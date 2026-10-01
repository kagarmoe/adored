import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";
import { DecisionController } from "@/server/api/decisions";
import { SessionController } from "@/server/api/sessions";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Card } from "@/components/ui";
import { ItemPhotoCarousel } from "@/features/items/ItemPhotoCarousel";
import { ItemPanelForm } from "@/features/items/ItemPanelForm";
import { InYourLifeChip } from "@/features/items/InYourLifeChip";
import { deriveUsage } from "@/lib/derive-usage";
import { itemDisplayName, itemSubtitle } from "@/lib/items";

interface ItemDetailPageProps {
  params: Promise<{ id: string; itemNumber: string }>;
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { id, itemNumber } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Admits only owner or member — and every member may write (items:write / photos:write).
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const number = Number(itemNumber);
  const item =
    number > 0 && Number.isInteger(number)
      ? await ItemController.fromDb(db).getByCollectionAndNumber(collection.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${collection.slug ?? collection.id}/items`);
  }

  const [photos, curatorEvents, curatorSessions] = await Promise.all([
    PhotoController.fromDb(db).findByItem(item.id),
    // Server-only: only the folded answer for this one item reaches the client.
    DecisionController.fromDb(db).listForCurator(collection.id, session.user.id),
    SessionController.fromDb(db).listByCollectionAndCurator(collection.id, session.user.id),
  ]);
  const usage = deriveUsage(curatorEvents, new Set([item.id])).get(item.id);
  const openSession = curatorSessions.find((s) => s.status === "active" || s.status === "paused");
  const collectionHref = `/collections/${collection.slug ?? collection.id}`;
  // findByItem has no ORDER BY: cover first, then upload order (spec §6).
  const orderedPhotos = [...photos]
    .sort(
      (a, b) =>
        Number(b.isHero) - Number(a.isHero) ||
        +new Date(a.createdAt) - +new Date(b.createdAt) ||
        (a.id < b.id ? -1 : 1),
    )
    .map((p) => ({
      id: p.id,
      itemId: item.id,
      collectionId: collection.id,
      rotation: p.rotation,
      updatedAt: p.updatedAt,
      alt: itemDisplayName(item),
    }));

  return (
    <AppLayout breadcrumbs={trail.item(collection, item)}>
      <div className="space-y-6">
        <header className="min-w-0">
          <h1 className="text-3xl text-ink sm:text-4xl">{itemDisplayName(item)}</h1>
          <p className="mt-1 text-sm text-ink-soft">{itemSubtitle(item, new Date())}</p>
        </header>
        <div className="grid gap-6 md:grid-cols-[3fr_2fr] md:items-start">
          <ItemPhotoCarousel
            photos={orderedPhotos}
            collectionId={collection.id}
            itemName={itemDisplayName(item)}
            addPhotosHref={`${collectionHref}/items/${item.number}/photos`}
            canDelete
          />
          <Card variant="card" padding="lg" className="space-y-6">
            <InYourLifeChip
              collectionId={collection.id}
              itemId={item.id}
              sessionId={openSession?.id ?? null}
              initial={usage}
            />
            <ItemPanelForm item={item} collectionId={collection.id} />
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

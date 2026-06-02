import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { AppLayout } from "@/components/layout";
import { Card, EmptyState } from "@/components/ui";
import { DecisionControls } from "@/features/sorting/DecisionControls";
import { ItemCard } from "@/features/items/ItemCard";

interface TriagePageProps {
  params: { id: string; sessionId: string };
}

export default async function TriagePage({ params }: TriagePageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);
  const [collection, items, sortSession, preferences] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findByCollection(params.id),
    sessionRepo.findById(params.sessionId),
    prefRepo.findByCollection(params.id, session.user.id),
  ]);

  if (!collection || !sortSession) {
    redirect(`/collections/${params.id}/sort`);
  }

  const preferencesByItemId = new Map(preferences.map((p) => [p.itemId, p]));
  const item = items.find((i) => !preferencesByItemId.has(i.id)) || null;
  const totalItems = items.length;
  const triaged = preferences.length;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Session", href: `/collections/${params.id}/sort/${params.sessionId}` },
        { label: "Triage" },
      ]}
    >
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-ink">Triage</h1>
            <p className="mt-2 text-ink-soft">Assign the current item to a preference bucket.</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-soft">{triaged} of {totalItems}</p>
            <div className="mt-2 w-32 bg-clay-soft rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${totalItems > 0 ? (triaged / totalItems) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {!item ? (
          <EmptyState heading="All items triaged!" message="You&apos;ve completed triage for all items. View results to see your ranked order." />
        ) : (
          <>
            <ItemCard item={item} collectionId={params.id} />
            <Card padding="lg">
              <DecisionControls
                sessionId={params.sessionId}
                type="triage"
                decisions={[
                  { label: "Love", decision: { itemId: item.id, result: "top" } },
                  { label: "Like", decision: { itemId: item.id, result: "high" } },
                  { label: "Maybe", decision: { itemId: item.id, result: "medium" } },
                  { label: "Release", decision: { itemId: item.id, result: "low" } },
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

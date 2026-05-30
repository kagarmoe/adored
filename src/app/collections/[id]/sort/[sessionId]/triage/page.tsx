import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
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
  const [collection, items, sortSession] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findByCollection(params.id),
    sessionRepo.findById(params.sessionId),
  ]);

  if (!collection || !sortSession) {
    redirect(`/collections/${params.id}/sort`);
  }

  const item = items[0];

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
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Triage</h1>
          <p className="mt-2 text-gray-600">Assign the current item to a preference bucket.</p>
        </div>

        {!item ? (
          <EmptyState heading="No items to triage" message="Add items before starting a sorting session" />
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

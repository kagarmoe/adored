import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { AppLayout } from "@/components/layout";
import { Card, EmptyState } from "@/components/ui";
import { DecisionControls } from "@/features/sorting/DecisionControls";
import { ItemCard } from "@/features/items/ItemCard";
import { selectNextPair } from "@/lib/pairwise-selection";

interface ComparePageProps {
  params: { id: string; sessionId: string };
}

export default async function ComparePage({ params }: ComparePageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);
  const decisionRepo = new DecisionEventRepository(db);
  const [collection, items, sortSession, preferences, decisions] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findByCollection(params.id),
    sessionRepo.findById(params.sessionId),
    prefRepo.findByCollection(params.id, session.user.id),
    decisionRepo.findBySession(params.sessionId),
  ]);

  if (!collection || !sortSession) {
    redirect(`/collections/${params.id}/sort`);
  }

  if (items.length < 2) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Collections", href: "/collections" },
          { label: collection.name, href: `/collections/${params.id}` },
          { label: "Session", href: `/collections/${params.id}/sort/${params.sessionId}` },
          { label: "Compare" },
        ]}
      >
        <EmptyState
          heading="Not enough items"
          message="Add more items to the collection to use pairwise comparison"
        />
      </AppLayout>
    );
  }

  const decidedPairs = new Set(
    decisions
      .filter((d) => d.type === "pairwise_compare")
      .map((d) => {
        const decision = d.decision as any;
        return `${decision.itemAId}-${decision.itemBId}`;
      })
  );

  const pair = selectNextPair({
    preferences,
    items,
    decidedPairs,
  });

  if (!pair) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Collections", href: "/collections" },
          { label: collection.name, href: `/collections/${params.id}` },
          { label: "Session", href: `/collections/${params.id}/sort/${params.sessionId}` },
          { label: "Compare" },
        ]}
      >
        <EmptyState
          heading="All comparisons complete"
          message="You&apos;ve compared all meaningful pairs. Check your results!"
        />
      </AppLayout>
    );
  }

  const [itemA, itemB] = pair;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Session", href: `/collections/${params.id}/sort/${params.sessionId}` },
        { label: "Compare" },
      ]}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl text-ink">Compare</h1>
          <p className="mt-2 text-ink-soft">Choose which item better fits this session goal.</p>
        </div>

        {!itemA || !itemB ? (
          <EmptyState heading="Need at least two items" message="Add more items to use pairwise comparison" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <ItemCard item={itemA} collectionId={params.id} />
              <ItemCard item={itemB} collectionId={params.id} />
            </div>
            <Card padding="lg">
              <DecisionControls
                sessionId={params.sessionId}
                type="pairwise_compare"
                decisions={[
                  { label: itemA.name, decision: { itemAId: itemA.id, itemBId: itemB.id, result: "item_a" } },
                  { label: itemB.name, decision: { itemAId: itemA.id, itemBId: itemB.id, result: "item_b" } },
                  { label: "Tie", decision: { itemAId: itemA.id, itemBId: itemB.id, result: "tie" } },
                  { label: "Skip", decision: { itemAId: itemA.id, itemBId: itemB.id, result: "skip" } },
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

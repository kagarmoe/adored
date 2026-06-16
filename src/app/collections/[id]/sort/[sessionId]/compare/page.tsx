import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { AppLayout } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { CompareChoice } from "@/features/sorting/CompareChoice";
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
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);
  const decisionRepo = new DecisionEventRepository(db);
  const [items, sortSession, preferences, decisions] = await Promise.all([
    itemRepo.findByCollection(collection.id),
    sessionRepo.findById(params.sessionId),
    prefRepo.findByCollection(collection.id, session.user.id),
    decisionRepo.findBySession(params.sessionId),
  ]);

  if (!sortSession) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  if (items.length < 2) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Collections", href: "/collections" },
          { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
          { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${params.sessionId}` },
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
          { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
          { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${params.sessionId}` },
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
  const comparisonsMade = decisions.filter((d) => d.type === "pairwise_compare").length;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${params.sessionId}` },
        { label: "Compare" },
      ]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl text-ink">Which do you love more?</h1>
          <p className="mt-2 text-ink-soft">Tap the one you love more. Tie or skip whenever you like.</p>
        </div>

        {!itemA || !itemB ? (
          <EmptyState heading="Need at least two items" message="Add more items to use pairwise comparison" />
        ) : (
          <CompareChoice
            sessionId={params.sessionId}
            itemA={itemA}
            itemB={itemB}
            comparisonsMade={comparisonsMade}
          />
        )}
      </div>
    </AppLayout>
  );
}

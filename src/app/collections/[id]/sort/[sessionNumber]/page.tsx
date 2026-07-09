import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { PreferenceController } from "@/server/api/preferences";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { DecisionController } from "@/server/api/decisions";
import { DispositionController } from "@/server/api/dispositions";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
import { SessionAnalytics } from "@/features/sessions/SessionAnalytics";
import { SeeResultsCard } from "@/features/sessions/SeeResultsCard";
import { RecommendedRound } from "@/features/sessions/RecommendedRound";
import { recommendNextRound, type NextRound } from "@/lib/next-round";
import { ROUND_COPY } from "@/features/sorting/roundCopy";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import Link from "next/link";

interface SessionPageProps {
  params: { id: string; sessionNumber: string };
}

export default async function SortSessionPage({ params }: SessionPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);

  const sessionNumber = Number(params.sessionNumber);
  const [items, sortSession] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? SessionController.fromDb(db).getByCollectionAndNumber(collection.id, sessionNumber)
      : Promise.resolve(null),
  ]);

  // #196 integrity guard — kept verbatim; redundant with the resolver but defends
  // against any future resolver change. Never compare against params.id.
  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  // purses-t9l: each user sorts independently — only the session's curator may open it.
  if (sortSession.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  const [preferences, curatorDecisions, dispositions] = await Promise.all([
    PreferenceController.fromDb(db).listItemPreferences(collection.id, sortSession.curatorId),
    // ONE decision read serves both consumers (spec §3.8/§2.6): the curator's whole
    // cross-session log drives usage-known derivation; the session-scoped subset below
    // feeds selectNextPair/analytics. The curator guard above makes the curator log a
    // strict superset, so the filtered subset equals the retired listBySession result.
    DecisionController.fromDb(db).listForCurator(collection.id, sortSession.curatorId),
    DispositionController.fromDb(db).listDispositions(collection.id, sortSession.curatorId),
  ]);

  // Session-scoped subset for SessionAnalytics only. §7.3 is fixed: selectNextPair
  // reads the curator-wide log (see recommendNextRound), so the compare recommendation
  // agrees with the recompute across sessions.
  const decisions = curatorDecisions.filter((e) => e.sessionId === sortSession.id);

  // Gates the "See results" card: at least one item has been given a feeling.
  const bucketed = preferences.length;

  // Derived, no schema: which round is a good next step, plus the demoted twin the
  // device-local anti-nagging swap needs. Reuses the same selectTriageItem /
  // selectUsageQueue / selectNextPair the rounds use, so it can never disagree with
  // what a round would actually show (TONE: a suggestion, not a tally).
  const dispositionByItemId = new Map(dispositions.map((d) => [d.itemId, d.disposition]));
  const { primary, whenUsageDemoted } = recommendNextRound({
    items,
    preferences,
    curatorDecisions,
    dispositionByItemId,
  });
  const collectionHref = `/collections/${collection.slug ?? collection.id}`;
  const hrefFor = (round: NextRound): string => {
    switch (round.kind) {
      case "triage":
        return `${collectionHref}/sort/${sortSession.number}/triage`;
      case "usage":
        return `${collectionHref}/sort/${sortSession.number}/usage`;
      case "compare":
        return `${collectionHref}/sort/${sortSession.number}/compare`;
      case "decide":
        return `${collectionHref}/results`;
    }
  };

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Sort", href: `/collections/${collection.slug ?? collection.id}/sort` },
        { label: "Session" },
      ]}
    >
      {/* Recovery gate (spec §3.4): the analytics/recommendation below derive
          from decision events — drain pending ones before trusting them. */}
      <PendingDecisionsGate curatorId={session.user.id}>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-ink">Sorting session</h1>
          <p className="text-ink-soft mt-2">Goal: {sortSession.goal}</p>
          <div className="mt-3">
            <Badge variant={sortSession.status}>{sortSession.status}</Badge>
          </div>
        </div>

        <RecommendedRound
          primary={{ round: primary, href: hrefFor(primary) }}
          whenUsageDemoted={
            whenUsageDemoted ? { round: whenUsageDemoted, href: hrefFor(whenUsageDemoted) } : undefined
          }
          curatorId={sortSession.curatorId}
          sessionId={sortSession.id}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/triage`}>
            <Card interactive padding="lg">
              <h2 className="text-lg text-ink">{ROUND_COPY.triage.name}</h2>
              <p className="mt-2 text-sm text-ink-soft">{ROUND_COPY.triage.explainer}</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/usage`}>
            <Card interactive padding="lg">
              <h2 className="text-lg text-ink">{ROUND_COPY.usage.name}</h2>
              <p className="mt-2 text-sm text-ink-soft">{ROUND_COPY.usage.explainer}</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/compare`}>
            <Card interactive padding="lg">
              <h2 className="text-lg text-ink">{ROUND_COPY.compare.name}</h2>
              <p className="mt-2 text-sm text-ink-soft">{ROUND_COPY.compare.explainer}</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
        </div>

        {bucketed > 0 && (
          <SeeResultsCard
            collectionId={collection.id}
            collectionSlug={collection.slug ?? collection.id}
          />
        )}

        <SessionAnalytics
          preferences={preferences}
          decisions={decisions}
          totalItems={items.length}
          sessionCreatedAt={sortSession.createdAt}
        />
      </div>
      </PendingDecisionsGate>
    </AppLayout>
  );
}

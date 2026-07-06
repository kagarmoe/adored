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
import { RecommendedRoundCard } from "@/features/sessions/RecommendedRoundCard";
import { recommendNextRound } from "@/lib/next-round";
import { ROUND_COPY } from "@/features/sorting/roundCopy";
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

  const [preferences, decisions, dispositions] = await Promise.all([
    PreferenceController.fromDb(db).listItemPreferences(collection.id, sortSession.curatorId),
    DecisionController.fromDb(db).listBySession(sortSession.id),
    DispositionController.fromDb(db).listDispositions(collection.id, sortSession.curatorId),
  ]);

  // Gates the "See results" card: at least one item has been given a feeling.
  const bucketed = preferences.length;

  // Derived, no schema: which round is a good next step. Reuses the same
  // selectTriageItem / selectNextPair the rounds themselves use, so it can never
  // disagree with what a round would actually show (TONE: a suggestion, not a tally).
  const dispositionByItemId = new Map(dispositions.map((d) => [d.itemId, d.disposition]));
  const nextRound = recommendNextRound({ items, preferences, decisions, dispositionByItemId });
  const collectionHref = `/collections/${collection.slug ?? collection.id}`;
  const nextRoundHref =
    nextRound.kind === "triage"
      ? `${collectionHref}/sort/${sortSession.number}/triage`
      : nextRound.kind === "compare"
        ? `${collectionHref}/sort/${sortSession.number}/compare`
        : `${collectionHref}/results`;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Sort", href: `/collections/${collection.slug ?? collection.id}/sort` },
        { label: "Session" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-ink">Sorting session</h1>
          <p className="text-ink-soft mt-2">Goal: {sortSession.goal}</p>
          <div className="mt-3">
            <Badge variant={sortSession.status}>{sortSession.status}</Badge>
          </div>
        </div>

        <RecommendedRoundCard round={nextRound} href={nextRoundHref} />

        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/triage`}>
            <Card interactive padding="lg">
              <h2 className="text-lg text-ink">{ROUND_COPY.triage.name}</h2>
              <p className="mt-2 text-sm text-ink-soft">{ROUND_COPY.triage.explainer}</p>
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
    </AppLayout>
  );
}

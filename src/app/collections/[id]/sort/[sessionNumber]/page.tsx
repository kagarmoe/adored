import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { PreferenceController } from "@/server/api/preferences";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { DecisionController } from "@/server/api/decisions";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
import { SessionAnalytics } from "@/features/sessions/SessionAnalytics";
import { SeeResultsCard } from "@/features/sessions/SeeResultsCard";
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

  const [preferences, decisions] = await Promise.all([
    PreferenceController.fromDb(db).listItemPreferences(collection.id, sortSession.curatorId),
    DecisionController.fromDb(db).listBySession(sortSession.id),
  ]);

  const bucketCounts = {
    top: preferences.filter((p) => p.rankBucket === "top").length,
    high: preferences.filter((p) => p.rankBucket === "high").length,
    medium: preferences.filter((p) => p.rankBucket === "medium").length,
    low: preferences.filter((p) => p.rankBucket === "low").length,
  };

  const bucketed = bucketCounts.top + bucketCounts.high + bucketCounts.medium + bucketCounts.low;
  const remaining = items.length - bucketed;
  const progress = items.length === 0 ? 0 : Math.round((bucketed / items.length) * 100);

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

        <Card padding="lg">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-ink-soft mb-3">Progress</p>
              <div className="h-3 overflow-hidden rounded-full bg-ground">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-ink-soft">Love</p>
                <p className="text-lg font-bold text-ink">{bucketCounts.top}</p>
              </div>
              <div>
                <p className="text-ink-soft">Like</p>
                <p className="text-lg font-bold text-ink">{bucketCounts.high}</p>
              </div>
              <div>
                <p className="text-ink-soft">Maybe</p>
                <p className="text-lg font-bold text-ink">{bucketCounts.medium}</p>
              </div>
              <div>
                <p className="text-ink-soft">Onward</p>
                <p className="text-lg font-bold text-ink">{bucketCounts.low}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-hairline">
              <p className="text-sm text-ink-soft">
                {remaining} of {items.length} items left to triage
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/triage`}>
            <Card interactive padding="lg">
              <h2 className="text-lg text-ink">Triage</h2>
              <p className="mt-2 text-sm text-ink-soft">Quickly bucket one item at a time.</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
          <Link href={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}/compare`}>
            <Card interactive padding="lg">
              <h2 className="text-lg text-ink">Compare</h2>
              <p className="mt-2 text-sm text-ink-soft">Pick between pairs to refine ranking.</p>
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
            bucketed={bucketed}
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

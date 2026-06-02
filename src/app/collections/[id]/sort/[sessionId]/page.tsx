import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
import { SessionAnalytics } from "@/features/sessions/SessionAnalytics";
import Link from "next/link";

interface SessionPageProps {
  params: { id: string; sessionId: string };
}

export default async function SortSessionPage({ params }: SessionPageProps) {
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
  const [collection, items, sortSession] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findByCollection(params.id),
    sessionRepo.findById(params.sessionId),
  ]);

  if (!collection || !sortSession) {
    redirect(`/collections/${params.id}/sort`);
  }

  const [preferences, decisions] = await Promise.all([
    prefRepo.findByCollection(params.id, sortSession.curatorId),
    decisionRepo.findBySession(params.sessionId),
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
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Sort", href: `/collections/${params.id}/sort` },
        { label: "Session" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-ink">Sorting Session</h1>
          <p className="text-ink-soft mt-2">Goal: {sortSession.goal}</p>
          <div className="mt-3">
            <Badge variant={sortSession.status}>{sortSession.status}</Badge>
          </div>
        </div>

        <Card padding="lg">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-ink-soft mb-3">Progress</p>
              <div className="h-3 overflow-hidden rounded-full bg-plaster">
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
                <p className="text-ink-soft">Release</p>
                <p className="text-lg font-bold text-ink">{bucketCounts.low}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-line">
              <p className="text-sm text-ink-soft">
                {remaining} of {items.length} items left to triage
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`/collections/${params.id}/sort/${params.sessionId}/triage`}>
            <Card interactive padding="lg">
              <h2 className="text-lg font-semibold text-ink">Triage</h2>
              <p className="mt-2 text-sm text-ink-soft">Quickly bucket one item at a time.</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
          <Link href={`/collections/${params.id}/sort/${params.sessionId}/compare`}>
            <Card interactive padding="lg">
              <h2 className="text-lg font-semibold text-ink">Compare</h2>
              <p className="mt-2 text-sm text-ink-soft">Pick between pairs to refine ranking.</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
        </div>

        {bucketed > 0 && (
          <Card padding="lg" className="border-line bg-verdigris-soft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-verdigris-deep">Ready to see results?</h2>
                <p className="mt-1 text-sm text-verdigris-deep">
                  You&apos;ve made {bucketed} decision{bucketed !== 1 ? "s" : ""}. Generate a draft result to see the ranked order.
                </p>
              </div>
              <Link href={`/collections/${params.id}/results`}>
                <Button>View Results</Button>
              </Link>
            </div>
          </Card>
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

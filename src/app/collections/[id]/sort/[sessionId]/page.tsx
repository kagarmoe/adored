import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
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
  const [collection, items, sortSession] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findByCollection(params.id),
    sessionRepo.findById(params.sessionId),
  ]);

  if (!collection || !sortSession) {
    redirect(`/collections/${params.id}/sort`);
  }

  const preferences = await prefRepo.findByCollection(params.id, sortSession.curatorId);

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
          <h1 className="text-3xl font-bold text-gray-900">Sorting Session</h1>
          <p className="text-gray-600 mt-2">Goal: {sortSession.goal}</p>
          <div className="mt-3">
            <Badge variant={sortSession.status}>{sortSession.status}</Badge>
          </div>
        </div>

        <Card padding="lg">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-3">Progress</p>
              <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600">Love</p>
                <p className="text-lg font-bold text-gray-900">{bucketCounts.top}</p>
              </div>
              <div>
                <p className="text-gray-600">Like</p>
                <p className="text-lg font-bold text-gray-900">{bucketCounts.high}</p>
              </div>
              <div>
                <p className="text-gray-600">Maybe</p>
                <p className="text-lg font-bold text-gray-900">{bucketCounts.medium}</p>
              </div>
              <div>
                <p className="text-gray-600">Release</p>
                <p className="text-lg font-bold text-gray-900">{bucketCounts.low}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                {remaining} of {items.length} items left to triage
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`/collections/${params.id}/sort/${params.sessionId}/triage`}>
            <Card interactive padding="lg">
              <h2 className="text-lg font-semibold text-gray-900">Triage</h2>
              <p className="mt-2 text-sm text-gray-600">Quickly bucket one item at a time.</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
          <Link href={`/collections/${params.id}/sort/${params.sessionId}/compare`}>
            <Card interactive padding="lg">
              <h2 className="text-lg font-semibold text-gray-900">Compare</h2>
              <p className="mt-2 text-sm text-gray-600">Pick between pairs to refine ranking.</p>
              <div className="mt-4">
                <Button size="sm">Open</Button>
              </div>
            </Card>
          </Link>
        </div>

        {bucketed > 0 && (
          <Card padding="lg" className="border-blue-200 bg-blue-50">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-950">Ready to see results?</h2>
                <p className="mt-1 text-sm text-blue-900">
                  You&apos;ve made {bucketed} decision{bucketed !== 1 ? "s" : ""}. Generate a draft result to see the ranked order.
                </p>
              </div>
              <Link href={`/collections/${params.id}/results`}>
                <Button>View Results</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

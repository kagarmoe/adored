import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
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
  const decisionRepo = new DecisionEventRepository(db);
  const [collection, items, sortSession, decisions] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findByCollection(params.id),
    sessionRepo.findById(params.sessionId),
    decisionRepo.findBySession(params.sessionId),
  ]);

  if (!collection || !sortSession) {
    redirect(`/collections/${params.id}/sort`);
  }

  const progress = items.length === 0 ? 0 : Math.min(100, Math.round((decisions.length / items.length) * 100));

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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Progress</p>
                <p className="text-2xl font-bold text-gray-900">{decisions.length} decisions</p>
              </div>
              <p className="text-sm text-gray-600">{items.length} items in scope</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
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
      </div>
    </AppLayout>
  );
}

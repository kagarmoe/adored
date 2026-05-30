import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { AppLayout } from "@/components/layout";
import { Button, Card, EmptyState } from "@/components/ui";
import Link from "next/link";

interface SortPageProps {
  params: { id: string };
}

export default async function SortPage({ params }: SortPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const sessionRepo = new SessionRepository(db);

  const collection = await collectionRepo.findById(params.id);
  if (!collection) {
    redirect("/collections");
  }

  const sessions = await sessionRepo.findByCollection(params.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Sorting" },
      ]}
    >
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Sorting Sessions</h1>
          <Link href={`/collections/${params.id}/sort/new`}>
            <Button>New Session</Button>
          </Link>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            heading="No sorting sessions yet"
            message="Create a session to start organizing items"
            action={{
              label: "Create Session",
              onClick: () => (window.location.href = `/collections/${params.id}/sort/new`),
            }}
          />
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Link key={s.id} href={`/collections/${params.id}/sort/${s.id}`}>
                <Card interactive padding="md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{s.goal}</h3>
                      <p className="text-sm text-gray-600">Status: {s.status}</p>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
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
  const activeSession = sessions.find((sortSession) => sortSession.status === "active");

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
          <h1 className="text-3xl font-bold text-ink">Sorting Sessions</h1>
          <Link href={`/collections/${params.id}/sort/new`}>
            <Button>New Session</Button>
          </Link>
        </div>

        {activeSession && (
          <Card padding="lg" className="border-line bg-verdigris-soft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-verdigris-deep">Active Session</h2>
                  <Badge variant="active">active</Badge>
                </div>
                <p className="text-sm text-verdigris-deep">
                  {activeSession.goal || "Preference discovery"} · {sessions.length} total session{sessions.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-3">
                <Link href={`/collections/${params.id}/sort/${activeSession.id}`}>
                  <Button>Resume</Button>
                </Link>
                <Link href={`/collections/${params.id}/sort/${activeSession.id}`}>
                  <Button variant="secondary">Details</Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {sessions.length === 0 ? (
          <EmptyState
            heading="No sorting sessions yet"
            message="Create a session to start organizing items"
            action={{
              label: "Create Session",
              href: `/collections/${params.id}/sort/new`,
            }}
          />
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Link key={s.id} href={`/collections/${params.id}/sort/${s.id}`}>
                <Card interactive padding="md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-ink">{s.goal}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant={s.status}>{s.status}</Badge>
                      </div>
                    </div>
                    <span className="text-sm text-ink-soft">
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

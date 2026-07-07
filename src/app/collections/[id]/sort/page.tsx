import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { SessionController } from "@/server/api/sessions";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { ResumeControl } from "@/features/sorting/ResumeControl";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
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
  const collection = await requireCollectionAccess(db, params.id, session.user.id);

  // purses-t9l: each user sorts independently — show only this user's own sessions.
  const sessions = await SessionController.fromDb(db).listByCollectionAndCurator(collection.id, session.user.id);
  // purses-4bhh: at most one open session at a time (sessions_active_unique covers
  // active AND paused). A paused sort is still the *current* one, so it gates a new
  // session and offers Resume just like an active one.
  const currentSession = sessions.find(
    (sortSession) => sortSession.status === "active" || sortSession.status === "paused",
  );
  const collectionHref = `/collections/${collection.slug ?? collection.id}`;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: collectionHref },
        { label: "Sorting" },
      ]}
    >
      {/* Recovery gate (spec §3.4): pending decisions drain before this hub
          renders from stale session/preference data. Empty queue = zero cost. */}
      <PendingDecisionsGate curatorId={session.user.id}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl text-ink">Sorting sessions</h1>
          {/* purses-4bhh: only invite a new session when none is open — starting a
              second while one is active/paused violates sessions_active_unique. */}
          {!currentSession && (
            <Link href={`${collectionHref}/sort/new`}>
              <Button>New session</Button>
            </Link>
          )}
        </div>

        {currentSession && (
          <Card padding="lg" className="border-hairline bg-content-soft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-lg text-ink">
                    {currentSession.status === "paused" ? "Your sort is paused" : "Active session"}
                  </h2>
                  <Badge variant={currentSession.status}>{currentSession.status}</Badge>
                </div>
                <p className="text-sm text-ink">
                  {currentSession.status === "paused"
                    ? "Your sort is safe — pick up where you left off."
                    : currentSession.goal || "Preference discovery"}
                </p>
              </div>
              <div className="flex gap-3">
                {currentSession.status === "paused" ? (
                  <ResumeControl
                    sessionId={currentSession.id}
                    sortHref={`${collectionHref}/sort/${currentSession.number}`}
                  />
                ) : (
                  <Link href={`${collectionHref}/sort/${currentSession.number}`}>
                    <Button>Resume</Button>
                  </Link>
                )}
                <Link href={`${collectionHref}/sort/${currentSession.number}`}>
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
              label: "Create session",
              href: `${collectionHref}/sort/new`,
            }}
          />
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Link key={s.id} href={`${collectionHref}/sort/${s.number}`}>
                <Card interactive padding="md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-ink">{s.goal}</h3>
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
      </PendingDecisionsGate>
    </AppLayout>
  );
}

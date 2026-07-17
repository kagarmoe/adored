import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { SessionController } from "@/server/api/sessions";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, Card, EmptyState } from "@/components/ui";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { ResumeControl } from "@/features/sorting/ResumeControl";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { SessionResumeCard } from "@/features/sessions/SessionResumeCard";
import { StartSortingButton } from "@/features/sessions/StartSortingButton";
import { quietLink } from "@/lib/design/quiet-link";
import Link from "next/link";

interface SortPageProps {
  params: Promise<{ id: string }>;
}

export default async function SortPage({ params }: SortPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

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
    <AppLayout breadcrumbs={trail.sort(collection)}>
      {/* Recovery gate (spec §3.4): pending decisions drain before this hub
          renders from stale session/preference data. Empty queue = zero cost. */}
      <PendingDecisionsGate curatorId={session.user.id}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl text-ink sm:text-3xl">Sort</h1>
          {/* purses-4bhh: only invite a new session when none is open — starting a
              second while one is active/paused violates sessions_active_unique. */}
          {!currentSession && sessions.length > 0 && (
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <StartSortingButton collectionId={collection.id} collectionSlug={collection.slug ?? collection.id} />
              {/* purses-znkt.1: the deliberate path stays reachable — goal text +
                  round-length dial — behind a quiet secondary link. Named for the
                  field it actually sets (never "scope": that select is dead weight
                  server-side, out of scope for this pass). */}
              <Link href={`${collectionHref}/sort/new`} className={quietLink}>
                Set a goal first
              </Link>
            </div>
          )}
        </div>

        <WorkspaceModeChips base={collectionHref} activeMode="sort" />

        {currentSession && (
          <SessionResumeCard
            status={currentSession.status as "active" | "paused"}
            goal={currentSession.goal}
            headingLevel="h2"
            actions={
              <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
                {currentSession.status === "paused" ? (
                  <ResumeControl
                    curatorId={session.user.id}
                    sessionId={currentSession.id}
                    sortHref={`${collectionHref}/sort/${currentSession.number}`}
                  />
                ) : (
                  <Link href={`${collectionHref}/sort/${currentSession.number}`} className="min-w-0">
                    <Button className="w-full">Resume</Button>
                  </Link>
                )}
                <Link href={`${collectionHref}/sort/${currentSession.number}`} className="min-w-0">
                  <Button variant="secondary" className="w-full">Details</Button>
                </Link>
              </div>
            }
          />
        )}

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-4">
            {/* EmptyState's action prop only takes a Link or a bare Button — it
                can't host the island's own POST + status-line state, so the
                heading/message render through EmptyState (no action) and the
                one-tap island renders as the single primary CTA beneath it. */}
            <EmptyState heading="Nothing sorted yet" message="Begin with how you feel about each." />
            <div className="flex flex-col items-center gap-2">
              <StartSortingButton collectionId={collection.id} collectionSlug={collection.slug ?? collection.id} />
              {/* purses-znkt.1: the deliberate path stays reachable even in the empty
                  state — goal text + round-length dial — behind a quiet secondary
                  link. Named for the field it actually sets. */}
              <Link href={`${collectionHref}/sort/new`} className={quietLink}>
                Set a goal first
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xl text-ink">Earlier passes</h2>
            <div className="space-y-3">
              {sessions.map((s) => (
                <Link key={s.id} href={`${collectionHref}/sort/${s.number}`}>
                  <Card interactive padding="md">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-ink">{s.goal ?? "A sorting pass"}</h3>
                      <span className="text-sm text-ink-soft">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      </PendingDecisionsGate>
    </AppLayout>
  );
}

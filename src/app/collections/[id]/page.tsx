import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { PhotoController } from "@/server/api/photos";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DispositionController } from "@/server/api/dispositions";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { EmptyState, buttonVariants } from "@/components/ui";
import { ActiveSessionPanel } from "@/features/sessions/ActiveSessionPanel";
import { PhotoPoolPreview } from "@/features/collections/PhotoPoolPreview";
import { ItemPreviewGrid } from "@/features/collections/ItemPreviewGrid";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { resolveWorkspaceState } from "@/features/collections/workspaceState";
import { workspaceMeta } from "@/features/sessions/roundProgress";
import { quietLink } from "@/lib/design/quiet-link";
import Link from "next/link";

interface CollectionPageProps {
  params: Promise<{ id: string }>;
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Access is enforced BEFORE any preview query — a thrown redirect here means the
  // Promise.all below never runs, so pool/item data is unreachable without access.
  const collection = await requireCollectionAccess(db, id, session.user.id);

  // The two bounded previews (and this user's own sessions for the Continue
  // affordance) in one round-trip. Adaptive state derives from preview row
  // counts — no separate count/existence query. A failed preview query
  // PROPAGATES (it is never caught into [] and rendered as the empty state).
  const [poolPreview, itemPreview, sessions] = await Promise.all([
    PhotoController.fromDb(db).findPoolByCollection(collection.id, 6),
    ItemController.fromDb(db).listItems(collection.id, { limit: 12, orderBy: "number" }),
    SessionController.fromDb(db).listByCollectionAndCurator(collection.id, session.user.id),
  ]);

  const covers =
    itemPreview.length > 0
      ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(itemPreview.map((i) => i.id))
      : new Map();

  const state = resolveWorkspaceState(poolPreview.length, itemPreview.length);
  const isOwner = collection.ownerId === session.user.id;

  const base = `/collections/${collection.slug ?? collection.id}`;
  const poolHref = `${base}/pool`;
  const itemsHref = `${base}/items`;

  // purses-t9l: each user sorts independently — this reflects only the current
  // user's sessions. A paused sort is still the current one (resume, not start).
  const currentSession = sessions.find(
    (s) => s.status === "active" || s.status === "paused",
  );
  const resumeHref = `${base}/sort/${currentSession?.number}`;
  // Workspace resume card meta (spec §B last bullet, purses-1xbp.1). Preferences
  // are fetched UNCONDITIONALLY: they also feed hasEverSorted below (a curator
  // whose only session was set aside has zero session rows — soft-deleted — but
  // their decisions persist; purses-1xbp.2). The total MUST be a real count —
  // never itemPreview.length (bounded to 12) — so this reads the full item
  // list, not the preview. Decided = preference rows + set-aside dispositions,
  // mutually exclusive by construction (same rule as the session hub).
  const preferences = await PreferenceController.fromDb(db).listItemPreferences(
    collection.id,
    session.user.id,
  );
  const [setAsideDispositions, allItems] = currentSession
    ? await Promise.all([
        DispositionController.fromDb(db).listDispositions(collection.id, session.user.id, "set_aside"),
        ItemController.fromDb(db).listItems(collection.id),
      ])
    : [[], []];

  // Sorted before = any past session (completed/abandoned) OR any surviving
  // decision — feeds the start card's progress-keyed copy ("Start" vs "Keep sorting").
  const hasEverSorted = sessions.length > 0 || preferences.length > 0;
  const workspaceMetaLine =
    workspaceMeta(preferences.length + setAsideDispositions.length, allItems.length) ?? undefined;

  // A1: at most one dominant (bg-primary) action on the workspace. Sort wins
  // once items exist — either a session is already open (Resume/undo IS that
  // one action) or the Continue section's start card will claim it once items
  // exist, so the adaptive section's lead action ("Make items" / "Add photos")
  // is demoted to a non-primary in both cases.
  //
  // Deliberate, documented exception: during the set-aside undo window (and the
  // rare post-409 settled note), ActiveSessionPanel shows only a quiet notice
  // with no primary action, so the page briefly has ZERO primary actions rather
  // than two. See docs/superpowers/specs/2026-07-17-collection-home-continue-design.md
  // §2 — zero-during-undo is TONE-preferable to a shouting CTA beside a
  // reversible-escape notice, and it self-heals on navigation or undo resolution.
  const leadActionVariant = currentSession || itemPreview.length > 0 ? "secondary" : "primary";

  const itemsPreview = (
    <ItemPreviewGrid
      items={itemPreview}
      covers={covers}
      collectionId={collection.id}
      collectionSlugOrId={collection.slug ?? collection.id}
    />
  );

  return (
    <AppLayout breadcrumbs={trail.collection(collection)}>
      <div className="space-y-10">
        <header className="max-w-3xl">
          <h1 className="text-2xl text-ink sm:text-3xl">{collection.name}</h1>
          {collection.description && <p className="mt-2 text-ink-soft">{collection.description}</p>}
          <p className="mt-4 text-sm text-ink-soft">
            Created {new Date(collection.createdAt).toLocaleDateString()}
          </p>
        </header>

        <WorkspaceModeChips base={base} activeMode="build" />

        {state.kind === "pool-first" && (
          <>
            <PhotoPoolPreview
              collectionId={collection.id}
              poolHref={poolHref}
              photos={poolPreview.map((p) => ({ id: p.id }))}
              actionVariant={leadActionVariant}
            />
            {itemPreview.length > 0 && (
              <section aria-labelledby="items-heading" className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="items-heading" className="text-xl text-ink">
                      Items
                    </h2>
                    <p className="mt-1 text-ink-soft">Things gathered here</p>
                  </div>
                  <Link href={itemsHref} className={quietLink}>
                    View all items
                  </Link>
                </div>
                {itemsPreview}
              </section>
            )}
          </>
        )}

        {state.kind === "items-first" && (
          <section aria-labelledby="items-heading" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="items-heading" className="text-xl text-ink">
                  Items
                </h2>
                <p className="mt-1 text-ink-soft">Things gathered here</p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <Link href={poolHref} className={`${buttonVariants({ variant: leadActionVariant })} w-full sm:w-auto`}>
                  Add photos
                </Link>
                <div className="flex flex-wrap gap-3">
                  <Link href={`${base}/items/new`} className={quietLink}>
                    Add item
                  </Link>
                  <Link href={itemsHref} className={quietLink}>
                    View all items
                  </Link>
                </div>
              </div>
            </div>
            {itemsPreview}
          </section>
        )}

        {state.kind === "empty" && (
          <EmptyState
            heading="Add photos when you're ready"
            message="Photos can wait here until you are ready to name or group them."
            action={{ label: "Add photos", href: poolHref }}
          />
        )}

        {/* B2 (spec §11): the empty state offers ONE clear action (add photos);
            Continue/sorting chrome would only lead to empty pages, so it is
            withheld until there is something to continue. */}
        {state.kind !== "empty" && (
          /* Mounted UNCONDITIONALLY (not inside `{currentSession && …}`) so the
             persistent set-aside Undo survives the refresh that flips
             currentSession to null. The panel owns the "Continue" section chrome
             and renders nothing at all — heading included — when there's neither
             a session nor a pending undo. */
          <ActiveSessionPanel
            curatorId={session.user.id}
            session={
              currentSession
                ? {
                    id: currentSession.id,
                    number: currentSession.number,
                    goal: currentSession.goal,
                    status: currentSession.status as "active" | "paused",
                  }
                : null
            }
            resumeHref={resumeHref}
            startHref={itemPreview.length > 0 ? `${base}/sort/new` : undefined}
            hasEverSorted={hasEverSorted}
            meta={workspaceMetaLine}
          />
        )}

        {isOwner && (
          <nav aria-label="Owner utilities" className="flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:flex-wrap">
            <Link href={`${base}/edit`} className={quietLink}>
              Collection settings
            </Link>
            <Link href={`${base}/members`} className={quietLink}>
              Members
            </Link>
          </nav>
        )}
      </div>
    </AppLayout>
  );
}

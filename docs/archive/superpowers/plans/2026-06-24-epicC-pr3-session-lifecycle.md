# Epic C · PR3 — Session lifecycle: pause + session set-aside undo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Two gentle session-lifecycle affordances: (1) an always-available "Take a break" that pauses the sort and returns the person to a calm landing where "Resume" waits exactly where they left off; (2) a confirmation + **Undo** after setting a sort session aside, so a mistaken "Set aside" is reversible.

**Architecture:** `SessionService.pause/resumeSession` and `PATCH /api/sessions/[id] {status}` already exist (unwired). Pause = `PATCH {status:"paused"}` from the sort chrome → calm landing; Resume = `PATCH {status:"active"}`. Session set-aside soft-deletes (`deletedAt`); undo needs a NEW include-deleted lookup + `restore` (clear `deletedAt`) behind a dedicated `POST /api/sessions/[id]/restore` (the existing routes 404 on soft-deleted rows). Both undo/pause UIs follow the **PR2 lesson**: any persistent notice must render where it survives a `router.refresh()` that unmounts the card.

**Tech Stack:** Next.js App Router, Drizzle + Neon Postgres, NextAuth, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-06-24-gentle-affordances-design.md` §5.4 (pause) + §5.5 (session undo) + §3.3 (the purses-4bhh New-Session gating).

## Global Constraints

- **Authorities:** TONE.md (first-order) → PRODUCT.md → DESIGN.md. Person-side copy: "Take a break", "Your sort is safe", "Resume", "Set aside", "Bring it back"/"Undo". **Forbidden:** abandon/discard, urgency, deadlines, **NO auto-dismiss timer** on any notice (TONE 4).
- **purses-4bhh mitigation:** when a current (active OR paused) session exists, the sort landing must NOT offer "New Session" (it would 500 on the unconditional `sessions_active_unique`). Gate/replace it with Resume. (Do NOT change the index — that's purses-4bhh.)
- **Restore authz (IDOR-critical):** the restore route resolves the session *including soft-deleted*, then re-checks collection access + `curatorId === userId` BEFORE restoring. A non-curator/stranger must never restore another's session.
- **Persistent-notice lesson (PR2):** the session set-aside undo notice must render at a tree position that survives the active-session card unmounting on refresh (a client island holding the undo state, not inside the `{activeSession && <card/>}` conditional).
- ≥44px, focus-visible, reduced-motion, AA both themes, `role=status` live regions on notices. The pause control lives in the **top chrome** (AppLayout header actions slot), not the decision-button zone.
- Tests in CI: un-mocked DB tests under `src/lib/db/`; e2e under `e2e/**`.

---

### Task 1: Session restore data layer (`findByIdIncludingDeleted` + `restore`)

**Files:**
- Modify: `src/server/repositories/SessionRepository.ts` (interface) + `src/server/repositories/implementations/SessionRepository.ts`
- Modify: `src/server/services/SessionService.ts` (+ `restoreSession`) — and confirm whether the route uses the service or controller
- Modify: `src/server/api/sessions.ts` (`SessionController` — add `restoreSession` + a `getSessionIncludingDeletedOrNull`)
- Test: `src/lib/db/session-restore.integration.test.ts`

**Interfaces:**
- Produces on `ISessionRepository`: `findByIdIncludingDeleted(id: string): Promise<Session | null>` (no `deletedAt` filter); `restore(id: string): Promise<Session>` (`set deletedAt = null, status = "active", updatedAt = now`).
- `SessionController.restoreSession(sessionId): Promise<Session>`; `SessionController.getSessionIncludingDeletedOrNull(sessionId): Promise<Session | null>`.

- [ ] **Step 1: Failing DB-integration test** `src/lib/db/session-restore.integration.test.ts` (`// @vitest-environment node`, `RUN_DB_TESTS` gate, mock `@/lib/db`): seed a collection + curator + a session (`SessionRepository.create`); `softDelete` it; assert `findById` returns null (existing) but `findByIdIncludingDeleted` returns it with `deletedAt` set; call `restore` and assert `deletedAt` is null, `status === "active"`, and `findById` now finds it.

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("SessionRepository restore", () => {
  beforeEach(() => resetDb());
  afterAll(() => closeDb());
  it("findByIdIncludingDeleted sees a soft-deleted session; restore re-activates it", async () => {
    const { db } = getTestDb();
    const curatorId = await seedBaseline();
    const collectionId = await seedBareCollection(curatorId);
    const repo = new SessionRepository(db);
    const s = await repo.create({ collectionId, curatorId });
    await repo.softDelete(s.id);
    expect(await repo.findById(s.id)).toBeNull();
    const deleted = await repo.findByIdIncludingDeleted(s.id);
    expect(deleted?.deletedAt).not.toBeNull();
    const restored = await repo.restore(s.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.status).toBe("active");
    expect(await repo.findById(s.id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npm run test:db -- src/lib/db/session-restore.integration.test.ts` (method missing).
- [ ] **Step 3: Implement** the two repo methods (impl + interface): `findByIdIncludingDeleted` = `findById` without `isNull(deletedAt)`; `restore(id)` = `update set { deletedAt: null, status: "active", updatedAt: new Date() }`. Add `restoreSession`/`getSessionIncludingDeletedOrNull` to `SessionController` (+ `SessionService.restoreSession` if the route goes through the service — match the existing GET/PATCH path which uses `SessionController`).
- [ ] **Step 4: Run → PASS**. Then `npm run build` + `npm run lint`.
- [ ] **Step 5: Commit** — `feat(session): findByIdIncludingDeleted + restore repo/controller (Epic C PR3)`.

---

### Task 2: `POST /api/sessions/[id]/restore` route + IDOR

**Files:**
- Create: `src/app/api/sessions/[id]/restore/route.ts`
- Test: `src/lib/db/session-restore-route.integration.test.ts`

**Interfaces:**
- Consumes: `getSession`, `getDb`, `requireApiCollectionAccess`, `SessionController.getSessionIncludingDeletedOrNull` + `restoreSession`.
- Auth: resolve the session **including soft-deleted**; 404 if truly absent; `requireApiCollectionAccess(db, session.collectionId, userId)`; then `session.curatorId !== userId → 403`; only then `restoreSession`.

- [ ] **Step 1: Failing route integration test** `src/lib/db/session-restore-route.integration.test.ts` (mirror `sessions-routes.integration.test.ts` header; mock `@/lib/auth` + `@/lib/db`): (a) curator A soft-deletes their session, then POST `/restore` → 200, session active again; (b) **IDOR**: curator B (member of A's shared collection) POSTs `/restore` for A's session → 403, session stays deleted; a stranger → 403/404; (c) restore of a non-existent id → 404.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `src/app/api/sessions/[id]/restore/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireApiCollectionAccess } from "@/server/dal/collection-access";
import { SessionController } from "@/server/api/sessions";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const sortSession = await SessionController.fromDb(db).getSessionIncludingDeletedOrNull(params.id);
  if (!sortSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireApiCollectionAccess(db, sortSession.collectionId, session.user.id);
  if (access instanceof NextResponse) return access;
  if (sortSession.curatorId !== session.user.id) {
    return NextResponse.json({ error: "You can only restore your own sorting session" }, { status: 403 });
  }
  const restored = await SessionController.fromDb(db).restoreSession(params.id);
  return NextResponse.json(restored);
}
```

- [ ] **Step 4: Run → PASS**; build + lint.
- [ ] **Step 5: Commit** — `feat(api): POST /sessions/[id]/restore with IDOR re-auth (Epic C PR3)`.

---

### Task 3: Pause — chrome control, calm landing, Resume, New-Session gating

**Files:**
- Modify: `src/components/layout/AppLayout.tsx` (render the declared-but-unused `actions` slot in the header area)
- Create: `src/features/sorting/TakeABreakControl.tsx` (client: PATCH `{status:"paused"}` → `router.push` to the sort landing)
- Create: `src/features/sorting/ResumeControl.tsx` (client: PATCH `{status:"active"}` → `router.push` to the sort/{number} screen)
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx` + `.../compare/page.tsx` (pass `<TakeABreakControl sessionId=… />` to `AppLayout actions`)
- Modify: `src/app/collections/[id]/sort/page.tsx` (landing: `currentSession = active|paused`; calm paused card; **gate "New Session" when a current session exists**; Resume)
- Test: `src/features/sorting/TakeABreakControl.test.tsx`, `ResumeControl.test.tsx`; update the sort landing page test if present.

**Interfaces:**
- `TakeABreakControl({ sessionId, collectionHref }: { sessionId: string; collectionHref: string })` — quiet ghost "Take a break"; PATCH `/api/sessions/${sessionId}` `{status:"paused"}`; on success `router.push(${collectionHref}/sort)` (the calm landing). In-flight guard, gentle error.
- `ResumeControl({ sessionId, sortHref }: { sessionId: string; sortHref: string })` — primary "Resume"; PATCH `{status:"active"}` → `router.push(sortHref)`.
- `AppLayout`: render `actions` (e.g. top-right of the breadcrumb row).

- [ ] **Step 1: Failing component tests** — `TakeABreakControl.test.tsx`: click → PATCH `{status:"paused"}` to the right URL + `router.push` to the landing. `ResumeControl.test.tsx`: click → PATCH `{status:"active"}` + push to the sort. (jsdom, mock fetch + useRouter.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Render `AppLayout.actions`** — destructure `actions` and render it (e.g. a flex row: breadcrumbs left, `actions` right). No page passes it yet, so this is additive/safe.
- [ ] **Step 4: Implement** `TakeABreakControl` + `ResumeControl` (mirror `StartSessionForm` PATCH+navigate + the in-flight guard).
- [ ] **Step 5: Wire triage + compare** — `<AppLayout breadcrumbs={…} actions={<TakeABreakControl sessionId={sortSession.id} collectionHref={`/collections/${collection.slug ?? collection.id}`} />}>`.
- [ ] **Step 6: Landing (`sort/page.tsx`)** — `const currentSession = sessions.find(s => s.status === "active" || s.status === "paused")`. When `currentSession` exists: render a calm card — if `paused`, gentle copy "Your sort is safe — pick up where you left off" + `<ResumeControl sessionId={currentSession.id} sortHref={…/sort/${currentSession.number}} />`; if `active`, the existing Resume link. **Gate "New Session":** only render the New-Session button when NO `currentSession` exists (otherwise it 500s — purses-4bhh). Keep the historical session list.
- [ ] **Step 7: Run** component tests + `npm run build` + `npm run lint`.
- [ ] **Step 8: Commit** — `feat(sort): "Take a break" pause + calm landing + Resume + New-Session gating (Epic C PR3)`.

---

### Task 4: Session set-aside confirmation + persistent Undo (restructure `AbandonSessionButton`)

**Files:**
- Modify/replace: `src/features/sessions/AbandonSessionButton.tsx` → a client island that, after a successful set-aside (DELETE), shows a persistent `role=status` "Set aside — you can bring it back · Undo" notice (NO timer) that survives `router.refresh()`; Undo → `POST /api/sessions/[id]/restore` → `router.refresh()`.
- Modify: `src/app/collections/[id]/page.tsx` — render the island at a stable position so the undo notice survives the active-session card unmounting (the island holds the undo state; the card is shown/hidden by the island based on a `session` prop, NOT a parent `{activeSession && …}` conditional).
- Test: `src/features/sessions/AbandonSessionButton.test.tsx` (or the renamed island).

**Interfaces:**
- An island, e.g. `ActiveSessionPanel({ session, resumeHref }: { session: {id; goal} | null; resumeHref: string })` — renders the active-session card (Resume + a "Set aside" two-step confirm) when `session` is non-null; holds `undo` state; on set-aside success `setUndo(session.id)` + `router.refresh()`; renders the persistent "Set aside — Undo" notice when `undo` set (survives the card going away because the island is mounted unconditionally); Undo → POST `/restore` → `setUndo(null)` + `router.refresh()`.

- [ ] **Step 1: Failing component test** — after a successful set-aside (DELETE ok), the persistent undo notice with "Undo" appears and SURVIVES the `session` prop going null (simulate by rerendering with `session={null}` — the notice still shows); clicking "Undo" POSTs `/api/sessions/{id}/restore` and refreshes. Keep the existing two-step-confirm test (a stray tap can't set aside).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the island (reuse the PR2 pattern: undo state held in a component mounted regardless of the card's presence). Keep the two-step confirm (reveal → confirm) on the destructive-ish set-aside. Person-side copy; `role=status`; `aria-hidden` on any decorative `·`.
- [ ] **Step 4: Wire `collections/[id]/page.tsx`** — render the island unconditionally (pass `session={activeSession ?? null}`), replacing the `{activeSession && <Card>…<AbandonSessionButton/></Card>}` block so the undo survives. Keep the empty/no-session rendering gentle.
- [ ] **Step 5: Run** component test + `npm run build` + `npm run lint`.
- [ ] **Step 6: Commit** — `feat(session): confirmation + persistent Undo after setting a session aside (Epic C PR3)`.

---

### Task 5: e2e (pause + session undo) + screenshots

**Files:**
- Create: `e2e/session-pause.spec.ts`, `e2e/session-undo.spec.ts`
- Modify: `e2e/screenshots/capture.ts` (a "paused landing" surface and/or the session-undo notice — seed a paused session)

- [ ] **Step 1: Pause e2e** — seed a journey scenario; open triage; tap "Take a break" (in the chrome); assert it lands on the sort landing showing the paused session calmly AND that "New Session" is NOT offered while a current session exists; tap "Resume"; assert it returns to the sort and the next undecided item shows. 3 viewports.
- [ ] **Step 2: Session-undo e2e** — seed an active session (collection page); set aside the session (two-step confirm); assert the "Set aside — Undo" notice persists after the card disappears; tap "Undo"; assert the active-session card returns. 3 viewports.
- [ ] **Step 3: Run** both specs, then the FULL `npx playwright test` (catch regressions). Add a screenshot surface (paused landing) to `capture.ts`; capture light+dark.
- [ ] **Step 4: Commit** — `test(e2e): session pause + set-aside undo across viewports (Epic C PR3)`.

---

## Final gate (before PR3)
- [ ] build · test:ci · lint · auth:verify · `RUN_DB_TESTS=1` test:db · full e2e (3 viewports) — green
- [ ] `/sync-docs` (API.md: new `POST /sessions/[id]/restore` + the pause/resume PATCH status semantics; ARCHITECTURE: note the New-Session gating mitigates purses-4bhh) + `/graphify --update`
- [ ] Whole-branch `adversarial-review` (security/IDOR on restore; system-design on the pause status + the undo-survives-refresh island; UX/TONE/a11y; QA) → fold → re-verify
- [ ] Light+dark screenshots (paused landing; the session-undo notice) embedded in the PR
- [ ] Merge when green → `/close-out` (close purses-z76 + purses-2f3f)

## Self-review (spec coverage)
§5.4 pause (chrome control, calm landing, Resume) → Tasks 3. §3.3 New-Session gating (purses-4bhh) → Task 3. §5.5 session set-aside confirmation + persistent Undo + restore → Tasks 1, 2, 4. Restore IDOR re-auth → Task 2. e2e + screenshots → Task 5. Note: this does NOT change `sessions_active_unique` (purses-4bhh stays open); it only gates the UI path.

# Adored UX redesign — PR 6 (hygiene) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax. Track work in beads (`bd`), never TodoWrite. Never run two implementer
> subagents at once (memory `sdd-never-overlap-implementers`); implementers never run
> `graphify update .` (memory `sdd-implementers-must-not-run-graphify-update`).

**Goal:** Close the epic's last ten P4 hygiene beads: every writer of a curator's ranking rows runs
under the curator lock (or no longer exists), two pieces of dead code go, revisions insert their rows
in one statement, the flusher's notices have one API and stay on their own collection, a recovery
drain that joins a live one keeps its recovery meaning, every notice kind has words, and the saved
ranking page loses its three visual flaws.

**Architecture:** No schema change, no migration, no new route, no new token. One route method is
**removed** (`PATCH /api/sort-results/[id]`, no caller). One new lock helper,
`lockCuratorMemberships`, sits beside `lockCollectionCurators` in
`src/server/services/purge-lock.ts`. The notice engine (`src/features/sorting/decisionFlusher.ts`)
keeps only its snapshot API (`subscribeNoticeSet` / `getNoticeSet`). Each notice carries its
collection, and the in-flight drain map carries the run's options so a joiner can upgrade them.

**Tech Stack:** Next.js 16 App Router, React 19 (`useSyncExternalStore`), Tailwind 4, vitest +
Testing Library (jsdom/node), Drizzle/Postgres advisory locks (DB tier), Playwright (WebKit tablet
project in CI; a phone check inside it at 390×664).

**Spec:** `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` §3 (the queue and its
notices: quiet, gentle, one line per kind), §4 (the live Ranking, pins, Save, Make a revision), §5
(Frosted shelf, tap targets, phone), §7 (every test runs in CI at the cheapest tier that can catch the
regression), §8 (light/dark/phone screenshots). Bead texts:
`/Users/kimberlygarmoe/.claude/jobs/61c105b1/tmp/pr6/beads.md` (`purses-w7ss.18`–`.23`, `.30`–`.33`).
Context: `docs/superpowers/plans/2026-10-03-ux-redesign-pr5-polish.md` (Task 5, sticky notices;
Rulings §1). ARCHITECTURE decision 42 (one lock for the ranking's draft writers), the account-deletion
decision (`AccountDeletionService` phases), and the "a purge takes the same advisory lock" bullet.
Memories `plan-mandated-shape-can-miss-its-own-invariant` (walk every emitter when a notice filter is
tightened) and `dense-pins-splice` (pinned slots must stay distinct). Base: `origin/main` `9b4c96a15`
(PR 5 merged). Every path, symbol and line reference below was checked against that commit.

## Global Constraints

- **No schema change, no migration, no new route, no new colour token.** If a step seems to need one,
  stop and raise it with the controller. Do not improvise one.
- **TONE:** never "error"/"failed"/"invalid" in person-side copy. Notices are one quiet line each,
  gentle and reversible. No new red.
- **Tap targets** ≥ 44px (`h-11`). WCAG 2.1 AA both themes. Colour is never the only signal.
- **Locks:** a writer of a curator's ranking rows (`sort_results`, `sort_result_items`,
  `sort_result_shares`, `decision_events`, `sessions`, preferences, dispositions) holds
  `pg_advisory_xact_lock(hashtext(collection), hashtext(curator))` for that pair. A transaction that
  takes several such locks takes them in one statement, ordered by the varying key's `hashtext`.
- **Tests:** TDD (failing test first). DB tier only for real DB crossings (here: advisory locks and
  the route-exhaustiveness backstop). A viewport-sensitive e2e check sets
  `page.setViewportSize({ width: 390, height: 664 })` inside the tablet project (precedent:
  `e2e/sort-journey.spec.ts:106`). Every test must run in the CI gate: no `.skip`, and DB tests sit
  in `src/lib/db/` behind `RUN_DB_TESTS=1`.
- **DB, e2e and screenshot runs go through the npm scripts** (`npm run test:db`, `npm run test:e2e`,
  `npm run screenshots`). They take `scripts/with-db-lock.ts`. Never call `playwright` or
  `run-db-tests.sh` directly.
- **Git:** stay on `feat/ux-redesign-pr6-hygiene`. Path-scoped `git add` only (never `-A`). The
  untracked `.beads.gate.lock`, `.codex/` and `pr-screenshots/` are never staged. One logical change
  per commit. Every commit message ends with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s
  ```

  Do not push without the owner's go-ahead.

## Review Focus

These five inputs or conditions are the most likely to bite a person. The beads imply them, and
before this plan no test exercised them. The test that pins each one is added in the task named.

1. **Deleting your account while another tab is pinning or answering in a borrowed collection.**
   Expected: the deletion waits for the in-flight write, then erases everything, with no 500 on either
   side. Pinned in Task 2 (DB: the real writer lock held on a second connection, and the deletion
   proven to block). *Try to break:* two borrowed collections plus a concurrent owner purge of one of
   them (deadlock?); a deletion racing a second deletion of the same user.
2. **A sort page opened while a mid-round flush for the same sort is still in flight, and the sort
   was closed elsewhere (409).** Expected: the recovery meaning wins. The closed sort's waiting
   answers are let go with the "a few answers … didn't make it in" line, never held forever as a
   mid-round conflict. Pinned in Task 4 (engine unit: a recovery joiner during a held request).
   *Try to break:* the joiner arriving after the 409 was already classified; a keepalive joiner.
3. **Two collections open in one tab.** A notice raised by collection A's answers must never show on
   collection B's pages. The sign-in line ("Sign in again…") shows everywhere, because signing in
   is per person. Pinned in Task 4 (`pendingNotices.test.tsx`: two surfaces, two collections) and
   the page wiring tests (sort and results pages pass their collection). *Try to break:* a recovery
   gate on A's page that drains B's queue (B's lines wait for B's page, by design: Decision 9); a
   queue envelope with no collection stamped.
4. **Recovery gate with a sign-in line left over from an earlier drain.** Expected: a recovery that
   lands still refreshes the page. A recovery that is still signed out reveals the page without a
   refresh and keeps the queue. Pinned in Task 4 (the existing gate tests "a sign-in notice left over
   from an earlier drain…" and "401 during the recovery drain…" run unchanged against the new
   no-`live`-flag gate). *Try to break:* a multi-key recovery where one key 401s and another lands.
5. **The saved ranking on a 390px phone.** Expected: one tier mark per card, visible breathing room
   above the Onward eyebrow, "Create link" on one line, and no sideways scroll. Pinned in Task 5
   (`RankedResults.test.tsx` count, and a phone geometry e2e in `e2e/sort-journey.spec.ts`).

Accepted, not pinned: a notice raised for a collection the person never visits again in this tab is
never shown. Notices are per tab and cleared on reload, and the pieces involved come around again
(quarantine) or stay visibly placed (superseded). Pinning "not shown" would test an absence the
design intends.

---

## Decisions this plan takes where the spec is silent

1. **`.18` takes the lock.** At the start of Phase 2, `AccountDeletionService.deleteCurrentUser`
   calls a new `lockCuratorMemberships(tx, userId)`. That is one statement:
   `select pg_advisory_xact_lock(hashtext(collection_id), hashtext(userId)) from memberships where
   user_id = userId order by hashtext(collection_id)`. The lock set is the user's **memberships**
   only. Owned collections were already purged in Phase 1 under `lockCollectionCurators`, and a
   collection the user is no longer a member of has no writer that can pass authz. *Evidence:* Phase
   2 deletes `sort_result_items` and then `sort_results` by curator. A pin committing in between adds
   items under a draft, and `sort_result_items → sort_results` has no `ON DELETE CASCADE`, so the
   `sort_results` delete 23503s and the account deletion 500s. The reverse order does the same to the
   pin. *Deadlock:* a writer holds one curator lock (plus `lockSaveKey`, a disjoint keyspace taken
   last). A purge holds locks for one collection only. So nothing waits on deletion's earlier locks
   while holding a later one.
2. **`.21` deletes the rename instead of locking it.** `PATCH /api/sort-results/[id]` has no caller
   in `src/` or `e2e/`: names are set at Save, and drafts are reached only through the live Ranking.
   Its draft-only check reads outside any transaction (the PR 4 Architect note: a concurrent save can
   finalize the row between check and update, and a saved keepsake gets renamed). The precedent is the
   per-item `DELETE …/items/[rid]`, "the last unlocked draft writer, with no UI caller", removed in
   PR 2 (API.md). `ResultController.updateResult` and `UpdateResultSchema` go with it. After this,
   every `sort_results` writer is under the curator lock by construction. If the owner wants rename
   later, it comes back as `SortResultService.renameDraft` inside `inCuratorTx`, with a
   `findByIdForUpdate` status re-check.
3. **`.19`: `computePreferences`' `events` parameter becomes required.**
   `ScoringService.loadCuratorDecisionEvents` (a per-session loop) goes, and so do the constructor's
   two repositories, which only it used. `new ScoringService()` takes no arguments. Prod already
   passes the shared loader's events (`PreferenceStateService.recalculatePreferences`). The unit tests
   pass events directly, which is the loader's output shape. `decision-log.test.ts` and
   `usage-events.integration.test.ts` already pin the loader itself. No new test: a deletion guarded by
   `tsc` and the existing suite.
4. **`.20`: the batch route and `scripts/bench-batch.ts` mint with `generateId("event")`.**
   `generateOrderedIdFactory` and its first two tests go. The third test (factory order survives the
   shared comparator) is kept, retargeted at `generateId("event")`, because it pins the property the
   batch route relies on: a later array entry wins at a shared `createdAt`. The DB guard
   `decision-batch.integration.test.ts` "shared batch timestamp…" (line 466) and "case 6" (line 808)
   stay green unchanged.
5. **`.23`: `insertResultWithItems` gains `slots: ReadonlyMap<string, number> = new Map()` and
   writes all rows in one `createMany`, with `manualRank: slots.get(itemId) ?? null`.** The revision's
   update loop goes. The unit tests (the precedent is `saveAndShare`'s "one multi-row insert each —
   never row by row") assert one `createMany`, no `create` and no `update`. No new DB test:
   `ranking-save-route.integration.test.ts:177` already pins the revision's saved-order pins through
   the DB (`listPins` → b at 1, a at 2), and `sort-results-usage-snapshot.integration.test.ts` pins
   usage and a low row's null `manualRank`. Slots come from `savedOrderPositions`, which are distinct
   by construction (`dense-pins-splice`).
6. **`.30`: the snapshot API survives; the stream goes.** `subscribeNotices`, `noticeSubscribers`
   and the replay-on-subscribe are deleted. `CompareChoice` derives "closed elsewhere" from the
   snapshot (a standing `session_conflict` for its own sort). `PendingDecisionsGate` no longer
   subscribes at all. When its recovery drain settles, it reads `getNoticeSet()`: if `auth_required`
   still stands, nothing landed, so it reveals without a refresh. Otherwise it refreshes. The `live`
   flag goes, because a 2xx anywhere in the drain already clears `auth_required`, so a leftover line
   can no longer skip the refresh after a recovery that lands. **Behaviour change:** on a 401 the gate
   reveals when the drain settles (immediately for one queue, at the latest when the 5 s bound fires),
   not at the instant the 401 is classified.
7. **`.31`: every notice except `auth_required` carries `collectionId: string | undefined`** (a
   required key, so TypeScript makes every emitter supply it). The value is the queue envelope's
   stamped collection (`readQueueCollectionId`), captured when the drain starts. Surfaces filter: same
   collection (a notice with no collection, from an envelope that predates stamping, shows anywhere),
   **and** for `session_conflict`, same sort. `auth_required` has no collection and shows on every
   surface: signing in is per person. The engine keys its map by kind + collection, so two
   collections' lines coexist. `dismissNotice` takes the notice. `PendingNotices` and
   `PendingDecisionsGate` take a required `collectionId`.
8. **`.32`: the in-flight map holds `{ promise, run }`**, where `run.opts` is a copy owned by the
   drain. A joiner passing `recovery: true` sets `run.opts.recovery = true`. The upgrade is one-way:
   recovery is never downgraded. The 409 branch reads `run.opts.recovery` when it classifies, so a
   join before the response lands takes the recovery path. A join after it was already classified
   changes nothing (that drain already stopped). Keepalive is unchanged: its joiners already ride
   `keepaliveNext` via `preemptBackoff`.
9. **Notices raised during a recovery on another collection's page wait for that collection's
   page.** The gate drains every pending queue of the curator (`listPendingKeysForCurator`), and with
   `.31` a line about collection B no longer shows on collection A. This is accepted (Review Focus,
   "Accepted, not pinned").
10. **`.33`: add copy rather than stop emitting.** A disposition 409 means the piece had already been
    given an answer, so "set aside" / "not yet" did not apply. Dropping it silently would hide a lost
    intent. New constant `DISPOSITION_SUPERSEDED_NOTICE = "One piece already had your answer, so it
    stays where that answer put it"`, with Okay. `NOTICE_COPY` becomes
    `Record<FlushNotice["kind"], string>`, so a future kind without words fails to compile. That makes
    this class of bug structural.
11. **`.22` saved ranking:**
    - (a) The glyph-only `TierBadge` above each "full ranking" card goes. `ItemCard` already carries
      the tier mark (its bucket `Badge`, with `role="img"` and an `aria-label`), so the pill was a
      duplicate floating above the card. The `space-y-2` wrapper and `BUCKET_TO_TIER` go with it.
    - (b) The Onward section gets `pt-4`, giving 48px between the content above and the "Onward"
      eyebrow. It was the bare 32px `space-y-8` gap, which reads as cramped above a small uppercase
      label.
    - (c) The share panel's header row stacks below `sm` (`flex flex-col gap-4 sm:flex-row
      sm:items-start sm:justify-between`), and the button is `shrink-0 self-start`, so "Create link"
      never wraps.

## Owner-veto list (put in the PR body with screenshots)

- **Rename removed from the API:** `PATCH /api/sort-results/[id]` is gone (no screen used it). A
  saved ranking's name is the one given at Save.
- **Saved ranking, cards:** the small tier pill floating above each card in "The full ranking" is
  gone. Each card's own tier dots remain.
- **Saved ranking, Onward:** a little more room above the "Onward" eyebrow (48px, was 32px).
- **Saved ranking, share panel on phone:** the "Show someone what you love" text and "Create link"
  stack; the button sits under the text, on one line.
- **New notice line** (a set-aside or not-yet that an answer had already settled): "One piece
  already had your answer, so it stays where that answer put it", with Okay.
- **Notices stay on their collection:** a line about one collection's answers no longer shows on
  another collection's pages. The sign-in line still shows everywhere.
- **Recovery after sign-out:** the page reveals when the recovery drain settles (at most 5 s) rather
  than the instant the sign-out is seen.

## Rulings (controller)

*(Empty at plan time. The controller records adversarial-review rulings here.)*

## Rejected review findings

*(Empty at plan time.)*

---

## File map

| Task | Beads | Create | Modify | Delete |
|---|---|---|---|---|
| 1 | `.19`, `.20` | — | `src/server/services/ScoringService.ts`, `src/server/services/ScoringService.test.ts`, `src/server/api/preferences.ts`, `src/lib/id.ts`, `src/lib/id.test.ts`, `src/app/api/sessions/[id]/decisions/batch/route.ts`, `scripts/bench-batch.ts` | — |
| 2 | `.18`, `.21` | — | `src/server/services/purge-lock.ts`, `src/server/services/AccountDeletionService.ts`, `src/lib/db/purge-recompute-lock.integration.test.ts`, `src/app/api/sort-results/[id]/route.ts`, `src/server/api/results.ts`, `src/lib/db/route-authz-enumeration.integration.test.ts`, `src/lib/db/sort-results-authz.integration.test.ts`, `src/lib/db/sort-pipeline.integration.test.ts` | — |
| 3 | `.23` | — | `src/server/services/SortResultService.ts`, `src/server/services/SortResultService.test.ts` | — |
| 4 | `.30`–`.33` | — | `src/features/sorting/decisionFlusher.ts` (+ test), `src/features/sorting/pendingNotices.tsx` (+ test), `src/features/sorting/PendingDecisionsGate.tsx` (+ test), `src/features/sorting/CompareChoice.tsx`, `src/features/sorting/CompareChoice.test.tsx`, `src/features/sorting/TriageRound.tsx`, `src/app/collections/[id]/sort/page.tsx` (+ `page.test.tsx`), `src/app/collections/[id]/results/page.tsx` (+ `page.test.tsx`) | — |
| 5 | `.22` | — | `src/features/results/RankedResults.tsx`, `src/features/results/RankedResults.test.tsx`, `src/features/results/SharePanel.tsx`, `e2e/sort-journey.spec.ts` | — |
| 6 | all | — | `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`, `graphify-out/` (controller) | — |

Order: the tasks run in sequence. Tasks 2 and 3 both touch the curator-lock story but different
files. Task 3's `SortResultService.ts` is untouched by Task 2, because the rename lived in
`ResultController`. Task 4 is one engine change in one commit: `.30`/`.31`/`.32`/`.33` all reshape
`FlushNotice`, the notice map and the drain map, and splitting them would mean three passes over the
same lines and tests (memory `batch-changes-gate-once`). Task 5 is independent of 1–4. Task 6 runs
last.

---

## Task 1: Dead code — `ScoringService.loadCuratorDecisionEvents` and `generateOrderedIdFactory` (`purses-w7ss.19`, `.20`)

**Files:** see the file map. **Test:** existing suites, plus `src/lib/id.test.ts` (one test
retargeted).

**Interfaces:**
- Produces: `ScoringService` has a no-argument constructor;
  `computePreferences(collectionId: string, curatorId: string, liveItemIds: ReadonlySet<string>,
  events: DecisionEvent[]): Promise<CollectionPreferenceItem[]>` (`events` required).
- Produces: `generateOrderedIdFactory` no longer exists; batch inserts use `generateId("event")`.

This task is pure deletion behind existing tests (CLAUDE.md: trivial refactors need no new test). The
red step is the type checker.

- [ ] **Step 1: Retarget the id test first.** In `src/lib/id.test.ts`, replace the import and the
  whole `describe("generateOrderedIdFactory", …)` block (lines 2 and 7–28) with:

```ts
import { generateId } from "./id";
```

```ts
describe("generateId('event') in a batch", () => {
  it("keeps the event_ format, and at an equal createdAt a later id orders after an earlier one under the shared comparator", () => {
    const t = new Date(1000);
    const a = { id: generateId("event"), createdAt: t };
    const b = { id: generateId("event"), createdAt: t };
    expect(a.id).toMatch(EVENT_ID);
    expect(compareByCreatedAtThenId(a, b)).toBeLessThan(0);
    // sign-equal with the retired comparators:
    expect(a.id.localeCompare(b.id)).toBeLessThan(0);
    expect(a.id < b.id).toBe(true);
  });
});
```

  Keep `EVENT_ID`, the `compareByCreatedAtThenId` import and the existing `describe("generateId", …)`
  block.

- [ ] **Step 2: Delete the factory and switch its callers.**
  - `src/lib/id.ts`: delete lines 14–20 (the comment and `generateOrderedIdFactory`).
  - `src/app/api/sessions/[id]/decisions/batch/route.ts`: line 5
    `import { generateOrderedIdFactory } from "@/lib/id";` → `import { generateId } from "@/lib/id";`.
    Delete line 151 (`const nextId = generateOrderedIdFactory();`). Line 178 `id: nextId(),` →
    `id: generateId("event"),`. Edit the comment above it (lines 147–150) to:
    `// §2.3.4/5 — classify in array order; insert survivors with generateId's process-wide monotonic`
    `// ids (later array entries get strictly greater ids, so at the shared transaction timestamp the`
    `// (createdAt, id) comparator resolves in-batch same-item conflicts to the later entry).`
  - `scripts/bench-batch.ts`: line 33 `import { generateId, generateOrderedIdFactory } from "@/lib/id";`
    → `import { generateId } from "@/lib/id";` (it already mints `generateId("event")` at line 81).
    Delete line 104 (`const nextId = …`). Line 112 `id: nextId(),` → `id: generateId("event"),`.

- [ ] **Step 3: Delete `ScoringService.loadCuratorDecisionEvents`.** In
  `src/server/services/ScoringService.ts`:
  - Delete the two type imports `DecisionEventRepository` and `SessionRepository` (lines 7–8).
  - Delete the constructor (lines 29–32) and the method with its comment (lines 51–64).
  - Replace the comment and signature at lines 66–87 so that `events` is required:

```ts
  // `events` is the curator's decision log, read once by the caller through the shared loader
  // (decision-log.ts) and shared with the comparison mapping.
  //
  // purses-5g1g: `liveItemIds` is the collection's live (non-deleted) item set.
  // … (keep the existing purses-5g1g paragraph verbatim) …
  async computePreferences(
    collectionId: string,
    curatorId: string,
    liveItemIds: ReadonlySet<string>,
    events: DecisionEvent[],
  ): Promise<CollectionPreferenceItem[]> {
    const allDecisions = events;
```

  - `src/server/api/preferences.ts:23`: `new ScoringService(decisionRepo, sessionRepo)` →
    `new ScoringService()`.
  - `src/server/services/ScoringService.test.ts`: delete the two repository type imports (lines
    9–10) and `Session` from the `@/types` import (line 6; only `buildService` used it). Replace `buildService` and `scoreByItem` (lines
    56–94) with:

```ts
async function scoreByItem(
  decisions: DecisionEvent[],
  liveItemIds: ReadonlySet<string> = referencedItemIds(decisions),
) {
  const prefs = await new ScoringService().computePreferences(COLLECTION, CURATOR, liveItemIds, decisions);
  return new Map(prefs.map((p) => [p.itemId, p]));
}
```

  (Move `referencedItemIds` above it if needed. `SESSION` stays: the fixtures use it.)

- [ ] **Step 4: Verify.**
  `grep -rn "generateOrderedIdFactory\|loadCuratorDecisionEvents(collectionId" src scripts e2e`.
  Expected: no output. Then `npx tsc --noEmit` (expected: no errors), then
  `npx vitest run src/lib/id.test.ts src/server/services src/server/api` (expected: PASS). The batch
  route's DB guard runs in Task 6's `npm run test:db`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/id.ts src/lib/id.test.ts "src/app/api/sessions/[id]/decisions/batch/route.ts" scripts/bench-batch.ts \
  src/server/services/ScoringService.ts src/server/services/ScoringService.test.ts src/server/api/preferences.ts
git commit -m "chore(sort): delete generateOrderedIdFactory and ScoringService's own log loader (purses-w7ss.19, purses-w7ss.20)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s"
```

---

## Task 2: Curator-lock writers — account deletion locks; the unlocked rename goes (`purses-w7ss.18`, `.21`)

**Files:** see the file map. **Test:** `src/lib/db/purge-recompute-lock.integration.test.ts` (one new
DB case), `src/lib/db/route-authz-enumeration.integration.test.ts` (the exhaustiveness backstop).

**Interfaces:**
- Produces: `export async function lockCuratorMemberships(tx: Database, curatorId: string): Promise<void>`
  in `src/server/services/purge-lock.ts`.
- Produces: `src/app/api/sort-results/[id]/route.ts` exports `GET` and `DELETE` only;
  `ResultController` no longer has `updateResult`.

**Invariant (`.18`):** account deletion's Phase 2 never interleaves with a curator-lock writer for the
same (collection, user). **Pinned by** the new DB case (real lock on a second connection; the
deletion blocks). **Invariant (`.21`):** no `sort_results` writer runs outside the curator lock.
**Pinned by** the route-enumeration DB test (the method is gone, so the exhaustiveness check fails
if it comes back without a registered case).

- [ ] **Step 1: Failing DB case for `.18`.** In `src/lib/db/purge-recompute-lock.integration.test.ts`,
  add the import after the `CollectionRepository` import (line 31):

```ts
import { AccountDeletionService } from "@/server/services/AccountDeletionService";
```

  Then add, after `itemCount()` (line 99):

```ts
  async function membershipCount(): Promise<number> {
    const rows = await probe<{ n: number }[]>`
      select count(*)::int as n from memberships where user_id = ${memberId}`;
    return rows[0].n;
  }
```

  Then add this case at the end of the `describeDb` block:

```ts
  // purses-w7ss.18: Phase 2 erases the member's curator rows in this collection. A pin holding this
  // lock mid-write adds sort_result_items under a draft; the FK has no cascade, so an unlocked
  // Phase 2 died on 23503 (500, retryable) — or killed the pin the same way.
  it("AccountDeletionService waits on the member's writer lock before erasing their rows, then completes", async () => {
    const { db } = getTestDb();
    await holdWriterLock();

    const deleted = new AccountDeletionService(db)
      .deleteCurrentUser(memberId)
      .then(() => "done" as const);

    await new Promise((r) => setTimeout(r, 750));
    // Pre-fix Phase 2 has already committed here and the membership is gone.
    expect(await membershipCount()).toBe(1);

    await holder.unsafe("COMMIT");
    await expect(deleted).resolves.toBe("done");
    expect(await membershipCount()).toBe(0);
  }, 20_000);
```

- [ ] **Step 2: Failing exhaustiveness check for `.21`.** In
  `src/lib/db/route-authz-enumeration.integration.test.ts`, replace the PATCH case (lines 538–541,
  `c("sort-results/[id]/route.ts", "PATCH", … { name: "Stranger rename" }),`) with:

```ts
    // PATCH removed (purses-w7ss.21): no caller, and it renamed outside the curator lock.
```

- [ ] **Step 3: Run both and see them fail.** `RUN_DB_TESTS=1` is set by the script:
  `npm run test:db -- src/lib/db/purge-recompute-lock.integration.test.ts src/lib/db/route-authz-enumeration.integration.test.ts`.
  (If `run-db-tests.sh` does not forward file arguments, run the whole `npm run test:db` and read
  these two files' results.) Expected: FAIL. The account-deletion case sees `membershipCount() === 0`
  at 750 ms, and the enumeration test reports `PATCH /api/sort-results/[param]` as a route with no
  case.

- [ ] **Step 4: Implement `.18`.** Append to `src/server/services/purge-lock.ts`:

```ts
/**
 * Account deletion's borrowed pass (Phase 2) erases one curator's private rows in every collection
 * they curate but don't own. Take that curator's writer lock in each, so a pin, save or decision
 * for the same (collection, curator) either commits before the deletes or waits for them — never
 * lands between the sort_result_items and sort_results deletes (no cascade → 23503).
 *
 * Memberships only: owned collections were already purged (under lockCollectionCurators), and a
 * collection the user no longer belongs to has no writer that passes authz. Ordered by the lock
 * key; a writer holds one curator lock (plus lockSaveKey, a disjoint keyspace taken last) and a
 * purge locks one collection, so no cycle. Released at commit/rollback.
 */
export async function lockCuratorMemberships(
  tx: Database,
  curatorId: string,
): Promise<void> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtext(collection_id), hashtext(${curatorId}))
    from memberships
    where user_id = ${curatorId}
    order by hashtext(collection_id)
  `);
}
```

  In `src/server/services/AccountDeletionService.ts`, add
  `import { lockCuratorMemberships } from "@/server/services/purge-lock";` after line 2. Make the
  first statement inside the Phase 2 `withTransaction` (line 85) the lock:

```ts
    await withTransaction(this.db, async (tx) => {
      // Serialize with this curator's in-flight writers in each borrowed collection (purses-w7ss.18).
      await lockCuratorMemberships(tx, userId);
      await new SortResultShareRepository(tx).deleteByCurator(userId);
```

  In the class doc comment's Phase 2 paragraph (lines 30–34), add after "The owner's own rows are
  untouched.": `It first takes the curator's writer lock in each of those collections
  (lockCuratorMemberships), so an in-flight pin or decision finishes first.`

- [ ] **Step 5: Implement `.21`.**
  - `src/app/api/sort-results/[id]/route.ts`: delete the `PATCH` export (lines 26–48). Delete the
    `ResultController` import only if `GET` no longer uses it. It does (`getResult`), so keep it.
  - `src/server/api/results.ts`: delete `UpdateResultSchema` (lines 6–8), the `zod` import (line 1)
    and `updateResult` (lines 35–38).
  - `src/lib/db/sort-results-authz.integration.test.ts`: line 31
    `import { GET as getResult, PATCH as patchResult, DELETE as deleteResult } …` →
    `import { GET as getResult, DELETE as deleteResult } …`. Delete the three PATCH cases (lines
    101–124: "PATCH 403s a non-member…", "PATCH 403s a member who is not the curator…", "PATCH 200s
    for the curator…"). The curator-scope and IDOR boundaries stay pinned for `GET`, `DELETE`,
    finalize and shares in the same file.
  - `src/lib/db/sort-pipeline.integration.test.ts`: line 50 →
    `import { DELETE as deleteResultRoute } from "@/app/api/sort-results/[id]/route";`. Delete the two
    PATCH cases (lines 428–479: "…rejects renaming a finalized result with 409…" and "…400s an
    invalid body (empty name)…").
  - Check: `grep -rn "patchResult\|updateResult\b\|UpdateResultSchema" src e2e`. Expected: no output.

- [ ] **Step 6: Run and see them pass.** Re-run the Step 3 command (expected: PASS), then
  `npx tsc --noEmit` and `npx vitest run src/server` (expected: PASS).

- [ ] **Step 7: Commit.**

```bash
git add src/server/services/purge-lock.ts src/server/services/AccountDeletionService.ts \
  src/lib/db/purge-recompute-lock.integration.test.ts src/lib/db/route-authz-enumeration.integration.test.ts \
  "src/app/api/sort-results/[id]/route.ts" src/server/api/results.ts \
  src/lib/db/sort-results-authz.integration.test.ts src/lib/db/sort-pipeline.integration.test.ts
git commit -m "fix(ranking): account deletion takes the curator lock; drop the unlocked, uncalled result rename (purses-w7ss.18, purses-w7ss.21)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s"
```

---

## Task 3: Revisions and drafts insert their rows in one statement (`purses-w7ss.23`)

**Files:** `src/server/services/SortResultService.ts`, `src/server/services/SortResultService.test.ts`.

**Interfaces:**
- Consumes: `SortResultItemRepository.createMany(rows: NewSortResultItem[])` (exists; `manualRank`
  optional).
- Produces: `private insertResultWithItems(tx, collectionId, curatorId, name, items,
  usageByItemId, slots: ReadonlyMap<string, number> = new Map()): Promise<SortResult>`.

**Invariant:** a materialization writes its rows in one insert inside the curator lock. A revision's
loved rows carry their saved slot as `manualRank`; every other row carries `null`. **Pinned by** the
unit tests below (the shape), plus `ranking-save-route.integration.test.ts:177` and
`sort-results-usage-snapshot.integration.test.ts` (the DB result).

- [ ] **Step 1: Failing unit tests.** In `src/server/services/SortResultService.test.ts`:
  - In "ranks preferences (score desc) and inserts one tx item per preference" (line 167), rename it
    to `"ranks preferences (score desc) and inserts every row in one multi-row insert"` and replace
    the assertions from line 198 to the end of the test with:

```ts
    expect(txItemRepo.create).not.toHaveBeenCalled();
    expect(txItemRepo.createMany).toHaveBeenCalledTimes(1);
    // Epic S: each row carries the snapshot usage (null here — the stubbed log is empty).
    expect(txItemRepo.createMany).toHaveBeenCalledWith([
      { sortResultId: created.id, itemId: "a", computedRank: 0, computedBucket: "top", manualRank: null, usage: null },
      { sortResultId: created.id, itemId: "b", computedRank: 1, computedBucket: "medium", manualRank: null, usage: null },
    ]);
```

  - In "createDraftResult with no preferences creates a result but zero items" (line 244), replace
    `expect(txItemRepo.create).not.toHaveBeenCalled();` with
    `expect(txItemRepo.createMany).toHaveBeenCalledWith([]); // the repo no-ops an empty list`.
  - In "clones a finalized source's items into a new '(Revision)' draft via the tx primitive" (line
    343), replace the two `toHaveBeenNthCalledWith` assertions (lines 376–391) with:

```ts
    // One multi-row insert; the saved loved order is pinned AT insert (a at slot 0), the low row
    // is not (savedOrderPositions skips Onward). Never row by row, never a follow-up update.
    expect(txItemRepo.create).not.toHaveBeenCalled();
    expect(txItemRepo.update).not.toHaveBeenCalled();
    expect(txItemRepo.createMany).toHaveBeenCalledTimes(1);
    expect(txItemRepo.createMany).toHaveBeenCalledWith([
      { sortResultId: newResult.id, itemId: "a", computedRank: 0, computedBucket: "top", manualRank: 0, usage: null },
      { sortResultId: newResult.id, itemId: "b", computedRank: 1, computedBucket: "low", manualRank: null, usage: null },
    ]);
```

- [ ] **Step 2: Run and see them fail.** `npx vitest run src/server/services/SortResultService.test.ts`.
  Expected: FAIL. `create` is called per row and `createMany` is not.

- [ ] **Step 3: Implement.** In `src/server/services/SortResultService.ts`, replace
  `insertResultWithItems` (lines 216–233) with:

```ts
  // Invariant: tx-bound repos only — a write on this.sortResultRepo would not roll back.
  // One multi-row insert under the curator lock (purses-w7ss.23); `slots` pins rows at insert
  // (a revision's saved loved order — distinct slots, see savedOrderPositions).
  private async insertResultWithItems(
    tx: Database,
    collectionId: string,
    curatorId: string,
    name: string,
    items: MaterializedItem[],
    usageByItemId: ReadonlyMap<string, UsageAnswer>,
    slots: ReadonlyMap<string, number> = new Map(),
  ): Promise<SortResult> {
    const resultRepo = new SortResultRepository(tx);
    const number = await resultRepo.getNextResultNumber(collectionId);
    const result = await resultRepo.insertWithNumber({ collectionId, curatorId, name, status: "draft", number });
    await new SortResultItemRepository(tx).createMany(
      items.map((item) => ({
        sortResultId: result.id,
        ...item,
        manualRank: slots.get(item.itemId) ?? null,
        usage: usageByItemId.get(item.itemId) ?? null,
      })),
    );
    return result;
  }
```

  In `supersedeResult`, replace the insert and the update loop (lines 418–424):

```ts
      await this.deleteDrafts(tx, source.collectionId, source.curatorId);
      const revision = await this.insertResultWithItems(
        tx, source.collectionId, source.curatorId, `${source.name} (Revision)`, items, usageByItemId, slots,
      );
      return { revision };
```

  (`itemRepo` in that callback is still used by the `pinsLostToRevision` check above; keep it.)

- [ ] **Step 4: Run and see them pass.** `npx vitest run src/server/services` (expected: PASS) and
  `npx tsc --noEmit` (expected: no errors). The DB guards (`ranking-save-route`,
  `sort-results-usage-snapshot`, `sort-pipeline` "supersedeResult clones…") run in Task 6's
  `npm run test:db`. If you want earlier evidence, run
  `npm run test:db -- src/lib/db/ranking-save-route.integration.test.ts src/lib/db/sort-results-usage-snapshot.integration.test.ts`
  now.

- [ ] **Step 5: Commit.**

```bash
git add src/server/services/SortResultService.ts src/server/services/SortResultService.test.ts
git commit -m "perf(ranking): drafts and revisions insert their rows in one statement, pins set at insert (purses-w7ss.23)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s"
```

---

## Task 4: The notice engine — one API, scoped by collection, recovery joins kept, every kind voiced (`purses-w7ss.30`, `.31`, `.32`, `.33`)

**Files:** see the file map.

**Interfaces (all in `src/features/sorting/decisionFlusher.ts` unless noted):**
- `export type FlushNotice` — every variant except `auth_required` gains
  `collectionId: string | undefined`:

```ts
// collectionId: the collection whose queue raised it (the envelope's stamp), so a surface shows only
// its own collection's lines (purses-w7ss.31); undefined only for a queue that predates stamping.
// auth_required has none: signing in is per person, not per collection.
export type FlushNotice =
  | { kind: "rejected_unknown_item"; count: number; collectionId: string | undefined }
  | { kind: "quarantined"; count: number; collectionId: string | undefined }
  | { kind: "session_conflict"; sessionId: string; collectionId: string | undefined } // mid-round batch 409; names its sort so it never holds another
  | { kind: "closed_session_discarded"; collectionId: string | undefined } // recovery batch 409: a closed sort's waiting answers were let go
  | { kind: "disposition_superseded"; collectionId: string | undefined } // disposition POST 409 (PreferenceExistsError)
  | { kind: "auth_required" };
```

- `export function noticeKey(n: FlushNotice): string` — `kind` for `auth_required`, else
  `` `${kind}\u0000${collectionId ?? ""}` ``.
- `export function subscribeNoticeSet(listener: () => void): () => void` and
  `export function getNoticeSet(): readonly FlushNotice[]` — **the only notice API** (unchanged
  signatures).
- `export function dismissNotice(notice: FlushNotice): void` — signature change (was `kind`).
- **Removed:** `subscribeNotices`.
- `pendingNotices.tsx`: `export const DISPOSITION_SUPERSEDED_NOTICE = "One piece already had your
  answer, so it stays where that answer put it";`
  `export function PendingNotices({ collectionId, sessionId }: { collectionId: string; sessionId?: string })`.
- `PendingDecisionsGate.tsx`: `PendingDecisionsGate({ curatorId, collectionId, children }: { curatorId: string; collectionId: string; children: React.ReactNode })`.

**Invariants and what pins them:**
- *One API (`.30`):* nothing imports `subscribeNotices`; `CompareChoice`'s hold and the gate's
  refresh decision read the snapshot. Pinned by `tsc` (the export is gone), the existing
  `CompareChoice.test.tsx` 409 tests (hold, no "it's safe" line, no Undo after a 409), and the gate
  tests "401 during the recovery drain…" and "a sign-in notice left over from an earlier drain never
  skips the refresh…" (unit, real engine).
- *Scoped (`.31`):* a line raised by collection B's queue never renders on a surface for collection
  A, and `auth_required` renders on both. Pinned by the new `pendingNotices.test.tsx` case (unit, real
  engine) and the page wiring tests (sort and results pages pass their collection).
- *Recovery joins (`.32`):* a recovery caller joining an in-flight drain gets recovery semantics on a
  409. Pinned by the new engine unit test.
- *Every kind voiced (`.33`):* `NOTICE_COPY: Record<FlushNotice["kind"], string>` (compile-time), plus
  a render test of the new line with Okay.

- [ ] **Step 1: Failing engine tests** in `src/features/sorting/decisionFlusher.test.ts`.
  - **Migrate the notice assertions to the snapshot** (the stream is going). In each of the nine
    "failure taxonomy" tests (lines 446–611), delete
    `const notices: FlushNotice[] = [];` and `engine.subscribeNotices((n) => notices.push(n));`, and
    assert on `engine.getNoticeSet()` instead, with the collection carried (`keyA` is `col_1`):
    - 446 disposition 409:
      `expect(engine.getNoticeSet()).toEqual([{ kind: "disposition_superseded", collectionId: "col_1" }]);`
    - 470 disposition 404 and 546 (403): `expect(engine.getNoticeSet()).toEqual([]);`
    - 491: `expect(engine.getNoticeSet()).toEqual([{ kind: "quarantined", count: 1, collectionId: "col_1" }]);`
    - 511: the same with `count: 2`.
    - 531 (401): `expect(engine.getNoticeSet()).toEqual([{ kind: "auth_required" }]);`
    - 560 (mid-round 409):
      `expect(engine.getNoticeSet()).toEqual([{ kind: "session_conflict", sessionId: "sess_1", collectionId: "col_1" }]);`
    - 574 (recovery 409):
      `expect(engine.getNoticeSet()).toEqual([{ kind: "closed_session_discarded", collectionId: "col_1" }]);`
    - 587 (rejected):
      `expect(engine.getNoticeSet()).toEqual([{ kind: "rejected_unknown_item", count: 1, collectionId: "col_1" }]);`
  - **Replace** the "notices are sticky" describe (lines 613–636) with:

```ts
describe("notices are sticky (a surface that mounts later still reads them)", () => {
  it("the current set holds the notice; dismissNotice clears it; a later 2xx clears auth_required", async () => {
    const engine = await loadEngine();
    global.fetch = vi.fn(async () => jsonRes(401)) as unknown as typeof fetch;
    await enqueue(keyA, triage());
    await engine.drain([keyA]);

    expect(engine.getNoticeSet()).toEqual([{ kind: "auth_required" }]);
    engine.dismissNotice({ kind: "auth_required" });
    expect(engine.getNoticeSet()).toEqual([]);

    await engine.drain([keyA]); // still signed out: raised again
    expect(engine.getNoticeSet()).toEqual([{ kind: "auth_required" }]);
    global.fetch = vi.fn(async (_url: string, init: RequestInit = {}) => respondCreated(init)) as unknown as typeof fetch;
    await engine.drain([keyA]); // signed back in: the 2xx resolves it
    expect(engine.getNoticeSet()).toEqual([]);
    expect(readQueue(keyA)).toEqual([]);
  });

  it("two collections' lines of one kind stand side by side, and each is dismissed alone (purses-w7ss.31)", async () => {
    const engine = await loadEngine();
    const keyB: QueueKey = { curatorId: "user_a", sessionId: "sess_2", collectionId: "col_2" };
    const stale = () => triage({ decision: { itemId: `item_${ulid().toLowerCase()}`, result: "loved" } });
    await enqueue(keyA, stale());
    await enqueue(keyB, stale());
    await engine.drain([keyA, keyB]);

    expect(engine.getNoticeSet()).toEqual([
      { kind: "quarantined", count: 1, collectionId: "col_1" },
      { kind: "quarantined", count: 1, collectionId: "col_2" },
    ]);
    engine.dismissNotice(engine.getNoticeSet()[0]);
    expect(engine.getNoticeSet()).toEqual([{ kind: "quarantined", count: 1, collectionId: "col_2" }]);
  });
});

describe("drain — a recovery caller joining a live drain (purses-w7ss.32)", () => {
  it("makes it a recovery drain: a 409 lets the closed sort's answers go instead of holding them as a mid-round conflict", async () => {
    const engine = await loadEngine();
    let respond: ((r: Response) => void) | undefined;
    global.fetch = vi.fn(
      () => new Promise<Response>((resolve) => { respond = resolve; }),
    ) as unknown as typeof fetch;
    await enqueue(keyA, triage());

    const live = engine.triggerFlush(keyA); // a mid-round drain, request in flight
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const recovery = engine.drain([keyA], { recovery: true });
    expect(recovery).toBe(live); // still one drain (F12)

    respond?.(jsonRes(409));
    await recovery;

    expect(engine.getNoticeSet()).toEqual([{ kind: "closed_session_discarded", collectionId: "col_1" }]);
    expect(window.localStorage.getItem(pendingStorageKey(keyA))).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
```

  Remove the `import type { FlushNotice }` line (line 14) if nothing else uses it.

- [ ] **Step 2: Failing surface tests** in `src/features/sorting/pendingNotices.test.tsx`.
  - Import `DISPOSITION_SUPERSEDED_NOTICE` from `./pendingNotices`. Add it to the TONE loop at line
    101. Change line 93 to `for (const notice of getNoticeSet()) dismissNotice(notice);`.
  - Every `render(<PendingNotices … />)` gains `collectionId="coll_1"` (lines 110, 133–135, 158, 177,
    200, 245; inside the three-surface render at 129–137 too: `<PendingNotices collectionId="coll_1"
    sessionId={key.sessionId} />`, `<PendingNotices collectionId="coll_1" sessionId="sess_other" />`,
    `<PendingNotices collectionId="coll_1" />`).
  - Line 238 `act(() => dismissNotice("session_conflict"));` →
    `act(() => getNoticeSet().filter((n) => n.kind === "session_conflict").forEach(dismissNotice));`
  - Add:

```ts
describe("PendingNotices — scoped by collection (purses-w7ss.31)", () => {
  it("a line from another collection's answers stays on that collection; the sign-in line shows everywhere", async () => {
    const other: QueueKey = { ...key, sessionId: `${key.sessionId}_other`, collectionId: "coll_2" };
    render(
      <>
        <div data-testid="here"><PendingNotices collectionId="coll_1" /></div>
        <div data-testid="there"><PendingNotices collectionId="coll_2" /></div>
      </>,
    );
    await enqueue(other, staleEntry());
    await act(async () => {
      await drain([other]);
    });
    expect(within(screen.getByTestId("here")).queryByText(QUARANTINE_NOTICE)).not.toBeInTheDocument();
    expect(within(screen.getByTestId("there")).getByText(QUARANTINE_NOTICE)).toBeInTheDocument();

    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    await enqueue(other, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([other]);
    });
    expect(within(screen.getByTestId("here")).getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();
    expect(within(screen.getByTestId("there")).getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();
  });
});

describe("PendingNotices — a set-aside an answer had already settled (purses-w7ss.33)", () => {
  it("says the piece stays where the answer put it, with Okay", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices collectionId="coll_1" />);
    await enqueue(key, {
      kind: "disposition",
      clientKey: newClientKey(),
      itemId: realItemId(),
      disposition: "set_aside",
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(screen.getByText(DISPOSITION_SUPERSEDED_NOTICE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    expect(screen.queryByText(DISPOSITION_SUPERSEDED_NOTICE)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Failing page wiring tests.**
  - `src/app/collections/[id]/sort/page.test.tsx:62`: the mock becomes
    `PendingNotices: (p: { collectionId: string; sessionId?: string }) => <div data-testid="notices" data-collection={p.collectionId} data-session={p.sessionId} />,`.
    After the `data-session` assertions at lines 114 and 137, add
    `expect(screen.getByTestId("notices")).toHaveAttribute("data-collection", "coll_1");`.
  - `src/app/collections/[id]/results/page.test.tsx:39`: the same mock change. After line 86, add
    `expect(screen.getByTestId("notices")).toHaveAttribute("data-collection", COLLECTION.id);`.

- [ ] **Step 4: Gate and compare test plumbing** (no new cases; these keep the existing tests
  compiling against the new signatures):
  - `src/features/sorting/PendingDecisionsGate.test.tsx`: line 86 →
    `for (const notice of getNoticeSet()) dismissNotice(notice);`. In `gate()` (lines 92–99) render
    `<PendingDecisionsGate curatorId={curatorId} collectionId="coll_1">` and
    `<PendingNotices collectionId="coll_1" />`. Rename the test at line 205 to
    `"401 during the recovery drain → reveal once the drain stops, with the re-auth affordance, queue preserved, no refresh"`.
    In the test at line 238, change the comment "The surface's PendingNotices has no sessionId, and
    still tells the person." to "The surface's PendingNotices (this collection, no sort) still tells
    the person." and the title's "any surface" to "this collection's surface".
  - `src/features/sorting/CompareChoice.test.tsx:31` →
    `for (const notice of flusher.getNoticeSet()) flusher.dismissNotice(notice);`.

- [ ] **Step 5: Run and see them fail.**
  `npx vitest run src/features/sorting "src/app/collections/[id]/sort/page.test.tsx" "src/app/collections/[id]/results/page.test.tsx"`.
  Expected: FAIL. The snapshot entries lack `collectionId`; the two-collections and join tests fail;
  the scoped and disposition surface tests fail (no copy, no scoping); the page tests lack
  `data-collection`. TypeScript errors in the editor (for example `dismissNotice(notice)`) are
  expected until Step 6.

- [ ] **Step 6: Implement the engine** (`src/features/sorting/decisionFlusher.ts`).
  - Replace the header's last paragraph (lines 20–23) with:

```ts
// Notices are sticky per tab and read as one snapshot (subscribeNoticeSet/getNoticeSet — the only
// notice API; purses-w7ss.30): the engine keeps the current line per kind per collection, and a
// surface reads the set whenever it renders. An entry stands until dismissed (dismissNotice) or
// resolved (a 2xx clears auth_required); a reload clears them all.
```

  - Replace `FlushNotice` (lines 48–54) with the type in **Interfaces** above.
  - Replace `DrainTallies` (lines 71–74) with:

```ts
// One drain's state. `opts` is the drain's own copy: a recovery caller that joins it upgrades
// `recovery` (purses-w7ss.32). `collectionId` scopes the notices it raises (purses-w7ss.31).
interface DrainRun {
  opts: DrainOptions;
  collectionId: string | undefined;
  rejected: number;
  quarantined: number;
}
```

  - Line 77 `const drains = new Map<string, Promise<void>>();` →
    `const drains = new Map<string, { promise: Promise<void>; run: DrainRun }>();`.
    Delete line 81 (`noticeSubscribers`). Line 82 →
    `const currentNotices = new Map<string, FlushNotice>(); // keyed by noticeKey`.
  - Replace lines 94–127 (from `// The current set as an immutable snapshot` through
    `dismissNotice`) with:

```ts
export function noticeKey(n: FlushNotice): string {
  return n.kind === "auth_required" ? n.kind : `${n.kind}\u0000${n.collectionId ?? ""}`;
}

// The current set as an immutable snapshot (useSyncExternalStore), so adds AND clears reach a
// mounted surface.
let noticeSet: readonly FlushNotice[] = [];
const noticeSetListeners = new Set<() => void>();

function publishNoticeSet(): void {
  noticeSet = [...currentNotices.values()];
  for (const listener of [...noticeSetListeners]) listener();
}

function emitNotice(notice: FlushNotice): void {
  currentNotices.set(noticeKey(notice), notice);
  publishNoticeSet();
}

export function subscribeNoticeSet(listener: () => void): () => void {
  noticeSetListeners.add(listener);
  return () => void noticeSetListeners.delete(listener);
}

export function getNoticeSet(): readonly FlushNotice[] {
  return noticeSet;
}

export function dismissNotice(notice: FlushNotice): void {
  if (currentNotices.delete(noticeKey(notice))) publishNoticeSet();
}
```

  - Replace `drainKey` and `runDrain` (lines 179–211) with:

```ts
function drainKey(key: QueueKey, opts: DrainOptions): Promise<void> {
  const storageKey = pendingStorageKey(key);
  const inFlight = drains.get(storageKey);
  if (inFlight !== undefined) {
    // A recovery caller joining a live drain makes it a recovery drain (one-way): a 409 then means a
    // closed sort's answers to let go, not a mid-round conflict to hold (purses-w7ss.32).
    if (opts.recovery) inFlight.run.opts.recovery = true;
    return inFlight.promise;
  }
  const run: DrainRun = { opts: { ...opts }, collectionId: readQueueCollectionId(key), rejected: 0, quarantined: 0 };
  const promise = runDrain(key, run).finally(() => {
    if (drains.get(storageKey)?.promise === promise) drains.delete(storageKey);
  });
  drains.set(storageKey, { promise, run });
  return promise;
}

async function runDrain(key: QueueKey, run: DrainRun): Promise<void> {
  const storageKey = pendingStorageKey(key);
  try {
    for (;;) {
      const step = await withWebLock(lockName(key), () => performStep(key, run));
      if (step === "continue") continue;
      if (step === "backoff") {
        const attempt = attempts.get(storageKey) ?? 0;
        attempts.set(storageKey, attempt + 1);
        await backoffWait(storageKey, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
        continue;
      }
      return; // "done" | "stop"
    }
  } finally {
    // One notice per kind per drain (F9) — a set of rejections/quarantines
    // collapses to a single quiet line.
    const { collectionId } = run;
    if (run.rejected > 0) emitNotice({ kind: "rejected_unknown_item", count: run.rejected, collectionId });
    if (run.quarantined > 0) emitNotice({ kind: "quarantined", count: run.quarantined, collectionId });
  }
}
```

  - Thread `run` instead of `(opts, tallies)` through the rest:
    - `performStep(key: QueueKey, run: DrainRun)`, which calls `flushDecisionRun(key, entries, run)`
      / `flushDisposition(key, head, run)`.
    - `quarantine(key, entries, run)` does `run.quarantined += entries.length`.
    - In `flushDecisionRun(key, entries, run)`: `quarantine(key, offenders, run)`,
      `keepalive: consumeKeepalive(storageKey, run.opts)`, `tallies.rejected += 1` →
      `run.rejected += 1`, `dismissNotice("auth_required")` →
      `dismissNotice({ kind: "auth_required" })`, and
      `return handleBatchFailure(key, res.status, valid, run);`.
    - `handleBatchFailure(key, status, sent, run)`: `quarantine(key, sent, run)`; `if (opts.recovery)` →
      `if (run.opts.recovery)`;
      `emitNotice({ kind: "closed_session_discarded", collectionId: run.collectionId });`;
      `emitNotice({ kind: "session_conflict", sessionId: key.sessionId, collectionId: run.collectionId });`.
    - `flushDisposition(key, entry, run)`: both `quarantine(…, run)`;
      `consumeKeepalive(storageKey, run.opts)` (×2);
      `dismissNotice({ kind: "auth_required" })`;
      `emitNotice({ kind: "disposition_superseded", collectionId: run.collectionId });`.
  - Check: `grep -n "tallies\|opts\.\|subscribeNotices\|noticeSubscribers" src/features/sorting/decisionFlusher.ts`.
    Expected: only `run.opts.…` hits and the `useDecisionFlusher` `{ keepalive: true }` call.

- [ ] **Step 7: Implement the surfaces.**
  - `src/features/sorting/pendingNotices.tsx`. Line 7 →
    `import { dismissNotice, getNoticeSet, noticeKey, subscribeNoticeSet, type FlushNotice } from "./decisionFlusher";`.
    After `CLOSED_SESSION_DISCARDED_NOTICE` add:

```ts
export const DISPOSITION_SUPERSEDED_NOTICE = "One piece already had your answer, so it stays where that answer put it";

// Every kind the engine can raise has words, or this does not compile (purses-w7ss.33).
const NOTICE_COPY: Record<FlushNotice["kind"], string> = {
  rejected_unknown_item: REJECTED_NOTICE,
  quarantined: QUARANTINE_NOTICE,
  session_conflict: SESSION_CONFLICT_NOTICE,
  closed_session_discarded: CLOSED_SESSION_DISCARDED_NOTICE,
  disposition_superseded: DISPOSITION_SUPERSEDED_NOTICE,
  auth_required: AUTH_REQUIRED_NOTICE,
};

// A line belongs to the collection whose answers raised it (one with no collection predates
// stamping and shows anywhere); a conflict also names its sort. Signing in is per person, so
// auth_required shows on every surface (purses-w7ss.31).
function isForThisSurface(notice: FlushNotice, collectionId: string, sessionId: string | undefined): boolean {
  if (notice.kind === "auth_required") return true;
  if (notice.collectionId !== undefined && notice.collectionId !== collectionId) return false;
  return notice.kind !== "session_conflict" || notice.sessionId === sessionId;
}
```

    Delete the old `NOTICE_COPY` (`as const`), `NoticeKind`, `isNoticed` and `isForThisSurface`
    (lines 22–40). In the doc comment, replace "`closed_session_discarded` (a recovery-time 409) is
    one of them and shows on any surface, since no surface belongs to the closed sort." with "Every
    line shows only on its own collection's surfaces; `closed_session_discarded` (a recovery-time 409)
    and `disposition_superseded` (a set-aside an answer had already settled) offer Okay too." Then
    change the component:

```tsx
export function PendingNotices({ collectionId, sessionId }: { collectionId: string; sessionId?: string }) {
  // Read at render (no mount-effect gap); a clear (a 2xx, dismissNotice) removes
  // the line from every mounted surface.
  const notices = useSyncExternalStore(subscribeNoticeSet, getNoticeSet, getNoticeSet);
  const pathname = usePathname();
  const visible = notices.filter((notice) => isForThisSurface(notice, collectionId, sessionId));
```

    In the JSX, map `visible.map((notice) => …)` with `key={noticeKey(notice)}`, the copy
    `{NOTICE_COPY[notice.kind]}`, the branches on `notice.kind`, and Okay
    `onClick={() => dismissNotice(notice)}`.
  - `src/features/sorting/PendingDecisionsGate.tsx`:
    - Line 3 → `import { useEffect, useRef, useState, useTransition } from "react";` (unchanged; keep
      `useRef` for `ran`). Line 6 → `import { drain, getNoticeSet } from "./decisionFlusher";`.
    - Props: add `collectionId` (`{ curatorId, collectionId, children }: { curatorId: string;
      collectionId: string; children: React.ReactNode }`).
    - Delete the `authRequired` state and ref (lines 44–45). Replace lines 55–83 (from `const bound =`
      to the end of the `.finally`) with:

```ts
    const bound = setTimeout(() => setBoundedReveal(true), GATE_REVEAL_BOUND_MS);
    void drain(pendingKeys, { recovery: true }).finally(() => {
      clearTimeout(bound);
      sweepExpired(Date.now());
      // Still signed out: nothing landed and the queue waits for sign-in (spec §3.2) — reveal
      // with the re-auth line, no refresh. A 2xx anywhere in this drain clears auth_required, so
      // a line left over from an earlier drain can never skip the refresh after one that lands.
      if (getNoticeSet().some((n) => n.kind === "auth_required")) {
        setDrained(true);
        return;
      }
      // Mark drained INSIDE the transition so children mount only when the
      // refresh transition settles — they render from the post-flush payload.
      startTransition(() => {
        router.refresh();
        setDrained(true);
      });
    });
```

    - Line 86 → `const revealed = !recovering || boundedReveal || (drained && !isPending);`.
    - Line 97 → `{!revealed && <PendingNotices collectionId={collectionId} />}`.
  - `src/features/sorting/CompareChoice.tsx`:
    - Line 3 → `import { useEffect, useRef, useState, useSyncExternalStore } from "react";`. Line 10 →
      `import { awaitAck, getNoticeSet, isInFlight, subscribeNoticeSet, triggerFlush, type AckOutcome } from "./decisionFlusher";`.
    - Replace lines 51–67 (the `closedElsewhere` state through the `subscribeNotices` effect) with:

```ts
  // A sort closed elsewhere (409): the answer will never land here, so the
  // "it's safe" line must not stand and the controls hold still; PendingNotices
  // says what happened. Only THIS sort's conflict: a sticky one from an earlier
  // sort in the same tab (or any, for the local walkthrough) never holds this one.
  const sessionId = submit.kind === "session" ? submit.sessionId : undefined;
  const notices = useSyncExternalStore(subscribeNoticeSet, getNoticeSet, getNoticeSet);
  const closedElsewhere =
    sessionId !== undefined && notices.some((n) => n.kind === "session_conflict" && n.sessionId === sessionId);
  useEffect(() => {
    if (!closedElsewhere) return;
    pendingRef.current = false;
    setPending(null);
  }, [closedElsewhere]);
```

    (`pendingRef` and `pending` are declared above, at lines 47–50, so they exist before this
    block.)
  - `src/features/sorting/TriageRound.tsx:175` →
    `<PendingNotices collectionId={collectionId} sessionId={sessionId} />`.
  - `src/app/collections/[id]/sort/page.tsx`: line 109 →
    `<PendingDecisionsGate curatorId={curatorId} collectionId={collection.id}>`; lines 131 and 146 →
    `<PendingNotices collectionId={collection.id} sessionId={open.id} />`.
  - `src/app/collections/[id]/results/page.tsx`: line 104 →
    `<PendingDecisionsGate curatorId={curatorId} collectionId={collection.id}>`; line 106 →
    `<PendingNotices collectionId={collection.id} />`.
  - Check: `grep -rn "subscribeNotices\b\|dismissNotice(\"" src`. Expected: no output.

- [ ] **Step 8: Run and see them pass.** Re-run the Step 5 command (expected: PASS), then
  `npx tsc --noEmit` (expected: no errors), then `npx vitest run src/features src/app` (expected:
  PASS). `TriageRound.test.tsx` mocks `subscribeNoticeSet`/`getNoticeSet` already, so no change is
  needed there.

- [ ] **Step 9: Commit.**

```bash
git add src/features/sorting/decisionFlusher.ts src/features/sorting/decisionFlusher.test.ts \
  src/features/sorting/pendingNotices.tsx src/features/sorting/pendingNotices.test.tsx \
  src/features/sorting/PendingDecisionsGate.tsx src/features/sorting/PendingDecisionsGate.test.tsx \
  src/features/sorting/CompareChoice.tsx src/features/sorting/CompareChoice.test.tsx src/features/sorting/TriageRound.tsx \
  "src/app/collections/[id]/sort/page.tsx" "src/app/collections/[id]/sort/page.test.tsx" \
  "src/app/collections/[id]/results/page.tsx" "src/app/collections/[id]/results/page.test.tsx"
git commit -m "fix(sort): one notice API, notices scoped by collection, recovery joins keep recovery, every kind voiced (purses-w7ss.30, .31, .32, .33)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s"
```

---

## Task 5: The saved ranking page — one tier mark, room above Onward, Create link on one line (`purses-w7ss.22`)

**Files:** `src/features/results/RankedResults.tsx`, `src/features/results/RankedResults.test.tsx`,
`src/features/results/SharePanel.tsx`, `e2e/sort-journey.spec.ts`.

**Interfaces:** none cross-task. `RankedResults`' props are unchanged.

**Invariants and what pins them:** each "full ranking" card carries exactly one tier mark (unit,
`RankedResults.test.tsx`). On a 390px phone: ≥ 48px above the Onward eyebrow, "Create link" on a
single line, and no sideways scroll (e2e, `sort-journey.spec.ts`, in CI's `results` area map).

- [ ] **Step 0: See it first** (systematic-debugging; no code). Run
  `SHOTS=saved-ranking npm run screenshots` and open
  `pr-screenshots/saved-ranking-light-phone.png` and `…-light-tablet.png`. Confirm the three flaws
  are as described in Decision 11: the glyph pill above the single "full ranking" card (the seed is
  top/high/low, so the ranking has one card), the cramped Onward eyebrow, and "Create link" on two
  lines on phone. If what you see differs, stop and report it to the controller before Step 1.

- [ ] **Step 1: Failing unit test.** In `src/features/results/RankedResults.test.tsx`, replace the
  test at line 27 ("marks ranked rows with a tier badge but never a visible Love/Like/Maybe label")
  with:

```ts
  it("marks each ranked card with exactly one tier mark (the card's own), never a visible Love/Like/Maybe label", () => {
    const loved = [row("a", "top"), row("b", "high"), row("c", "medium")];
    render(<RankedResults loved={loved} onward={[]} collectionId="c" coverUrl={noCover} />);
    for (const label of ["Love", "Like", "Maybe"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // purses-w7ss.22: ItemCard's bucket badge is the tier mark; a second glyph pill floated above
    // each card. Two tail rows → two marks.
    const ranking = screen.getByRole("heading", { name: /the full ranking/i }).closest("section")!;
    expect(within(ranking).getAllByRole("img")).toHaveLength(2);
  });
```

- [ ] **Step 2: Failing phone e2e.** Append to `e2e/sort-journey.spec.ts`, and add `seedSortScenario`
  to the `./fixtures/seed` import on line 7:

```ts
test.describe("saved ranking on a phone", () => {
  let path: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    const { slug, finalizedResultNumber } = await seedSortScenario(ownerId);
    path = `/collections/${slug}/results/${finalizedResultNumber}`;
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/photo-files/**", (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
  });

  // purses-w7ss.22. Viewport-sensitive; runs in CI's tablet project at iPhone width.
  test("Onward has room above it, Create link stays on one line, nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto(path);

    const ranking = page.getByRole("heading", { name: "The full ranking" }).locator("xpath=ancestor::section[1]");
    const eyebrow = page.getByText("Onward", { exact: true });
    const above = (await ranking.boundingBox())!;
    const label = (await eyebrow.boundingBox())!;
    expect(label.y - (above.y + above.height)).toBeGreaterThanOrEqual(47);

    const create = page.getByRole("button", { name: "Create link" });
    const lines = await create.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
```

- [ ] **Step 3: Run and see them fail.**
  `npx vitest run src/features/results/RankedResults.test.tsx` → FAIL (4 marks, not 2).
  `npm run test:e2e -- e2e/sort-journey.spec.ts --project=tablet -g "saved ranking on a phone"` →
  FAIL (gap ≈ 32 < 47, and/or 2 lines).

- [ ] **Step 4: Implement.**
  - `src/features/results/RankedResults.tsx`: delete the `TierBadge` import (line 5) and
    `BUCKET_TO_TIER` with its comment (lines 23–28). Replace the grid body (lines 62–78) with:

```tsx
            {loved.slice(1).map(({ ri, item }) => (
              <ItemCard
                key={ri.id}
                item={item}
                collectionId={collectionId}
                heroPhotoUrl={coverUrl(item.id)}
                bucket={effectiveBucket(ri)}
                usage={usageByItemId?.get(item.id)}
              />
            ))}
```

    Onward section (line 96): `<section className="space-y-4">` →
    `<section className="space-y-4 pt-4">`. In the comment above it, add: "`pt-4`: the small eyebrow
    needs more air than the bare section gap (purses-w7ss.22)."
  - `src/features/results/SharePanel.tsx`: line 121 `<div className="flex items-start justify-between">` →
    `<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">`. Line 128
    `<Button onClick={handleCreateShare} disabled={loading}>` →
    `<Button onClick={handleCreateShare} disabled={loading} className="shrink-0 self-start">`.

- [ ] **Step 5: Run and see them pass.** Re-run both Step 3 commands (expected: PASS), then
  `PW_VIEWPORT=phone npm run test:e2e -- e2e/sort-journey.spec.ts` (expected: PASS) and
  `npx vitest run src/features/results` (expected: PASS). Re-capture
  `SHOTS=saved-ranking npm run screenshots` and look at all four PNGs (light/dark × tablet/phone).

- [ ] **Step 6: Commit.**

```bash
git add src/features/results/RankedResults.tsx src/features/results/RankedResults.test.tsx \
  src/features/results/SharePanel.tsx e2e/sort-journey.spec.ts
git commit -m "fix(results): saved ranking drops the duplicate tier pill, gives Onward room, keeps Create link on one line (purses-w7ss.22)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s"
```

---

## Task 6: Docs, full gate, graphify, screenshots

**Files:** `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`; `graphify-out/` (controller
only).

- [ ] **Step 1: Docs** (`/sync-docs` scope, per `docs/doc-ownership.md`; never PRODUCT/TONE):
  - `docs/ARCHITECTURE.md`:
    - Decision 42 *Rationale* (line 307): replace "the `PATCH` rename stays a lock-free single-row
      update in `ResultController`; `AccountDeletionService` is `purses-w7ss.18`" with "the uncalled
      `PATCH /api/sort-results/[id]` rename, which wrote outside the lock, was deleted
      (`purses-w7ss.21`), and account deletion takes the curator's lock in each borrowed collection
      before erasing (`purses-w7ss.18`)".
    - Decision 42 *Status* (line 308): append "PR 6: the flusher's notices are one snapshot
      (`subscribeNoticeSet`/`getNoticeSet`; the stream is gone), each line scoped to the collection
      whose queue raised it (a conflict also to its sort; the sign-in line everywhere); a recovery
      caller joining a live drain makes it a recovery drain; `disposition_superseded` has words.
      Revisions and drafts insert their rows in one statement."
    - Account-deletion decision (line 177): after "(2) delete the user's curator-private rows
      globally (…) in one transaction" insert ", first taking the curator's writer lock in every
      collection they are a member of (`lockCuratorMemberships`, ordered by key), so an in-flight pin
      or decision commits first (`purses-w7ss.18`)".
    - Line 224 (Epic P status): "`generateOrderedIdFactory` in `src/lib/id.ts`" →
      "monotonic `generateId("event")` (`src/lib/id.ts`)".
  - `docs/API.md`:
    - Line 195: `| GET·PATCH·DELETE | `/api/sort-results/[id]` | curator |` →
      `| GET·DELETE | `/api/sort-results/[id]` | curator |`.
    - Lines 345–347: replace "The result rename (`PATCH /api/sort-results/[id]`) runs outside the
      lock (`ResultController.updateResult` — a single-row `name` update on a draft; it never creates
      or deletes a draft)." with "The result rename (`PATCH /api/sort-results/[id]`), the last
      `sort_results` write outside the lock, had no caller and was removed (`purses-w7ss.21`)."
    - Line 416 heading → `### `GET·DELETE /api/sort-results/[id]``, and in its paragraph delete
      "`PATCH` body → updated `SortResult` (`400` invalid JSON), but rejects a **finalized** result
      with **`409`** (`"Result is finalized"`) — a finalized result is immutable, name included (infra
      §11.3; `purses-gmn`, mirroring `purses-526`'s item-level guards)." Then add after the `DELETE`
      sentence: "(`PATCH`, the rename, was removed in UX redesign PR 6: no caller, and it wrote outside
      the curator lock.)"
  - `docs/DATABASE.md` lines 34–35: replace "`generateOrderedIdFactory()` (`src/lib/id.ts:19`) remains
    for batch inserts (one factory per request/batch; consolidating it is `purses-w7ss.20`)." with
    "The decisions batch route mints with `generateId("event")` too, so a later array entry wins a
    shared `createdAt` (`purses-w7ss.20` retired the per-batch factory)."
  - Commit:

```bash
git add docs/ARCHITECTURE.md docs/API.md docs/DATABASE.md
git commit -m "docs: PR 6 hygiene — curator-lock writers, rename removed, notice engine, ids (epic purses-w7ss)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s"
```

- [ ] **Step 2: Full local gate** (CLAUDE.md "Local pre-PR verification"; record each command and its
  result in the PR body):

```bash
npm run lint
npm run test:ci
npm run build
npm run auth:verify
npm run test:db
npm run test:e2e
PW_VIEWPORT=phone npm run test:e2e -- e2e/sort-journey.spec.ts e2e/decision-recovery.spec.ts e2e/lists-and-home.spec.ts
```

  Expected: all green. `auth:verify` runs because this PR removes a route method (an API-surface
  change); `test:db` runs because of locks, routes and repositories; the full `test:e2e` runs because
  the sorting and results surfaces both changed. On any failure, use `superpowers:systematic-debugging`
  before changing anything; for a DB or e2e failure, read the report first (CLAUDE.md rule 11).

- [ ] **Step 3: graphify (controller only).** `graphify update .`. If it refuses because the graph
  shrank (deleted symbols), use `--force` (memory `graphify-force-when-smaller`). Then:

```bash
git add graphify-out
git commit -m "chore(graphify): refresh after PR 6 hygiene (epic purses-w7ss)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BfKskkWb3LMmPkFkdDYp9s"
```

- [ ] **Step 4: Screenshots.** `SHOTS=saved-ranking npm run screenshots` captures light + dark ×
  tablet + phone into `pr-screenshots/` (gitignored, never staged). Embed them in the PR body per
  `docs/cookbook/add-images-to-pr.md` (`pr-screenshots` skill), with the owner-veto list above. The
  notice changes have no seeded screenshot surface. List the new copy line in the PR body instead.

---

## Out of scope (bead candidates)

- **A writer authorized before account deletion can still write afterwards.** A pin or decision
  that passed authz before Phase 2 committed waits on the new lock, then proceeds and can create
  fresh curator rows (an open draft, a session) for the scrubbed user, because writers don't re-check
  membership under the lock. No 500, but orphaned private rows for a deleted account. Fix: re-check
  membership (or the user row's tombstone) inside `inCuratorTx` / the decisions transaction.
- **`POST /api/sort-results` (legacy `createDraftResult`) has no UI caller** (API.md says so). It is
  a candidate for the same removal as the rename. It is locked, so it is not urgent.
- **`ScoringService` is stateless after Task 1.** `computePreferences` could be a plain function
  beside `deriveOrder`. Left as a class to keep this PR's diff to the bead.
- **Notices for a collection the person doesn't revisit in the tab are never heard** (Decision 9). If
  that matters, the gate could voice "answers from another collection…" generically. That is a
  product call.

## Self-review

1. **Bead coverage.** `.18` → Task 2 (lock and DB proof). `.19` and `.20` → Task 1. `.21` → Task 2
   (deleted; Decision 2). `.22` → Task 5 (all three flaws, each with a test). `.23` → Task 3. `.30`,
   `.31`, `.32` and `.33` → Task 4 (one engine change; Decisions 6–10). No bead needs a schema change,
   a migration or a new route.
2. **Placeholder scan.** No TBD/TODO. Every code step shows the code. The one "if what you see
   differs, stop" (Task 5 Step 0) is a diagnosis gate, not a deferral: Steps 1–4 carry the full fix.
3. **Type consistency.** `FlushNotice.collectionId: string | undefined` is used by `noticeKey`,
   `isForThisSurface` and every `emitNotice` call. `dismissNotice(notice: FlushNotice)` is used by the
   engine (`{ kind: "auth_required" }`), `PendingNotices` and the three test files.
   `PendingNotices({ collectionId, sessionId? })` and `PendingDecisionsGate({ curatorId,
   collectionId, children })` are used by the sort page, the results page, `TriageRound` and the
   tests. `DrainRun` is used throughout the engine. `lockCuratorMemberships(tx, curatorId)` is defined
   in Task 2 and used once. `insertResultWithItems(…, slots)` is used by `createDraftResult` (the
   default) and `supersedeResult`.
4. **Review Focus.** Each of the five lines names its pinning test and owning task. The emitter walk
   (memory `plan-mandated-shape-can-miss-its-own-invariant`) covers six kinds: `rejected_unknown_item`
   and `quarantined` (`runDrain` finally), `session_conflict` and `closed_session_discarded`
   (`handleBatchFailure`), `disposition_superseded` (`flushDisposition`), and `auth_required` (×2,
   global). The required `collectionId` key makes the compiler enforce the walk. The one consumer
   whose filter tightened, the gate's pre-reveal `PendingNotices`, now gets its page's collection.
   Recovery lines for other collections are Decision 9, accepted and listed.

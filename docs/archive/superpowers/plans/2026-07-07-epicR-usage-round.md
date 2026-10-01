# Epic R — Usage Round, End to End — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "Do you use this?" round, end to end, in **two PRs**: PR 1 (dark backend) adds the `usage` event type to the domain types and both request schemas, composes the recompute-skip predicate into the batch route, adds the `deriveUsage` pure fold and the cross-session curator decision-log read — nothing user-visible, no writer exists. PR 2 (round UI) ships the usage round page + client component (Relaxed/Quick pacing, at-most-twice pass cycling, a11y floor, first-Quick education), the round-length change (30 s–5 m, default 2 m, "No timer" first-class, mid-round switch via `RoundLengthChooser` in all three rounds), hub wiring (`recommendNextRound` ladder + device-local anti-nagging demotion + third round card + arc-name renames), the 4-step round arc, and the recap extension.

**Spec (authoritative — every mechanism decision is already made; implement, never re-decide):**
`docs/superpowers/specs/2026-07-07-epicR-usage-round-design.md` (rev 2, §7 items user-confirmed 2026-07-07), with parent
`docs/superpowers/specs/2026-07-06-usage-round-and-sort-unification-design.md` §D2/§D3/§D5/§4.
Bead: `purses-sisy` (parent epic `purses-9v1f`).

**Architecture:** Usage is a second *axis*, not a third tier (parent D1): a `usage` decision event (`{ itemId, result: "uses" | "not_uses" }`) rides the shipped Epic P pipeline — same log, same clientKey idempotency, same flusher — but **never triggers a preference recompute and never clears a disposition**. A pass writes nothing (absence *is* "undecided"). Usage is derived at read time by a pure fold (`deriveUsage`, latest-wins via the one shared comparator); the round queue and the hub ladder both consume it through one cross-session read (`DecisionController.listForCurator`). The round UI reuses the shipped optimistic-round machinery via a refactor-extracted `useOptimisticRound`, with usage-only forks (pass cycling, Quick beat, no dispositions).

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, Postgres, Zod 3, Vitest (`RUN_DB_TESTS=1` DB tier; `@vitest-environment jsdom` docblock for client tests), Playwright (CI `e2e` job), posthog-node.

## Global Constraints

- **No schema migration** in either PR: `decision_events.type` is `text` and `decision` is `jsonb` (`src/lib/db/schema.ts:218-236`) — `usage` is purely additive.
- **Deploy-order (spec §2.2/§6):** PR 2 lands **strictly after PR 1 is deployed** (not merely merged). A usage-writing client against a pre-PR-1 server gets a whole-batch 400 → the flusher quarantines the chunk (`decisionFlusher.ts` 400 branch) and those answers are lost-to-resurface. PR 1 is dark and safely revertable (no writer exists). The orchestrator confirms PR 1's production deploy before PR 2 review starts.
- **Branches:** PR 1 on `feat/epicR-usage-dark`, PR 2 on `feat/epicR-usage-round` — orchestrator confirms bases at kickoff (PR 2 cut after PR 1 merges). Never commit to `main`. Commit per task.
- **PR 2a discipline (spec §6):** the `useOptimisticRound` extraction (Task 7) is a **refactor-only first commit** of PR 2, explicitly revertable independently — `TriageRound.test.tsx` green **unchanged**, before any usage-round code, so reverting the usage round never drags the triage refactor.
- **Advisory-lock contract unchanged:** both decision routes keep their shipped gate ladders and `lockCollectionCurator` transactions; PR 1 only changes what happens *inside* (recompute predicate) — never the lock, gates, or idempotency mechanics.
- **Usage never touches `score`/`orderRank`** — the recompute-output invariance test (Task 5) is the regression pin; treat any diff there as a stop-and-report finding.
- **Gates at each PR boundary** (pre-push mirrors them): `npm run build` · `npm run test:ci` · `npm run lint` · `npm run auth:verify` · `npm run test:db`. Every test added here runs in one of those (or the CI `e2e` job); nothing manual, nothing skipped.
- **TDD:** failing test first, then minimal code. YAGNI never applies to tests (user override).
- **DB tests:** `src/lib/db/*.integration.test.ts`, `// @vitest-environment node` docblock, `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;`. Mock ONLY `@/lib/auth` (via `mockAuth` from `e2e/fixtures/mock-auth.ts`), `@/lib/db` (`getDb: () => getTestDb().db`), and `@/lib/posthog-server` where a route is exercised. Clone the conventions of `src/lib/db/decision-batch.integration.test.ts` (including its **recompute observable** — preference-row identity/`updatedAt` snapshots, never a mock spy). Run one file: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism <file>`.
- **Client tests:** vitest + jsdom via `// @vitest-environment jsdom` docblock, `@testing-library/react`, `vi.mock("next/navigation", …)`, fake timers for the Quick beat / timers (see `src/features/sorting/TriageRound.test.tsx` for the house round-test pattern: `installStorage`, mocked flusher/fetch).
- **Copy:** every person-side string is an exported constant; tests assert against the constant (and, where the spec pins wording, the verbatim string). All §4 spec-table strings are TONE-review items — Task 23 is the named TONE gate. Register rules: no game/challenge/race framing, no urgency copy, no counts of what *remains*.
- **`QueueKey` reality check:** the shipped `QueueKey` is `{ curatorId, sessionId, collectionId? }` (`decisionQueue.ts:10-16`) — `collectionId` is stamped on the envelope for disposition routing. `UsageRound` builds the same three-field key `TriageRound` does (`TriageRound.tsx:71-74`).
- **Screenshots:** PR 2 is user-visible UI → light + dark screenshots in the PR body (`/pr-screenshots`): the hub's third card + renamed cards, the usage round in both paces, the new length chooser.
- **Playwright honesty:** the usage smoke (Task 22) ships **without** its reload half — the crash-reload harness does not exist (Epic P deferred it; bead `purses-hmjs`, gated on `purses-yuw`). The reload assertion joins the suite when that bead lands; named in PR 2's body.
- **Out of scope** (spec §1): Standing/reconciliation + `sort_result_items.usage` snapshot (Epic S); a materialized `item_usage` table; revisit-usage flows; usage history; blended love×use score; tombstone/clear events; the single route's item-∈-collection check (`purses-stln`); the hub's pre-existing session-scoped `selectNextPair` quirk (spec §7.3 — preserved, bead filed at close).

## File Structure

**PR 1 (dark backend):**
- **Modify** `src/types/domain.ts` (L114-135) — `DecisionType` gains `"usage"`; new `UsageDecision`; `DecisionEvent.decision` union gains it.
- **Modify** `src/lib/decision-batch-schema.ts` (+ `decision-batch-schema.test.ts`) — third discriminated-union variant.
- **Create** `src/lib/derive-usage.ts` + `src/lib/derive-usage.test.ts` — the pure latest-wins fold.
- **Create** `src/server/services/decision-log.ts` — `loadCuratorDecisionEvents` (extracted from `PreferenceStateService.loadDecisionEvents`, `PreferenceStateService.ts:99-108`).
- **Modify** `src/server/services/PreferenceStateService.ts` — `loadDecisionEvents` delegates to the shared helper.
- **Modify** `src/server/api/decisions.ts` — `DecisionController.listForCurator`; constructor + `fromDb` gain a `SessionRepository`.
- **Modify** `src/app/api/sessions/[id]/decisions/route.ts` — usage variant in `DecisionRequestSchema` (L27-52); recompute skipped for usage (L150).
- **Modify** `src/app/api/sessions/[id]/decisions/batch/route.ts` — usage arm in `referencesUnknownItem` (L31-36); `insertedScoringCount` predicate (L188-207).
- **Create** `src/lib/db/usage-events.integration.test.ts`; **modify** `src/lib/db/decision-batch.integration.test.ts`.
- **Modify** `docs/API.md` — decisions routes now accept `usage`.

**PR 2 (round UI):**
- **Create** `src/features/sorting/useOptimisticRound.ts` — refactor-extracted shared round plumbing (Task 7; `TriageRound.test.tsx` unchanged is its test).
- **Modify** `src/lib/round-preference.ts` + test — `RoundBox = 0.5|1|2|5|"none"`, `DEFAULT_ROUND_BOX = 2`, `ROUND_BOX_OPTIONS` (the one home), clamp-on-read.
- **Modify** `src/features/sorting/RoundTimer.tsx` + test — sub-minute label.
- **Modify** `src/features/sorting/StartSessionForm.tsx` + test — options from `ROUND_BOX_OPTIONS`, default `"2"`, selection-keyed helper line.
- **Create** `src/features/sorting/RoundLengthChooser.tsx` + test; **modify** `TriageRound.tsx`, `RoundSurface.tsx` — mid-round switch in every round.
- **Create** `src/lib/usage-selection.ts` + test — `selectUsageQueue`.
- **Create** `src/lib/usage-round-prefs.ts` + test — pace / Quick-intro / round-ran device-local facts.
- **Modify** `src/features/sorting/roundCopy.ts` + test — `ROUND_COPY.usage`, `usageDecisions`, `usagePass` constants, arc-name renames; **modify** `e2e/session-pause.spec.ts` (link-name fallout).
- **Modify** `src/lib/what-moved.ts` + test, `src/features/sorting/WhatMoved.tsx` + test — usage counts + recap lines.
- **Modify** `src/features/sorting/decisionQueue.ts` (`PendingEntry` type union), `src/features/sorting/DecisionControls.tsx` (`type` prop union), `src/features/sorting/decisionFlusher.test.ts` (contiguous-run extension).
- **Modify** `src/features/sorting/RoundShell.tsx` + `RoundShell.test.tsx`, `RoundSurface.tsx` (step prop type), `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx` (step 2→3), `TriageRound.tsx` (totalSteps 4) — the 4-step arc.
- **Create** `src/features/sorting/UsageRound.tsx` + `UsageRound.test.tsx`.
- **Create** `src/app/collections/[id]/sort/[sessionNumber]/usage/page.tsx` + `page.test.tsx`.
- **Modify** `src/lib/next-round.ts` + test — `"usage"` kind, `curatorDecisions` input, `{ primary, whenUsageDemoted? }` return; **create** `src/features/sessions/RecommendedRound.tsx` + test; **modify** `src/app/collections/[id]/sort/[sessionNumber]/page.tsx` + `page.test.tsx` — one-read swap, third card, wrapper mount.
- **Create** `e2e/usage-round.spec.ts`.
- **Modify** `docs/API.md` only if PR 2 touches route surface (it shouldn't).

---

# PR 1 — Dark backend (`feat/epicR-usage-dark`)

### Task 1: `usage` in the domain types + shared batch schema

**Files:**
- Modify: `src/types/domain.ts` (L114-135), `src/lib/decision-batch-schema.ts` (L17-35), `src/lib/decision-batch-schema.test.ts`

**Interfaces (spec §2.1/§2.2, verbatim):**

```ts
// domain.ts
export type DecisionType = "triage" | "pairwise_compare" | "usage";
export type UsageResult = "uses" | "not_uses";
export interface UsageDecision { itemId: string; result: UsageResult }
// DecisionEvent.decision: TriageDecision | PairwiseDecision | UsageDecision
```

Deliberately **no** pass/skip member in the result enum: absence of an event *is* "undecided" (parent D2) — the type system cannot express a counted non-answer.

```ts
// decision-batch-schema.ts — third variant in BatchEntrySchema, reusing ItemId/ClientKey unchanged:
z.object({
  type: z.literal("usage"),
  decision: z.object({ itemId: ItemId, result: z.enum(["uses", "not_uses"]) }),
  clientKey: ClientKey,
}),
```

Everything downstream is type-agnostic: the flusher pre-validates with this exact schema and batches all `kind: "decision"` entries in contiguous runs — once the schema knows `usage`, the pipeline carries it with **zero flusher changes** (spec §2.2).

- [ ] **Step 1: Write the failing tests** (extend `decision-batch-schema.test.ts`, mirroring its existing F1 drift-guard style):
  - Usage entry with `generateId("item")` itemId + `ulid().toLowerCase()` clientKey → `BatchEntrySchema.safeParse` success (repo-format ids pass end-to-end).
  - Usage entry with a **bare 26-char ULID** itemId (no `item_` prefix) → rejected (F1 drift guard, extended).
  - Out-of-enum results rejected: `"sometimes"`, `"skip"`, `"yes"`.
  - A mixed 3-entry batch (triage + pairwise_compare + usage) passes `BatchRequestSchema`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/decision-batch-schema.test.ts`
Expected: FAIL — no `usage` variant in the discriminated union.

- [ ] **Step 3: Write minimal implementation** — the domain-type additions and the schema variant above. `npx tsc --noEmit` (or `npm run build`) confirms the `DecisionEvent.decision` union widening breaks no consumer (ScoringService filters on `"triage"`/`"pairwise_compare"` and ignores unknown types, `ScoringService.ts:93-106` — no change there).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/decision-batch-schema.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/domain.ts src/lib/decision-batch-schema.*
git commit -m "feat(usage): usage decision type in domain types + shared batch schema (dark)"
```

---

### Task 2: `deriveUsage` — the pure latest-wins fold

**Files:**
- Create: `src/lib/derive-usage.ts`, `src/lib/derive-usage.test.ts`

**Interfaces (spec §2.5, verbatim):**

```ts
import { compareByCreatedAtThenId } from "@/lib/decision-order";
import type { DecisionEvent, UsageDecision } from "@/types";

export type UsageAnswer = "uses" | "not_uses";

export function deriveUsage(
  events: readonly DecisionEvent[],
  liveItemIds: ReadonlySet<string>,
): Map<string, UsageAnswer>;
```

Mechanics: filter to `type === "usage"`; sort ascending with `compareByCreatedAtThenId` (`src/lib/decision-order.ts` — the ONE shared comparator, same latest-wins regime the scorer uses, parent ARCH-6); fold into a `Map` so the last write per `itemId` wins; drop itemIds ∉ `liveItemIds` (purged/deleted items fall out naturally, mirroring `deriveStanding`'s drop of items missing from its lookup, `src/features/results/standing.ts:14`). Pure — no DB, no React.

- [ ] **Step 1: Write the failing test** — the unit table (spec §5):
  - Empty log → empty map.
  - Latest-wins: two usage events for one item, later `createdAt` wins.
  - Equal-`createdAt` id tie-break: later id wins (build ids so code-unit order is unambiguous, e.g. `event_…a` < `event_…b`).
  - Non-usage events (triage/pairwise) ignored entirely.
  - ItemIds not in `liveItemIds` dropped from the result.
  - Input order irrelevant (shuffle before fold; same map).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/derive-usage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/derive-usage.ts
// Usage is DERIVED at read time (parent D3 — no projection table): the latest
// usage event per item wins, resolved by the ONE shared (createdAt, id)
// comparator the scorer already uses (parent ARCH-6), so the round queue, the
// hub ladder, and (Epic S) Standing can never disagree about "known".
import { compareByCreatedAtThenId } from "@/lib/decision-order";
import type { DecisionEvent, UsageDecision } from "@/types";

export type UsageAnswer = "uses" | "not_uses";

export function deriveUsage(
  events: readonly DecisionEvent[],
  liveItemIds: ReadonlySet<string>,
): Map<string, UsageAnswer> {
  const usage = events
    .filter((e) => e.type === "usage")
    .sort(compareByCreatedAtThenId);
  const byItem = new Map<string, UsageAnswer>();
  for (const e of usage) {
    const d = e.decision as UsageDecision;
    if (liveItemIds.has(d.itemId)) byItem.set(d.itemId, d.result);
  }
  return byItem;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/derive-usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/derive-usage.*
git commit -m "feat(usage): deriveUsage — pure latest-wins fold over the decision log (dark)"
```

---

### Task 3: One definition of "the curator's decision log" — `loadCuratorDecisionEvents` + `DecisionController.listForCurator`

**Files:**
- Create: `src/server/services/decision-log.ts`
- Modify: `src/server/services/PreferenceStateService.ts` (L99-108 → one-line delegate)
- Modify: `src/server/api/decisions.ts` (new method; constructor + `fromDb` gain `SessionRepository`)
- Create: `src/lib/db/usage-events.integration.test.ts` (first cases)

**Interfaces (spec §2.6, verbatim):**

```ts
// src/server/services/decision-log.ts
// THE definition of "the curator's decision log" — the recompute and the round
// page provably read the same log. Body is the former private
// PreferenceStateService.loadDecisionEvents, verbatim.
export async function loadCuratorDecisionEvents(
  sessionRepo: SessionRepository,
  decisionRepo: DecisionEventRepository,
  collectionId: string,
  curatorId: string,
): Promise<DecisionEvent[]>;
// findByCollectionAndCurator → decisionRepo.findBySession per session, in parallel, flattened.
```

```ts
// src/server/api/decisions.ts
export class DecisionController {
  constructor(private decisionRepo: DecisionEventRepository, private sessionRepo: SessionRepository) {}
  static fromDb(db: Database): DecisionController; // constructs both repos
  async listBySession(sessionId: string): Promise<DecisionEvent[]>;        // unchanged
  async listForCurator(collectionId: string, curatorId: string): Promise<DecisionEvent[]>; // → loadCuratorDecisionEvents
}
```

`PreferenceStateService.loadDecisionEvents` becomes a one-line call to the helper (its private signature and every caller unchanged). Grep for any direct `new DecisionController(` construction outside `fromDb` (tests included) and update signatures — don't assume `fromDb` is the only site.

- [ ] **Step 1: Write the failing tests** — start `usage-events.integration.test.ts` (conventions per Global Constraints; controller-level, no route import needed yet; seed via `SessionRepository`/`ItemRepository`/`DecisionEventRepository` as `decision-batch.integration.test.ts` does):
  - **Per-curator isolation:** two curators, each with a session in one collection and usage events (seeded directly via the repository); `listForCurator(collectionId, A)` returns only A's events; `deriveUsage` over A's log never contains B's items.
  - **Cross-session:** curator A with two sessions; a usage event in session 1 appears in `listForCurator`, and `deriveUsage(listForCurator(...), liveIds)` marks that item usage-known — the fact a session-2 queue will exclude it on. *(The spec's §5 wording names `selectUsageQueue`, a PR 2 module; the composition half of this assertion is completed in Task 12's `usage-known → out` case.)*
  - **Same log as the recompute:** `listForCurator` returns exactly the event set `PreferenceStateService.loadDecisionEvents` loads for the same (collection, curator) — assert by seeding triage events across two sessions and comparing id sets against a recompute-visible observable (or export-for-test via the shared helper: both callers hit `loadCuratorDecisionEvents`, so asserting the helper's output once + both delegations by code inspection is acceptable; prefer the behavioral id-set comparison).
  - Regression: existing `PreferenceStateService.test.ts` and DB suites stay green (the delegate is behavior-identical).

- [ ] **Step 2: Run tests to verify they fail**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/usage-events.integration.test.ts`
Expected: FAIL — `listForCurator` does not exist.

- [ ] **Step 3: Implement** — create the helper (move the body verbatim), delegate from `PreferenceStateService`, add the controller method + dependency.

- [ ] **Step 4: Run tests to verify they pass**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/usage-events.integration.test.ts && npx vitest run src/server/services/PreferenceStateService.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/decision-log.ts src/server/services/PreferenceStateService.ts src/server/api/decisions.ts src/lib/db/usage-events.integration.test.ts
git commit -m "feat(usage): loadCuratorDecisionEvents shared helper + DecisionController.listForCurator (dark)"
```

---

### Task 4: Single route accepts usage — recompute skipped, dispositions pinned

**Files:**
- Modify: `src/app/api/sessions/[id]/decisions/route.ts`
- Modify: `src/lib/db/usage-events.integration.test.ts`

**Interfaces (spec §2.3):**
- `DecisionRequestSchema` (L27-52) gains, inside the discriminated union (the `.and(clientKey)` intersection is untouched):

```ts
z.object({
  type: z.literal("usage"),
  decision: z.object({ itemId: z.string().min(1), result: z.enum(["uses", "not_uses"]) }),
}),
```

(`min(1)` matches the route's existing laxness; the missing item-∈-collection check stays `purses-stln`'s.)
- **Recompute skipped:** L150 becomes conditional — `if (body.type !== "usage") await PreferenceController.fromDb(tx).recalculatePreferences(…)`. Rationale (from code): the recompute *output* would be identical (the scorer ignores unknown types) but `PreferenceStateService.recalculatePreferences` still clears every orderRank and bulk-upserts the whole set (`PreferenceStateService.ts:52-64`) — pure waste inside the advisory lock.
- **Dispositions never cleared:** already conditioned `if (body.type === "triage")` (L154-156) — usage bypasses by construction; the test makes it an invariant.
- Gate ladder, lock, clientKey idempotency read, insert (`generateId("event")`), analytics (`decision_type` flows through) — all unchanged.

- [ ] **Step 1: Write the failing tests** (extend `usage-events.integration.test.ts`; now import the single route's `POST` after the mocks, with the `decisionReq`-style helper from `decisions-hardening.integration.test.ts`):
  - Usage POST from the seeded curator → **201**, one `decision_events` row with `type: "usage"` and the payload verbatim.
  - **Zero recomputes (observable, never a spy):** seed one triage decision first (so preference rows exist), snapshot the preference rows (ids + `updatedAt` — the `decision-batch.integration.test.ts` observable); usage POST; rows byte-identical after.
  - **No disposition cleared:** seed a `set_aside` disposition on an item, usage-POST that same item → 201 and the disposition row survives (the disposed-then-usage-answered pin).
  - Idempotent replay: same clientKey again → **200**, same event id, still one row.
  - Malformed usage shape (`result: "sometimes"`) → **400**, zero rows written.

- [ ] **Step 2: Run tests to verify they fail**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/usage-events.integration.test.ts`
Expected: FAIL — 400 on every usage POST (no schema variant).

- [ ] **Step 3: Implement** the schema variant + the recompute conditional. Keep the comments-of-record style (one line explaining the skip, citing parent D3).

- [ ] **Step 4: Run tests to verify they pass**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/usage-events.integration.test.ts src/lib/db/decisions-hardening.integration.test.ts`
Expected: PASS (hardening suite proves triage/compare behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sessions/[id]/decisions/route.ts" src/lib/db/usage-events.integration.test.ts
git commit -m "feat(usage): single decisions route accepts usage — recompute skipped, dispositions untouched (dark)"
```

---

### Task 5: Batch route — semantic-validation arm + `insertedScoringCount` predicate composition

**Files:**
- Modify: `src/app/api/sessions/[id]/decisions/batch/route.ts`
- Modify: `src/lib/db/decision-batch.integration.test.ts`

**Interfaces (spec §2.4):**
- `referencesUnknownItem` (L31-36) gains an explicit usage arm — same check as triage: `!liveItemIds.has(entry.decision.itemId)`. (Without it, a usage entry falls into the compare-pair branch and is spuriously rejected — make the function an exhaustive per-type switch.) `liveItemIds` is non-deleted items; **disposed items are live rows**, so a usage event for a now-disposed item (cross-device race) is *accepted* — parent D3/QA-7 with no extra code, pinned by test.
- **Predicate split:** add **`insertedScoringCount`**, incremented only for inserted entries with `entry.type !== "usage"`. The recompute **and** the disposition-clear block (L193-207) run iff `insertedScoringCount > 0`. Reality check vs the spec's text: the 201/200 status already derives from `counts.created > 0` (L230), not `insertedCount` — so after the split, `insertedCount` has no consumer; remove it (lint will flag it). Response semantics unchanged: 201 iff ≥1 entry of any type created. `insertedTriagedItemIds` stays triage-only by construction (usage can never clear a disposition — QA-9). Analytics counts unchanged (no per-type breakdown).

- [ ] **Step 1: Write the failing tests** (extend `decision-batch.integration.test.ts`, reusing its seeding + recompute observable):
  - **Usage-only batch** → 201, all `created`, **zero recomputes** (preference rows byte-identical) and **zero `bringBack` effects** (a pre-seeded disposition on one of the answered items survives).
  - **Mixed usage+triage batch** → exactly **one** recompute (observable advances once), disposition-clear only for the triaged itemIds (a disposition on the usage-only item survives; one on the triaged item is cleared), and usage derivable afterwards via `deriveUsage` over the session's events (QA-9).
  - **Triage-all-duplicate + usage-created batch** → **201** (usage created), **zero recomputes** (the duplicates drove their recompute when first inserted; spec §2.4's new edge).
  - **Recompute-output invariance (the score/orderRank pin):** seed triage events, recompute, snapshot each preference row's `score`/`orderRank`/`rankBucket`; add usage events; force a recompute (one more triage event); assert the usage-affected items' `score`/`orderRank` identical to a control run without the usage events.
  - **Disposed (live) item** usage entry → `created`; usage entry with an unknown/foreign/deleted itemId → per-entry `rejected` with `reason: "unknown_item"`, others written.
  - **Latest-wins via the shared comparator:** two usage events for one item in one batch (shared `createdAt`) → `deriveUsage` resolves to the **later array entry** (monotonic id); cross-batch (two sequential POSTs, separate transactions) → resolves by `createdAt`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/decision-batch.integration.test.ts`
Expected: FAIL — usage entries rejected as `unknown_item` (pair-branch fallthrough), and/or usage-only batch rewrites preferences.

- [ ] **Step 3: Implement** the two changes. Keep the §2.3.x comment anchors; add one comment naming the composition ("recompute iff ≥1 *scoring* entry inserted — Epic P §2.3.6's anticipated extension").

- [ ] **Step 4: Run tests to verify they pass**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/decision-batch.integration.test.ts src/lib/db/usage-events.integration.test.ts && npm run lint`
Expected: PASS; lint confirms no dead `insertedCount`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sessions/[id]/decisions/batch/route.ts" src/lib/db/decision-batch.integration.test.ts
git commit -m "feat(usage): batch route carries usage — insertedScoringCount recompute predicate, disposed-item acceptance (dark)"
```

---

### Task 6: PR 1 boundary — docs, full gates, PR

**Files:**
- Modify: `docs/API.md` (decisions route entries: request unions now include `usage`; note the recompute-skip semantics in one line)

- [ ] **Step 1:** Update `docs/API.md`'s entries for `POST /api/sessions/[id]/decisions` and `.../decisions/batch`.
- [ ] **Step 2: Full gates:**

```bash
npm run build && npm run test:ci && npm run lint && npm run auth:verify && npm run test:db
```

Expected: ALL PASS.
- [ ] **Step 3:** Orchestrator: `/sync-docs` + `graphify update .` before push. Open **PR 1** with a body that names: dark launch (no writer exists; revert-safe), the deploy-order constraint on PR 2 (§2.2 schema-skew → quarantine hazard), and the Epic S deferral of the "disposed item's usage excluded from Standing" half-obligation (spec §5). **Do not start PR 2's usage-writing tasks until PR 1 is deployed.**
- [ ] **Step 4: Commit**

```bash
git add docs/API.md
git commit -m "docs(api): decisions routes accept usage events (recompute skipped)"
```

---

# PR 2 — Round UI + hub (`feat/epicR-usage-round`, strictly after PR 1 is deployed)

### Task 7: Refactor-only — extract `useOptimisticRound`, `TriageRound` its sole consumer

**Files:**
- Create: `src/features/sorting/useOptimisticRound.ts`
- Modify: `src/features/sorting/TriageRound.tsx`

**This is PR 2's first, independently-revertable commit. No usage-round code exists yet. No behavior change: `TriageRound.test.tsx` passes UNCHANGED — that suite is the regression net and the gate.**

**What generalizes into the hook (spec §3.4, from the shipped `TriageRound.tsx`):**
1. Queue-key memo + `useDecisionFlusher(key)` wiring (L71-75).
2. Persist-before-advance enqueue with quota fallback (L149-198): `enqueue(key, entry, () => triggerFlush(key))`; on `needs_fallback` the awaited single-route POST (injected body), advance only on its ack; else `awaitAck` → outcome map. Stumble state + `STUMBLE_LINE` ride along.
3. Round tap log + frozen recap + end sequence (L88-143): `roundLogRef`, `serverLogRef`, `initialQueueEmpty`, freeze-once, `triggerFlush(key)` → exactly one `router.refresh()` (F15), empty-mount guard. The hook accepts the server-log prop **as-is** — usage will pass `[]`; triage keeps its session-log behavior unchanged.
4. Undo-as-revisit state machine (L96-98, 204-226): queued → remove + re-present fresh; in-flight/acked → standing answer via `priorAnswer`; rejected → no-op.
5. Round clock: `startedAtRef` + `boxMs` from `getRoundBox()` in a mount effect + expiry state (an `onBoxChange` seam is added in Task 11).

**Hook contract (sketch — names illustrative, spec §3.4):**
`useOptimisticRound({ key, ended, decisionType, fallbackBody(decision, clientKey), labelFor(itemId, result), toMoved(decision, enqueuedAt) })` — each round injects its decision type, fallback POST body, label resolver, and `MovedDecision` mapper; `ended` is computed by each round from its **own** queue fork and passed in — the hook owns the freeze-once/flush/refresh sequence, never the queue-state derivation.

**Shape caveat (spec-binding):** the single-hook shape is the default, not the invariant. If the seam degenerates into a wide config object / callback soup, land it as fewer or smaller shared units (e.g. the round clock and enqueue-with-fallback as separate helpers). Binding requirements: (a) both rounds consume the same shared units, (b) behavior identity proven by `TriageRound.test.tsx` passing unchanged.

**Stays in `TriageRound`:** dispositions (defer/set-aside + revisit gating), the deferred banner, the "Set aside" link, `TriageUndoProvider` integration, triage labels.

- [ ] **Step 1: Baseline** — run `npx vitest run src/features/sorting/TriageRound.test.tsx` green BEFORE touching anything.
- [ ] **Step 2: Extract** the hook; rewire `TriageRound` as its only consumer. Do not edit `TriageRound.test.tsx`.
- [ ] **Step 3: Verify** — `npx vitest run src/features/sorting/TriageRound.test.tsx src/features/sorting/DecisionControls.test.tsx && npm run build && npm run lint`. Expected: PASS, test file untouched (`git diff --stat` shows zero test changes). Behaviors the suite doesn't pin (e.g. `outcomesRef` timing between `awaitAck` resolution and `goBack`) get a targeted look in this task's review (spec §5).
- [ ] **Step 4: Commit** (single commit — the independent revert unit):

```bash
git add src/features/sorting/useOptimisticRound.ts src/features/sorting/TriageRound.tsx
git commit -m "refactor(rounds): extract useOptimisticRound — TriageRound sole consumer, behavior-identical"
```

---

### Task 8: Round length — `ROUND_BOX_OPTIONS` one home, default 2 m, clamp-on-read

**Files:**
- Modify: `src/lib/round-preference.ts`, `src/lib/round-preference.test.ts`

**Interfaces (spec §3.1, verbatim):**

```ts
export type RoundBox = 0.5 | 1 | 2 | 5 | "none";
export const DEFAULT_ROUND_BOX: RoundBox = 2; // named const, tunable (parent §1.12)
export const ROUND_BOX_OPTIONS: ReadonlyArray<{ value: RoundBox; label: string }> = [
  { value: 0.5, label: "30 seconds" },
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 5, label: "5 minutes" },
  { value: "none", label: "No timer" },
];
```

- `getRoundBox()` **clamps on read**: `"none"` → `"none"`; `0.5|1|2|5` → itself; stale `10`/`20` → `5`; anything else → `DEFAULT_ROUND_BOX`. `setRoundBox` keeps `String(value)` (`"0.5"` round-trips through `Number()`); key stays `pi-round-box` — the clamp **is** the migration.
- Rewrite the module's "Default is none: calm, no-pressure" comment (L5-6) to cite parent §1.12's deliberate supersession (the review's regression warning was answered, not ignored).
- Consumers multiply by `MINUTE_MS` (`TriageRound`/`useOptimisticRound`, `RoundSurface.tsx:57`): `0.5 × 60_000 = 30 s` — no consumer change for the value. `StartSessionForm` still compiles against the widened union (its `Number(value) as RoundBox` cast); its stale `"10"`/`"20"` options persist-then-clamp until Task 10 replaces them — its existing test stays green meanwhile.

- [ ] **Step 1: Write the failing tests** — the clamp table (spec §5): stored `"10"`/`"20"` → `5`; stored `"none"` stays `"none"`; stored `"0.5"`/`"1"`/`"2"`/`"5"` stay themselves (incl. the `"0.5"` round-trip through `setRoundBox`); garbage (`"7"`, `"abc"`, empty) → `2`; `DEFAULT_ROUND_BOX === 2`; **the option labels/values asserted once, verbatim, against `ROUND_BOX_OPTIONS`** (the one home — per-component tests will assert list identity by importing the constant, never re-pinned strings).
- [ ] **Step 2:** `npx vitest run src/lib/round-preference.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npx vitest run src/lib/round-preference.test.ts src/features/sorting/StartSessionForm.test.tsx src/features/sorting/TriageRound.test.tsx && npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/round-preference.*
git commit -m "feat(rounds): 30s-5m round boxes, default 2m, clamp-on-read migration, ROUND_BOX_OPTIONS one home"
```

---

### Task 9: `RoundTimer` sub-minute honesty

**Files:**
- Modify: `src/features/sorting/RoundTimer.tsx`, `src/features/sorting/RoundTimer.test.tsx`

**Behavior (spec §3.1):** `minutesLeft` rounds up (L19-21), so a 30 s box would read "About 1 minute left" for its whole life. When remaining < 60 s the label becomes the exported constant **`SUB_MINUTE_LABEL = "Less than a minute left in this round"`** (TONE item). Bar, ring a11y treatment, and expiry behavior unchanged (D2: no per-item countdown; the round ring stays the only time signal).

- [ ] **Step 1: Write the failing tests:** at < 60 s remaining the label is `SUB_MINUTE_LABEL` (assert against the constant); a 30 s box **never** renders "About 1 minute"; at ≥ 60 s the existing "About N minute(s) left in this round" renders; expiry rendering unchanged (existing assertions stay green).
- [ ] **Step 2:** `npx vitest run src/features/sorting/RoundTimer.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same command — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/RoundTimer.*
git commit -m "feat(rounds): RoundTimer sub-minute label — a 30s box never claims a minute"
```

---

### Task 10: `StartSessionForm` — options from the one home, default 2 m, selection-keyed helper

**Files:**
- Modify: `src/features/sorting/StartSessionForm.tsx`, `src/features/sorting/StartSessionForm.test.tsx`

**Behavior (spec §3.1):** default state `"2"`; the Round length `Select` renders from `ROUND_BOX_OPTIONS` (same flat list — "No timer" a first-class peer, never buried). One quiet helper line under the control, **keyed to the selection**, exported constants (TONE items):
- timed selected → `TIMED_BOX_HELPER = "A short round — it wraps up gently."`
- "No timer" selected → `NO_TIMER_HELPER = "Take all the time you like."`

The POSTed `timebox` field has no server-side reader — left as-is (cleanup bead, spec §7.4). The stale comment about the 10-minute default (L18-19) is rewritten.

- [ ] **Step 1: Write the failing tests:** default selection is `"2"`; the rendered options are exactly `ROUND_BOX_OPTIONS` (import the constant — list identity, not re-pinned strings); helper line shows `TIMED_BOX_HELPER` for a timed selection and swaps to `NO_TIMER_HELPER` when "No timer" is chosen; choosing an option calls through to `setRoundBox` (existing persistence behavior retained).
- [ ] **Step 2:** `npx vitest run src/features/sorting/StartSessionForm.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same command + `npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/StartSessionForm.*
git commit -m "feat(sessions): StartSessionForm renders ROUND_BOX_OPTIONS — default 2m, keyed helper line"
```

---

### Task 11: `RoundLengthChooser` — mid-round switch in triage + compare

**Files:**
- Create: `src/features/sorting/RoundLengthChooser.tsx`, `src/features/sorting/RoundLengthChooser.test.tsx`
- Modify: `src/features/sorting/TriageRound.tsx` (+ `useOptimisticRound.ts` clock seam), `src/features/sorting/RoundSurface.tsx`, their tests

**Behavior (spec §3.1, parent D2 — switchable "before and during a round", every round type):**
- New client component: a compact select (options from `ROUND_BOX_OPTIONS`), rendered **beside the timer in the round header** (compose it with `<RoundTimer/>` inside `RoundShell`'s `timer` slot), ≥44 px target, accessible label "Round length".
- On change: `setRoundBox(box)` **and** `onChange(box)` — the mounted round updates its `boxMs` live against the **unchanged** `startedAtRef` (the hook/`RoundSurface` expose an `onBoxChange` that maps `"none"` → `null`, else `box * MINUTE_MS`).
- Live-change semantics: `RoundTimer`'s effect re-arms on the `boxMs` prop change (`RoundTimer.tsx:54`); switching to `"none"` removes the countdown and expiry; switching to a box **shorter than the already-elapsed time** expires at the next tick and ends the round **gently into the recap** — consequence-free by the same D2 argument as natural expiry (named choice; test-pinned).
- **Not rendered on the recap** (each round renders the chooser only while the round is live).
- Wire into `TriageRound` and `RoundSurface` (compare) now; `UsageRound` gets it in Task 18.

- [ ] **Step 1: Write the failing tests:**
  - `RoundLengthChooser.test.tsx`: renders the `ROUND_BOX_OPTIONS` list (constant identity) with "No timer" a visible peer; a change persists via `setRoundBox` (spy the module) and fires `onChange` with the box value; ≥44 px class + accessible name.
  - `TriageRound.test.tsx` additions (fake timers): mid-round switch to `"none"` removes the countdown (timer renders the label-only state) and the round no longer expires; switch to a box shorter than elapsed → round ends into the recap at the next tick; the chooser is absent once the recap shows.
  - `RoundSurface` (compare) — same three assertions via its own test (create `RoundSurface.test.tsx` if none exists; mirror the TriageRound test's mount pattern).
- [ ] **Step 2:** `npx vitest run src/features/sorting/RoundLengthChooser.test.tsx src/features/sorting/TriageRound.test.tsx` — FAIL.
- [ ] **Step 3: Implement** component + wiring (the hook's clock gains `onBoxChange`; `RoundSurface` mirrors it locally).
- [ ] **Step 4:** same command + `RoundSurface` tests + `npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/RoundLengthChooser.* src/features/sorting/TriageRound.tsx src/features/sorting/useOptimisticRound.ts src/features/sorting/RoundSurface*
git commit -m "feat(rounds): RoundLengthChooser — mid-round length switch, 'No timer' first-class, gentle early expiry"
```

---

### Task 12: `selectUsageQueue`

**Files:**
- Create: `src/lib/usage-selection.ts`, `src/lib/usage-selection.test.ts`

**Interfaces (spec §3.2, verbatim):**

```ts
export function selectUsageQueue(
  items: Item[],
  usageByItemId: ReadonlyMap<string, UsageAnswer>,
  dispositionByItemId: Map<string, Disposition>,
): Item[];
```

Eligible (parent D2): usage currently unknown (`!usageByItemId.has(item.id)`) **and** not disposed — both `set_aside` **and** `deferred` excluded. Untriaged items included (usage is a primary sort). Ordering: input order. Returns bare `Item[]` — no `deferred` flag, no banner: the deliberate fork from `selectTriageQueue` (a defer is a love-question disposition, honored by absence — spec §7.7, user-confirmed).

- [ ] **Step 1: Write the failing tests** — inclusion branches (spec §5): untriaged **in**; `set_aside` **out**; `deferred` **out**; usage-known **out** (this completes Task 3's cross-session composition: an item marked known by `deriveUsage` over the curator log is excluded); input order preserved; empty input → `[]`.
- [ ] **Step 2:** `npx vitest run src/lib/usage-selection.test.ts` — FAIL.
- [ ] **Step 3: Implement** (one filter chain; mirror `triage-selection.ts`'s style).
- [ ] **Step 4:** same command — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/usage-selection.*
git commit -m "feat(usage): selectUsageQueue — usage-unknown, undisposed, input order"
```

---

### Task 13: `usage-round-prefs` — the three device-local facts

**Files:**
- Create: `src/lib/usage-round-prefs.ts`, `src/lib/usage-round-prefs.test.ts`

**Interfaces (spec §3.5; `round-preference.ts`'s `typeof window` + try/catch pattern):**

```ts
export type UsagePace = "relaxed" | "quick";
export function getUsagePace(): UsagePace;          // default "relaxed" (D2: Relaxed is the default, ever)
export function setUsagePace(p: UsagePace): void;   // key "adored.usagePace.v1" — device-global
export function hasSeenQuickIntro(): boolean;       // key "adored.usageQuickIntro.v1"
export function markQuickIntroSeen(): void;
export function markUsageRoundRan(curatorId: string, sessionId: string): void;
export function hasUsageRoundRan(curatorId: string, sessionId: string): boolean;
// key "adored.usageRoundRan.v1.{curatorId}.{sessionId}", value = completion ISO timestamp
```

Keys accumulate one tiny string per (curator, session) — accepted, named residue (not under the pending/quarantine GC prefixes).

- [ ] **Step 1: Write the failing tests:** pace defaults to `"relaxed"` with empty/garbage storage; set/get round-trips; intro flag round-trips; `markUsageRoundRan` writes an ISO timestamp under the exact composite key; `hasUsageRoundRan` is **curator- and session-scoped** (a different curator's or session's flag reads false — the ARCH-7 isolation posture); all getters degrade (return defaults) when storage throws.
- [ ] **Step 2:** `npx vitest run src/lib/usage-round-prefs.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same command — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/usage-round-prefs.*
git commit -m "feat(usage): device-local usage-round prefs — pace, first-Quick intro, round-ran demotion memory"
```

---

### Task 14: `roundCopy` — usage copy + the arc-name renames

**Files:**
- Modify: `src/features/sorting/roundCopy.ts`, `src/features/sorting/roundCopy.test.ts`
- Modify: `e2e/session-pause.spec.ts` (L113 asserts a hub link named "Triage" — rename fallout)

**Behavior (spec §3.8 + §4; all strings TONE items, Task 23 is the gate):**
- `ROUND_COPY.usage = { name: "Do you use this?", explainer: "One piece at a time — is it in your life these days?" }`.
- **Renames (same PR as the hub card — review adjudication (a), user-confirmed):** `ROUND_COPY.triage.name` → **"Get acquainted"**, `ROUND_COPY.compare.name` → **"Which do you love more?"** (parent D5's person-side arc names; the `/welcome` walkthrough and hub cards follow for free via the shared module).
- New `usageDecisions(itemId)` mirroring `triageDecisions`: **"Yes, I use it"** → `uses`, **"Not these days"** → `not_uses`.
- Pass-button copy constants (exported here — the round copy's one home): `USAGE_PASS_LABEL = "Skip for now"`, `USAGE_PASS_TITLE = "It'll come around again"`, `USAGE_PASS_ARIA_LABEL = "Skip for now — it'll come around again"` (the `DeferControl.tsx:24-26` precedent: the escape's contract lives in its accessible name; adjudicates spec §7.9. WCAG 2.5.3: the accessible name begins with the visible label).
- The module stays server-importable (existing test pins it).

- [ ] **Step 1: Write the failing tests** (update `roundCopy.test.ts`):
  - `ROUND_COPY.usage.name`/`explainer` asserted **verbatim, once** (the two consuming slots — the round h1 and the recommended-card label — assert identity `===` in Tasks 18/21, never re-pinned strings).
  - Renames asserted verbatim: `"Get acquainted"`, `"Which do you love more?"` (replacing the `"Triage"`/`"Compare"` assertions).
  - `usageDecisions("item-1")` shape + labels verbatim.
  - Pass constants verbatim; `USAGE_PASS_ARIA_LABEL.startsWith(USAGE_PASS_LABEL)` (2.5.3 pin).
  - **No digits/denominators/urgency terms** in any usage-round copy string (regex scan over the exported usage constants — the parent's assert-the-strings obligation, extended in Task 23).
- [ ] **Step 2:** `npx vitest run src/features/sorting/roundCopy.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Then sweep rename fallout: `e2e/session-pause.spec.ts` link name; check `src/features/onboarding/beats.test.tsx` and both `page.test.tsx` files for hard-coded "Triage"/"Compare" strings (consumers importing `ROUND_COPY` need nothing).
- [ ] **Step 4:** `npx vitest run src/features/sorting/roundCopy.test.ts src/features/onboarding/beats.test.tsx "src/app/collections/[id]/sort/[sessionNumber]/page.test.tsx" && npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/roundCopy.* e2e/session-pause.spec.ts src/features/onboarding/
git commit -m "feat(copy): ROUND_COPY.usage + usageDecisions + arc-name renames (Get acquainted / Which do you love more?)"
```

---

### Task 15: Recap — `what-moved.ts` + `WhatMoved.tsx` learn usage

**Files:**
- Modify: `src/lib/what-moved.ts`, `src/lib/what-moved.test.ts`, `src/features/sorting/WhatMoved.tsx`, `src/features/sorting/WhatMoved.test.tsx`

**Behavior (spec §3.7):**
- `MovedDecision.type` union gains `"usage"`; its decision union gains `{ itemId: string; result: "uses" | "not_uses" }`.
- `WhatMovedSummary` gains `uses: number; resting: number`; `whatMoved` counts usage results into them and into `total`. Passes appear nowhere (no event, no round-log entry — the recap can't count them even by accident).
- `WhatMoved.tsx` `lines()` adds, count-gated like the others: **"{n} in your life"** / **"{n} resting for now"** (exported line-builder strings or inline like the siblings — match the file's existing style; the strings are §4 TONE items). Triage/compare recaps unaffected (zero counts render no line); the zero-total "gentle pass" line reused as-is.

- [ ] **Step 1: Write the failing tests:** usage decisions inside the window count into `uses`/`resting`/`total`; outside-window usage excluded; `WhatMoved` renders "2 in your life" / "1 resting for now" count-gated; triage-only input renders **no** usage lines; zero-total still renders the gentle-pass line (existing assertion stays).
- [ ] **Step 2:** `npx vitest run src/lib/what-moved.test.ts src/features/sorting/WhatMoved.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same command — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/what-moved.* src/features/sorting/WhatMoved.*
git commit -m "feat(recap): usage counts in whatMoved — 'in your life' / 'resting for now' lines"
```

---

### Task 16: Pipeline type widening — queue entry, `DecisionControls.type`, flusher run order

**Files:**
- Modify: `src/features/sorting/decisionQueue.ts` (`PendingEntry` decision `type` union, L22), `src/features/sorting/DecisionControls.tsx` (`type` prop, L17), `src/features/sorting/decisionFlusher.test.ts`, `src/features/sorting/decisionQueue.test.ts`

**Behavior (spec §3.6):** `PendingEntry`'s decision `type` union gains `"usage"` (its only writer arrives in Task 18). `DecisionControlsProps.type` widens `"triage" | "pairwise_compare"` → `| "usage"` — runtime-inert on the local path, truthful on the session path (it flows verbatim into the single-route body). The flusher needs **zero code changes**: usage entries are ordinary decision entries (pre-validation uses the shared schema, which accepts usage since PR 1) — the test proves it.

- [ ] **Step 1: Write the failing tests:**
  - `decisionFlusher.test.ts` extension: a queue of `[usage, triage, set_aside, usage]` drains as **batch(2) → disposition → batch(1)**, order preserved — usage entries join contiguous decision runs (spec §5).
  - `decisionQueue.test.ts`: an enqueued usage entry round-trips through `readQueue` (type preserved).
  - `DecisionControls.test.tsx`: existing suite green with the widened union (compile-level; no behavioral addition needed here — `UsageRound` uses the local path).
- [ ] **Step 2:** `npx vitest run src/features/sorting/decisionFlusher.test.ts src/features/sorting/decisionQueue.test.ts` — FAIL (type error / test compile).
- [ ] **Step 3: Implement** the two union widenings.
- [ ] **Step 4:** same command + `npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/decisionQueue.* src/features/sorting/DecisionControls.tsx src/features/sorting/decisionFlusher.test.ts
git commit -m "feat(pipeline): usage entries are ordinary decision entries — queue/controls type widening, run-order pinned"
```

---

### Task 17: The 4-step round arc — `RoundShell` widening

**Files:**
- Modify: `src/features/sorting/RoundShell.tsx` (step `1|2|3` → `1|2|3|4`, L7), `src/features/sorting/RoundShell.test.tsx`, `src/features/sorting/RoundSurface.tsx` (its own `step: 1|2|3` re-declaration, L13, + docblock), `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx` (`step={2} totalSteps={3}` → `step={3} totalSteps={4}`, L151-153), `src/features/sorting/TriageRound.tsx` (`totalSteps={3}` → `{4}`, L285)

**Behavior (spec §3.9):** the arc is Get acquainted → Do you use this? → Which do you love more? → Decide. Triage stays 1, **usage = 2** (Task 18 passes it), compare moves 2 → 3, all call sites `totalSteps={4}`. This touches shipped triage/compare chrome — flagged for review (spec §7.5, user-confirmed: the indicator is a fixed positional wayfinder, not a remaining-work tally) and covered by refreshed PR screenshots.

- [ ] **Step 1: Write the failing tests:** `RoundShell.test.tsx` — renders 4 indicators with `totalSteps={4}`, `aria-label="Round progress: step 3 of 4"` for compare's position, completed-step ✓ non-color cue retained; TriageRound/compare-page tests assert their new step/totalSteps props (page test or component render).
- [ ] **Step 2:** `npx vitest run src/features/sorting/RoundShell.test.tsx` — FAIL.
- [ ] **Step 3: Implement** the widening + call-site updates.
- [ ] **Step 4:** `npx vitest run src/features/sorting/RoundShell.test.tsx src/features/sorting/TriageRound.test.tsx && npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/RoundShell.* src/features/sorting/RoundSurface.tsx "src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx" src/features/sorting/TriageRound.tsx
git commit -m "feat(rounds): 4-step arc — usage is step 2, compare moves to 3"
```

---

### Task 18: `UsageRound` — the round core (Relaxed path)

**Files:**
- Create: `src/features/sorting/UsageRound.tsx`, `src/features/sorting/UsageRound.test.tsx`

**Interfaces (spec §3.4; consumes `useOptimisticRound` — the second consumer that justifies Task 7):**

```ts
interface UsageRoundProps {
  curatorId: string; sessionId: string; collectionId: string; // QueueKey (three fields — shipped shape)
  collectionSlugOrId: string;
  queue: Array<{ item: Item; heroPhotoUrl?: string }>;  // server-selected, selectUsageQueue order
  decisions: MovedDecision[];                            // recap server-log prop — the page passes [] (§3.3)
  usageKnownSeed: number;                                // usageByItemId.size
  hubHref: string;
}
```

**Forks — usage-only (spec §3.4):**
- **Queue state:** `entries` + `handled` set + `passes: Map<itemId, number>` (round-local, ephemeral — a crash forgets pass counts by design, parent D7).
- **Surface:** `RoundShell` `step={2} totalSteps={4}`, `roundLabel` **"This round"** (matches triage's shipped label); `RoundTimer` + `RoundLengthChooser` (Task 11 wiring, not on recap) + `PendingNotices` outside the content swap; question `<h1 tabIndex={-1}>` renders **`ROUND_COPY.usage.name`**; `ItemCard` photo-dominant (`imageClassName="h-64"`); `DecisionControls` with `submit={{ kind: "local", … }}`, `type="usage"` (never a reused `"triage"`), `decisions={usageDecisions(item.id)}`; the always-visible **"Skip for now"** tertiary button (h-11, below a hairline — the demoted-escape slot triage uses) carrying `USAGE_PASS_TITLE` and `USAGE_PASS_ARIA_LABEL` (Task 14 constants).
- **No `TriageUndoProvider`** — no set-aside/defer affordances (D2: Yes / Not these days / Skip for now, nothing else).
- **Pass semantics + termination (parent D2/UX-5/QA-6):** `pass(item)` writes **nothing** (no event, no queue entry, no log line): `passes[id] += 1`; presented twice (`>= 2`) → leaves the queue (`handled`), staying usage-unknown; else moves to the tail (the `handleDefer` reorder pattern). Termination provable: ≤ 2n presentation slots.
- **Answer handler:** closes over the shown item and marks **that item** handled wherever it sits — an answer racing an auto-advance records against the item the person *saw* (the pass wrote nothing, so the answer lands and the item leaves). Taps synchronously cancel any armed beat (`busyRef` + clearTimeout — armed in Task 19).
- **Enqueue path (spec §3.6):** Yes/No taps enqueue `{ kind: "decision", clientKey: newClientKey(), type: "usage", decision: { itemId, result }, enqueuedAt }` through the hook's persist-before-advance; quota fallback POSTs `{ type: "usage", decision, clientKey }` to the single route (accepted since PR 1), advancing only on its ack. Undo-as-revisit rides the hook verbatim (latest-wins holds for usage — same event domain, same comparator).
- **Recap:** each Yes/No pushes a `MovedDecision` (`type: "usage"`, `createdAt: Date.parse(enqueuedAt)` — the F5 client-clock rule) into the round log. Passes push nothing.
- **Answered-count cue:** `usageKnownSeed + newlyAnswered.size`, rendered as **"{n} answered so far"** (exported constant builder) — ticks on the Yes/No tap only, never on a pass, never on the flush, decrements on queued undo (F20 verbatim).
- **Demotion memory writes (spec §3.8, parent-D5 reading amended §6):** the end sequence calls `markUsageRoundRan(curatorId, sessionId)` **only when the round ends without engagement** — (a) always on **queue exhaustion**, (b) on **timer expiry only if `newlyAnswered.size === 0`**. An expired round with ≥ 1 answer writes nothing. Never written on Pause/navigation/unmount.

- [ ] **Step 1: Write the failing tests** (`@vitest-environment jsdom`, fake timers, TriageRound.test.tsx's house pattern — `installStorage`, mocked `next/navigation`, mocked fetch; spec §5's UsageRound list, Relaxed-path half):
  - Pass-tap re-queues the item at the tail; a second pass removes it; an all-pass round terminates into the recap with ≤ 2n presentations.
  - **A pass writes nothing:** no localStorage enqueue, no round-log entry, recap counts unchanged, answered-count unchanged.
  - Persist-before-advance: a Yes tap lands the usage entry in localStorage before the next item renders; quota fallback (storage mocked to always throw) POSTs `{ type: "usage", … }` to the **single route** and advances only on its ack.
  - Answered-count: ticks on Yes/No only; never on a pass; decrements on queued undo; renders "{n} answered so far" via the constant.
  - Undo-as-revisit: queued → removed + re-presented fresh; in-flight/acked (drain mocked) → standing answer shown via `priorAnswer`, a different tap enqueues a superseding entry; rejected → no-op.
  - Zero mid-round `router.refresh()`; exactly one at round end, after the mocked drain settles.
  - Round-expiry vs queue-exhaustion both terminate into the recap; recap shows this round's usage counts (WhatMoved wiring).
  - `markUsageRoundRan` three cases: queue exhaustion → flag written; expiry with zero answers → flag; expiry with ≥ 1 answer → **no flag**; unmount mid-round → no flag.
  - Surface pins: h1 text `=== ROUND_COPY.usage.name` (identity, not a re-pinned string); Skip button's accessible name is `USAGE_PASS_ARIA_LABEL`; `DecisionControls` receives `type="usage"`; `RoundShell` gets `step={2} totalSteps={4}`; the length chooser renders while live and not on the recap.
- [ ] **Step 2:** `npx vitest run src/features/sorting/UsageRound.test.tsx` — FAIL (module missing).
- [ ] **Step 3: Implement** the component on `useOptimisticRound` (if Task 7's shape caveat fired and the extraction landed as smaller units, consume those — the binding requirement is shared units, not the single-hook shape).
- [ ] **Step 4:** `npx vitest run src/features/sorting/UsageRound.test.tsx src/features/sorting/TriageRound.test.tsx && npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/UsageRound.*
git commit -m "feat(usage): UsageRound — write-nothing passes, at-most-twice cycling, optimistic enqueue, demotion memory"
```

---

### Task 19: Quick pacing + the a11y floor + first-Quick education

**Files:**
- Modify: `src/features/sorting/UsageRound.tsx`, `src/features/sorting/UsageRound.test.tsx`

**Behavior (spec §3.5, parent D2 (a)-(e)):**
- **Toggle:** a quiet button on the round surface (below the header, above the card — no pre-round chooser, review A5b), label **"Quick pace"** (exported constant), `aria-pressed`, ≥44 px. Writes `setUsagePace` + updates state; leaving Quick mid-round is the same toggle. Pace read at mount in an effect (hydration-safe, the `getRoundBox` pattern) — **Relaxed default, ever**.
- **Beat:** `export const QUICK_BEAT_MS = 5_000` (named tunable). While pace is `quick`, the round is live (not ended, not revisiting), and no suspension holds: a `setTimeout(QUICK_BEAT_MS)` keyed to the current item; on fire → `pass(current)`. **No per-item countdown is rendered** — the beat is felt, never watched.
- **A11y floor:**
  - (a) One `focusin`/`focusout` listener pair on the round-surface root suspends (clears) / re-arms the beat while focus is on **any interactive chrome** — decision controls, Skip, Back/undo, the Quick toggle, the `RoundLengthChooser`, `RoundShell`'s Pause. Re-arm restarts the **full** beat (restart, not resume — named choice). WCAG 2.2.1's escape hatches must be operable without the beat firing beneath them; Quick + SR is served by suspension (e).
  - (b) In Quick, every advance (auto-pass, Skip tap, answer) moves focus to the new item's `h1[tabIndex=-1]` (WCAG 2.4.3) — **except** an auto-pass never moves focus when `document.activeElement` is interactive chrome outside the card/heading region (belt-and-braces). In Relaxed, tap-advance keeps triage's behavior (no focus move).
  - (c) A visually-hidden `role="status"` region announces "Now: {item name}" on advance (distinct from `RoundTimer`'s live region).
  - (d) The card swap uses CSS transitions with `motion-reduce:transition-none` (the house pattern) — reduced motion cannot suppress the advance callback by construction.
- **First-Quick education (UX-4):** on enabling Quick with `hasSeenQuickIntro()` false: the line **"If you're not sure, it just comes around again."** (exported constant, parent-fixed verbatim) renders as `role="status"` in the same commit as the toggle state change, and the first beat arms only **after** that commit. The line stays visible for the rest of the round; `markQuickIntroSeen()` at enable, so later rounds skip it.

- [ ] **Step 1: Write the failing tests** (fake timers; mocked `matchMedia` for reduced motion; spec §5's list, Quick half):
  - **Relaxed default:** no beat fires without the toggle (advance never happens on timer alone).
  - Quick auto-advance after `QUICK_BEAT_MS` re-queues the current item at the tail (same outcome as a pass-tap).
  - **Tap racing auto-advance resolves to the tap:** fire the beat and a Yes tap in the same tick window — the item ends **answered**, not passed; no double-advance.
  - Suspension: focus on the `RoundLengthChooser`, the Quick toggle, Back, and Pause (not only the decision controls) each suspend the beat (time passes, no advance); focusout re-arms the **full** beat.
  - An auto-pass forced to fire with focus on such chrome does **not** move focus to the heading.
  - In Quick, focus lands on the new item's heading after an advance; the `role="status"` region announces the new item.
  - Reduced motion (mocked matchMedia): the advance still fires; the swap container carries `motion-reduce:transition-none`.
  - Mid-round toggle off cancels the armed beat.
  - First-Quick education: with the flag unset, the line renders **before any advance** (beat arms only after the commit) and persists for the round; with the flag set, absent; enabling sets the flag (persists).
- [ ] **Step 2:** `npx vitest run src/features/sorting/UsageRound.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same command — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/UsageRound.*
git commit -m "feat(usage): Quick pacing — 5s beat, focus/announce/reduced-motion a11y floor, first-Quick education"
```

---

### Task 20: The usage round page — one curator-log read, empty recap prop

**Files:**
- Create: `src/app/collections/[id]/sort/[sessionNumber]/usage/page.tsx`, `src/app/collections/[id]/sort/[sessionNumber]/usage/page.test.tsx`

**Behavior (spec §3.3 — mirrors `triage/page.tsx` exactly for the guard ladder, `TakeABreakControl` actions, and the `PendingDecisionsGate` wrap; differences):**
- **Reads:** items · sortSession · dispositions · **one** decision-log read — `DecisionController.fromDb(db).listForCurator(collection.id, session.user.id)`. **No `listBySession`, no preferences read.**
- **Queue:** `selectUsageQueue(items, deriveUsage(curatorEvents, new Set(items.map(i => i.id))), dispositionByItemId)`, then cover photos exactly as triage does (`findCoverPhotosByItemIds` → `getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card })`).
- **Seed:** `usageByItemId.size` (the distinct usage-known count).
- **Recap prop:** `decisions={[]}` — the curator log is consumed **server-side only** (queue + seed) and is **never serialized into the RSC payload** (`whatMoved` window-filters to the round start, so every curator-log event predates mount and could never contribute a recap count; serializing it would be pure hydration weight on an unbounded table — DATA-6).
- **No `TriageUndoProvider`.** Breadcrumb label: the round's home ("Session" → hub, then the usage round — mirror triage's breadcrumb shape).

- [ ] **Step 1: Write the failing tests** (mirror `triage/page.test.tsx` conventions — mocked controllers/auth, render the async page):
  - Guard ladder: unauthenticated → login redirect; bad session number / foreign collection / non-curator → hub-or-sort redirects (clone triage's cases).
  - **Payload-scoping regression pin (spec §5):** seed a prior-session AND a prior-visit usage/pairwise event in the mocked curator log → the rendered `UsageRound`'s `decisions` prop is `[]` (the events appear nowhere in the component's props).
  - Queue: usage-known and disposed items excluded from the `queue` prop; `usageKnownSeed` equals the derived map's size; cover URLs attached.
  - `PendingDecisionsGate` wraps the round; `TakeABreakControl` in the layout actions; no `TriageUndoProvider` in the tree.
- [ ] **Step 2:** `npx vitest run "src/app/collections/[id]/sort/[sessionNumber]/usage/page.test.tsx"` — FAIL.
- [ ] **Step 3: Implement** the page.
- [ ] **Step 4:** same command + `npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add "src/app/collections/[id]/sort/[sessionNumber]/usage/"
git commit -m "feat(usage): usage round page — one curator-log read, empty recap payload, triage guard ladder"
```

---

### Task 21: Hub — ladder + dual return, demotion swap, third card, one-read swap

**Files:**
- Modify: `src/lib/next-round.ts`, `src/lib/next-round.test.ts`
- Create: `src/features/sessions/RecommendedRound.tsx`, `src/features/sessions/RecommendedRound.test.tsx`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/page.tsx`, its `page.test.tsx`

**Interfaces (spec §3.8):**

```ts
// next-round.ts
export type NextRoundKind = "triage" | "usage" | "compare" | "decide";
export interface NextRoundInput {
  items: Item[]; preferences: CollectionPreferenceItem[];
  decisions: DecisionEvent[];          // session-scoped — selectNextPair input, unchanged (§7.3 quirk preserved)
  curatorDecisions: DecisionEvent[];   // NEW — the §2.6 cross-session log
  dispositionByItemId?: Map<string, Disposition>;
}
export function recommendNextRound(input: NextRoundInput): {
  primary: NextRound;
  whenUsageDemoted?: NextRound; // present iff primary.kind === "usage"; ladder re-run as triage → compare → decide
};
```

- Ladder: `selectTriageItem` hit → **triage**; else `selectUsageQueue(items, deriveUsage(curatorDecisions, liveIds), dispositions)` non-empty → **usage**; else `selectNextPair` hit → **compare**; else **decide** — the very selectors the rounds use (F6: recommendation and round agree by construction).
- `whenUsageDemoted` re-runs the ladder **skipping usage** — usage is **never re-promoted** on a demoted device (named narrowing of parent D5, user-confirmed §7.1); the hub's always-present usage chooser card is the honored path back.
- Usage card copy: `label` references **`ROUND_COPY.usage.name`** (identity — one home); `description: "An easy pass — just whether each piece is in your life right now."`; `cta: "Begin"` (card-own copy per the shipped precedent; non-numeric).
- **Hub page:** swap the `listBySession` call for **one** `DecisionController.listForCurator(collection.id, sortSession.curatorId)` read; derive the session-scoped `decisions` for `selectNextPair`/`SessionAnalytics` by `curatorDecisions.filter(e => e.sessionId === sortSession.id)` (`DecisionEvent` carries `sessionId`; the curator guard makes the curator log a strict superset, so the filtered subset is identical to today's `listBySession` result). Third card in the grid (`ROUND_COPY.usage`), **between** Triage and Compare, linking `${collectionHref}/sort/${number}/usage`; hub computes hrefs for both `primary` and `whenUsageDemoted`.
- **`RecommendedRound` (client wrapper):** receives `{ primary: { round, href }, whenUsageDemoted?: { round, href }, curatorId, sessionId }`; renders `primary` (server paint), after mount swaps to `whenUsageDemoted` if `hasUsageRoundRan(curatorId, sessionId)` — the read-device-state-after-hydration pattern. The swap is a **plain same-slot re-render** of the presentational `RecommendedRoundCard` (unchanged, stays server-renderable): no transition/animation classes, **zero layout shift** (both rounds' copy renders within the card's reserved footprint at hub widths). The pre-hydration wrong-card window on demoted hubs is an accepted, named trade-off (spec §7.2, user-confirmed) — do NOT add a neutral placeholder.

- [ ] **Step 1: Write the failing tests:**
  - `next-round.test.ts` — **all four branches**: untriaged → triage; usage-unknown → usage **and** `whenUsageDemoted` present; usage-known + rankable pair → compare; none → decide. Demoted ladder: pair remaining → compare; no pair → **decide** (never usage). `whenUsageDemoted` absent when primary ≠ usage. Usage card copy: `label === ROUND_COPY.usage.name` (identity), description/cta verbatim, non-numeric.
  - `RecommendedRound.test.tsx` — flag set (via `markUsageRoundRan`) → demoted card content after mount; unset → primary; a **different curator's/session's** flag → primary (isolation); the swap is a same-slot content change (same rendered card container) and the swap container carries **no transition/animation classes**.
  - Hub `page.test.tsx` — third card present between the renamed Triage/Compare cards, linking `/usage`; exactly **one** decision read (`listForCurator`, no `listBySession`); `SessionAnalytics`/`selectNextPair` receive the session-filtered subset; `RecommendedRound` mounted with both hrefs + curator/session ids.
- [ ] **Step 2:** `npx vitest run src/lib/next-round.test.ts src/features/sessions/RecommendedRound.test.tsx "src/app/collections/[id]/sort/[sessionNumber]/page.test.tsx"` — FAIL.
- [ ] **Step 3: Implement** ladder + wrapper + hub rewiring.
- [ ] **Step 4:** same command + `npm run build` — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/next-round.* src/features/sessions/RecommendedRound.* "src/app/collections/[id]/sort/[sessionNumber]/page."*
git commit -m "feat(hub): usage in the recommendation ladder — dual return, device-local demotion swap, third round card"
```

---

### Task 22: Playwright usage-round smoke

**Files:**
- Create: `e2e/usage-round.spec.ts`

**Behavior (spec §5):** the un-mocked full-stack crossing for the new surface — from the hub's usage card: answer two items (one "Yes, I use it", one "Not these days"), Skip one, the recap shows the two answers ("1 in your life" / "1 resting for now"); the skipped item produced no line. Clone the seeding/login conventions of `e2e/sort-session.spec.ts` / `e2e/compare.spec.ts`. Runs in the CI `e2e` job (`.github/workflows/ci.yml`).

**Deferred (named, spec §5/§6):** the smoke's **reload half** — "reload lands the events before the round re-renders" — stays OUT of PR 2: the crash-reload harness does not exist (Epic P deferred its Playwright tier; prerequisite bead **`purses-hmjs`**, gated on `purses-yuw`). The assertion joins the suite when that bead lands. Name it in PR 2's body.

- [ ] **Step 1:** Write the spec (e2e specs aren't TDD'd against a missing feature — the feature exists by now; write and run).
- [ ] **Step 2:** `npx playwright test e2e/usage-round.spec.ts` locally — PASS (dev server per the repo's playwright config).
- [ ] **Step 3: Commit**

```bash
git add e2e/usage-round.spec.ts
git commit -m "test(e2e): usage-round smoke — hub card, two answers + one skip, recap counts"
```

---

### Task 23: Copy inventory — the named TONE gate

**Files:**
- Modify: `src/features/sorting/roundCopy.test.ts` (or a dedicated `usage-copy.test.ts` audit block) — whichever keeps one obvious home

**This is the spec-§4 TONE-review task (a named PR 2 task per the epic's requirements).** Two halves:

1. **Mechanical (in CI):** every §4 inventory row's string exists as an **exported constant** and is asserted against that constant by some test in this plan (audit the table below); plus the register scan — **no digits/denominators/urgency terms** ("left", "remaining", "hurry", "only", numerals) in the usage-round copy constants (`ROUND_COPY.usage`, `usageDecisions` labels, pass constants, Quick toggle/education, recap lines, helper lines, `SUB_MINUTE_LABEL`). Exception handling: the recap/answered-count *templates* interpolate counts by design (F20's affirming pattern) — assert the constant templates, not rendered digits.
2. **Review (session gate):** run the TONE review over the §4 table (the strings are proposals; parent-fixed candidates are carried verbatim). Any wording change is an edit to the constant + its verbatim assertion — one commit. TONE.md is first-order: an exception is an amendment to TONE.md, never a local override.

| §4 slot → owning constant | Asserted in |
|---|---|
| Round question h1 (= `ROUND_COPY.usage.name`) | Task 14 (verbatim) + Task 18 (identity) |
| "Yes, I use it" / "Not these days" (`usageDecisions`) | Task 14 |
| "Skip for now" + title + aria-label | Task 14 (+ Task 18 accessible-name) |
| `ROUND_COPY.usage.explainer` | Task 14 |
| Renames: "Get acquainted" / "Which do you love more?" | Task 14 |
| `roundLabel` "This round" | Task 18 |
| Recommended-card description/cta | Task 21 |
| "Quick pace" toggle + education line | Task 19 |
| "{n} answered so far" | Task 18 |
| Recap lines "in your life"/"resting for now" | Task 15 |
| `ROUND_BOX_OPTIONS` labels (only home) | Task 8 |
| Length helper lines (timed / no-timer) | Task 10 |
| `SUB_MINUTE_LABEL` | Task 9 |

- [ ] **Step 1:** Write the audit/register-scan test (failing if any constant is missing/un-exported).
- [ ] **Step 2:** `npx vitest run src/features/sorting/roundCopy.test.ts` — green after wiring.
- [ ] **Step 3:** Run the TONE review; fold any wording edits (constants + assertions together).
- [ ] **Step 4: Commit**

```bash
git add src/features/sorting/roundCopy.*
git commit -m "test(tone): usage copy inventory — every string a constant, register rules enforced"
```

---

### Task 24: PR 2 boundary — full gates, screenshots, beads, PR

- [ ] **Step 1: Full gates:**

```bash
npm run build && npm run test:ci && npm run lint && npm run auth:verify && npm run test:db
```

Expected: ALL PASS. Then `npx playwright test` locally (the e2e job also runs in CI).
- [ ] **Step 2: Screenshots** (`/pr-screenshots`, light + dark): the hub with the third card + renamed cards + recommended card; the usage round in Relaxed and Quick (education line visible); the round-length chooser; the recap with usage lines.
- [ ] **Step 3: File the epic's follow-up beads** (epic completion = ALL beads closed; not owner-deferrable):
  - `/welcome` walkthrough usage beat (spec §7.6 — renames arrive free via `ROUND_COPY`; the missing beat is the bead).
  - Hub session-scoped `selectNextPair` quirk (spec §7.3 — preserved, not fixed).
  - Dead `timebox` POST field (spec §7.4).
  - Confirm `purses-hmjs` (crash-reload e2e) lists the usage-round reload assertion.
- [ ] **Step 4:** Orchestrator: `/sync-docs` (ARCHITECTURE/DESIGN/API per doc-ownership) + `graphify update .` before push. Open **PR 2**; body names: the PR-1 deploy-order dependency (verified deployed), the reload-half deferral (`purses-hmjs`), the pre-hydration demotion window (accepted trade-off, §7.2), and the shipped-chrome change (4-step arc, §7.5).

---

## Coverage audit — every spec-§5 obligation → exactly one owning task

Owner = the task whose Step 1 contains the assertion.

**PR 1 (server, DB-backed unless noted):**

| Spec obligation | Task |
|---|---|
| Schema: usage variant accepts `generateId("item")` end-to-end, rejects bare 26-char ULID (F1 extended), rejects out-of-enum results (vitest unit) | 1 |
| `deriveUsage` unit table: empty log; latest-wins; equal-`createdAt` id tie-break; non-usage ignored; non-live dropped | 2 |
| Per-curator isolation: `listForCurator` returns only the caller's; `deriveUsage` over A's log never contains B's items | 3 |
| Cross-session: session-1 usage event in `listForCurator`, item usage-known for a session-2 queue (composition half completed by Task 12's usage-known-out case) | 3 |
| Usage-only batch → created, **zero recomputes** (observable, never a spy — QA-14), zero `bringBack` effects | 5 |
| Mixed usage+triage → exactly one recompute; disposition-clear only for triaged itemIds; usage derivable via `deriveUsage` (QA-9) | 5 |
| Triage-all-duplicate + usage-created → 201, zero recomputes (§2.4's new edge) | 5 |
| Recompute-output invariance: usage never touches score/orderRank | 5 |
| Usage for a disposed (live) item → created (D3/QA-7); unknown/foreign/deleted itemId → per-entry rejected, others written | 5 |
| *Deferred half:* disposed item's usage excluded from Standing → **Epic S's test floor** (not droppable) | 6 (named in PR body) |
| Latest-wins via the shared comparator: in-batch (monotonic id) + cross-batch (`createdAt`), asserted through `deriveUsage` | 5 |
| Single route: usage → 201 + row, zero recomputes, no disposition cleared, clientKey replay → 200, malformed → 400 writes nothing | 4 |

**PR 2 (client, jsdom/fake timers unless noted):**

| Spec obligation | Task |
|---|---|
| `recommendNextRound` all four branches; `whenUsageDemoted` present iff usage-primary; demoted ladder → compare, else **decide** (never usage) | 21 |
| Anti-nagging application: flag → demoted after mount; unset → primary; foreign curator/session flag → primary; motionless same-slot swap | 21 |
| `markUsageRoundRan` three cases: exhaustion → flag; expiry+0 answers → flag; expiry+≥1 → no flag; never on pause/unmount | 18 |
| `selectUsageQueue` inclusion branches: untriaged in; set_aside out; deferred out; usage-known out; input order; empty | 12 |
| Quick auto-advance re-queues at tail AND pass-tap does the same | 19 (tap: 18) |
| At-most-twice → all-pass round terminates into the recap (≤ 2n) | 18 |
| Tap racing auto-advance resolves to the tap (answered, no double-advance) | 19 |
| Suspension on `RoundLengthChooser`/toggle/Back/Pause focus (not only decision controls); full-beat re-arm on focusout | 19 |
| Forced auto-pass with focus on chrome does not move focus; Quick advance focuses the heading; `role="status"` announces | 19 |
| Reduced motion: advance still fires; swap container carries `motion-reduce:transition-none` | 19 |
| Relaxed default (no beat without toggle); mid-round toggle-off cancels the armed beat | 19 |
| First-Quick education: renders before any advance when unset; absent when set; flag persists | 19 |
| Round-expiry vs queue-exhaustion both terminate into the recap | 18 |
| A pass writes nothing (no enqueue, no round-log entry, recap counts unchanged) | 18 |
| Persist-before-advance + quota fallback POSTs `type: "usage"` to the single route, advances on its ack | 18 |
| Answered-count ticks on Yes/No only, never on a pass, decrements on queued undo | 18 |
| Undo-as-revisit: queued → removed + fresh; in-flight/acked → `priorAnswer` + supersede; rejected → no-op | 18 |
| Zero mid-round `router.refresh()`, exactly one at round end | 18 |
| Usage page payload scoping: `decisions` prop is `[]`; seeded prior events never in props | 20 |
| TriageRound regression net: extraction ships with `TriageRound.test.tsx` passing unchanged | 7 |
| Round-length clamp table; `DEFAULT_ROUND_BOX === 2`; options asserted once against `ROUND_BOX_OPTIONS`; components assert list identity | 8 (components: 10, 11) |
| `RoundLengthChooser`: "No timer" visible peer; switch-to-none removes countdown; shorter-than-elapsed → gentle recap; persists via `setRoundBox` | 11 |
| `StartSessionForm`: default "2", five options, selection-keyed helper line | 10 |
| `RoundTimer`: sub-minute label; 30 s box never shows "About 1 minute" | 9 |
| `roundCopy`: usage strings verbatim once + identity from consuming slots; renames verbatim; pass accessible name (2.5.3); no digits/denominators/urgency | 14 (identity: 18, 21; gate: 23) |
| `what-moved`/`WhatMoved`: usage counted into uses/resting/total; count-gated lines; triage-only renders no usage lines; zero-total gentle pass | 15 |
| Flusher: `[usage, triage, set_aside, usage]` → batch(2) → disposition → batch(1), order preserved | 16 |
| `RoundShell` 4-step arc (step type widened; compare call site at 3) | 17 |
| Playwright: usage smoke (hub card → two answers + one skip → recap) | 22 |
| Playwright reload half | **deferred → `purses-hmjs`** (named in 22/24) |
| Screenshots light+dark incl. hub third card + both paces | 24 |

## Self-Review

**Spec mechanisms → tasks:** §2.1 → 1; §2.2 → 1 (+ deploy-order in Global Constraints/6); §2.3 → 4; §2.4 → 5; §2.5 → 2; §2.6 → 3; §2.7 → 4+5 (pins); §3.1 → 8, 9, 10, 11; §3.2 → 12; §3.3 → 20; §3.4 → 7 (extraction) + 18 (forks); §3.5 → 13 (prefs) + 19 (mechanics); §3.6 → 16 + 18; §3.7 → 15; §3.8 → 13 (memory) + 18 (writes) + 21 (ladder/swap/card); §3.9 → 17; §4 → 23; §6 rollout → PR structure + Tasks 6/24; §7 resolutions honored as folded (never re-decided).

**Verified against real code (not assumed):** `DecisionType`/`DecisionEvent` (`domain.ts:114-135` — `sessionId` present on events, needed for the hub filter); `BatchEntrySchema`/`ItemId`/`ClientKey` (`decision-batch-schema.ts:7-48`); single-route schema + `.and(clientKey)` + recompute L150 + triage-only clear L154-156 + analytics L166-181; batch route `referencesUnknownItem` L31-36 (usage would fall into the pair branch — the explicit arm is required), `insertedTriagedItemIds` L149, `insertedCount` L150/188/196 (only consumer is the recompute gate; **status derives from `counts.created > 0` at L230**, a small divergence from the spec's "keep insertedCount for the status" — folded into Task 5), clear block L193-207, counts L218-228; `DecisionController` (`decisions.ts:5-15`, currently decisionRepo-only); `PreferenceStateService.loadDecisionEvents` L99-108 + `clearOrderRanks`/`bulkUpsert` L52-64; `compareByCreatedAtThenId` (`decision-order.ts`); `deriveStanding` (`standing.ts:14`); `round-preference.ts` (RoundBox 5|10|20|none, default none, key `pi-round-box`, L5-6 comment); `RoundTimer` `minutesLeft` L19-21, effect deps L54, "About N … left in this round" L86; `StartSessionForm` default "10" L20, options L80-85, dead `timebox` POST L38; `RoundShell` step `1|2|3` L7; `RoundSurface` step re-declaration L13, `MINUTE_MS`/`getRoundBox` L29/55-58; compare page `step={2} totalSteps={3}` L151-153; `TriageRound` — key memo (three-field `QueueKey`!) L71-74, fallback POST L161-179, round-log/end-sequence L88-143, undo L204-226, `handleDefer` tail reorder L256-260, `PendingNotices` placement L291-296, `motion-reduce` L342, escape slot L374, `roundLabel`/`step` L284-287; `DecisionControls` `type` L17 + session body L51 (no clientKey — the fallback POST is the hook's, not the control's); `DeferControl` LABEL/TITLE/ARIA L24-26; hub page `listBySession` L54, grid L97-116, `RecommendedRoundCard` (presentational, `features/sessions/`); triage page guards/reads/covers/seed L24-127; `decisionQueue` `PendingEntry` L18-32 + `QueueKey.collectionId` L10-16; flusher head-run batching + shared-schema pre-validation + 400-quarantine (`decisionFlusher.ts:205-303`); `what-moved.ts` L12-33/48; `WhatMoved.tsx` `lines()` + gentle-pass copy; `roundCopy.ts`/`.test.ts` (current "Triage"/"Compare" verbatim assertions → updated in Task 14); ROUND_COPY consumers (hub page + test, welcome beats + test); `e2e/session-pause.spec.ts:113` "Triage" link assertion (rename fallout); CI `e2e` job exists (`.github/workflows/ci.yml`); repos expose `findBySession`/`findByCollectionAndCurator`.

**Gaps to watch during execution:** (1) Task 7's hook seam — honor the spec's shape caveat rather than forcing one wide hook. (2) The recompute observable — reuse `decision-batch.integration.test.ts`'s exact helper, don't invent a second. (3) jsdom focus semantics for the Task 19 suspension tests — drive `focusin`/`focusout` via `fireEvent`/`userEvent.tab()`, and document any jsdom-vs-browser delta in the test. (4) `DecisionController` direct constructions outside `fromDb` (grep before Task 3). (5) `beats.test.tsx`/page tests may hard-code round names — sweep in Task 14 Step 3. (6) The usage page has **no preferences read** — don't copy it from triage reflexively.

## Spec ambiguities encountered (listed for the orchestrator — none resolved silently)

1. **§5 PR-1 cross-session bullet references `selectUsageQueue`** (a PR-2 module) inside the PR-1 test floor. Plan splits it: Task 3 asserts the fact via `deriveUsage` (item usage-known); Task 12's `usage-known → out` case completes the composition.
2. **§2.4 "keep `insertedCount` for the 201/200 status (L230)"** — the shipped route derives status from `counts.created > 0`, and `insertedCount`'s only consumer is the recompute gate. Task 5 replaces it with `insertedScoringCount` and removes the dead counter; response semantics identical.
3. **Home of the pass-button copy constants** — the spec pins the strings (§3.4/§4) but not their module. Plan exports them from `roundCopy.ts` beside `usageDecisions` (one home for round copy); flag at review if the executor prefers component-local constants.
4. **Rename fallout surface** — the spec names the walkthrough as "free via the shared module" but is silent on `e2e/session-pause.spec.ts`'s hard-coded "Triage" link assertion. Task 14 updates it.
5. **`UsageRound`'s `decisions` prop** — §3.3 says the server-log prop is an empty `MovedDecision[]` and §5's page test asserts the prop is empty; the plan keeps the prop (page passes `[]`) rather than hardcoding `[]` inside the component, so the payload-scoping pin has something to assert against.

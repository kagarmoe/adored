# Epic P — Batched Decision Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One client queue + one batch endpoint so no tap in any round waits on the database: triage decisions, dispositions ("Not mine"/"Not yet"), compare as an idempotent batch-of-1, and crash/pause/completion recovery via `PendingDecisionsGate`. No schema migration — `decision_events.client_key` and its partial unique index already exist (`src/lib/db/schema.ts:227-234`).

**Spec (authoritative — every mechanism decision is already made; implement, never re-decide):**
`docs/superpowers/specs/2026-07-06-epicP-batched-decisions-design.md` (rev 2), with parent
`docs/superpowers/specs/2026-07-06-usage-round-and-sort-unification-design.md` §D6/§D7/§4.

**Architecture:** Server: `POST /api/sessions/[id]/decisions/batch` (same gates and advisory lock as the single route; one transaction, one recompute, per-entry `created | duplicate | rejected` results). Ordering authority stays DB `now()` (transaction-start-fixed, shared per batch) + monotonic-ULID event ids in array order, resolved everywhere by one shared comparator (`src/lib/decision-order.ts`). Client: a localStorage queue (`adored.pending.v1.{curatorId}.{sessionId}`), a single-flight Web-Lock flusher that is the only code that POSTs, optimistic round advance, and a recovery gate that drains before any sort surface renders from stale events.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, Postgres, Zod 3, `ulid` ^2.3.0 (`monotonicFactory`), Vitest (`RUN_DB_TESTS=1` DB tier; `@vitest-environment jsdom` docblock for client tests), posthog-node.

## Global Constraints

- **No schema migration.** `clientKey` + partial unique index `decision_events_client_key_unique (session_id, client_key) WHERE client_key IS NOT NULL` shipped in Epic 0. `decision_events.created_at` is `defaultNow() NOT NULL` — **never set `createdAt` in JS on the batch path** (spec §2.3.5; the repository's `new Date()` path in `DecisionEventRepository.create` is seed/test-only and stays untouched).
- **Advisory-lock contract:** any write that touches this curator's preferences takes `lockCollectionCurator(tx, collectionId, userId)` (`src/lib/transactions.ts:18`) inside `withTransaction` — the batch route included, op label `record_decision_batch`.
- **Gates in CI** (pre-push mirrors them): `npm run build` · `npm run test:ci` · `npm run lint` · `npm run auth:verify` · `npm run test:db`. Every test added here runs in one of those; nothing manual, nothing skipped.
- **TDD:** failing test first, then minimal code. YAGNI never applies to tests (user override).
- **DB tests:** `src/lib/db/*.integration.test.ts`, `// @vitest-environment node` docblock, gated by `const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;`. Mock ONLY `@/lib/auth` (via `mockAuth` from `e2e/fixtures/mock-auth.ts`) and `@/lib/db` (`getDb: () => getTestDb().db`) — plus `@/lib/posthog-server` for the analytics assertion. Run one file: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism <file>` (Docker DB via `npm run test:db` if not up; default URL `postgresql://postgres:test@localhost:5433/app_test`).
- **≥1 un-mocked route→service→repo→DB test exercises the batch route itself** (Task 5's happy-path batch test is that test — real handler import, real controllers, real Postgres).
- **Client tests:** vitest + jsdom via `// @vitest-environment jsdom` docblock, `@testing-library/react`, `vi.mock("next/navigation", …)`, `global.fetch = vi.fn()`, fake timers for backoff/triggers (see `src/features/sorting/TakeABreakControl.test.tsx` for the house pattern).
- **Copy:** all person-side notice strings are exported constants (tests assert against the constant), TONE.md register — never "error"/"failed"/"invalid". Final wording is a TONE-review item; the spec's draft strings are the starting point.
- **Branch:** `feat/sort-unification-specs` already exists with the specs. Work continues on a new branch **`feat/epicP-batched-decisions` cut from it** (orchestrator confirms base at kickoff). Never commit to `main`. One PR for the whole epic (spec §5); commit per task.
- **Out of scope** (spec §1/parent §5): usage events (Epic R — the pipeline stays type-agnostic so Epic R only extends the Zod union), client-side compare pair selection (`purses-ka07`), tombstone/undo events, offline beyond localStorage, the single route's semantic item check (`purses-stln`).

## File Structure

- **Create** `src/lib/decision-order.ts` + `src/lib/decision-order.test.ts` — shared `(createdAt, id)` comparator (spec §2.4).
- **Modify** `src/server/services/ScoringService.ts` (sort at L89-92, currently `localeCompare`) and `src/lib/insertion-ranking.ts` (`isAfter` L21-25 and `canonicalSequence` id tie-breaks, currently code-unit `>`/`<`) — both delegate to the comparator.
- **Modify** `src/lib/id.ts` + **create** `src/lib/id.test.ts` — `generateOrderedIdFactory()`.
- **Create** `src/lib/decision-batch-schema.ts` + test — shared Zod batch schema (client pre-validates with the same module).
- **Create** `src/lib/read-json-with-limit.ts` + test — stream-budget body reader.
- **Create** `src/app/api/sessions/[id]/decisions/batch/route.ts` — the batch endpoint.
- **Create** `src/lib/db/decision-batch.integration.test.ts` — DB-backed batch-route suite.
- **Modify** `src/lib/db/route-authz-enumeration.integration.test.ts` — register the batch route in `buildStrangerCases()` (L197).
- **Modify** `src/app/api/sessions/[id]/decisions/route.ts` — remove the dead 23505 catch-and-re-read (L54-59, L144-162).
- **Create** `src/features/sorting/decisionQueue.ts` + test — queue/quarantine storage module (pure + storage, no React).
- **Create** `src/lib/web-lock.ts` + test — `navigator.locks` wrapper with in-realm fallback.
- **Create** `src/features/sorting/decisionFlusher.ts` + test — drain engine, failure taxonomy, triggers hook.
- **Modify** `src/lib/triage-selection.ts` + `src/lib/triage-selection.test.ts` — `selectTriageQueue`; `selectTriageItem` = first entry (keeps `src/lib/next-round.ts:40` agreeing by construction).
- **Create** `src/features/sorting/TriageRound.tsx` + test — the optimistic client round (reuses `RoundShell`/`RoundTimer`/`WhatMoved`; `RoundSurface` remains for compare).
- **Modify** `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx` (+ its `page.test.tsx`) — server-select the queue, hand off to `TriageRound`.
- **Modify** `src/features/sorting/DecisionControls.tsx` + test — optional prior-answer prop (F19).
- **Create** `src/features/sorting/pendingNotices.tsx` (component + exported copy constants) + test.
- **Modify** `src/features/sorting/TriageUndoProvider.tsx`, `src/features/sorting/DeferControl.tsx` (+ tests) — dispositions through the queue.
- **Modify** `src/features/sorting/CompareChoice.tsx` + test — batch-of-1 through the queue/flusher (replaces the bare fetch + `crypto.randomUUID()` clientKey).
- **Create** `src/features/sorting/PendingDecisionsGate.tsx` + test; **modify** mount points: `src/app/collections/[id]/sort/page.tsx`, `…/sort/[sessionNumber]/page.tsx`, `…/triage/page.tsx`, `…/compare/page.tsx`, `src/app/collections/[id]/results/page.tsx` (the Standing surface).
- **Create** `src/features/sorting/sessionStatusPatch.ts` + test; **modify** `src/features/sorting/TakeABreakControl.tsx`, `src/features/sorting/ResumeControl.tsx`.
- **Create** `scripts/bench-batch.ts` (reuses `scripts/seed-load-core.ts`); **modify** `package.json` (`bench:batch` script), `docs/API.md` (route index).

---

### Task 1: Shared tie-break comparator — `src/lib/decision-order.ts`

**Files:**
- Create: `src/lib/decision-order.ts`, `src/lib/decision-order.test.ts`
- Modify: `src/server/services/ScoringService.ts` (L89-92), `src/lib/insertion-ranking.ts` (`isAfter` L21-25; `canonicalSequence` id tie-break ~L120-123)

**Interfaces:**
- `interface Ordered { id: string; createdAt: Date }`
- `function compareByCreatedAtThenId(a: Ordered, b: Ordered): number` — `createdAt` epoch-ms first, then **code-unit** id comparison (`<`/`>`, documented: NOT locale-dependent; at equal `createdAt` a cross-format tie `event_…` < `evt_…` resolves by prefix, accepted per spec §2.4).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/decision-order.test.ts
import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { compareByCreatedAtThenId } from "./decision-order";

const at = (ms: number) => new Date(ms);
const ev = (id: string, ms: number) => ({ id, createdAt: at(ms) });

// The two comparators being replaced, reproduced verbatim as oracles:
// ScoringService.ts:91 (localeCompare) and insertion-ranking.ts isAfter (`>`).
const oldScoring = (a: { id: string; createdAt: Date }, b: { id: string; createdAt: Date }) => {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
};
const oldRankingSign = (a: { id: string; createdAt: Date }, b: { id: string; createdAt: Date }) => {
  const ta = a.createdAt.getTime(), tb = b.createdAt.getTime();
  if (ta !== tb) return ta > tb ? 1 : -1;
  return a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
};
const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

// Realistic corpus: prefixed lowercase ULIDs, BOTH prefixes that exist in the
// table (`event_` from generateId, `evt_` from legacy seed/DB-test paths).
function corpus(n: number) {
  const out: Array<{ id: string; createdAt: Date }> = [];
  for (let i = 0; i < n; i++) {
    const prefix = i % 3 === 0 ? "evt" : "event";
    out.push(ev(`${prefix}_${ulid().toLowerCase()}`, 1000 + (i % 7)));
  }
  return out;
}

describe("compareByCreatedAtThenId", () => {
  it("orders by createdAt first", () => {
    expect(sign(compareByCreatedAtThenId(ev("event_b", 1), ev("event_a", 2)))).toBe(-1);
    expect(sign(compareByCreatedAtThenId(ev("event_a", 2), ev("event_b", 1)))).toBe(1);
  });
  it("breaks createdAt ties by code-unit id", () => {
    expect(sign(compareByCreatedAtThenId(ev("event_a", 5), ev("event_b", 5)))).toBe(-1);
    expect(sign(compareByCreatedAtThenId(ev("event_a", 5), ev("event_a", 5)))).toBe(0);
  });
  it("property: sign-equal with BOTH old comparators on the realistic corpus (F10)", () => {
    const items = corpus(300);
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j += 17) {
        const a = items[i], b = items[j % items.length];
        const s = sign(compareByCreatedAtThenId(a, b));
        expect(s).toBe(sign(oldScoring(a, b)));
        expect(s).toBe(sign(oldRankingSign(a, b)));
      }
    }
  });
  it("at equal createdAt, event_ sorts before evt_ (documented cross-format tie)", () => {
    const a = ev(`event_${ulid().toLowerCase()}`, 9);
    const b = ev(`evt_${ulid().toLowerCase()}`, 9);
    expect(sign(compareByCreatedAtThenId(a, b))).toBe(-1); // "event_" < "evt_" code-unit ('e'<'t' at index 2)
  });
});
```

Also update `src/server/services/ScoringService.test.ts` and `src/lib/insertion-ranking.test.ts` only if behavior assertions break (they must NOT — the switch is behavior-identical on the real corpus; a broken assertion there is a finding, stop and report).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/decision-order.test.ts`
Expected: FAIL — module `./decision-order` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/decision-order.ts
// The ONE tie-break comparator for decision-event ordering (spec §2.4, parent
// ARCH-6). createdAt (DB now(), transaction-start-fixed) first; then CODE-UNIT
// id comparison — deliberately not localeCompare (host-locale-dependent). On
// the real id corpus (prefixed lowercase ULIDs, `event_` and `evt_`) this is
// sign-identical to both comparators it replaces; the property test asserts it.
export interface Ordered {
  id: string;
  createdAt: Date;
}

export function compareByCreatedAtThenId(a: Ordered, b: Ordered): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
```

Switch consumers:
- `ScoringService.ts` L89-92: `const ordered = [...allDecisions].sort(compareByCreatedAtThenId);`
- `insertion-ranking.ts` `isAfter`: body becomes `return compareByCreatedAtThenId(a, b) > 0;`
- `insertion-ranking.ts` `canonicalSequence` sort callback: delegate to `compareByCreatedAtThenId` (same `{id, createdAt}` shape).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/decision-order.test.ts src/lib/insertion-ranking.test.ts src/server/services/ScoringService.test.ts src/lib/pairwise-selection.test.ts`
Expected: PASS — new tests green, existing consumers unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/decision-order.ts src/lib/decision-order.test.ts src/server/services/ScoringService.ts src/lib/insertion-ranking.ts
git commit -m "feat(ordering): one shared (createdAt,id) comparator for both event consumers"
```

---

### Task 2: Monotonic ordered-id factory — `generateOrderedIdFactory`

**Files:**
- Modify: `src/lib/id.ts`
- Create: `src/lib/id.test.ts`

**Interfaces:**
- `function generateOrderedIdFactory(): () => string` — wraps `monotonicFactory()` from `ulid`; each call returns `` `event_${monotonicUlid().toLowerCase()}` `` — same convention as `generateId("event")` (spec §2.3.5: prefix + lowercase are load-bearing; bare/uppercase output forbidden).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/id.test.ts
import { describe, it, expect } from "vitest";
import { generateId, generateOrderedIdFactory } from "./id";
import { compareByCreatedAtThenId } from "./decision-order";

const EVENT_ID = /^event_[0-9a-hjkmnp-tv-z]{26}$/;

describe("generateOrderedIdFactory", () => {
  it("emits ids in the existing generateId('event') format (prefixed, lowercase Crockford)", () => {
    const next = generateOrderedIdFactory();
    expect(next()).toMatch(EVENT_ID);
    expect(generateId("event")).toMatch(EVENT_ID); // format anchor — never drifts apart
  });
  it("two ids in the same millisecond strictly increase (F10)", () => {
    const next = generateOrderedIdFactory();
    const ids = Array.from({ length: 200 }, () => next()); // same-ms runs guaranteed in a tight loop
    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
  });
  it("factory order survives prefix + lowercase under the shared comparator: at equal createdAt a later factory id orders after an earlier same-batch id", () => {
    const next = generateOrderedIdFactory();
    const t = new Date(1000);
    const a = { id: next(), createdAt: t };
    const b = { id: next(), createdAt: t };
    expect(compareByCreatedAtThenId(a, b)).toBeLessThan(0);
    // sign-equal with the retired comparators on factory output too:
    expect(a.id.localeCompare(b.id)).toBeLessThan(0);
    expect(a.id < b.id).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/id.test.ts`
Expected: FAIL — `generateOrderedIdFactory` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/id.ts
import { ulid, monotonicFactory } from "ulid";

export function generateId(prefix: string): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}

// Batch-insert ids: monotonic WITHIN one factory instance (base ulid() is not
// monotonic within a millisecond), preserving the `event_` + lowercase
// convention — lowercasing is order-preserving for Crockford base32, and the
// prefix keeps new ids in the same code-unit ordering regime as existing rows
// (spec §2.3.5). One factory per request/batch; never module-level shared.
export function generateOrderedIdFactory(): () => string {
  const next = monotonicFactory();
  return () => `event_${next().toLowerCase()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/id.ts src/lib/id.test.ts
git commit -m "feat(id): generateOrderedIdFactory — monotonic event ids preserving prefix+lowercase"
```

---

### Task 3: Shared batch schema + stream-budget body reader

**Files:**
- Create: `src/lib/decision-batch-schema.ts`, `src/lib/decision-batch-schema.test.ts`
- Create: `src/lib/read-json-with-limit.ts`, `src/lib/read-json-with-limit.test.ts`

**Interfaces (exact regexes from spec §2.1 — do not "improve" them):**

```ts
// decision-batch-schema.ts — shared client/server; no server-only imports.
export const ClientKey = z.string().length(26).regex(/^[0-9a-hjkmnp-tv-z]{26}$/);
export const ItemId = z.string().max(64).regex(/^item_[0-9a-hjkmnp-tv-z]{26}$/);
export const BatchEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("triage"),
             decision: z.object({ itemId: ItemId, result: z.enum(["top","high","medium","low"]) }),
             clientKey: ClientKey }),
  z.object({ type: z.literal("pairwise_compare"),
             decision: z.object({ itemAId: ItemId, itemBId: ItemId,
                                  result: z.enum(["item_a","item_b","tie","skip"]) }),
             clientKey: ClientKey }),
]);
export const BatchRequestSchema = z.object({ decisions: z.array(BatchEntrySchema).min(1).max(50) });
export type BatchEntry = z.infer<typeof BatchEntrySchema>;
export type BatchResultStatus = "created" | "duplicate" | "rejected";
export interface BatchResult { clientKey: string; status: BatchResultStatus; reason?: "unknown_item" }
export const MAX_BATCH_BYTES = 65_536;
```

```ts
// read-json-with-limit.ts
export class BodyTooLargeError extends Error {}
// Reads req.body with a byte budget (App Router has no bodyParser.sizeLimit;
// Content-Length is absent under chunked transfer — spec F17). Cancels the
// stream the moment the budget is exceeded, then parses the buffered bytes.
// Throws BodyTooLargeError (caller → 413) or SyntaxError (caller → 400).
export async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown>;
```

- [ ] **Step 1: Write the failing tests** — key cases (real code in the executor's hands; these are the required assertions):
  - **F1 end-to-end id-format pin:** `ItemId.safeParse(generateId("item")).success === true` (a real repository-format id passes), and a **bare 26-char ULID** (`ulid().toLowerCase()`, no prefix) is **rejected**; an uppercase `ITEM_…` is rejected; a 65-char id is rejected.
  - `ClientKey`: accepts `ulid().toLowerCase()`; rejects uppercase ULID, 25/27 chars, chars outside Crockford (`i`, `l`, `o`, `u`).
  - `BatchRequestSchema`: rejects `[]` (min 1) and 51 entries (max 50); accepts a mixed 50-entry triage+compare batch built from `generateId("item")` ids and `ulid().toLowerCase()` keys.
  - `readJsonWithLimit` (node env): (a) a `Request` whose body is a **`ReadableStream` with NO Content-Length header** larger than the budget → throws `BodyTooLargeError` **and** the stream's `cancel` was invoked (spy on the underlying source); (b) a small streamed body parses to the JSON value; (c) malformed JSON under budget → `SyntaxError`. Build the Request with `new Request(url, { method: "POST", body: stream, duplex: "half" })`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/decision-batch-schema.test.ts src/lib/read-json-with-limit.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement** both modules exactly per the interfaces above. `readJsonWithLimit`: `req.body.getReader()`, accumulate `Uint8Array` chunks with a running byte count; on exceed → `reader.cancel()` then throw `BodyTooLargeError`; else decode (`TextDecoder`) and `JSON.parse`. Handle `req.body === null` → parse empty → `SyntaxError`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/decision-batch-schema.test.ts src/lib/read-json-with-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/decision-batch-schema.* src/lib/read-json-with-limit.*
git commit -m "feat(batch): shared Zod batch schema (repo-format ids pinned) + stream-budget body reader"
```

---

### Task 4: Batch route — gates, body cap, shape validation, authz registration

**Files:**
- Create: `src/app/api/sessions/[id]/decisions/batch/route.ts`
- Create: `src/lib/db/decision-batch.integration.test.ts`
- Modify: `src/lib/db/route-authz-enumeration.integration.test.ts` (`buildStrangerCases()`, L197 — F14)

**Interfaces:**
- `POST` handler with `export const runtime = "nodejs"; export const maxDuration = 30;`
- Gate order **identical to the single route** (`decisions/route.ts:61-93`): 401 unauthenticated → `SessionController.fromDb(db).getSessionOrNull` 404 → `requireApiCollectionAccess` → `curatorId !== userId` 403 → status not `active`/`paused` 409. Then `readJsonWithLimit(req, MAX_BATCH_BYTES)` → 413 on `BodyTooLargeError`, 400 on `SyntaxError`; `BatchRequestSchema.safeParse` → whole-batch 400, nothing written.
- This task's transaction is the minimal spine (lock → insert all entries with `generateOrderedIdFactory()` ids, **omitting `createdAt`** → one `recalculatePreferences` → triage disposition-clear), response `{ results }` all `created`, status 201. Task 5 layers the full semantics on this spine.

- [ ] **Step 1: Write the failing tests** in `decision-batch.integration.test.ts`, cloning the conventions of `src/lib/db/decisions-hardening.integration.test.ts` (its L20-58: `@vitest-environment node` docblock, `vi.hoisted` `mockGetSession`, `vi.mock("@/lib/auth", () => mockAuth(mockGetSession))`, `vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }))`, import `POST` after the mocks, `describeDb`, `resetDb`/`closeDb`, `seedBaseline`/`seedBareCollection`, `SessionRepository`/`ItemRepository`/`DecisionEventRepository` seeding). A `batchReq(sessionId, body)` helper mirrors `decisionReq`. Cases:
  - 401 when `mockGetSession` resolves null — nothing written.
  - 404 unknown session id — nothing written.
  - 403 non-curator collection member (seed a second user + membership, session owned by the first) — nothing written.
  - 409 on a `completed` session (`db.update(sessionsTable).set({ status: "completed" })…` as decisions-hardening L147 does) — nothing written.
  - Shape-invalid body (bad enum result / missing clientKey / bare-ULID itemId) → 400, `DecisionEventRepository.findBySession` length 0.
  - 51 entries → 400, nothing written.
  - **413 stream-enforced (F17):** build the request with a `ReadableStream` body >64 KiB and **no Content-Length header** → 413, nothing written.
  - Happy path: valid 3-entry triage batch from a seeded curator → 201, `results` has 3 × `created` echoing the clientKeys, 3 rows in `decision_events`, and preferences exist for the 3 items (recompute ran).
  - **Authz enumeration (F14):** add to `buildStrangerCases()`:
    ```ts
    c("sessions/[id]/decisions/batch/route.ts", "POST",
      `/api/sessions/${sessionId}/decisions/batch`,
      { id: sessionId },
      { decisions: [{ type: "triage", decision: { itemId: itemAId, result: "top" },
                      clientKey: "0123456789abcdefghjkmnpqrs" }] }),
    ```
    (mirror the exact `c(...)` signature at L213; the file self-discovers routes, so omission fails the enumeration guard — verify by running that suite).

- [ ] **Step 2: Run tests to verify they fail**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/decision-batch.integration.test.ts`
Expected: FAIL — route module does not exist (import error).

- [ ] **Step 3: Implement the route spine.** Copy the single route's gate block verbatim (same comments-of-record style), then:

```ts
const raw = await readJsonWithLimit(req, MAX_BATCH_BYTES); // try/catch → 413 / 400
const parsed = BatchRequestSchema.safeParse(raw);
if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
const results = await withTransaction(db, async (tx) => {
  await lockCollectionCurator(tx, sortSession.collectionId, userId);
  const nextId = generateOrderedIdFactory();
  // (Task 5 inserts semantic validation / dedupe / ON CONFLICT here.)
  for (const entry of parsed.data.decisions) {
    await tx.insert(decisionEventsTable).values({
      id: nextId(), sessionId: params.id, type: entry.type,
      decision: entry.decision, clientKey: entry.clientKey,
    }); // createdAt OMITTED — defaultNow(), one shared timestamp per batch
  }
  await PreferenceController.fromDb(tx).recalculatePreferences(sortSession.collectionId, userId);
  for (const itemId of distinctTriagedItemIds(parsed.data.decisions)) {
    await DispositionController.fromDb(tx).bringBack(itemId, userId);
  }
  return parsed.data.decisions.map((e) => ({ clientKey: e.clientKey, status: "created" as const }));
}, { op: "record_decision_batch",
     ctx: { collectionId: sortSession.collectionId, curatorId: userId, sessionId: params.id } });
return NextResponse.json({ results }, { status: 201 });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/decision-batch.integration.test.ts src/lib/db/route-authz-enumeration.integration.test.ts`
Expected: PASS (enumeration suite now covers the new route).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sessions/[id]/decisions/batch/route.ts" src/lib/db/decision-batch.integration.test.ts src/lib/db/route-authz-enumeration.integration.test.ts
git commit -m "feat(batch): POST /api/sessions/[id]/decisions/batch — gates, stream body cap, whole-batch validation"
```

---

### Task 5: Batch transaction semantics — spec §2.3 steps 1–7 in full

**Files:**
- Modify: `src/app/api/sessions/[id]/decisions/batch/route.ts`
- Modify: `src/lib/db/decision-batch.integration.test.ts`

**Interfaces (inside the Task 4 transaction, in this order):**
1. `lockCollectionCurator` (already there).
2. **Semantic validation:** one indexed query for the collection's live item ids (`ItemRepository`/`ItemController.listItems` on the tx handle, or a direct `select id from items where collection_id = …`); entries referencing an unknown/foreign/deleted item (**either side** of a compare pair) → `{ status: "rejected", reason: "unknown_item" }`.
3. **Cross-request idempotency:** one `SELECT` of existing `(sessionId, clientKey)` matches for all the batch's keys → `duplicate`.
4. **In-batch dedupe:** first occurrence of a clientKey proceeds, later ones → `duplicate`.
5. **Insert survivors in array order** with factory ids; each insert uses `.onConflictDoNothing({ target: [sessionId, clientKey] })`-equivalent — Drizzle: `ON CONFLICT (session_id, client_key) WHERE client_key IS NOT NULL DO NOTHING` with `RETURNING`; a row that comes back absent → `duplicate`. **Never a mid-transaction re-read** (25P02 — spec §2.3.4). Note: drizzle-orm 0.30's `onConflictDoNothing` cannot express the partial-index predicate via `target` + `where` on this index — if it can't, use `tx.execute(sql\`INSERT … ON CONFLICT (session_id, client_key) WHERE client_key IS NOT NULL DO NOTHING RETURNING id\`)`; verify against the installed version, don't guess.
6. `recalculatePreferences` **once, only if ≥1 row inserted**; all-duplicate/rejected batches skip it AND step 7 and return **200** (else 201).
7. Disposition-clear (`bringBack`) once per distinct triaged itemId among **inserted** entries only.
8. After commit: **one** PostHog capture `sort_decision_batch_recorded` with `{ created, duplicate, rejected }` counts (never ids), then `await phClient.flush()` — mirror the single route's L180-195 pattern.

- [ ] **Step 1: Write the failing tests** (extend the Task 4 file; each seeds fresh via `beforeEach`):
  - **F2 in-batch dedupe:** two entries with the same clientKey → 201; first `created`, second `duplicate`; exactly one `decision_events` row; never a 500.
  - **F2+F13 committed-batch replay via the recompute observable:** POST a 3-entry batch (201). Snapshot the recompute observable — read `PreferenceStateService`/`CollectionPreferenceItemRepository` first: the recompute rewrites the curator's `preferences` rows, so capture each row's `updatedAt` (and row `id`s). Re-POST the identical batch → **200**, all `duplicate`, zero new event rows, preferences rows **byte-identical** (zero recomputes — no mock spy), and a pre-seeded disposition on an unrelated item is untouched (no disposition-clear). A batch with ≥1 fresh entry → 201 and the observable advances exactly once.
  - **Semantic rejection:** batch of `[valid triage, triage on another collection's item, compare with one unknown side]` → valid entry `created`; other two `rejected` with `reason: "unknown_item"`; only the valid row written; a pre-seeded disposition on the rejected itemId **survives** (rejected entries trigger no disposition-clear); an all-rejected batch → 200 and the recompute observable is unchanged (rejected entries don't count toward the predicate).
  - **F3 cross-path latest-wins:** same item triaged via the **single route then the batch route** (separate transactions) → `ScoringService` bucket = the batch's result; then **vice versa** (batch then single) → the single route's result. Guards the shared clock domain: both paths omit `createdAt`.
  - **Shared batch timestamp + in-batch conflict:** one batch triaging the same item `high` then `top` (different clientKeys) → both rows share one `createdAt`; recompute resolves to `top` (later array entry wins via the id tie-break).
  - **clientKey scope pinned:** the same clientKey POSTed to two different sessions (same curator) → both insert (`created` twice — the unique index is per-session).
  - **Advisory lock taken:** spy `vi.spyOn(txMod, "lockCollectionCurator")` (the `import * as txMod from "@/lib/transactions"` pattern from decisions-hardening L32) and assert it was called with `(anything, collectionId, curatorId)`. (A true two-connection race is not feasible on the `{ max: 1 }` test pool — same documented limitation as decisions-hardening L12-16.)
  - **Analytics (F15):** `vi.mock("@/lib/posthog-server")` with `capture`/`flush` spies; a mixed created+duplicate+rejected batch emits **exactly one** `sort_decision_batch_recorded` whose `{created, duplicate, rejected}` counts match the response body, and `flush()` was awaited; a replayed batch emits counts `{0, n, 0}` (still one capture — mirror-check against spec: capture fires per request).

- [ ] **Step 2: Run tests to verify they fail**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/decision-batch.integration.test.ts`
Expected: FAIL — duplicates 500 (unique violation), rejected entries 500 or written, replay recomputes.

- [ ] **Step 3: Implement** steps 2–8 above inside the existing transaction. Build a `Map<clientKey, BatchResult>` as each stage classifies entries; response array preserves request order.

- [ ] **Step 4: Run tests to verify they pass**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/decision-batch.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sessions/[id]/decisions/batch/route.ts" src/lib/db/decision-batch.integration.test.ts
git commit -m "feat(batch): semantic validation, idempotency, ON CONFLICT dedupe, recompute predicate, analytics"
```

---

### Task 6: Single route — remove the dead 23505 catch-and-re-read

**Files:**
- Modify: `src/app/api/sessions/[id]/decisions/route.ts` (delete `isUniqueViolation` L54-59 and the insert's try/catch re-read L144-162 → plain insert; keep the SELECT-first idempotency L127-142 unchanged)

**Why (spec §2.5):** the advisory lock serializes all writers, so the SELECT-first check is authoritative and the race branch is unreachable; if it ever fired, the re-read inside the aborted transaction would die with 25P02 — dead **and** broken. Removed, not mirrored.

- [ ] **Step 1: Confirm the pinned behavior tests exist** — the repeated-clientKey idempotency test (same event returned, exactly one row) lives in `src/lib/db/binary-insertion-ranking.integration.test.ts` (Epic 0 Task 9) and/or `decisions-hardening.integration.test.ts`; locate it and run it green **before** touching the route. This deletion changes no behavior, so no new test drives it — the existing suite is the regression net. If no repeated-clientKey test exists, WRITE ONE FIRST (same shape as Epic 0 Task 9 Step 1), then delete.

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts src/lib/db/decisions-hardening.integration.test.ts`
Expected: PASS (baseline).

- [ ] **Step 2: Delete** `isUniqueViolation` and the try/catch around the insert; the insert becomes the bare `tx.insert(...).returning()`.

- [ ] **Step 3: Re-run the same suites + lint**

Run: `RUN_DB_TESTS=1 npx vitest run --no-file-parallelism src/lib/db/binary-insertion-ranking.integration.test.ts src/lib/db/decisions-hardening.integration.test.ts && npm run lint`
Expected: PASS; lint catches any now-unused import.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/sessions/[id]/decisions/route.ts"
git commit -m "refactor(decisions): drop unreachable 23505 catch-and-re-read (advisory lock serializes; re-read would 25P02)"
```

---

### Task 7: Client queue module — `src/features/sorting/decisionQueue.ts`

**Files:**
- Create: `src/features/sorting/decisionQueue.ts`, `src/features/sorting/decisionQueue.test.ts` (`// @vitest-environment jsdom` — jsdom provides localStorage)

**Interfaces (pure + storage; no React; spec §3.1):**

```ts
export interface QueueKey { curatorId: string; sessionId: string }
export type PendingEntry =
  | { kind: "decision"; clientKey: string; type: "triage" | "pairwise_compare";
      decision: Record<string, unknown>; enqueuedAt: string }
  | { kind: "disposition"; clientKey: string; itemId: string;
      disposition: "set_aside" | "deferred" | "clear"; enqueuedAt: string };
export function newClientKey(): string;                       // ulid().toLowerCase() — matches ClientKey
export function pendingStorageKey(key: QueueKey): string;     // `adored.pending.v1.{curatorId}.{sessionId}`
export function readQueue(key: QueueKey): PendingEntry[];     // verifies envelope {v:1, curatorId}; mismatch/corrupt → []
export type EnqueueResult = "persisted" | "needs_fallback";
export function enqueue(key: QueueKey, entry: PendingEntry,
  onQuotaExceeded?: () => Promise<void>): Promise<EnqueueResult>; // sync write path; async only for the quota retry
export function removeEntries(key: QueueKey, clientKeys: string[]): void; // ack-removal
export function removeQueued(key: QueueKey, clientKey: string): boolean;  // undo of a not-yet-in-flight entry
export function quarantineEntries(key: QueueKey, entries: PendingEntry[]): void; // adored.quarantine.v1.…, cap 50 FIFO
export function readQuarantine(key: QueueKey): PendingEntry[];
export function listPendingKeysForCurator(curatorId: string): QueueKey[]; // scans adored.pending.v1.{curatorId}.*
export function deleteQueue(key: QueueKey): void;             // recovery-409 disposal
export const GC_TTL_MS: number;                               // 30 days
export function sweepExpired(nowMs: number): void;            // ALL adored.pending.v1.* + adored.quarantine.v1.* keys
                                                              // whose NEWEST enqueuedAt is older than TTL — incl. other curators'
```

Semantics to implement exactly: envelope `{ v: 1, curatorId, sessionId, entries }`; array order in storage IS flush order (no seq); `enqueue` appends + writes localStorage **synchronously before resolving** on the happy path; on a quota throw it awaits `onQuotaExceeded` (the flusher's drain, injected later) once, retries the write once, and returns `"needs_fallback"` if it still throws (caller degrades to today's awaited direct submit — spec F18). Every read verifies envelope `curatorId` against the requested key and never deletes a foreign queue.

- [ ] **Step 1: Write the failing tests** — required assertions:
  - `newClientKey()` matches `/^[0-9a-hjkmnp-tv-z]{26}$/` and passes `ClientKey.safeParse` from `decision-batch-schema` (client/server can never drift).
  - **Persist-before-advance:** after `enqueue` resolves, `localStorage.getItem(pendingStorageKey(key))` already contains the entry (assert synchronously, no flush ran).
  - Order preserved across enqueues; `removeEntries` removes exactly the given keys; `removeQueued` returns false for an unknown key.
  - **Curator isolation:** `readQueue` for curator B against a key whose stored envelope says curator A → `[]`, and the stored blob is untouched.
  - Corrupt JSON / wrong version envelope → `readQueue` returns `[]` without throwing and without deleting (GC owns eventual cleanup).
  - Quarantine cap: pushing 55 entries keeps the newest 50 (FIFO eviction).
  - **GC (F18):** `sweepExpired` deletes a pending key **of another curator** whose newest `enqueuedAt` is 31 days old and an expired quarantine key, keeps a fresh one.
  - **Quota fallback (F18):** `localStorage.setItem` mocked to throw once → `onQuotaExceeded` called once, retry persists, result `"persisted"`; mocked to always throw → `"needs_fallback"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/decisionQueue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** per the interface. Storage guards follow the `src/lib/round-preference.ts` house pattern (`typeof window` guard + try/catch).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/sorting/decisionQueue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/decisionQueue.*
git commit -m "feat(queue): versioned curator-keyed pending/quarantine storage with GC + quota fallback"
```

---

### Task 8: Flusher engine — `drain()`, Web-Lock single-flight, failure taxonomy

**Files:**
- Create: `src/lib/web-lock.ts`, `src/lib/web-lock.test.ts`
- Create: `src/features/sorting/decisionFlusher.ts`, `src/features/sorting/decisionFlusher.test.ts` (`@vitest-environment jsdom`, fake timers, mocked fetch)

**Interfaces:**

```ts
// web-lock.ts — navigator.locks when available; else an in-realm promise-chain
// mutex per name (jsdom + older browsers). The cross-tab guarantee comes from
// navigator.locks in real browsers; the fallback preserves in-realm exclusivity.
export function withWebLock<T>(name: string, fn: () => Promise<T>): Promise<T>;
```

```ts
// decisionFlusher.ts — ONE module-level engine; the ONLY code that POSTs (F12).
export interface DrainOptions { recovery?: boolean; keepalive?: boolean }
export function drain(keys: QueueKey[], opts?: DrainOptions): Promise<void>; // promise-based single-flight:
  // a caller finding a drain in flight awaits the SAME promise; resolves when every
  // entry visible at call time (+ same-key entries enqueued mid-drain) is acked,
  // quarantined, or the taxonomy says stop.
export type AckOutcome = { status: "created" | "duplicate" } | { status: "rejected"; reason?: string };
export function awaitAck(key: QueueKey, clientKey: string): Promise<AckOutcome>; // compare's batch-of-1 (Task 14)
export type FlushNotice =
  | { kind: "rejected_unknown_item"; count: number }
  | { kind: "quarantined"; count: number }
  | { kind: "session_conflict" }        // batch-route 409 mid-round
  | { kind: "disposition_superseded" }  // disposition POST 409 (PreferenceExistsError)
  | { kind: "auth_required" };
export function subscribeNotices(fn: (n: FlushNotice) => void): () => void; // UI renders (Task 12); engine never renders
export const BACKOFF_MS = [1_000, 4_000, 15_000, 60_000] as const;
export function useDecisionFlusher(key: QueueKey): void; // triggers ONLY: ≥5 pending · 4 s after oldest ·
  // pagehide/visibilitychange:hidden → keepalive drain that PREEMPTS an active backoff wait
export function triggerFlush(key: QueueKey): Promise<void>; // round-end / compare / pause callers
```

Drain algorithm and taxonomy exactly per spec §3.2 — every queue mutation (ack-removal, quarantine) and every drain iteration runs inside `withWebLock('adored.flush.v1.{curatorId}.{sessionId}', …)`, re-reading the queue from storage under the lock before each request. Head-run batching: longest contiguous `decision` run (chunked ≤50, order kept) → `POST /api/sessions/{sessionId}/decisions/batch`; a `disposition` entry flushes alone between runs — `set_aside`/`deferred` → `POST /api/collections/{collectionId}/dispositions` (needs `collectionId`: store it on the envelope at enqueue time — extend Task 7's envelope with `collectionId`), `clear` → `DELETE /api/collections/{collectionId}/dispositions/{itemId}`. Pre-flush local Zod validation via `BatchEntrySchema`; offenders quarantined (one `quarantined` notice per drain, F9). Taxonomy: created/duplicate → remove; rejected → remove + one `rejected_unknown_item` notice, **no refresh at ack time** (spec's named staleness window); network/5xx → backoff `BACKOFF_MS`, reset on success; 400 → re-validate locally, quarantine offenders, retry rest; 401 → preserve + stop + `auth_required`; 403 → preserve + stop this queue (retained until GC); batch-route 409 → mid-round: stop + preserve + `session_conflict`; `opts.recovery`: surface once then `deleteQueue` (terminal-session disposal); disposition POST 409 → **per-entry** removal + `disposition_superseded` notice, drain continues; disposition 404 → drop silently, continue.

- [ ] **Step 1: Write the failing tests** — required assertions (fake timers; `global.fetch` scripted per-call):
  - **Order:** queue `[triage A, set_aside B, triage C]` → exactly 3 requests in order: batch(1 triage) → disposition POST → batch(1 triage). Cross-endpoint order preserved: `[set_aside X, triage X]` lands in that order.
  - **Chunking:** 120 queued decisions → three batch POSTs of 50/50/20, sequential, array order preserved; ack removes exactly the acked clientKeys (server replies `created` for each).
  - **Rehydration:** a queue written directly to localStorage (simulated reload — no in-memory state) drains in stored order.
  - **Single-flight (F12):** a second `drain()` during an in-flight drain returns the same promise — one POST total for one pending entry; a 4 s timer firing mid-flight does not start a second flush.
  - **Backoff pinned (F15):** 5xx responses → retries at exactly 1 s, 4 s, 15 s, then 60 s repeated (cap); a success resets the schedule; queue intact throughout.
  - **Pagehide preempts backoff (F11):** during a backoff wait, dispatching `pagehide` fires an immediate fetch with `{ keepalive: true }`.
  - **Cross-tab exclusion (F11):** install a shared fake `navigator.locks` (exclusive, queued grants) + one localStorage; load the module twice via `vi.resetModules()` + dynamic `import()` to simulate two realms; concurrent `drain()`s never overlap (grant log proves mutual exclusion) and an enqueue interleaved with the other realm's ack-removal is not lost (re-read-under-lock).
  - **Taxonomy:** disposition 409 → that entry removed, one `disposition_superseded` notice, drain **continues**, remaining triage still POSTs — recovery of `[set_aside X (409), triage Y]` never discards Y (F4). Disposition 404 → silent drop, continue. 400 with one stale-shape entry → offender quarantined (in `adored.quarantine.v1.…`), rest retried and acked. 401 → queue preserved, drain stops, `auth_required` notice. 403 → preserved, stopped, storage intact. Batch 409 with `opts.recovery` → one `session_conflict` surface + queue deleted; without → preserved + stopped.
  - **Triggers:** with `useDecisionFlusher` mounted (renderHook), the 5th enqueue triggers a drain; a lone entry drains 4 s after enqueue (fake timers).
  - `awaitAck` resolves with the entry's outcome (created / rejected).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/web-lock.test.ts src/features/sorting/decisionFlusher.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement** `web-lock.ts` then the engine. Keep the engine free of React (the hook only wires interval + listeners to `drain`). Module-level state: current drain promise per storage key, backoff timer handles, notice subscribers, per-clientKey ack resolvers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/web-lock.test.ts src/features/sorting/decisionFlusher.test.ts src/features/sorting/decisionQueue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/web-lock.* src/features/sorting/decisionFlusher.* src/features/sorting/decisionQueue.ts
git commit -m "feat(flusher): single-flight Web-Lock drain engine with ordered runs, backoff, and failure taxonomy"
```

---

### Task 9: `selectTriageQueue` — the round queue selector

**Files:**
- Modify: `src/lib/triage-selection.ts`, `src/lib/triage-selection.test.ts`

**Interfaces (spec §3.3/F6):**

```ts
export interface TriageQueueEntry { item: Item; deferred: boolean }
export function selectTriageQueue(items, preferenceItemIds, dispositionByItemId): TriageQueueEntry[];
// Entire eligible remainder — untriaged, not set_aside; active first then deferred,
// in today's ordering. NO count parameter (rounds are time-boxed, never count-boxed).
export function selectTriageItem(items, preferenceItemIds, dispositionByItemId):
  { item: Item | null; showingDeferred: boolean };
// REIMPLEMENTED as "first entry of selectTriageQueue" (+ showingDeferred = first
// entry's deferred flag) so next-round.ts:40 and the round page agree by construction.
```

- [ ] **Step 1: Write the failing tests** (extend the existing fixture style in `triage-selection.test.ts` — `item(id)` helper):
  - Active-then-deferred ordering with correct per-entry `deferred` flags.
  - Triaged (in `preferenceItemIds`) and `set_aside` items excluded; `deferred` included at the tail.
  - Empty input → `[]`.
  - **First-entry equivalence (F6):** for EVERY fixture case already in the file's `selectTriageItem` table, `selectTriageQueue(...)[0] ?? null` matches `selectTriageItem(...).item`, and `showingDeferred` matches the first entry's `deferred` (the current semantics `active.length === 0 && deferred.length > 0` ≡ first entry deferred).
  - `src/lib/next-round.test.ts` stays green untouched (agreement by construction).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/triage-selection.test.ts`
Expected: FAIL — `selectTriageQueue` not exported.

- [ ] **Step 3: Implement** — build the queue from the existing filter chain; rewrite `selectTriageItem` to delegate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/triage-selection.test.ts src/lib/next-round.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/triage-selection.*
git commit -m "feat(triage): selectTriageQueue — whole eligible remainder; selectTriageItem = first entry"
```

---

### Task 10: Optimistic triage round — `TriageRound` + page wiring + frozen recap

**Files:**
- Create: `src/features/sorting/TriageRound.tsx`, `src/features/sorting/TriageRound.test.tsx`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx` (+ `page.test.tsx`)

**Interfaces:**

```ts
interface TriageRoundProps {
  curatorId: string; sessionId: string; collectionId: string; // queue key + disposition endpoint
  queue: Array<{ item: Item; deferred: boolean; heroPhotoUrl?: string }>; // server-selected, whole remainder
  decisions: MovedDecision[];   // server decision log (recap merge input)
  decidedSeed: number;          // server-computed distinct-decided count (today's `preferences.length`)
  hubHref: string; setAsideHref: string;
}
```

Behavior (spec §3.3):
- Page: replace the single-item `selectTriageItem` call with `selectTriageQueue`; fetch cover photos for all queue items in one `findCoverPhotosByItemIds` call; render `<TriageRound …/>` inside `TriageUndoProvider` (still server-fetching everything — Next.js opinion #3). The page-level `showingDeferred` flag and per-render `router.refresh()` are retired.
- `TriageRound` (client): advances through `queue` from local state. Each tier tap → `enqueue` (kind `decision`, `newClientKey()`, `enqueuedAt: new Date().toISOString()`) via `decisionQueue`, UI advances **only after `enqueue` resolves** (`"needs_fallback"` → degrade to one awaited single-route POST, advance on its ack — F18 fallback path); `useDecisionFlusher` provides the 5-pending/4 s/pagehide triggers. Tier buttons reuse `DecisionControls` with `submit={{ kind: "local", onDecision }}` (the synchronous path — no fetch, no refresh).
- **Zero `router.refresh()` mid-round; exactly one at round end** (F15).
- Round chrome: reuse `RoundShell` + `RoundTimer` + `WhatMoved` directly (mirror `RoundSurface.tsx`'s wiring — `RoundSurface` itself stays as-is for compare). Round ends on timer expiry OR queue exhaustion (exhaustion ends early into the recap).
- **Per-entry deferred banner:** the "Ready when you are" block renders while the **current entry** has `deferred: true` (copy moves from the page into `TriageRound`).
- **"{n} decided so far" (F20):** render `decidedSeed + newlyDecided.size`; `newlyDecided` adds on triage enqueue, removes on `removeQueued` undo of an item not in the seed, never double-counts a re-answer; dispositions don't count. Ticks on tap, never on flush.
- **Frozen recap (F5):** at round end compute ONCE: merge (a) server `decisions` with (b) this session's still-pending/in-flight entries mapped to `MovedDecision` (`createdAt: Date.parse(entry.enqueuedAt)` — `what-moved.ts` already accepts epoch-ms), pass the merged array + client `windowStartMs` to `whatMoved`/`WhatMoved`, store in state. Round-end ordering: `triggerFlush` → await drain settle (ack or terminal-per-taxonomy) → single `router.refresh()`. The frozen summary never re-renders from post-refresh data (prevents the double-count window).

- [ ] **Step 1: Write the failing tests** (`@vitest-environment jsdom`; mock `next/navigation` with a `refresh` spy; mock the flusher module where the assertion is about call counts):
  - n taps advance through n items with **zero** `refresh` calls; each tap lands one entry in localStorage **before** the next item renders (persist-before-advance at the round level).
  - Round end (queue exhausted) → recap shows; `refresh` called exactly once, and only after the mocked drain resolves.
  - N unflushed optimistic decisions → recap counts all N (assert `WhatMoved`'s rendered counts); the "gentle pass"/empty-round copy (read the exact string from `WhatMoved.tsx`) is **absent**; a genuinely empty round still shows it.
  - A post-end prune/refresh (simulate queue removal + rerender) does not change the displayed counts (frozen).
  - "decided so far": ticks on tap; re-answer of a counted item doesn't increment; queued undo decrements (cover in Task 11's revisit tests if the affordance lands there — the counter logic is asserted here via direct enqueue/removeQueued).
  - Deferred banner shows only while the current entry is deferred.
  - Page test (`page.test.tsx`): server passes the full queue + `decidedSeed` (update existing expectations from single-item to queue).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/TriageRound.test.tsx "src/app/collections/[id]/sort/[sessionNumber]/triage/page.test.tsx"`
Expected: FAIL — component missing / page still single-item.

- [ ] **Step 3: Implement** component + page rewiring per above.

- [ ] **Step 4: Run tests to verify they pass** (same command) — plus `npm run build` (the page's server/client seam type-checks).

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/TriageRound.* "src/app/collections/[id]/sort/[sessionNumber]/triage/"
git commit -m "feat(triage): optimistic client round — queue advance, one round-end refresh, frozen recap merge"
```

---

### Task 11: Undo-as-revisit + standing answer + disposition-affordance rules

**Files:**
- Modify: `src/features/sorting/DecisionControls.tsx`, `src/features/sorting/DecisionControls.test.tsx`
- Modify: `src/features/sorting/TriageRound.tsx`, `src/features/sorting/TriageRound.test.tsx`

**Interfaces:**
- `DecisionControlsProps` gains optional `priorAnswer?: string` (a decision label): when present, that tier renders as currently-selected (visually distinct, `aria-pressed`), with the copy register *"You placed this with Like — change it?"* rendered by the caller; absent = today's fresh rendering, pixel-identical (F19).
- `TriageRound` gains the back affordance (revisit the last item):
  - Entry still `queued` → `removeQueued(clientKey)`, item re-presents fresh, `newlyDecided` decrements (if not in seed).
  - Entry `inFlight`/acked → entry stands; item re-presents **with `priorAnswer`**; a different tap enqueues a superseding entry (latest-wins); walking away re-answers nothing.
  - Disposition affordances (`DeferControl`/`SetAsideButton`) **hidden** while the revisited item's triage entry is in-flight/acked (disposed ⇔ untriaged — a disposition cannot supersede a flushed triage); if the triage entry is still queued, choosing a disposition removes the queued triage first, then enqueues the disposition.
  - Undo-as-revisit of a `rejected` entry is a no-op.

- [ ] **Step 1: Write the failing tests:**
  - `DecisionControls` with `priorAnswer="Like"` marks that button selected (`aria-pressed="true"`), others untouched; without the prop, no button is pressed (regression: existing tests stay green).
  - Revisit of a queued entry: back → item re-presents, entry gone from localStorage, counter decremented.
  - Revisit of an acked entry (drain mocked to ack): prior choice shown selected; a different tap enqueues a NEW entry (fresh clientKey) — the old ack is untouched; navigating away leaves queue + answer intact.
  - Disposition affordances hidden for an in-flight/acked revisit; visible for a queued one; queued-triage + disposition tap → localStorage holds only the disposition entry.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/DecisionControls.test.tsx src/features/sorting/TriageRound.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.** Queue-entry status comes from `decisionQueue`/flusher introspection (`queued` = present in storage and not in the engine's in-flight set; expose a small `isInFlight(key, clientKey)` from the flusher if Task 8 didn't).

- [ ] **Step 4: Run tests to verify they pass** (same command).

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/DecisionControls.* src/features/sorting/TriageRound.*
git commit -m "feat(triage): undo-as-revisit — standing answer shown, latest-wins supersede, disposition gating"
```

---

### Task 12: Person-side notices — rejected + quarantine surfacing

**Files:**
- Create: `src/features/sorting/pendingNotices.tsx` (component + exported copy constants), `src/features/sorting/pendingNotices.test.tsx`
- Modify: `src/features/sorting/TriageRound.tsx` (mount the notice slot)

**Interfaces:**
- `export const REJECTED_NOTICE = "One piece isn't in this collection anymore, so that answer wasn't needed";`
- `export const QUARANTINE_NOTICE = "A few answers from before didn't reach us — those pieces will simply come around again";`
  (spec draft copy — TONE-review item; never "error"/"failed"/"invalid".)
- `PendingNotices` subscribes via `subscribeNotices` (Task 8), renders at most **one** quiet, dismissible, non-blocking line per notice kind per surface mount (a set of `rejected_unknown_item` acks collapses to one; N quarantined → one). Same slot `PendingDecisionsGate` will reuse (Task 15).

- [ ] **Step 1: Write the failing tests:**
  - A `rejected` ack renders its notice **exactly once** (copy asserted against `REJECTED_NOTICE`); no `router.refresh` fires at ack time; the round's optimistic state is retained; the notice is still mounted when the round-end refresh (revert) lands (F9 — "no later than the revert").
  - N quarantined entries in one drain → one `QUARANTINE_NOTICE`, dismissible.
  - **Quarantine reconciliation proven (F9):** an item whose entry was quarantined (thus no event, no preference) reappears in the next `selectTriageQueue(items, preferenceItemIds, dispositionByItemId)` — pure composition test of `decisionQueue.quarantineEntries` + Task 9's selector (resurfacing IS the reconciliation; no compensating write).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/pendingNotices.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** component + wire the slot into `TriageRound`.

- [ ] **Step 4: Run tests to verify they pass** (same command + `TriageRound.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/pendingNotices.* src/features/sorting/TriageRound.tsx
git commit -m "feat(notices): one quiet person-side line for rejected/quarantined answers"
```

---

### Task 13: Dispositions through the queue

**Files:**
- Modify: `src/features/sorting/TriageUndoProvider.tsx`, `src/features/sorting/SetAsideUndo.test.tsx`
- Modify: `src/features/sorting/DeferControl.tsx`, `src/features/sorting/DeferControl.test.tsx`

**Interfaces:**
- `TriageUndoProvider` gains queue-key props (`curatorId`, `sessionId`; it already takes `collectionId`). `setAside(itemId, name)` → `enqueue({kind: "disposition", disposition: "set_aside", …})` + `triggerFlush` — **no awaited fetch, no `router.refresh()` per tap**; the optimistic advance is owned by `TriageRound` (the provider exposes the undo state as today). `bringBack()` → if the set_aside entry is still `queued`: `removeQueued` (pure client); else enqueue `{disposition: "clear"}` (flusher DELETEs — idempotent).
- `DeferControl`'s session path → enqueue `deferred` through the same provider/queue (extend the provider with `defer(itemId)` so both affordances share one seam; the `local` walkthrough path is untouched).
- The flusher (Task 8) already handles disposition 409/404 per-entry; nothing to add server-side.

- [ ] **Step 1: Write the failing tests:**
  - Set-aside tap → disposition entry in localStorage synchronously, NO fetch awaited, no per-tap refresh; undo before flush → entry removed, no DELETE issued.
  - Undo after flush (drain mocked acked) → a `clear` entry enqueued.
  - Defer tap → `deferred` entry enqueued; walkthrough `local` mode still synchronous with no provider (regression: `localMode.guard.test.ts` + existing DeferControl tests stay green).
  - Order preservation belongs to Task 8's `[set_aside X, triage X]` test — here assert only the enqueue shapes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/SetAsideUndo.test.tsx src/features/sorting/DeferControl.test.tsx`
Expected: FAIL — components still fetch directly.

- [ ] **Step 3: Implement** the rewiring; update `triage/page.tsx` to pass the new provider props.

- [ ] **Step 4: Run tests to verify they pass** (same command + `src/features/sorting/localMode.guard.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/TriageUndoProvider.tsx src/features/sorting/DeferControl.* src/features/sorting/SetAsideUndo.test.tsx "src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx"
git commit -m "feat(dispositions): Not mine / Not yet ride the decision queue — network leaves the tap path"
```

---

### Task 14: Compare submits through the queue as a batch-of-1

**Files:**
- Modify: `src/features/sorting/CompareChoice.tsx`, `src/features/sorting/CompareChoice.test.tsx`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx` (pass `curatorId` for the queue key)

**Behavior (spec §3.3 compare):** the await-then-next-pair loop is unchanged, but `choose()` becomes: `enqueue` (kind `decision`, type `pairwise_compare`, `newClientKey()` — replaces `crypto.randomUUID()`, which fails the `ClientKey` regex) → `triggerFlush` → `await awaitAck(key, clientKey)` → on `created`/`duplicate`: posthog client capture + `router.refresh()` as today. **Never a bare fetch** — the entry rides the same single-flight/Web-Lock sequencing, so it cannot interleave with a draining triage queue. The compare surface does not wait out the 60 s cap: after ~5 s (named const) of retrying it shows the gentle retry state (today's error copy register) while the queue keeps the entry; a later ack recovers silently. `rejected` ack → no-op advance per the taxonomy (notice comes from Task 12's slot mounted on the compare surface via `RoundSurface` children — mount `PendingNotices` here too).

- [ ] **Step 1: Write the failing tests:**
  - A choice tap issues **no direct fetch from the component**; the flusher (mocked module) receives enqueue + trigger, and the POST the engine makes targets the **batch** endpoint with a 1-entry array whose clientKey matches `ClientKey` (F11 call-sequence assertion).
  - Ack resolves → `refresh` called once, pending state cleared (regression of the existing soft-lock test).
  - Ack delayed past the ~5 s bound (fake timers) → gentle retry copy visible, entry still in localStorage; late ack → advances.
  - Retry of the same tap reuses the same clientKey (idempotent retry preserved — the queue entry IS the retry).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/CompareChoice.test.tsx`
Expected: FAIL — component still fetches the single route.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run tests to verify they pass** (same command; plus `npm run build` for the page prop change).

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/CompareChoice.* "src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx"
git commit -m "feat(compare): submit as idempotent batch-of-1 through the queue/flusher — never a bare fetch"
```

---

### Task 15: `PendingDecisionsGate` + storage GC

**Files:**
- Create: `src/features/sorting/PendingDecisionsGate.tsx`, `src/features/sorting/PendingDecisionsGate.test.tsx`
- Modify (mount, passing `curatorId`): `src/app/collections/[id]/sort/page.tsx`, `…/sort/[sessionNumber]/page.tsx`, `…/sort/[sessionNumber]/triage/page.tsx`, `…/sort/[sessionNumber]/compare/page.tsx`, `src/app/collections/[id]/results/page.tsx` (Standing) — each wraps its main content: `<PendingDecisionsGate curatorId={session.user.id}>{…}</PendingDecisionsGate>`.

**Behavior (spec §3.4):**
- Reads `listPendingKeysForCurator(curatorId)` (foreign curators' keys untouched); envelope verified by `decisionQueue`.
- Empty → render children immediately (zero cost, the normal case).
- Non-empty → children **not mounted** (conditional mount, never CSS-hide); render one quiet line; `await drain(keys, { recovery: true })` — the shared engine, so a hook-initiated drain is awaited, never raced (F12) — then `startTransition(() => router.refresh())`; children mount only when the transition settles (`useTransition().isPending === false`).
- **Bounded reveal (F8):** if not all acked within ~5 s (named const `GATE_REVEAL_BOUND_MS`), reveal anyway with the catch-up line (*"A few of your answers are still on their way — everything here catches up in a moment"* — exported constant), keep flushing in the background, run one `router.refresh()` on final ack. 401 → immediate reveal + re-auth affordance, queue preserved; 403 / recovery-409 → reveal after the one-time surface/disposal.
- After handling, `sweepExpired(Date.now())` (Task 7's GC).

- [ ] **Step 1: Write the failing tests** (mock `next/navigation` refresh with a controllable completion signal — e.g. the mocked `refresh` resolves a deferred that the test flushes; drive `useTransition` settling via `act`):
  - Children **unmounted** (not in the DOM at all — query by testid absence) until last ack AND the refresh transition settles; then mounted.
  - Bounded reveal: acks withheld past 5 s (fake timers) → children mount, catch-up line (constant-asserted) shows, queue intact, background drain continues, one refresh on final ack.
  - Gate mounting during a hook-initiated drain awaits the same promise — no second POST (spy the engine).
  - 401 during recovery drain → immediate reveal + re-auth affordance, storage intact.
  - Recovery-409 → one surface, queue deleted, children mount.
  - Cross-curator: curator B's mount leaves curator A's `adored.pending.v1.A.*` key untouched.
  - GC: an expired foreign key is removed on mount; a fresh one kept (F18).
  - Empty queue → children render synchronously, no drain call.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/PendingDecisionsGate.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the gate + the five mounts. Data fetching stays in the Server Components; the gate only defers *mounting* of the already-fetched children (children are the server-rendered subtree passed through).

- [ ] **Step 4: Run tests to verify they pass** — same command, plus `npm run build`, plus the touched `page.test.tsx` suites.

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/PendingDecisionsGate.* "src/app/collections/[id]/sort/" "src/app/collections/[id]/results/page.tsx"
git commit -m "feat(recovery): PendingDecisionsGate — drain-then-reveal with bounded catch-up + storage GC"
```

---

### Task 16: Shared session-PATCH client helper — pre-flush on pause/terminal

**Files:**
- Create: `src/features/sorting/sessionStatusPatch.ts`, `src/features/sorting/sessionStatusPatch.test.ts`
- Modify: `src/features/sorting/TakeABreakControl.tsx` (+ test), `src/features/sorting/ResumeControl.tsx` (+ test)

**Interfaces:**

```ts
export async function patchSessionStatus(
  key: QueueKey, // curatorId + sessionId — the queue to pre-flush
  status: "active" | "paused" | "completed" | "abandoned",
): Promise<Response>;
```

- `paused` → **best-effort, non-blocking pre-flush (F8):** start `triggerFlush(key)` and wait at most one short bound (named const, e.g. `PAUSE_PREFLUSH_BOUND_MS = 2_000`); the PATCH and navigation proceed even if the flush fails or is backing off — the queue persists and the gate recovers it on return.
- Terminal (`completed`/`abandoned`) → **flush-then-complete (parent ARCH-2):** `await drain([key])` fully before the PATCH (no terminal PATCH while entries are pending; a drain stopped by the taxonomy propagates its failure to the caller). No UI PATCHes a terminal status today — the rule lives here so the first caller inherits it.
- `active` (resume) → no pre-flush, plain PATCH.
- `TakeABreakControl` and `ResumeControl` route their fetches through the helper (behavior otherwise identical — their existing tests keep passing with the flusher mocked idle).

- [ ] **Step 1: Write the failing tests:**
  - "Take a break" with a **failing/backing-off pre-flush still PATCHes `{status:"paused"}` and navigates**, queue preserved (F8) — fake timers past the bound.
  - Pause with a healthy queue: flush POST happens before the PATCH (call order).
  - `patchSessionStatus(key, "completed")` awaits the drain: PATCH is not issued until the mocked drain resolves; a taxonomy-stopped drain → no PATCH, error surfaced.
  - Resume: no drain call.
  - Existing `TakeABreakControl.test.tsx` assertions (PATCH body, double-tap guard, aria) still green.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/sorting/sessionStatusPatch.test.ts src/features/sorting/TakeABreakControl.test.tsx src/features/sorting/ResumeControl.test.tsx`
Expected: FAIL — helper missing.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run tests to verify they pass** (same command).

- [ ] **Step 5: Commit**

```bash
git add src/features/sorting/sessionStatusPatch.* src/features/sorting/TakeABreakControl.* src/features/sorting/ResumeControl.*
git commit -m "feat(sessions): shared status-PATCH helper — non-blocking pause pre-flush, strict flush-then-complete"
```

---

### Task 17: `seed-load` benchmark, docs, full gates

**Files:**
- Create: `scripts/bench-batch.ts`
- Modify: `package.json` (add `"bench:batch": "tsx scripts/bench-batch.ts"`), `docs/API.md` (route index entry for `POST /api/sessions/[id]/decisions/batch`)

**Behavior:** reuse `scripts/seed-load-core.ts` (its `resolveLocalUrl` local-only guard and stats helpers — LOCAL DB ONLY) to seed a collection + session, then time (a) 50 sequential single-route decision transactions vs (b) one 50-entry batch transaction, printing the per-decision amortization (documents the win; informs the 5-pending/4 s/50-chunk thresholds — parent §7.3). Timing unit mirrors what the routes run: `withTransaction` + insert(s) + one recompute, via the real route handlers where practical (mocked auth, tx-bound db) or the same controller path `seed-load-core` already times — match its existing pattern, don't invent a third.

- [ ] **Step 1:** No TDD cycle for the script itself (it's a measurement tool, not product behavior); guard-rail assertions only: the script refuses a non-local DB (reuses `resolveLocalUrl` — already tested in seed-load-core's suite if present; otherwise assert by construction).
- [ ] **Step 2:** Implement the script; run `npm run bench:batch` against the Docker DB; paste the numbers into the PR body (the parent-spec residual-risk note about `purses-yuw` goes in the PR body too).
- [ ] **Step 3:** Update `docs/API.md`'s route index (batch route: request/response shape, 200/201/400/401/403/404/409/413 semantics). Note for the orchestrator: `/sync-docs` + `/graphify --update` run before push per CLAUDE.md.
- [ ] **Step 4: Full gates:**

```bash
npm run build && npm run test:ci && npm run lint && npm run auth:verify && npm run test:db
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/bench-batch.ts package.json docs/API.md
git commit -m "chore(bench): 50 single POSTs vs 1x50 batch amortization benchmark + API docs"
```

---

### Task 18 (DEFERRED — gated on bead `purses-yuw`): Playwright tier

**Not executed in this plan.** Named obligations (spec §4 "Playwright"; parent §4 tier-honesty QA-4):
- Crash-reload: decisions land before the round queue renders (`PendingDecisionsGate` ordering, real browser).
- Pagehide delivery: the keepalive flush actually delivers on tab close (jsdom can only prove wiring — Tasks 8/15 are wiring-only for this claim).

Until `purses-yuw` makes e2e a required CI check, the crash-recovery story is **not fully tested**; this residual risk is named in Epic P's PR body (Task 17 Step 2). File/confirm a follow-up bead linking `purses-yuw` → these two specs before closing the epic (epic completion = all beads closed).

---

## Coverage audit — every §4 obligation → exactly one owning task

Epic P spec §4 (rev 2 additions) and parent spec §4 "Epic P" lists. Owner = the task whose Step 1 contains the assertion.

| Spec obligation | Task |
|---|---|
| **Server (DB-backed):** repo-format ids pass the shared schema end-to-end; bare-ULID itemId rejected (F1) | 3 (schema unit) + route-level 400 in 4 — owner: 3 |
| Same-clientKey pair in one batch → 201, created+duplicate, one row, one recompute, never 500 (F2) | 5 |
| Committed-batch replay → 200, all duplicate, zero rows, zero recomputes (observable, not spy), no disposition-clear; ≥1 inserted → 201, one recompute (F2+F13) | 5 |
| Batch of k → exactly one recompute (parent) | 5 |
| In-batch same-item conflict → later array entry wins; one shared batch `createdAt` (F3/parent) | 5 |
| Cross-path latest-wins single↔batch (shared clock domain, F3) | 5 |
| Comparator property test vs both old comparators on realistic mixed-prefix corpora (F10) | 1 |
| Factory: same-ms strict increase; order survives prefix+lowercase; equal-`createdAt` later-id-after-earlier (F10) | 2 |
| Gates 401/404/403 nothing written; 409 in-progress gate on the new route (parent) | 4 |
| Authz-enumeration `buildStrangerCases()` registration (F14) | 4 |
| Shape-invalid → whole-batch 400, nothing written (parent) | 4 |
| >50 entries rejected; oversized ids/body rejected (parent SEC-B2) | 4 (ids: 3's max-64 unit test) |
| 413 via ReadableStream body with no Content-Length — stream enforcement (F17) | 4 (unit-level cancel proof: 3) |
| Compare entry with one unknown side → rejected; rejected entries: no disposition-clear, no recompute-predicate count | 5 |
| Concurrent batches serialize under the advisory lock (lock-taken proof, documented pool limitation) | 5 |
| clientKey scope pinned: same key, different session → both insert (parent) | 5 |
| Un-mocked route→service→repo→DB seam test exercises the batch route (parent) | 5 (happy-path batch) |
| Analytics: one `sort_decision_batch_recorded`, counts match response, via `flush()` (F15) | 5 |
| **Client:** persist-before-advance (queue write is synchronous, pre-return) | 7 (queue-level) / round-level re-assert in 10 — owner: 7 |
| Ack removes exactly the acked keys | 8 |
| Flush triggers: ≥5 pending · 4 s | 8 |
| Flush trigger: round end | 10 |
| Flush triggers: pause-before-PATCH · flush-then-complete | 16 |
| Single-flight: timer mid-flight starts no second flush (F12) | 8 |
| >50 pending chunks sequentially in order | 8 |
| Rehydrated queue flushes in stored order | 8 |
| Drain order `[triage, set_aside, triage]` → batch(1)·disposition·batch(1) | 8 |
| Disposition 409 per-entry: removed, one notice, drain continues; recovery never discards the following triage (F4) | 8 |
| Disposition 404 → silent drop, continue | 8 |
| Backoff pinned 1/4/15/60 s, capped, reset on success (F15) | 8 |
| Pagehide during backoff → immediate keepalive flush (F11) | 8 |
| Cross-tab Web-Lock exclusivity; no lost enqueue during ack-removal (F11) | 8 |
| 400 → local re-validate, quarantine offenders, retry rest; 401 preserve+stop; 403 preserve, never delete; batch-409 mid-round stop vs recovery discard-once | 8 |
| Enqueue quota-throw → flush+retry, then awaited direct-submit fallback (F18) | 7 (fallback advance path exercised in 10) |
| Curator-keyed storage isolation (curator B never touches A's queue) | 7 |
| Compare batch-of-1 through the flusher (call sequence), never a bare fetch (F11); ~5 s gentle retry state; idempotent retry keeps its clientKey | 14 |
| Gate mounting during a hook drain awaits it — no second POST (F12) | 15 |
| Triage: n taps → zero mid-round refresh, exactly one at round end (F15) | 10 |
| "Decided so far" ticks on tap, no double-count on re-answer, decrements on queued undo (F20) | 10 (decrement interaction re-asserted in 11) |
| `selectTriageQueue`: first-entry equivalence across the existing fixture table; active-then-deferred + per-entry flags; exclusions; empty (F6) | 9 |
| Queue exhaustion ends the round early into the recap (F6) | 10 |
| Undo/revisit: standing answer selected; superseding entry; walk-away no-op; disposition affordances hidden for in-flight/acked; queued-triage+disposition swap (F19+F4) | 11 |
| Recap counts all N unflushed; "gentle pass" absent (present for a truly empty round); refresh only after final ack; post-end prune doesn't change counts (F5) | 10 |
| Rejected ack: notice exactly once (constant-asserted), no ack-time refresh, optimistic state retained until the round-end revert, notice present at revert (F9) | 12 |
| N quarantined → one notice; quarantine reconciliation: item reappears in the next `selectTriageQueue` (F9) | 12 |
| Gate: children unmounted until last ack + settled refresh transition; ~5 s bounded reveal, background flush, one refresh on final ack; 401 immediate reveal; cross-curator untouched; GC expired-foreign-key removal (F7/F8/F18) | 15 |
| "Take a break" with failing/backing-off pre-flush still pauses + navigates, queue preserved (F8) | 16 |
| `seed-load` benchmark: 50 singles vs 1×50 batch | 17 |
| Playwright: crash-reload ordering; pagehide delivery (gated `purses-yuw`) | 18 (deferred) |

## Self-Review

**Spec mechanisms → tasks:** §2.1 route+schema+body cap → 3, 4; §2.2 gates → 4; §2.3 steps 1–7 → 4 (spine) + 5 (semantics); §2.4 comparator → 1 (+2 for factory interplay); §2.5 single-route cleanup → 6; §3.1 queue/quarantine → 7; §3.2 flusher/taxonomy/triggers → 8 (+10, 14, 16 for the trigger call sites); §3.3 optimistic rounds → 9–14; §3.4 gate + GC → 15 (GC primitive in 7); §5 rollout: one PR, single route kept as fallback throughout — no task removes the single route's POST.

**Verified against real code (not assumed):** single-route gate order/comments (`decisions/route.ts:61-108`), 23505 dead branch (L54-59, 144-162), `generateId` (`id.ts:3-5`), `lockCollectionCurator`/`withTransaction` opts (`transactions.ts`), `localeCompare` at `ScoringService.ts:91`, `>`/`<` in `insertion-ranking.ts:21-25,120-123`, dispositions endpoints (`POST …/dispositions` 201/409/400; `DELETE …/dispositions/[itemId]` idempotent 200), `PreferenceExistsError` (`server/api/dispositions.ts:13`), triage page single-item flow + `decided = preferences.length`, `selectTriageItem` semantics, `TriageUndoProvider`/`DeferControl`/`SetAsideButton`/`CompareChoice` fetch paths (compare's clientKey is `crypto.randomUUID()` — replaced in Task 14), `RoundSurface`/`WhatMoved`/`what-moved.ts` (accepts epoch-ms `createdAt` — recap merge needs no type change), `TakeABreakControl` PATCH, schema `clientKey` + partial index + `defaultNow()` (`schema.ts:218-234`), DB-test conventions (`decisions-hardening.integration.test.ts:20-58`), `buildStrangerCases` shape (`route-authz-enumeration.integration.test.ts:197-224`), `seed-load-core.ts` guard/stats, npm scripts, `ulid@^2.3.0`, vitest node default + per-file jsdom docblocks.

**Gaps to watch during execution:** (1) Drizzle 0.30.10's `onConflictDoNothing` vs the partial-index predicate — Task 5 names the raw-SQL fallback; verify, don't guess. (2) The recompute observable — read `PreferenceStateService` before writing Task 5's assertions; if `updatedAt` isn't rewritten per recompute, use preference row identity (delete-then-insert changes row ids) as the observable. (3) `WhatMoved.tsx`'s empty-round copy string — read it for Task 10's "gentle pass" assertion. (4) jsdom has no `navigator.locks` — Tasks 8/15 install a shared fake; `web-lock.ts`'s fallback covers the runtime. (5) Envelope gains `collectionId` (Task 8's disposition URLs) — added in Task 7's shape from the start.

**Placeholders:** none load-bearing — Tasks 1–2 carry real code; later tasks carry exact interfaces + named assertions; all paths, scripts, and fixtures verified above.

## Spec ambiguities — RESOLVED (orchestrator, 2026-07-06)

1. **Pause pre-flush bound:** confirmed — `PAUSE_PREFLUSH_BOUND_MS = 2_000`, a named const;
   wait up to the bound, then pause/navigate regardless (queue persists; gate recovers).
2. **Terminal transitions:** the shared helper pre-flushes (same best-effort 2 s bound) before
   **both** a terminal-status PATCH *and* the session **DELETE** (abandon-with-undo) —
   decisions made before setting a session aside must land, or a later restore resurrects a
   session missing its final taps. The terminal-PATCH branch ships without a production call
   site today (Epic 5's Decide surface becomes its caller); Task 16 tests both branches.
3. **Analytics:** capture on every request, including all-duplicate replays (`{0, n, 0}`) —
   replay frequency is exactly the recovery-path signal worth observing, and counts are
   ids-free (PII discipline holds). Deliberate divergence from the single route's isNew-only
   capture; Task 5 asserts it.

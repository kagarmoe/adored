# Coverage Phase 1 — connectivity contract test + route-test harness

**Goal:** (1) A unit-speed test that fails if any UI data call targets a URL+method with no matching API route (proves UI→handler wiring; guards against dangling wires). (2) Shared test harness (`mockAuth()` + `seedFullCollection(ownerId)`) that Phases 2–3 build on.

**Global constraints:** vitest 4.1.9; mock policy = only `getSession`/`@vercel/blob`; real DB elsewhere; branch `feat/coverage-phase1-connectivity` → PR. The connectivity test must be **AST-based** (TypeScript 5.9.3 compiler API — `ts.createSourceFile`), **not** a line regex; it must **fail loud** on any URL it can't statically resolve (never silently skip).

---

### Task 1: UI↔route connectivity contract test

**File:** `src/lib/__tests__/ui-route-connectivity.test.ts` (no new prod code).

**Inputs (facts):**
- UI call sites: `fetch(url, { method })` (method defaults GET) and `apiGet(url)`/`apiPost(url,…)`/`apiPatch(url,…)` (`src/lib/api-client.ts:38,44,51` → GET/POST/PATCH). DELETEs go through raw `fetch`. (No `apiDelete`.)
- Routes: `src/app/api/**/route.ts`; methods via `export function GET|POST|PUT|PATCH|DELETE` **and** the `export { handler as GET, handler as POST }` form (NextAuth).
- A URL may be a string literal, a template literal (`/api/collections/${cid}/items/${id}`), or an **identifier bound to one earlier in the same file** — e.g. `ImageViewer.tsx` does `const patchUrl = \`…\`; fetch(patchUrl, …)`. Must resolve intra-file const bindings.

**Normalization:** strip `?query`; `${expr}` → `[param]`; route `[id]`/`[itemId]` segments → `[param]`; drop trailing slash. So UI `/api/collections/${cid}/items/${iid}/photos/${pid}` and route `collections/[id]/items/[itemId]/photos/[photoId]` both normalize to `/api/collections/[param]/items/[param]/photos/[param]`.

- [ ] **Step 1 — failing fixtures first.** Write unit assertions over small in-test source fixtures (strings passed to the extractor, not real files):
  - a `fetch("/api/x", { method: "DELETE" })` → `{url:"/api/x", method:"DELETE"}`.
  - `apiPost("/api/y", b)` → POST; bare `fetch("/api/z")` → GET.
  - template `/api/collections/${c}/items` → `/api/collections/[param]/items`.
  - **const resolution:** `const u = \`/api/collections/${c}/x\`; fetch(u,{method:"PATCH"})` → `/api/collections/[param]/x` PATCH (the ImageViewer case).
  - **unresolvable** (`fetch(buildUrl(), {…})`) → reported in `unresolved`, NOT silently dropped.
  Run → fail (extractor not defined).
- [ ] **Step 2 — implement the extractor** in the test file: `extractCalls(file, src)` using `ts.createSourceFile` (TSX scriptKind for `.tsx`); first pass collects `const <id> = <string|template>` bindings; second pass walks `CallExpression`s for `fetch`/`apiGet|apiPost|apiPatch`, resolving the URL arg (literal / template→pattern / identifier→const) and the method (apiX fixed; fetch from the 2nd-arg object literal `method:"…"`, default GET); keep only URLs starting `/api/`; push unresolved call sites (with line) to a separate list. Plus `routePatternFromFile`, `methodsFromRoute`, `normalizeUrl`. Run unit fixtures → pass.
- [ ] **Step 3 — repo scan test.** Glob `"use client"` files under `src/components`, `src/features`, `src/app` (a file is client if it starts with `"use client"`). Extract all calls; build the route table from `src/app/api/**/route.ts`. Assert: (a) `unresolved` is empty (else fail listing each `file:line` — "annotate or make statically resolvable"); (b) every extracted `{url,method}` has a matching route pattern + method (else fail listing the dangling wire). Expected: **green today** (inventory found no broken wires).
- [ ] **Step 4 — guardrail proof.** Add one assertion that the matcher is real: a deliberately-wrong fixture call `/api/does-not-exist` (POST) is reported as unmatched by the matching function (assert the function returns it as a miss — not by failing the suite).
- [ ] **Step 5 — run + commit.** `npx vitest run src/lib/__tests__/ui-route-connectivity.test.ts` green; `npx tsc --noEmit` clean. Commit `test(connectivity): UI fetch → route+method contract (AST, fail-loud)`.

### Task 2: Shared route-test harness

**File:** `e2e/fixtures/seed.ts` (extend), new `e2e/fixtures/mock-auth.ts`.

- [ ] **`mockAuth()`** — a helper returning a `getSession` spy + the matching `requireAuth` (both exports), so route integration tests don't re-derive the partial mock (avoids the `file-route-authz` getSession-only trap). Shape mirrors `collection-purge.integration.test.ts:39-46`. Document: callers still `vi.mock("@/lib/auth", () => mockAuth())` at top level (hoisted) — the helper just builds the object.
- [ ] **`seedFullCollection(ownerId: string)`** — extract from `collection-purge.integration.test.ts:151-273`, parameterized on `ownerId` (it currently closes over a test-scoped var). Returns the ids a populated-collection test needs.
- [ ] Prove by use in Task-1? No — these are exercised by Phase 2's route tests. Add a tiny `seed.ts` smoke under `RUN_DB_TESTS` that calls `seedFullCollection` and asserts row counts, so the helper itself is covered. Commit `test(harness): mockAuth() + seedFullCollection(ownerId) for route integration tests`.

## Verification
- `npx vitest run src/lib/__tests__/ui-route-connectivity.test.ts` (fixtures + repo scan green; unresolved list empty).
- Temporarily point a UI fetch at `/api/nope` locally → the repo-scan test fails with that file:line, then revert (proves it bites).
- `npm run test:db` exercises the `seedFullCollection` smoke.
</content>

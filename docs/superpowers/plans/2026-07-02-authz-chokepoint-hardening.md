# Plan — Harden the AuthZ chokepoint (bead purses-j9qf)

Teaching companion: `docs/teaching/authorization.md`. Context from the investigation: **no holes exist** — every API route and every collection page checks authorization before fetching today. The API surface is already durably locked (compile-exhaustive `CAPABILITIES` policy + a filesystem-exhaustive stranger test that reddens on any new unguarded route). This plan is **regression-proofing**: make the current correctness impossible to lose. We keep the model (owner/curator, the chokepoint) — no framework, no authz redesign (out of scope).

## Global constraints
- **No behavior change** — every task adds a *guard/test*, not a policy change. If a task would change any allow/deny outcome, stop and flag it.
- **Follow the existing patterns** — the route enumeration test and the `Record<Operation, Role>` map are the models to copy; don't invent new machinery.
- Standard test discipline; each task green on `test:ci` (+ the `db-tests` job for integration tests).

## Task 1 — Page authz enumeration guard (closes bead `6fk`) — highest value
The route enumeration test's blind spot is Server Component **pages**: it walks `src/app/api/**` only. A new page under `src/app/collections/**/page.tsx` that forgets `requireCollectionAccess`, or fetches before it, ships green.
- Add `src/lib/db/page-authz-enumeration.integration.test.ts`, symmetric with the route test: **filesystem-walk** every `src/app/collections/**/page.tsx`, and for each, render/invoke it as an **authenticated stranger** (non-member) against a seeded owner's collection, asserting the outcome is a **redirect** (to `/collections` or `/login`) — i.e. no protected data is returned. Fail on a `200`/data render.
- Mirror the route test's **Test-1 categorization**: every discovered page must be either in an explicit `PUBLIC_PAGES` allowlist (with a written rationale — e.g. `login`, `signup`, `shared-results/[token]`, `welcome`, `invitations/[token]`) **or** exercised as a stranger. An **uncategorized new page fails** — so adding a page forces a decision.
- This is the strongest fix (symmetric with the API backstop). If rendering a full Server Component in the test harness proves impractical, fall back to an **AST/lint check** asserting `requireCollectionAccess|requireCollectionOwnerPage` is the first `db`-touching `await` in each collection page — note which approach you took and why.

## Task 2 — Pin the capability-map *values* (semantic guard)
`Record<Operation, Role>` forces an entry to *exist* but not to be *correct* — a typo mapping `items:purge` → `"curator"` compiles and passes the enumeration test (a curator legitimately gets `200`; the stranger still `403`s). Add `capabilities.test.ts` (or extend the existing one) with a **table test** asserting the exact required role for **every** `Operation` — the owner-only set (`invitations:read`, `collection:manage|purge|audit`, `members:manage`, `invitations:manage`, `items:purge`) vs the curator set (the rest). Drive it off the `Operation` union so a newly-added operation forces a new assertion (or the test fails). This pins the policy's *meaning*, not just its shape.

## Task 3 — Assert the bespoke guards' consistency (lighter)
The curator-private guards (`requireApiResultAccess`, the inline session `authorizeSession`) each hand-roll the 404-before-403 + `curatorId === userId` sequence. Add focused tests asserting each: absent → `404`; exists-but-stranger → `403`/`404` (not `500`, not `200`); member-but-not-the-curator → `403`. (Some of this exists via the enumeration; this makes the *curator-leg* explicit so a future edit that drops it is caught.) Keep it minimal — one test per bespoke guard.

## Notes (not tasks)
- **pool/upload seam:** `POST …/pool/upload` is in the enumeration's `PUBLIC_OR_SELF` list because the `@vercel/blob` `handleUpload` mock bypasses the `onBeforeGenerateToken` authz callback; its real gate is covered in `pool-routes.integration.test.ts`. Leave as-is; keep the cross-reference comment so the seam stays visible.
- **Optional structural belt-and-suspenders:** a lint rule (sibling to the existing repo-import ban) that flags a collection page/route which reaches a controller/repo without a nearby capability call. Lower ROI than Tasks 1–2; only if we want compile-time page enforcement on top of the runtime test. Defer unless asked.

## Done =
`test:ci` + the `db-tests` job green; a deliberately-unguarded throwaway page makes Task 1's test go red (prove the guard bites); the capability table test covers all 14 operations. No allow/deny outcome changed. Update `docs/API.md` §Authorization + ARCHITECTURE decision 17's status line to note the page-enumeration backstop now exists.

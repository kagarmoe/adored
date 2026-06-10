# PurseInator Project Instructions

## Align with Next.js Opinions (REQUIRED)

Next.js is opinionated. Follow its conventions, not workarounds:

1. **App Router** — Use `src/app/` with file-based routing. Never Pages Router.
2. **Server Components by default** — Mark interactive UI `"use client"` only when needed (forms, hooks like `useState`)
3. **Data fetching in Server Components** — Async functions in Server Components, never in Client Components
4. **API Routes for mutations** — All POST/PATCH/DELETE via `src/app/api/` routes, no direct DB calls from client
5. **Native fetch()** — No SWR/React Query; use `fetch()` with error handling
6. **NextAuth v4 integration** — Follow canonical patterns: DrizzleAdapter, JWT strategy, session callbacks
7. **Middleware for route protection** — Guard routes in `src/middleware.ts`, not API guards
8. **Suspense for async UI** — Stream loading states with React Suspense
9. **No hardcoded secrets** — All config via `process.env.*` with validation at module load
10. **TypeScript strict mode** — All inference errors resolved, no `any`

## Wireframes (reference, not law)

`docs/PurseInator_wireframes.pdf` is a **starting reference, not a spec to match exactly.**
Deviate whenever a better flow serves the user — the governing authorities are
[`PRODUCT.md`](../PRODUCT.md) (purpose) and [`TONE.md`](../TONE.md) (first-order tone contract),
**not** the wireframes. When a wireframe and a better flow conflict, choose the better flow.

**Durable interaction principles (these hold regardless of any wireframe):**

- **Tablet-first, tap-first** — taps are the primary affordance; there is **no swiping**. Dragging is
  permitted where it genuinely helps (reordering, moving items between buckets). Touch targets ≥44px (h-11).
- **Navigation** — top-left back arrow + breadcrumb; top-right user area.

The wireframes' per-screen layouts (collections grid, item grid, card-based sorting, bucketed results)
are useful reference, but the **flow may change** — e.g. uploading photos before metadata, deferring
metadata to fill in later, and bulk-uploading images.

## Code Quality

- **Comments on WHY only** — Code is self-documenting via naming
- **No premature abstraction** — Three lines before helper; DRY within reason
- **Validate at boundaries** — User input + external APIs only; trust internal code
- **Build before commit** — `npm run build` + `npm run auth:verify`
- **Follow auth patterns** — API routes, error responses, validation precedent already set

## Git Workflow

- **Branch:** `complete-refactor`
- **Commit:** Frequent, one logical change per commit
- **Review:** Major features get `pr-review-toolkit:code-reviewer` before merge

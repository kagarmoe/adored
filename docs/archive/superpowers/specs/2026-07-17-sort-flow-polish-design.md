# Sort flow polish: one-tap start, mood-hub voice, canonical set-aside — design

**Date:** 2026-07-17 · **Epic:** purses-znkt (.1, .2, .4; .3 gets a separate design doc for owner review, no implementation) · **Branch:** feat/sort-flow-polish · **Rev 2** (spec review folded)
**Provenance:** verified reconciliation (sort-dashboard area) + fresh fact-check; owner overnight execute-and-merge authority.

## Verified facts

- `POST /api/sessions` requires only `collectionId`; `goal` optional with NO server default; **`scope` is sent by the form but ignored server-side** (never validated, stored, or read). Response = full Session (201); racing an open session → gentle 409 (`sessions_active_unique`).
- The form routes straight to `/sort/[number]/triage` on 201; two e2e specs drive the form and keep passing (they enter `/sort/new` directly).
- Hub (`/collections/[id]/sort`): h1 "Sorting sessions"; empty state "No sorting sessions yet / Create a session to start organizing items"; history rows = goal + status Badge + date. No test pins the h1 string.
- Set-aside shelf lives at `/sort/set-aside` (page with `BringBackControl` per item); the results page has its own set-aside grid whose "Bring any back" links to the shelf. References: `trail.setAside` (breadcrumbs), triage's `setAsideHref`, the results link, and `page-authz-enumeration.integration.test.ts`.

## Changes

### 1. One-tap "Start sorting" (purses-znkt.1)

On the hub, when no open session exists, the "New session" button becomes a **one-tap primary "Start sorting"** (a small client island): POSTs `/api/sessions` with `{ collectionId }` only — no canned goal; the resume card's gentle fallback line already covers a null goal — then routes to `/collections/[slug]/sort/[number]/triage` (the same landing the form uses; round length comes from the stored device preference, as today — landing on a possibly-empty triage queue is the form's existing, handled behavior, inherited knowingly). On a 409 (raced open session) show a gentle status line ("Your sort is already open — resuming is one tap away.") and `router.refresh()` so the resume card appears.

`/sort/new` stays reachable as a quiet secondary link beside the primary — **"Set a goal first"** (review F4: naming scope would advertise the very field this spec proved is dead) — for the deliberate path (goal text, round-length dial). The workspace start card (#353) keeps pointing at `/sort/new` (unchanged this pass).

The empty state's CTA becomes the same one-tap island (see §2). The two form-driving e2e specs are untouched and must stay green; add one hub-level e2e: tap "Start sorting" → land on `/sort/\d+/triage`.

**Scope note (fact-check finding):** the form's `scope` value is dead weight server-side. Out of scope to fix here; file a bead (either persist it or remove the select — owner call).

### 1b. Null-goal fallout (review F3)

The one-tap flow is the first real producer of null-goal sessions. The session-detail page (`/sort/[sessionNumber]/page.tsx` ~L108) renders `Goal: {goal}` raw — with null it shows a dangling "Goal: ". Fix in this pass: omit the line entirely when `goal` is null (the gentle fallback sentence belongs to cards, not a labeled field).

### 2. Hub voice pass (purses-znkt.2)

- h1 **"Sorting sessions" → "Sort"** (the breadcrumb + mode chip already carry context).
- Empty state → heading **"Nothing sorted yet"**, message **"Begin with how you feel about each."**, action = the one-tap **"Start sorting"** island (§1).
- History moves under a quiet `h2` **"Earlier passes"**; each row keeps its link + date but drops the raw status `Badge` (rows here are only completed/abandoned — the machine word adds nothing); row heading = the session's goal or, when null, **"A sorting pass"**.
- The current-session `SessionResumeCard` block is unchanged (already softened in #353).
- Update the hub page test pins accordingly (hrefs/gating tests keep passing; add h1 + empty-state + no-badge-in-history assertions).

### 3. Canonical set-aside on the Decide side (purses-znkt.4)

- The shelf page **moves** to `/collections/[id]/results/set-aside`; the old `/sort/set-aside` route keeps its **`requireCollectionAccess` guard FIRST** (review F1: the stranger-enumeration integration test exact-matches the first thrown redirect — the authz bounce must stay the first throw) and only then `permanentRedirect()`s (review F5: `redirect()` is 307; permanence needs `permanentRedirect()`, a first use in this repo) to the new path.
- Breadcrumbs: `trail.setAside` re-parents under the results prefix (leaf label "Set aside" unchanged); update `breadcrumb-trails.test.ts`.
- Update the two in-app links: triage's `setAsideHref` and the results page's "Bring any back".
- Page content unchanged (list + `BringBackControl`, same copy). `page-authz-enumeration.integration.test.ts` gains/updates the new route entry (test:db required).

## Testing

- One-tap island unit: POST body `{collectionId}` only; 201 → push to triage href; 409 → gentle line + refresh; button disabled while in flight.
- Hub page tests: new h1/empty-state/history pins; existing gating + href pins stay.
- Set-aside: redirect test (old path → new), breadcrumb test update, both link sites updated (grep proves no `/sort/set-aside` links remain outside the redirect), authz-enumeration integration updated (`npm run test:db`).
- e2e (review F2 — the load-bearing pinned string is **"New session"**, not the h1): `session-create-after-set-aside.spec.ts` L110 locates `getByRole("link", { name: "New session" })` — REWRITE that step: the deliberate path is now reached via the secondary "Set a goal first" link; keep its 201/no-409 assertions intact (they are the 4bhh proof). `sort-session.spec.ts` enters /sort/new directly — stays green. `not-mine-set-aside.spec.ts` L258 `goto`s the OLD shelf path — keep it as the live proof the redirect round-trips (note it in the PR). New hub one-tap journey (tablet). `session-pause`/`session-undo` stay green.
- Full gates incl. `npm run test:db`.

## Out of scope

- purses-znkt.3 (session URL tier collapse) — separate design doc for owner review, written on this branch, not implemented.
- Persisting or removing the form's dead `scope` field (new bead, owner call).
- Workspace start-card retarget to the one-tap flow.

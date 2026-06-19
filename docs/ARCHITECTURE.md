# Adored — Architecture & Project History

This is the orientation source-of-truth for Adored: **where the project is, how it got here (history + the non-obvious decisions), and where it's going.** It exists so the rationale behind the shipped code survives after the dated plan docs that produced it are deleted — when in doubt about *why* something is the way it is, this is the file to read.

It does not govern the product. The governing documents are, in order:

- **[`PRODUCT.md`](../PRODUCT.md)** — *why* Adored exists (purpose, users, brand personality, design principles).
- **[`TONE.md`](../TONE.md)** — the **first-order** voice/tone contract. The app conforms to TONE; an exception is an amendment to that file, never a local override. Nothing here outranks it; where this doc and TONE appear to conflict, TONE wins.
- **[`DESIGN.md`](../DESIGN.md)** — the visual system (the "Luminous Gallery": palette, type, elevation, components), accountable to TONE.
- **[`README.md`](../README.md)** — local setup and scripts.

Background/architecture context (this file) is descriptive — it records what was built and why. PRODUCT/TONE/DESIGN are prescriptive and take precedence.

Deeper reference specs are linked at the end under **[Reference deep-dives](#reference-deep-dives)**.

---

## Where we are

**What Adored is.** A working Next.js 14 App Router app for *curatorial collection sorting*. A user creates collections, adds items (named or nameless, each with a per-collection catalog number), bulk-uploads photos into a durable per-collection **pool** and promotes them into items, runs a per-curator **sort session** (triage into Love / Like / Maybe / Onward tiers, then pairwise "which do you love more?" comparisons), generates a ranked **result** with manual override, and shares a finalized result via a public token link. It is well past MVP.

**Stack (verified against code):**

- **Next.js 14 App Router**, TypeScript strict, Server Components by default (`"use client"` only for interactive forms/hooks).
- **Drizzle ORM** over **Postgres** (Neon / Vercel Postgres) via the `postgres-js` driver (`src/lib/db.ts`); schema in `src/lib/db/schema.ts` — **15 `pgTable`s**.
- **NextAuth v4**, `DrizzleAdapter`, **JWT** session strategy (`src/lib/auth.ts:124`), dual providers (Credentials email+password with bcrypt; EmailProvider magic-link).
- **Vercel Blob** for photo storage (client-upload; local filesystem fallback in dev).
- **Vitest** (unit + DB-backed integration behind `RUN_DB_TESTS=1`), **Playwright** e2e (ephemeral Docker Postgres, multi-viewport), deployed on **Vercel**.

**Layered architecture (strictly server-first):**

```
src/app/**                 file-based pages + src/app/api/** route handlers (mutations)
  → src/server/api/*       thin controllers (one per resource)
    → src/server/services/* domain Services (Collection, Item, Photo, Session,
                            Scoring, Pairing, Preference, SortResult, Membership, …)
      → src/server/repositories/* interface-typed repos; implementations/* do the Drizzle calls
        → Drizzle / Postgres (src/lib/db.ts, schema.ts)
src/server/dal/*           authorization chokepoint-in-progress (collection-access.ts)
src/middleware.ts          withAuth route protection
```

Key invariants:

- **`decision_events` is the immutable, append-only source of truth.** Scores, preferences, and rankings are *lazily derived* — never stored as authority on the Item.
- **All mutations go through `src/app/api/**` routes** (no DB calls from the client). React calls APIs only.
- **`deletedAt` soft-delete** throughout (users are the exception — see decisions); a tombstoned catalog number is never reused.

**Shipped features (verified):** collections CRUD with owner+membership model and real cover photos; items (named/nameless, catalog numbers, soft-delete, hero photos); photo pool + bulk upload with grouping and unified "Move to…" reassignment; per-curator triage→pairwise sort with the ScoringService model; computed results with manual override, finalize/supersede; tokenized public result sharing; email invitations with per-invite permission flags + member management; slug + sequential-number URLs (no raw ULIDs); NextAuth email+password and magic-link with JWT sessions and middleware protection; substantial security hardening (see Phase 9); Vitest + DB-integration + Playwright test infrastructure wired into CI.

**Not yet built (don't assume these exist):** **purge is a stub** — `purgeCollection` (`src/server/api/collections.ts:85`) soft-deletes with a `TODO` for the real cascade, and `purgeItem` (`src/server/api/items.ts:76`) is an empty `TODO` stub (soft-delete is the separate `deleteItem`). The hard-delete cascade is unbuilt (decision 13 / spec §11.4). The single DAL chokepoint and the Owner/Curator role collapse are in flight (epic `purses-pv9`).

---

## How we got here

### Timeline (Phase 0 → Phase 9)

1. **Phase 0 — MVP v1 (2026-05-07).** The original "PurseInator" MVP built overnight: Next.js App Router, **Prisma** + Neon, Vercel Blob, Auth.js v5 magic-link, Resend; an **operator** (photographs/uploads) vs **curator** (ranks) split; Elo scoring with four result tiers. The design anchor was set on day one: *"Rachel isn't shopping — she's sorting through her life"* — safe, unhurried, judgement-free.
2. **Phase 1 — v1 hardening (2026-05-08 → 05-17).** Rebrand to "PurseInator", tablet-first refocus, client-side background removal, hosted demo. The structural change: the global JWT role was replaced with **hierarchical per-collection membership + invite tables**. CI made a correctness gate (ephemeral-Postgres e2e, smoke test, `/api/health`).
3. **Phase 2 — The Complete Refactor (2026-05-29 → 05-30).** A deliberate **blank slate** (`3342e84` removed all source, keeping only docs/.beads/.claude) restarted the app on a **service-first** architecture: persistence-agnostic Services → Drizzle Repositories → thin API handlers → React-only-calls-APIs. **Prisma → Drizzle**; ULID primary keys; **DecisionEvents immutable append-only truth**; buckets renamed to user-facing Love/Like/Maybe/Release.
4. **Phase 3 — GitHub Flow + Neon branch-per-environment (2026-06-01).** Triggered by a prod connection string leaking into `.env.local`: Neon isolated so **Production→`main` DB, all Previews + local dev→a long-lived `development` DB** (no per-PR branches — the simplest design that protects prod). GitHub Flow adopted; the e2e harness built and hardened. (This is where the `VERCEL=1` Secure-cookie gotcha was diagnosed — decision 3.)
5. **Phase 4 — First design-system attempts (2026-06-02 → 06-05).** Two warm/domestic directions tried and **rejected** ("The Lamplit Sitting Room", then "Cabana"): the warmth read as cozy, not gallery-grade. Owner's verdict — *"the colours are ugly / the whole system is wrong."*
6. **Phase 5 — TONE first-order + sort model + Luminous (2026-06-09).** The foundations reset in a single day: **TONE.md written as the first-order contract**; the **ScoringService reworked** (band-center seeding + asymmetric deltas); the visual system replaced with the **Luminous Gallery** (white ground, committed cool color as protagonist, Playfair + Inter, light+dark, "Brand never speaks Danger"). Fourth tier renamed Release→**Onward**.
7. **Phase 6 — Rename PurseInator → Adored (2026-06-10).** The placeholder name retired (#125) across display brand, technical identifiers, and living docs. History deliberately **not** rewritten (decision below / rename story).
8. **Phase 7 — Bulk upload → durable pool → grouped, numbered items (2026-06-13 → 06-14).** Metadata-first ordering **inverted**: dump images fast, group/name later or never. `items.name`/`photos.itemId` made nullable, per-collection catalog number added, **Blob client-upload** durable pool, gentle deferred-metadata surfacing. Adopted `adversarial-review` as a gate.
9. **Phase 8 — Real card images, covers, slugs, analytics (2026-06-14 → 06-16).** UI-fidelity + URL fixes: real hero/cover photos on cards; member-or-owner page IDOR fix (`purses-82r`); **short collection slugs** replaced raw ULIDs under "slug for nav, id for data" (#190). Playwright runs selectively on UI changes; analytics added.
10. **Phase 9 — Authz overhaul: close live cross-tenant holes (2026-06-17 → 06-18).** A security cluster closed verified live cross-tenant read/write/IDOR holes: shared `requireApiCollectionAccess` (#196), cross-curator triage scoped (#198), session/result URLs got numbers (#197), the whole `/api/sort-results` subtree guarded (#200), dead routes deleted (#201). The heavier DAL chokepoint was deliberately **deferred** to epic `purses-pv9` — security first, structure later.

### Decisions log

Each entry is **Decision / Rationale / Status**. Where design and shipped code diverged, that is stated explicitly.

**1. Blank-slate service-first refactor (Prisma → Drizzle, DecisionEvents immutable).**
- *Decision:* Wipe the source (`3342e84`) and rebuild as Services → Repositories → thin API handlers → React-calls-APIs; DecisionEvents append-only; scores/rankings lazily derived; ULID PKs.
- *Rationale:* Keeps the data model simple and authoritative and concentrates authorization server-side. The original Prisma stack and its onboarding/roles code were erased in one move rather than incrementally migrated.
- *Status:* **Shipped.** Layout verified: `src/server/{api,services,repositories,dal}`; `decision_events` in `schema.ts:203`.

**2. Auth: NextAuth v4 Credentials + magic-link; JWT sessions (design said DB).**
- *Decision:* NextAuth v4 + `@auth/drizzle-adapter`; **Credentials** (email+password, bcrypt) as the primary sign-in plus an EmailProvider magic-link path. The canonical NextAuth schema (`user`/`account`/`session`/`verificationToken`) forced renaming the legacy `users` table; **users hard-delete** (no `deletedAt`), collections/items keep soft-delete.
- *Rationale / divergence:* The auth **design specified database-backed sessions and a `session` table the app does not use as a session store** — the shipped code **pivoted to JWT** (`src/lib/auth.ts:124` `strategy: "jwt"`). And **prod magic-link email was never wired**: `sendVerificationRequest` only `console.log`s in development (`src/lib/auth.ts:78-80`), so the magic-link is dev-only despite the provider being configured.
- *Status:* **Shipped (with the two design-vs-code gaps above).** Credentials authorize at `auth.ts:31-62`; bcrypt at `:48`.

**3. The `VERCEL=1`-in-`.env.local` `__Secure-` cookie gotcha.**
- *Decision:* Never let Vercel system vars (`VERCEL` / `VERCEL_ENV` / `VERCEL_URL` / `VERCEL_OIDC_TOKEN`) live in `.env.local`; neutralize `VERCEL` in the Playwright env block; **do NOT override `useSecureCookies`** (keep Vercel's native prod Secure detection).
- *Rationale:* `vercel env pull` wrote `VERCEL=1` into `.env.local`, which makes NextAuth emit a Secure-flagged `__Secure-next-auth.session-token` cookie that browsers **drop over `http://localhost`** → middleware's `getToken()` saw no session → every authenticated request bounced to `/login`. The bug was env hygiene, not auth code (incident #62, fix #64).
- *Status:* **Shipped + encoded as a startup guard.** `src/lib/env.ts:69-76` warns loudly when `VERCEL` is set and `AUTH_URL` is `http://` rather than overriding cookie behavior.

**4. Neon branch-per-environment.**
- *Decision:* `DATABASE_URL` scoped so **Production → `main` DB; all Previews + local dev → a long-lived `development` DB**. No per-PR ephemeral branches.
- *Rationale:* After a prod connection string leaked into `.env.local`, prod had to be unreachable from any non-production deploy. Per-PR branches were rejected as more machinery than needed — the simplest design that protects prod.
- *Status:* **Shipped** (topology lives in `docs/DEPLOYMENT.md` + the kept `neon-migration.md` history note).

**5. TONE.md first-order; Luminous design system accountable to it.**
- *Decision:* TONE.md is the **first-order, medium-agnostic** contract (constraints, never hexes/durations); DESIGN.md and copy answer to it; an exception is a written amendment to TONE. The Luminous Gallery delivers the feel; **"Brand never speaks Danger"** (red/amber/green reserved for ANSI Z535 safety meanings, never decorative); fourth tier **Release → Onward** ("Release"/"letting go" read clinical/grief-adjacent).
- *Rationale:* Two warm palettes were rejected as cozy-not-gallery; the durable fix was to make tone the contract and the visuals accountable to it. *"Restraint is not minimalism"* — Adored is aesthetic, not minimalist.
- *Status:* **Shipped (#82).** See `DESIGN.md`; tier tokens love/like/maybe/onward.

**6. Sort-ranking model: single [0,1] score, band-center seeding.**
- *Decision:* One continuous score in [0,1], computed in two order-independent passes. Triage seeds each item at its **tier-band center** (Love/Like/Maybe/Onward = **0.875 / 0.625 / 0.375 / 0.125**); pairwise refines with **asymmetric deltas (win +0.10, loss −0.05)** so rising is easier than falling (affirmation bias). Cross-tier override is emergent and symmetric (2 consistent wins promote, 3 losses demote); tie = no swing, skip = no-op.
- *Rationale:* The old edge-seeds read every tier one bucket too high (`seed→getBucket` was not an identity round-trip — `purses-7lh`), and a floored delta could never demote. Center-seeding makes `seed→getBucket` an identity round-trip and gives ±0.125 of pairwise headroom.
- *Status:* **Shipped (`purses-h02`).** `src/server/services/ScoringService.ts:13-21` (`TIER_SEED`, `WIN_DELTA=0.1`, `LOSS_DELTA=0.05`).

**7. Photo pool: upload-first, defer metadata; neon-http has no transactions.**
- *Decision:* Upload-first into a **durable per-collection pool** (`item_id IS NULL`), defer metadata, promote into grouped numbered items. Because **neon-http has no transactions**, the order is **create-item → assign-photos** (only partial failure = a harmless empty item), and assignment is a **single guarded `UPDATE … WHERE collection_id = c AND id IN ids AND item_id IS NULL AND deleted_at IS NULL`** whose **affected-row-count vs requested-count is the IDOR/double-assign guard**. **Hero is folded into the same UPDATE** (`is_hero = (id = heroPhotoId)`) so there is never a photos-but-no-hero window. Catalog number = `MAX(number)+1` with **retry-on-23505** (no txn to lock).
- *Rationale:* Getting photos in fast is the urgent real task; a stateless/transactionless driver means the WHERE clause and the count comparison *are* the integrity mechanism.
- *Status:* **Shipped.** `assignPooledPhotosToItem` + the explanatory comment at `src/server/repositories/implementations/PhotoRepository.ts:202-232` (returns count; caller compares); pre-check `countAvailablePooled` at `:240`; 23505 retry at `ItemRepository.ts:45-50` (`items_collection_number_unique`).

**8. Vercel Blob client-upload; `onUploadCompleted` can't reach localhost.**
- *Decision:* Bulk upload uses Blob **client-upload** (`@vercel/blob/client`) to bypass the 4.5 MB serverless body cap. The durable `photos` row is written **only** in the server `onUploadCompleted` callback, trusting the **signed `tokenPayload`** (never the client).
- *Rationale / divergence:* That callback **cannot reach `localhost`**, so the full path is verifiable **only on a Vercel preview deploy**, not local dev. The row-write was extracted into a pure `recordPooledPhoto` seam precisely so it is unit/DB-testable without Blob's network callback.
- *Status:* **Shipped** (pool/upload route + `recordPooledPhoto`).

**9. Reassign is one operation; hero reconciliation rules.**
- *Decision:* Move / split / return-to-pool are **one reassign**: set the selected photos' `item_id` (existing item = move, new item = split, `NULL` = return to pool). Hero rules: moved photos become non-hero on an existing target; the first moved photo is hero of a new item; the pool clears hero; a **source that loses its hero but keeps photos auto-promotes its first remaining photo**; **empty source items are left, not auto-deleted — for predictability**. `getNextCatalogNumber` maxes over **soft-deleted rows too** (a tombstoned number is never reused).
- *Rationale:* Treating the three gestures as one `item_id` reassignment is the smallest model; the deliberate "don't auto-delete empty sources" keeps behavior predictable rather than clever.
- *Status:* **Shipped.** `reassignPhotos` (`PhotoRepository.ts:259-284`, `targetItemId|null`); `getNextCatalogNumber` MAX-over-all-rows at `ItemRepository.ts:103-114`.

**10. URL model "slug for nav, id for data".**
- *Decision:* Collection page URLs use a human **slug**; session/result URLs use per-collection **sequential numbers**; **never raw ULIDs** in user-facing URLs. The slug/number resolves the entity **only at the page boundary**; every downstream DB query, image/file URL, client fetch prop, redirect, and integrity guard uses the immutable ULID.
- *Rationale:* **Slugs are globally unique (not per-owner)** *because* per-owner numbering would make a shared link resolve to a different collection for each viewer. A **reserved-slug blocklist** (e.g. `new`) exists *because* `/collections/new` is a static route Next resolves **before** the dynamic `[id]`. The **§7 audit rule**: every `params.id` downstream is wrong unless (a) passed to the access guard or (b) used as a nav href.
- *Status:* **Shipped** (#190 collections / #197 sessions+results). `RESERVED_COLLECTION_SLUGS = new Set(["new"])` at `src/lib/collections/slug.ts:7`.

**11. E2E testing strategy.**
- *Decision:* **Playwright over Cypress** (first-class multi-device emulation — iPad-landscape / iPhone-13 / desktop, WebKit ≈ iOS Safari). Test the **production build** (`next build && next start`), not `next dev`. Use an **ephemeral Docker Postgres on `:5433`** with a **hard guard that refuses any non-local host** (so it can never hit a Neon branch). **Mock the `@vercel/blob` boundary**; drive **only the Credentials provider** in the gate (magic-link needs an inbox).
- *Rationale:* The TRUNCATE in `resetDb()` must never touch a real DB — so the guard is a **fail-closed allowlist** (host ∈ {localhost, 127.0.0.1, ::1}), correct-by-construction rather than a denylist of three known Neon hosts.
- *Status:* **Shipped.** Guard at `e2e/fixtures/db.ts:14-39`; port `:5433` at `db.ts:12`; Credentials-only login in `e2e/auth.spec.ts`; blob stubbed in `e2e/sort-images.spec.ts`. Middleware public paths (`api/auth|login|signup|shared`) at `src/middleware.ts:8`.

**12. Deferred-metadata TONE guardrails (NON-NEGOTIABLE).**
- *Decision:* When surfacing items that "could use details": **no counts of incompleteness, no completion %/progress bar, no warning styling**; **person-side copy** ("Add a name" / "Tell its story", never "Incomplete"/"Missing"); **"could use details" = `name IS NULL` only** (a name turns a row into a story; brand/material/dimensions are optional extras, not deficiencies).
- *Rationale:* A direct expression of TONE — invitation, never nag; one thing at a time; no shaming metrics. This is a tone contract, not a styling preference, hence non-negotiable.
- *Status:* **Shipped.** `filterItems` / `hasName` use name-only (`src/lib/items.ts:9,27-33`); the "Waiting for a name" filter is off-by-default and opt-in (`?unnamed=1`).

**13. Authorization direction.**
- *Decision:* Today: a shared `requireApiCollectionAccess` (member-or-owner) plus curator-ownership guards; **owner-without-a-membership-row is authorized**. Heading toward a **single DAL chokepoint** + an **Owner/Curator role collapse** replacing the 9 permission flags (epic `purses-pv9`). Reuse the two proven guard tiers now; defer the structural rewrite.
- *Rationale:* Close live IDOR holes first with the smallest reliable change; the heavier refactor is a separate, testable epic. The standing authz invariants — **do not store scores on `Item`; do not make role *names* the authz model; do not expose another curator's `DecisionEvents` in shared results** — live in the kept `purseinator_app_infra_spec.md` §18 and the share-visibility matrix §8.
- *Status:* **Shipped guards; chokepoint in flight.** `requireApiCollectionAccess` (404/403) at `src/server/dal/collection-access.ts:14-25`; `requireApiResultAccess` adds `result.curatorId === userId` at `:31-42`. The 9 `can*` flags are on the `memberships` table (`schema.ts:355-374`, incl. `canDeleteItems`).

### Rename story (PurseInator → Adored)

"PurseInator" was an **explicit placeholder** from the first design doc (2026-05-07). The substantive rename to **Adored** was planned 2026-06-09 and executed 2026-06-10 (#125, commit `26a501b`), scoped across three tiers — display brand (wordmark, footer, titles, copy), technical identifiers (`package.json` name → `adored`, env defaults), and living docs (README/PRODUCT/TONE/DESIGN/CLAUDE). Vercel points `adored.kimberlygarmoe.com` live; email sends from the already-verified apex `noreply@kimberlygarmoe.com` to avoid any Resend/DNS work.

**History was preserved on purpose:** the dated `docs/plans/*` files (which still say "PurseInator"), the beads **`purses-`** prefix, and the GitHub repo name **`purseinator-app`** were all left unchanged — renaming them would falsify the record. The name also fits the product thesis: the work is **affirmation** ("realizing what you love most"), so the things a person cherishes are *adored*, not inventoried.

---

## Where we're going

The current direction (live status is tracked in **beads** — those are the source of truth, not this list):

- **Finish the authorization overhaul** — the single DAL chokepoint and the Owner/Curator role collapse replacing the 9 boolean flags, with import-boundary + route-enumeration enforcement (epic **`purses-pv9`**).
- **Complete the gentle sort experience** per PRODUCT/TONE — a "letting go" / Onward results section, pause/defer affordances, and a zero-engagement set-aside bucket (redesign tracked in **`purses-o93`**).
- **Lean into the affirmation/story frame** — capture an item's sentimental story, a "who would love this?" rehome flow, reusable voice-capture input.
- **Quality / automation** — finish the **E2E phases** (make e2e a required check on `main`), automated a11y scanning, and visual-regression capture for UI PRs.

For anything specific, check beads (`bd ready`, `bd show <id>`) rather than trusting a doc — the detailed task list drifts.

---

## Reference deep-dives

These are the **kept** living references (the dated plan docs that produced the shipped features have been deleted; their rationale is captured above):

- **[`docs/purseinator_app_infra_spec.md`](purseinator_app_infra_spec.md)** — the domain model and invariants the code still implements: the entity model, the **9 membership permission flags**, the **share-visibility matrix (§8)**, **DB invariants (§11)**, the **purge contract (§11.4)** (note: purge is still a stub in code — see decision 13), and the **§18 "do-not" authz rules**. *(Scoring deltas here are superseded by decision 6 above.)*
- **[`docs/purseinator_mvp_api_spec.md`](purseinator_mvp_api_spec.md)** — the API contract (resource groups, endpoints, permission-flag names) the `src/server/api` + `src/app/api` route tree conforms to.
- **[`docs/plans/2026-06-10-bulk-upload-pool-design.md`](plans/2026-06-10-bulk-upload-pool-design.md)** — the parent design for the **photo-pool architecture** (whole-epic rationale for decisions 7–9 in one place).
- **[`docs/Adored_wireframes.pdf`](Adored_wireframes.pdf)** — wireframes; a **starting reference, not law** (per `CLAUDE.md`: deviate when a better flow serves the user; PRODUCT and TONE govern, not the wireframes).

# Docs audit, ARCHITECTURE.md, and cleanup — design

**Date:** 2026-06-18
**Type:** Documentation + repo hygiene (no product code changes).
**Source audit:** the read-only `docs-history-audit` workflow output (40 docs classified, 9-phase history reconstructed, beads triaged, root-doc freshness checked). Full data: `~/.claude/.../tasks/wggh4cq1m.output` (referenced by the implementation plan for rationale sourcing).

## Problem

`docs/` has accumulated 43 files over 6 weeks — mostly **execution plans/specs for work that has since shipped** and now lives in the code. They are stale (some actively misleading on load-bearing details), they bury the few living references, and they encode non-obvious *decisions* with no durable home. The four root governance docs are mostly fresh, but **README has setup-breaking drift**. There is no single doc that tells a newcomer (human or agent) where the project is, how it got here, and where it's going. The bead tracker carries 6 duplicate pairs + 1 obsolete bead.

## Decisions (locked with the user)

1. **Create a single `docs/ARCHITECTURE.md`** — the orientation source-of-truth. Sections: **Where we are** (architecture + shipped) → **How we got here** (9-phase narrative + a decisions log) → **Where we're going** (roadmap). It *links to* PRODUCT/TONE/DESIGN/README rather than absorbing them.
2. **Aggressive deletion (35 docs).** Delete the 30 shipped-and-superseded plans/specs + 2 abandoned onboarding docs + the 2 legacy `purseinator_*` top-level specs + `neon-migration.md`. **Keep 4** living references + update `DEPLOYMENT.md`.
3. **Targeted root-doc fixes.** Fix README's real drift (env-var names). PRODUCT + TONE are fresh — leave them. DESIGN is fresh (its `contrast.test.ts` ref is valid). Add a cross-link to `ARCHITECTURE.md` from each.

## Critical sequencing (the one rule that matters)

**Capture rationale before deleting.** `ARCHITECTURE.md`'s decisions log must record the non-obvious *why* from the plans being deleted **first**; only then are the plans removed. The audit already extracted each doc's `historicalValue` — that is the input. Order: write ARCHITECTURE.md → verify it captures the decisions → then delete.

## ARCHITECTURE.md — content design

Sourced from the audit (history phases + per-doc `historicalValue` + major decisions), verified against the live code (do not restate stale plan claims — verify before writing).

- **Where we are** — one-paragraph "what Adored is", the stack (Next.js 14 App Router, Drizzle, Neon/Postgres, NextAuth v4 JWT, Vercel Blob, Vitest), the layered architecture (App Router pages → API routes → controllers `src/server/api` → repositories `src/server/repositories` → Drizzle/Neon; DAL guards in `src/server/dal`; services in `src/server/services`; DecisionEvents as immutable truth), and the shipped feature list (collections, photo pool/bulk upload, sort sessions triage+pairwise, results/buckets, sharing, slug+number URLs, authz guards).
- **How we got here** — the 9 phases (MVP v1 → complete refactor Prisma→Drizzle → Neon/GitHub-Flow/e2e → design-system attempts → TONE-first + Luminous + sort model → **rename PurseInator→Adored** → bulk-upload/photo-pool → cards/covers/slugs/numbers → authz overhaul). Then a **decisions log** (lightweight, ADR-flavored but inline): each major decision + its rationale, distilled from the deleted plans. Must include at minimum: the blank-slate refactor (Prisma→Drizzle, service-first, DecisionEvents); auth = NextAuth v4 Credentials+Email, **JWT sessions (not DB sessions — the design said DB, the code pivoted to JWT)**, hard-delete users / soft-delete collections+items; the **`VERCEL=1`-in-`.env.local` Secure-cookie gotcha** (env hygiene rule); Neon branch-per-environment; TONE.md as first-order contract + Luminous design system; the sort-ranking model (single [0,1] score, band-center seeding, symmetric cross-tier override); upload-first/defer-metadata photo pool; "slug for nav, id for data"; the authz curator-scope + member-or-owner guard direction.
- **Where we're going** — the roadmap from live epics + PRODUCT intent: finish the authz overhaul (DAL chokepoint, Owner/Curator role collapse — epic `purses-pv9`), the gentle sort experience (`purses-o93` redesign, Onward/letting-go results, "set aside"), affirmation/story features (item story note, rehome), multi-curator independence + owner-controlled reveal, tone remediation (SessionAnalytics reframe), quality automation (axe-core a11y, visual-regression, E2E phases), photo background removal.

Length target: thorough but skimmable (headings + lists). Links: PRODUCT.md (why/users), TONE.md (voice), DESIGN.md (visual system), README.md (setup), and the kept reference docs.

## Docs changes

**DELETE (35):** all of `docs/plans/*` **except** `2026-06-09-visual-regression-screenshots.md` and `2026-06-10-bulk-upload-pool-design.md`; all of `docs/superpowers/plans/*` and `docs/superpowers/specs/*` from the shipped work (the 8 superpowers files: slugs plan+design, authz-hotfix plan, card-images plan+design, authz-api-cluster plan+design, urls-slugs-numbers plan — **but NOT this 2026-06-18 spec**); plus `docs/purseinator_mvp_api_spec.md` and `docs/purseinator_app_infra_spec.md`. (Exact list enumerated in the implementation plan, derived from the audit's DELETE set + the 3 reclassified KEEPs.)

**KEEP (4):** `docs/plans/2026-06-09-visual-regression-screenshots.md` (unshipped plan — live), `docs/plans/2026-06-10-bulk-upload-pool-design.md` (pool architecture reference), `docs/cookbook/add-images-to-pr.md`, `docs/Adored_wireframes.pdf`. (Link the pool-design + wireframes from ARCHITECTURE.md.)

**UPDATE:** `docs/DEPLOYMENT.md` — refresh against current deploy reality (verify env vars, Neon branches, Vercel config).

**Empty dirs:** after deletion, prune `docs/superpowers/specs/` only if empty (this new spec lives there until it too ships, so it likely won't be empty during the work).

## Root-doc changes

- **README.md** — fix the env-var instructions to the names the code validates (`AUTH_URL`/`AUTH_SECRET` per `src/lib/env.ts`, which bridges to `NEXTAUTH_*` internally — see the `auth-env-naming` memory). **Verify every other "fix" against reality before applying** — e.g. `cd purseinator-app` is *correct* (the repo/dir is still named that; only the brand is "Adored"); do not change correct facts. Add a top cross-link to `docs/ARCHITECTURE.md`.
- **DESIGN.md** — confirmed `src/lib/design/contrast.test.ts` exists; verify it runs in CI. Add a cross-link to ARCHITECTURE.md. No other change.
- **PRODUCT.md, TONE.md** — fresh. Add only a one-line cross-link to ARCHITECTURE.md (TONE remains first-order; the link must not imply ARCHITECTURE outranks it).

## Bead cleanup (independent of the git PR — bd is a separate Dolt DB)

Delete the 6 duplicate drops + 1 obsolete, per the audit (keep the audit's chosen survivor of each pair):
- dups → drop: `purses-11e` (keep 04q), `purses-8ez` (keep 0ld), `purses-dtw` (keep jj9), `purses-d9o` (keep gjr), `purses-3g1` (keep 44j), `purses-5me` (keep 06a).
- obsolete → `purses-bv5` ("KeepSide" interim name, never used).
Use `bd delete` (pure noise/obsolete; not worth a closed record). Verify each drop is the true duplicate (the newer one carries an embedded dup marker) before deleting. Also close the two `in_progress` beads that are actually done: `purses-jz4` already closed; ensure `purses-22d` reflects reality (it's mid-decision, leave open).

## Graphify rebuild

After the docs cleanup is committed, re-run the full graphify pipeline on the cleaned repo (Step 1–9). The graph then reflects the new ARCHITECTURE.md and the removed cruft. Discard the current half-built `graphify-out/` (it predates the cleanup). Commit the **durable artifacts** (`graph.json`, `graph.html`, `GRAPH_REPORT.md`, `cost.json`) and add a `graphify-out/.gitignore` (or root `.gitignore` entry) excluding the `.graphify_*` temp/interpreter/cache dotfiles. Confirm `graphify-out` is not otherwise ignored.

## Branch / PR / commit strategy

- New branch off `main`: `docs/architecture-and-cleanup` (abandon the stale `chore/graphify-repo-graph`; its only content is the throwaway graphify-out + the uncommitted CLAUDE.md, which travels with the checkout).
- **One PR** containing: `docs/ARCHITECTURE.md` (new), the 35 deletions, README/DESIGN/PRODUCT/TONE cross-links + README env fix, `DEPLOYMENT.md` update, the rebuilt graphify artifacts, and the user's `CLAUDE.md` change (Agent Modes + any graphify section).
- Bead deletions happen via `bd` (not in the git diff).
- Gates: this is docs + artifacts only — no product code changes, so `build`/`test:ci`/`test:db` should be unaffected (run `lint`/`build` as a sanity check that nothing imported a deleted file — nothing should, since these are docs). Verify no code references the deleted doc paths.
- Merge once CI green (squash), per the standing workflow.

## Out of scope

- No product code changes. No changes to the 4 root docs beyond README env fix + cross-links + DEPLOYMENT update.
- The deeper authz/UX epics (pv9, o93, etc.) — untouched; only referenced in the roadmap.
- purses-22d (the deferred sort-result sub-route decision) — remains open for later.

## Verification

- `docs/ARCHITECTURE.md` exists, covers all three sections, and its decisions log contains the specific rationale items listed above (JWT pivot, VERCEL cookie gotcha, sort model, slug-for-nav, etc.).
- No deleted doc's path is referenced by any kept file or by code (`grep`).
- README env vars match `src/lib/env.ts`. Cross-links resolve.
- 6 dup beads + bv5 deleted; `bd stats` reflects it.
- graphify rebuilds cleanly; `graph.json`/`GRAPH_REPORT.md` regenerated; temp dotfiles gitignored.
- `npm run build` + `npm run lint` clean (no accidental code impact).

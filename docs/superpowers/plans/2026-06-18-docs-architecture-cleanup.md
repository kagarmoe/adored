# Docs ARCHITECTURE.md + cleanup — Implementation Plan (v2, post adversarial-review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Create `docs/ARCHITECTURE.md` (state + history + decisions + roadmap), fix the four root docs (targeted), repoint 3 dangling references, delete **35** superseded docs, close 7 stale beads, rebuild the graphify graph — one PR off `docs/architecture-and-cleanup`.

**Architecture:** Capture decision rationale in ARCHITECTURE.md FIRST, then delete the plans it supersedes. Docs + artifacts only, with ONE authorized carve-out (3 one-line comment/link repoints). Bead closes run via `bd` (separate Dolt DB). Graph rebuilt last, on the cleaned tree.

**Tech Stack:** Markdown; `bd` (beads); graphify CLI (global skill `~/.claude/skills/graphify`).

## v2 changes (folded from the adversarial review — BLOCK verdict)

| Finding | Fix in v2 |
|---|---|
| The 2 legacy `purseinator_*` specs are NOT superseded (only written record of the 9 permission flags pv9 migrates, entity model, share-visibility matrix, DB invariants, **unbuilt purge contract** — `purgeCollection` is a TODO stub). | **Moved DELETE→KEEP** (user-confirmed). Net delete = 35. ARCHITECTURE.md links them. |
| 3 dangling references the plan wrongly claimed wouldn't exist: `playwright.config.ts:6`, `src/lib/design/tokens.ts:3` (code comments), `docs/plans/2026-06-09-visual-regression-screenshots.md:122` (kept doc) → all cite deleted docs. | **New Task 2 Step 4** repoints all 3 (authorized carve-out for 2 one-line code comments). |
| Decisions-list ~65–70% complete — missed cross-cutting gotchas. | **Task 1 decisions-list expanded** (neon no-txn/affected-count, Blob-localhost, e2e-never-Neon, deferred-metadata TONE prohibitions, slug whys, reassign hero rules). |
| Tautological completeness grep (greps the file you just wrote for words you just typed). | **Replaced with claim→code-anchor verification** (Task 1 Step 3). |
| README: vague "scan the rest"; concrete stale facts. | **Named exactly**: "8 tables"→15, "8 granular boolean flags"→9, magic-link presented as the working sign-in (it's credentials). |
| `git add -A docs` would sweep the untracked plan file; `cost.json` is ephemera; `graph.html` churn. | **Scoped `git add`**; commit the plan file by name; drop `cost.json`; report `graph.html` size; CLAUDE.md committed first. |
| Reference grep too narrow (`*.md/*.ts/*.tsx`). | **Broadened to `git ls-files`** (all tracked). |
| Bead hard-delete is irreversible (sync OFF); 5me/bv5 carry unique detail. | **`bd close` not `bd delete`** (user-confirmed). |

## Global Constraints

- **Branch:** `docs/architecture-and-cleanup` (spec committed `3ef35fe`). Never commit to `main`.
- **No product-code changes EXCEPT one authorized carve-out:** repoint exactly two 1-line code comments (`playwright.config.ts:6`, `src/lib/design/tokens.ts:3`) that cite deleted docs. No behavioral code changes.
- **Sequencing rule:** ARCHITECTURE.md (Task 1) written + verified to contain the decision rationale BEFORE deletions (Task 3). Dangling-ref repoints (Task 2 Step 4) BEFORE deletions.
- **Audit source for rationale/history:** `/private/tmp/claude-501/-Users-kimberlygarmoe-repos-purseinator-app/f397d704-20eb-49a0-896a-c8d2474d8ce3/tasks/wggh4cq1m.output` (`result.history`, each `result.docs.delete[].historicalValue`, `result.state`). **Verify every architectural claim against live code before writing** — the deleted plans are often stale.
- **DELETE = 35.** KEEP: `docs/plans/2026-06-09-visual-regression-screenshots.md`, `docs/plans/2026-06-10-bulk-upload-pool-design.md`, `docs/cookbook/add-images-to-pr.md`, `docs/Adored_wireframes.pdf`, `docs/DEPLOYMENT.md` (updated), **`docs/purseinator_app_infra_spec.md`**, **`docs/purseinator_mvp_api_spec.md`**, `docs/superpowers/specs/2026-06-18-docs-architecture-cleanup-design.md`, `docs/superpowers/plans/2026-06-18-docs-architecture-cleanup.md` (this plan), plus new `docs/ARCHITECTURE.md`.
- **README rule:** code validates `AUTH_URL`/`AUTH_SECRET` (`src/lib/env.ts:11-12`, bridges to `NEXTAUTH_*` at `:60-61`). `cd purseinator-app` is CORRECT — do not change.
- **TONE.md is first-order** — its cross-link must not imply ARCHITECTURE outranks it.
- **Verification = grep for dangling refs (all tracked files), claim→code-anchor spot-checks, exact file counts, `npm run build`/`lint` as a no-regression sanity check, graphify rebuild success.**

---

### Task 1: Author `docs/ARCHITECTURE.md` (rationale capture — gates deletion)

**Files:** Create `docs/ARCHITECTURE.md`.

- [ ] **Step 1: Gather + verify**

Read the audit JSON (history phases, every `docs.delete[].historicalValue`, state). VERIFY architecture against live code (do not trust plan claims): `package.json`, `src/lib/db/schema.ts` (15 `pgTable`s), `src/lib/auth.ts:124` (`session.strategy:"jwt"`), `src/lib/env.ts` (AUTH_* names + VERCEL guard), `src/server/{api,repositories,services,dal}`, `src/server/api/{items,collections}.ts` (the `purge*` TODO stubs).

- [ ] **Step 2: Write the doc**

Sections (skimmable, headings + lists):

**`# Adored — Architecture & Project History`** + intro linking PRODUCT.md (why), TONE.md (voice, first-order), DESIGN.md (visual), README.md (setup), and the kept reference specs.

**`## Where we are`** — what Adored is; stack (Next.js 14 App Router, TS strict, Drizzle+Neon/Postgres `postgres` driver, NextAuth v4 JWT, Vercel Blob, Vitest, Playwright, Vercel); layered architecture (App Router → `src/app/api` routes → `src/server/api` controllers → `src/server/repositories` → Drizzle/Neon; DAL guards `src/server/dal`; services; DecisionEvents immutable; `schema.ts`); shipped features (verified list).

**`## How we got here`**
- *Timeline (9 phases)* — from the audit, each: period — title — 2-3 sentences.
- *Decisions log* — one entry each (**Decision / Rationale / Status**). MUST include ALL of:
  1. Blank-slate refactor: Prisma→Drizzle, service-first, DecisionEvents immutable.
  2. Auth: NextAuth v4 Credentials (email+password+bcrypt) + Email magic-link; **JWT sessions not DB** (design said DB; code pivoted); NextAuth schema forced renaming legacy `users` + hard-delete users / soft-delete collections+items; **prod magic-link never wired** (dev console-log only).
  3. **`VERCEL=1`-in-`.env.local` Secure-cookie gotcha**: `vercel env pull` writes VERCEL system vars → NextAuth emits `__Secure-` cookie browsers drop over `http://localhost` → middleware sees no session → bounced to /login. Rule: never let `VERCEL*` live in `.env.local`; neutralize in the Playwright env block; do NOT override `useSecureCookies` (keep prod Secure detection).
  4. Neon branch-per-environment (prod=main, dev=development).
  5. TONE.md first-order; Luminous design system accountable to it; "Brand never speaks Danger"; tier "Release"→"Onward" rename.
  6. Sort-ranking model: single [0,1] score, band centers (0.875/0.625/0.375/0.125), pairwise win +0.10 / loss −0.05, affirmation bias.
  7. Photo flow: upload-first into a durable per-collection pool, defer metadata, promote into grouped numbered items. **neon-http has NO transactions → create-item-then-assign-photos ordering (only partial failure = harmless empty item) + a single guarded `UPDATE … WHERE item_id IS NULL AND deleted_at IS NULL` whose affected-row-count vs requested-count IS the IDOR/double-assign guard + hero folded into the same UPDATE + `MAX(number)+1` with retry-on-23505 (no txn to lock).**
  8. **Vercel Blob client-upload**: bypasses the 4.5MB serverless cap; the durable photos row is written ONLY in the server `onUploadCompleted` callback trusting the signed `tokenPayload` (never the client) — **and that callback cannot reach localhost, so the full path is only verifiable on a Vercel preview**; `recordPooledPhoto` extracted so the row-write is DB-testable.
  9. **Reassign = one operation** (existing item=move, new item=split, NULL=return-to-pool) with hero-reconciliation rules (moved photos non-hero on target; first moved = hero of a new item; pool clears hero; a source losing its hero but keeping photos auto-promotes its first remaining; **empty source items are left, not auto-deleted — for predictability**); `getNextCatalogNumber` maxes over soft-deleted rows too (a tombstoned number is never reused).
  10. URL model "slug for nav, id for data": collection slugs + session/result sequential numbers, never raw ULIDs. **Slugs are globally unique (not per-owner) BECAUSE per-owner numbers would make a shared link resolve to different collections per viewer; a reserved-slug blocklist (e.g. `new`) exists BECAUSE `/collections/new` is a static route Next resolves before the dynamic `[id]`. The §7 audit rule: every `params.id` downstream is wrong unless (a) passed to the access guard or (b) used as a nav href.**
  11. **E2E testing strategy**: Playwright over Cypress (iPad-landscape/iPhone-13/desktop, WebKit≈iOS Safari); test the production build (`next build && next start`); **ephemeral Docker Postgres on :5433 with a hard guard that throws if the connection string resolves to a Neon host** (never a Neon branch); mock the `@vercel/blob` boundary; drive only the Credentials provider in the gate.
  12. **Deferred-metadata TONE guardrails (NON-NEGOTIABLE)**: no counts, no %/progress bar, no warning styling; person-side copy ("Add a name", never "Incomplete"/"Missing"); "could use details" = `name IS NULL` only.
  13. Authz direction: shared `requireApiCollectionAccess` (member-or-owner) + curator-ownership guards; heading toward a single DAL chokepoint + Owner/Curator role collapse (epic purses-pv9). **The standing authz invariants (do-not store scores on Item; do-not make role names the authz model; do-not expose another curator's DecisionEvents in shared results) live in the kept `purseinator_app_infra_spec.md` §18 and the share-visibility matrix §8 — link them.**

**`## Where we're going`** — KEEP THIN: 3-4 *themes* + "live status in beads (see purses-pv9 authz, purses-o93 sort redesign, the E2E phases)". Do NOT paste a detailed task list (it drifts; beads are the source of truth).

**`## Reference deep-dives`** — link the KEPT docs: `purseinator_app_infra_spec.md` (domain model, permission flags, visibility matrix, DB invariants, purge contract), `purseinator_mvp_api_spec.md` (API contract), `bulk-upload-pool-design.md` (photo-pool architecture), `Adored_wireframes.pdf`.

- [ ] **Step 3: Verify claims against code (not tautological)**

For each decision, confirm the claim has a real code anchor (spot-check ≥5): JWT→`src/lib/auth.ts:124`; VERCEL guard→`src/lib/env.ts`; AUTH_* bridge→`src/lib/env.ts:60-61`; affected-count guard→grep the pool/reassign repo for the guarded `UPDATE`; purge-is-a-stub→`src/server/api/collections.ts` `purgeCollection`. If a claim has no code anchor and isn't explicitly "design said X but code does Y", reword or drop it. Confirm links to PRODUCT/TONE/DESIGN/README + the 2 kept specs resolve (files exist).

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add ARCHITECTURE.md (state, 9-phase history, decisions log, roadmap)"
```

---

### Task 2: Root-doc fixes + cross-links + repoint dangling refs

**Files:** `README.md`, `DESIGN.md`, `PRODUCT.md`, `TONE.md`, `docs/DEPLOYMENT.md`, `playwright.config.ts`, `src/lib/design/tokens.ts`, `docs/plans/2026-06-09-visual-regression-screenshots.md`.

- [ ] **Step 1: README — fix the named stale facts**

In `README.md`: (a) lines ~42-43 + ~193-194: `NEXTAUTH_URL`/`NEXTAUTH_SECRET` → `AUTH_URL`/`AUTH_SECRET`; add a one-line note "bridged to `NEXTAUTH_*` internally (`src/lib/env.ts`)". (b) line 158 "8 tables" → 15 (or reword to avoid a brittle count: "the Drizzle schema (`src/lib/db/schema.ts`)"). (c) line 172 "8 granular boolean flags" → 9 (matches the `can*` columns). (d) line 146 "NextAuth v4 with email magic-link provider" → describe the **actual** sign-in: email+password (Credentials) primary; magic-link present but prod email not wired. Do NOT touch `cd purseinator-app` (correct).

- [ ] **Step 2: Cross-links**

Add one line near the top of `README.md`, `PRODUCT.md`, `DESIGN.md`, `TONE.md` linking `docs/ARCHITECTURE.md`. For TONE.md phrase as "Background/architecture context: docs/ARCHITECTURE.md" (must not imply it outranks the tone contract).

- [ ] **Step 3: DEPLOYMENT.md — bounded check (legit no-op allowed)**

```bash
grep -nE "NEXTAUTH_|ep-old-meadow|ep-empty-mode|purseinator|PurseInator|proud-surf" docs/DEPLOYMENT.md
```
Fix only confirmed mismatches against `src/lib/env.ts` + the `neon-db-setup` memory (Neon branches: prod=main host ep-empty-mode, dev=development host ep-old-meadow). If nothing is stale, leave it untouched and note "DEPLOYMENT.md verified current, no change".

- [ ] **Step 4: Repoint the 3 dangling references (authorized carve-out)**

```
playwright.config.ts:6   "// layout.spec.ts. See docs/plans/2026-05-30-e2e-ui-testing.md."
                       → "// layout.spec.ts. See docs/ARCHITECTURE.md (testing strategy)."
src/lib/design/tokens.ts:3  "// See docs/plans/2026-06-09-luminous-design-system-design.md."
                          → "// See DESIGN.md (the Luminous design system)."
docs/plans/2026-06-09-visual-regression-screenshots.md:122 (KEPT doc)
   "- `docs/plans/2026-05-30-e2e-ui-testing.md` (existing e2e plan)."
 → "- `docs/ARCHITECTURE.md` (testing strategy / decisions log)."
```
These are the ONLY code edits; both are 1-line comments, no behavior change.

- [ ] **Step 5: Verify + commit**

```bash
grep -n "NEXTAUTH_URL\|NEXTAUTH_SECRET" README.md   # expect: only the explanatory bridge note, not setup
git add README.md DESIGN.md PRODUCT.md TONE.md docs/DEPLOYMENT.md playwright.config.ts src/lib/design/tokens.ts docs/plans/2026-06-09-visual-regression-screenshots.md
git commit -m "docs: fix README facts, cross-link ARCHITECTURE.md, repoint refs off to-be-deleted plans"
```

---

### Task 3: Delete the 35 superseded docs (after Tasks 1-2)

- [ ] **Step 1: Safety pre-check (broadened ref grep)**

Confirm ARCHITECTURE.md exists w/ the decisions log, and the 3 repoints (Task 2 Step 4) are committed. Build the 35-list and check references across ALL tracked files:

```bash
cat > /tmp/del35.txt <<'EOF'
docs/plans/2026-05-14-onboarding-flow-design.md
docs/plans/2026-05-14-onboarding-flow.md
docs/plans/2026-05-29-phase-3-api-routes.md
docs/plans/2026-05-29-phase-4-react-ui.md
docs/plans/2026-05-29-purseinator-complete-refactor-design.md
docs/plans/2026-05-29-purseinator-complete-refactor-implementation.md
docs/plans/2026-05-30-e2e-ui-testing.md
docs/plans/2026-05-30-neon-migration.md
docs/plans/2026-05-30-purseinator-auth-design.md
docs/plans/2026-05-30-purseinator-auth-implementation.md
docs/plans/2026-05-30-repo-cruft-cleanup.md
docs/plans/2026-05-30-ui-implementation-design.md
docs/plans/2026-05-30-ui-implementation-plan.md
docs/plans/2026-06-01-auth-middleware-env-fix-design.md
docs/plans/2026-06-09-luminous-design-system-design.md
docs/plans/2026-06-09-luminous-design-system-plan.md
docs/plans/2026-06-09-rename-to-adored.md
docs/plans/2026-06-09-sort-ranking-model-design.md
docs/plans/2026-06-09-sort-ranking-model-plan.md
docs/plans/2026-06-10-bulk-upload-plan-1-schema.md
docs/plans/2026-06-13-bulk-upload-plan-2-pool-upload.md
docs/plans/2026-06-13-bulk-upload-plan-3a-catalog-urls.md
docs/plans/2026-06-13-bulk-upload-plan-3b-grouping-design.md
docs/plans/2026-06-13-bulk-upload-plan-3b-grouping.md
docs/plans/2026-06-14-bulk-upload-plan-4-deferred-metadata-design.md
docs/plans/2026-06-14-bulk-upload-plan-4-deferred-metadata.md
docs/plans/2026-06-14-pool-grouping-move-photos.md
docs/superpowers/plans/2026-06-15-short-collection-slugs.md
docs/superpowers/plans/2026-06-16-authz-hotfix-uxh.md
docs/superpowers/plans/2026-06-16-card-images-nkp.md
docs/superpowers/plans/2026-06-17-authz-api-cluster.md
docs/superpowers/plans/2026-06-17-urls-slugs-numbers-9hl.md
docs/superpowers/specs/2026-06-15-short-collection-slugs-design.md
docs/superpowers/specs/2026-06-16-card-images-nkp-design.md
docs/superpowers/specs/2026-06-17-authz-api-cluster-design.md
EOF
wc -l /tmp/del35.txt   # expect 35  (NOTE: the 2 purseinator_*_spec.md are NOT here — kept)
# reference check across ALL tracked files (not just md/ts):
for f in $(cat /tmp/del35.txt); do base=$(basename "$f"); git ls-files | grep -vFf /tmp/del35.txt | xargs grep -l "$base" 2>/dev/null; done | sort -u | grep -v "^.beads/issues.jsonl$" || true
```
Expected: prints nothing except possibly `.beads/issues.jsonl` (a passive bead export — benign, filtered above). If any other kept file/code prints, repoint it first.

- [ ] **Step 2: Delete**

```bash
git rm $(cat /tmp/del35.txt | tr '\n' ' ')
rmdir docs/superpowers/plans 2>/dev/null || true   # stays non-empty (this plan lives here) — harmless
```

- [ ] **Step 3: Verify counts**

```bash
find docs -name "*.md" | sort
# Expect exactly 8 md: ARCHITECTURE.md, DEPLOYMENT.md, cookbook/add-images-to-pr.md,
# plans/2026-06-09-visual-regression-screenshots.md, plans/2026-06-10-bulk-upload-pool-design.md,
# purseinator_app_infra_spec.md, purseinator_mvp_api_spec.md,
# superpowers/specs/2026-06-18-...-design.md, superpowers/plans/2026-06-18-...-cleanup.md
# (9 md once ARCHITECTURE + both 2026-06-18 files are counted) + Adored_wireframes.pdf
npm run build 2>&1 | tail -3 && npm run lint 2>&1 | tail -3   # no-regression sanity (no code path deleted)
```

- [ ] **Step 4: Commit (scoped, not -A)**

```bash
git rm already staged the deletions; commit them:
git commit -m "docs: delete 35 superseded plans/specs (rationale preserved in ARCHITECTURE.md; legacy specs kept)"
```

---

### Task 4: Bead cleanup — `bd close` (recoverable), not delete

- [ ] **Step 1: Verify each is the true duplicate / obsolete**

```bash
for id in purses-11e purses-8ez purses-dtw purses-d9o purses-3g1 purses-5me purses-bv5; do echo "=== $id ==="; bd show "$id" 2>&1 | head -10; done
```
Confirm 11e/8ez/dtw/d9o/3g1/5me are dup-of survivors 04q/0ld/jj9/gjr/44j/06a (embedded dup marker), and bv5 is obsolete ("KeepSide", never used).

- [ ] **Step 2: Preserve uniques, then close**

`purses-5me` has detail `purses-06a` lacks — append it to 06a first:
```bash
bd comment purses-06a "Merged from duplicate purses-5me before closing it: <copy 5me's unique notes — rejected aj-geddes skill, getDb()/no-Proxy NextAuth rule, nanoid PKs>"
```
Then close all 7 with a reason (recoverable; bd↔GitHub sync is OFF so delete would be unrecoverable):
```bash
for pair in "purses-11e:purses-04q" "purses-8ez:purses-0ld" "purses-dtw:purses-jj9" "purses-d9o:purses-gjr" "purses-3g1:purses-44j" "purses-5me:purses-06a"; do id="${pair%%:*}"; keep="${pair##*:}"; bd close "$id" --reason "Duplicate of ${keep}" 2>&1 | tail -1; done
bd close purses-bv5 --reason "Obsolete — interim name 'KeepSide' never used; product settled on 'Adored'" 2>&1 | tail -1
bd stats 2>&1 | grep -E "Open|Closed"
```
(If `bd close` lacks `--reason`, use `bd update <id> --status closed` + a `bd comment`.) No git commit — bd manages its own DB.

---

### Task 5: Graphify rebuild (lean artifact set)

- [ ] **Step 1: Rebuild on the cleaned tree**

Invoke the global `/graphify` skill on the repo (full pipeline). Parameters that matter for reproducibility: skip the 11 CC0 e2e photo fixtures (`e2e/fixtures/photos/*` — test data, no semantic value); the semantic cache will hit unchanged docs; only `ARCHITECTURE.md` + changed root docs re-extract. End state: `graph.json`, `graph.html`, `GRAPH_REPORT.md`, `cost.json` regenerated.

- [ ] **Step 2: gitignore temp + ephemera; report html size**

```bash
cat > graphify-out/.gitignore <<'EOF'
# transient graphify state + per-run ephemera — keep only the durable graph artifacts
.graphify_*
.chunklist_*
.noncode.txt
.detect_err
cache/
cost.json
EOF
ls -lh graphify-out/graph.html graphify-out/graph.json graphify-out/GRAPH_REPORT.md
```
Report `graph.html` size. If >2MB, ask the user before committing it (else gitignore it too and commit only `graph.json` + `GRAPH_REPORT.md`).

- [ ] **Step 3: Commit durable artifacts (scoped)**

```bash
git add graphify-out/.gitignore graphify-out/graph.json graphify-out/GRAPH_REPORT.md
git add graphify-out/graph.html   # only if size acceptable / user-approved
git commit -m "chore: add graphify knowledge graph of the repo (post-cleanup)"
```

---

### Task 6: Commit CLAUDE.md (first) + plan + push + PR + merge

- [ ] **Step 1: Commit the plan file (kept) — it isn't tracked yet**

```bash
git add docs/superpowers/plans/2026-06-18-docs-architecture-cleanup.md
git commit -m "docs: implementation plan for ARCHITECTURE.md + cleanup"
```
(Do this before the deletions if executing strictly in order; if already past Task 3, the plan file is still untracked and safe — commit it now. Either way, never rely on `git add -A`.)

- [ ] **Step 2: Commit the user's CLAUDE.md change**

```bash
git add CLAUDE.md
git commit -m "chore: CLAUDE.md — agent model policy + graphify integration"
```
Commit as-is (user's edit; do not author/alter).

- [ ] **Step 3: Sanity gates**

```bash
npm run build 2>&1 | tail -3
npm run lint 2>&1 | tail -3
```
Both clean (docs + 2 comment repoints only). Skip test:db (no DB code changed).

- [ ] **Step 4: Push + PR**

```bash
git push -u origin docs/architecture-and-cleanup
gh pr create --base main --title "docs: ARCHITECTURE.md + prune 35 superseded docs + repo knowledge graph" --body "<summary: ARCHITECTURE.md w/ decisions log; 35 deletions (legacy specs kept); 3 refs repointed; README facts fixed; 7 beads closed; graphify graph>"
```

- [ ] **Step 5: Merge when green** — E2E should SKIP (the 2 comment-only code edits don't touch UI paths; confirm). Squash-merge once required checks pass; sync `main`; report.

---

## Self-Review (v2)

**Review findings → all addressed:** legacy specs kept (DELETE→35) ✅; 3 dangling refs repointed (Task 2 Step 4) ✅; decisions-list expanded with the 6 missing gotchas (items 7-12) ✅; tautological grep replaced w/ claim→anchor (Task 1 Step 3) ✅; README facts named exactly (Task 2 Step 1) ✅; scoped git adds + plan-file committed + cost.json dropped + html size-gated + CLAUDE.md first ✅; ref grep broadened to `git ls-files` ✅; `bd close` not delete + 5me detail preserved ✅; roadmap kept thin w/ bd pointer ✅; DEPLOYMENT bounded w/ no-op ✅.

**Placeholder scan:** ARCHITECTURE.md content has authoring brackets with the exact required items enumerated (decisions 1-13) — instructions, not TODOs. The `<copy 5me's notes>` in Task 4 Step 2 and the PR `<summary>` are filled at execution from the named source. No vague placeholders.

**Consistency:** DELETE=35 (the 2 `purseinator_*` specs excluded from the list and named in KEEP). Final docs count = 9 md + 1 pdf. Bead IDs consistent. Audit path consistent.

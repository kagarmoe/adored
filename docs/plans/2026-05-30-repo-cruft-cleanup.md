# Repo Cruft Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all leftover files from the pre-refactor app so the repo contains only the last-24-hour refactor plus `/docs`.

**Architecture:** The app was rebuilt from a blank slate on 2026-05-29 19:13 (commit `3342e84`) into a `src/`-based Next.js App Router layout. A handful of old root-level files survived the wipe and are unreferenced by `src/`. We delete them in small, individually-verified commits, never touching active infra (`.beads/`, `.claude/`, wired-up `scripts/`).

**Tech Stack:** Next.js 14 (App Router, `src/`), Drizzle ORM, NextAuth v4, git.

**Safety rule for every task:** before deleting a file, confirm zero references with `grep -rn "<basename>" src/ package.json *.mjs *.ts 2>/dev/null`. If anything references it, STOP and report.

**Verification baseline:** `npm run build` currently succeeds and emits `/` + all 23 pages. After each deletion batch, the build must still succeed.

---

## Phase 1 — Delete tracked pre-refactor cruft

### Task 1: Remove old root-level onboarding components

**Files:**
- Delete: `components/onboarding/CollectionPicker.tsx`
- Delete: `components/onboarding/OnboardingScreen.tsx`

**Step 1:** Confirm unreferenced.
Run: `grep -rn "OnboardingScreen\|CollectionPicker" src/ 2>/dev/null`
Expected: no output.

**Step 2:** Delete and remove the now-empty dir.
Run: `git rm components/onboarding/CollectionPicker.tsx components/onboarding/OnboardingScreen.tsx`

**Step 3:** Commit.
```bash
git commit -m "clean: remove pre-refactor root onboarding components (unused)"
```

### Task 2: Remove old testing guide

**Files:**
- Delete: `TESTING.md` (root — "Operator MVP" guide for the old app)

**Step 1:** Confirm unreferenced.
Run: `grep -rn "TESTING.md" . --include=*.md --include=*.json -l 2>/dev/null | grep -v node_modules`
Expected: no meaningful references (ignore this plan file).

**Step 2:** Delete.
Run: `git rm TESTING.md`

**Step 3:** Commit.
```bash
git commit -m "clean: remove old Operator-MVP TESTING.md"
```

### Task 3: Remove old CI / smoke scripts

**Files:**
- Delete: `scripts/setup-branch-protection.sh`
- Delete: `scripts/smoke.mjs`

**Keep (do NOT touch):** `scripts/migrate.ts`, `scripts/verify-auth.ts`, `scripts/load-env.js` — all referenced by `package.json` (`db:migrate`, `auth:verify`).

**Step 1:** Confirm unreferenced by package.json or code.
Run: `grep -rn "setup-branch-protection\|smoke.mjs\|smoke" package.json src/ 2>/dev/null`
Expected: no output.

**Step 2:** Delete.
Run: `git rm scripts/setup-branch-protection.sh scripts/smoke.mjs`

**Step 3:** Commit.
```bash
git commit -m "clean: remove old CI branch-protection + smoke scripts"
```

### Task 4: Remove superseded infra.yaml

**Files:**
- Delete: `infra.yaml` (root — superseded by `docs/purseinator_app_infra_spec.md`)

**Step 1:** Confirm unreferenced.
Run: `grep -rn "infra.yaml" src/ package.json scripts/ 2>/dev/null`
Expected: no output.

**Step 2:** Delete.
Run: `git rm infra.yaml`

**Step 3:** Commit.
```bash
git commit -m "clean: remove old infra.yaml (superseded by docs/purseinator_app_infra_spec.md)"
```

### ✅ Phase 1 checkpoint — Ready to proceed?
Run: `npm run build` → expect success with `/` + all 23 pages. Report before Phase 2.

---

## Phase 2 — Commit already-staged deletions — ✅ ALREADY DONE

Verified `2026-05-30`: `docs/plans/2026-05-07-purseinator-app.md`,
`docs/plans/2026-05-07-purseinator-app-design.md`, and `vitest.config.ts`
are gone from disk **and** untracked (`disk:N git:N`). They were deleted and
committed earlier in the session. No action required.

---

## Phase 3 — Track the new docs — ✅ ALREADY DONE

Verified `2026-05-30`: `docs/PurseInator_wireframes.pdf`,
`docs/purseinator_app_infra_spec.md`, and `docs/purseinator_mvp_api_spec.md`
are already tracked (`git ls-files`). The only new doc still untracked is this
plan itself — add it in Task 6.

### Task 6: Track this cleanup plan

**Files:**
- Add: `docs/plans/2026-05-30-repo-cruft-cleanup.md` (this plan)

**Step 1:** Add and commit.
```bash
git add docs/plans/2026-05-30-repo-cruft-cleanup.md
git commit -m "docs: add repo cruft cleanup plan"
```

### ✅ Phase 3 checkpoint — Ready to proceed?

---

## Phase 4 — Remove untracked local debugging junk

These are NOT in git (local working-tree only, mostly gitignored). They are this-session debugging artifacts. Plain `rm`, no git.

### Task 7: Delete this-session local debugging env files

**Files (untracked, gitignored — verified present on disk 2026-05-30):**
- `.env.local.backup` — disposable backup I made while debugging
- `.env.production.local` — pulled via `vercel env pull` during debugging

**KEEP:** `.env.development.local` (your real local dev env) and `.env.example`
(tracked). `.gitignore` already covers `.env*` (with `!.env.example`), so no
`.gitignore` change is needed. (Note: `docs/PtmpA.md` and `.env.production.local2`
from an earlier draft do **not** exist — nothing to remove.)

**Step 1:** Confirm they're untracked.
Run: `git status --porcelain --ignored | grep -E '\.env\.(local\.backup|production\.local)$'`

**Step 2:** Delete the disposable ones (plain `rm`, not git).
Run: `rm -f .env.local.backup .env.production.local`

**Step 3:** Confirm clean.
Run: `git status --short` → expect no new changes (these were never tracked).

### ✅ Phase 4 checkpoint — Final verification

---

## Final Verification

1. `npm run build` — success, `/` + all 23 pages.
2. `git status` — clean except intentionally-kept untracked local env files.
3. `git log --oneline -8` — shows the cleanup commits.
4. Optional: redeploy / confirm production still serves `https://purseinator.kimberlygarmoe.com/` (HTTP 200).

---

## Full Checklist

Remaining actionable work:
- [ ] Task 1: rm `components/onboarding/*` (CollectionPicker, OnboardingScreen)
- [ ] Task 2: rm `TESTING.md`
- [ ] Task 3: rm `scripts/setup-branch-protection.sh`, `scripts/smoke.mjs`
- [ ] Task 4: rm `infra.yaml`
- [ ] Phase 1 checkpoint: `npm run build` passes
- [ ] Task 6: `git add` this plan doc
- [ ] Task 7: rm untracked local env backups + `docs/PtmpA.md`; verify `.gitignore`
- [ ] Final: build passes, git status clean, prod 200

Already complete (verified 2026-05-30):
- [x] Phase 2: `docs/plans/2026-05-07-*.md` and `vitest.config.ts` removed + committed
- [x] Phase 3: `docs/PurseInator_wireframes.pdf`, `purseinator_app_infra_spec.md`, `purseinator_mvp_api_spec.md` tracked

## Explicitly KEEP (not cruft)

- `.beads/` (all) — active task tracking; hooks run each session
- `.claude/settings.json` — Claude Code project config
- `scripts/migrate.ts`, `scripts/verify-auth.ts`, `scripts/load-env.js` — wired into `package.json`
- `next.config.mjs`, `tsconfig.json`, `package.json`, `tailwind`/`postcss` configs, `drizzle/` — active build/runtime config

# Neon Database + Branch-per-Environment Plan

> **STATUS (2026-06-01): LARGELY EXECUTED — kept for history.** What actually shipped differs from the original plan below in a few ways:
> - **Neon DB branches:** `main` (the primary/production database) and `development` (schema-only, used by local dev AND all Vercel preview deploys). The original called the primary `production`; in Neon it's `main`.
> - **No per-PR ephemeral DB branches.** We deliberately chose the simplest design that protects prod: scope `DATABASE_URL` so **Production → `main` DB** and **all Previews → `development` DB**. Prod is unreachable from any non-production deploy. (The Neon GitHub Action `neon_workflow.yml` that would create `preview/*` branches was removed.)
> - **Git branches:** the `dev` git branch was dropped — the project uses **GitHub Flow** (feature → PR → `main`). "Development branch" in this doc refers to the Neon *database* branch `development`, not a git branch.
> - **Prod schema:** `main` DB was migrated from the old Prisma schema to the Drizzle schema; old tables + data dropped.
> - **e2e** uses an **ephemeral Postgres** (not a Neon branch) — see `2026-05-30-e2e-ui-testing.md`.
>
> Terminology note for the original text below: "dev branch" / "development branch" = the Neon `development` **database** branch; "production branch" = the Neon `main` database branch.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Neon the system of record with **isolated databases per environment** so local dev and preview deploys can never read or write production data.

**Architecture (as shipped):** One Neon project, two database branches: `main` (primary / production data) and a long-lived `development` branch used by **both** local dev and all Vercel preview deploys. `DATABASE_URL` is scoped in Vercel so Production → `main` and Preview → `development`; local `.env.local` points at `development`. No per-PR ephemeral branches. Drizzle migrations apply per branch. The app connects via `postgres-js` using a single `DATABASE_URL` (`src/lib/db.ts:5`), so no app-code change was required — this is configuration only.

**Tech Stack:** Neon (serverless Postgres), Vercel env vars, Drizzle ORM + `drizzle-kit`, `postgres-js`.

---

## Context (read first)

- The production DB is **already Neon** (Vercel's Postgres integration migrated to Neon; env shows `NEON_PROJECT_ID`, `POSTGRES_*`, `DATABASE_URL`). So this is **not** a data-platform migration — it's establishing **branch isolation** so "dev writes prod" can't happen again.
- Tonight's incident: `vercel env pull --environment=production` put the prod connection string into `.env.local`. We disabled it; `DATABASE_URL` now points at a local placeholder. This plan replaces that placeholder with a proper **Neon dev branch**.
- The app reads only `DATABASE_URL`. The extra `POSTGRES_*`/`PG*` vars are Vercel-integration metadata and are unused by app code.

**If the intent is instead to migrate OFF some other DB onto Neon:** Phase 1 still applies; add a `pg_dump | psql` data-copy task before cutover. Flagged in Task 9.

---

## Phase 1 — Establish Neon branches

### Task 1: Confirm Neon project + production branch
**Steps:**
1. Install Neon CLI: `npm i -g neonctl` (or use the Neon console).
2. `neonctl auth` (interactive — needs human; run via `! neonctl auth`).
3. `neonctl projects list` → record the project id (matches `NEON_PROJECT_ID`).
4. `neonctl branches list --project-id <id>` → confirm the `production` (primary) branch.
**Verify:** the primary branch's connection host matches the production `POSTGRES_HOST`.
**Commit:** docs only — none.

### Task 2: Create a persistent `development` branch
**Steps:**
1. `neonctl branches create --project-id <id> --name development --parent production`
   (branches from prod schema+data — fast copy-on-write; isolated thereafter).
2. `neonctl connection-string development --project-id <id> --pooled` → the dev `DATABASE_URL`.
**Verify:** connecting to the dev branch shows the same tables but writes do NOT appear on production.
**Commit:** none.

### Task 3: Wire local dev to the `development` branch
**Files:** `.env.local` (gitignored)
**Steps:**
1. Replace the placeholder `DATABASE_URL=postgresql://localhost:5432/purseinator` with the **dev branch** pooled connection string.
2. Keep `AUTH_URL=http://localhost:3000`, `AUTH_SECRET`.
3. Leave prod `POSTGRES_*`/`BLOB_*` commented (`#PROD_DISABLED`).
**Verify:** `npm run dev` boots; `npm run db:migrate` applies cleanly to the dev branch; a row created locally is absent from production.
**Commit:** none (local only).

### ✅ Phase 1 checkpoint — Ready to proceed?

---

## Phase 2 — Per-environment env vars in Vercel

### Task 4: Scope `DATABASE_URL` correctly in Vercel
**Steps:**
1. **Production** env: `DATABASE_URL` = production branch (already set).
2. **Development** env: set `DATABASE_URL` = the `development` branch (so `vercel env pull` for dev no longer pulls prod). Also add `AUTH_URL`, `AUTH_SECRET`, `DATABASE_URL` to Development so local pulls are complete and safe.
   `vercel env add DATABASE_URL development` (paste dev branch string).
**Verify:** `vercel env pull .env.tmp --environment=development` yields the dev branch URL, not prod. Delete `.env.tmp`.
**Commit:** none (Vercel-side).

### Task 5: Preview branches per deployment (recommended)
**Options:**
- **A — Neon–Vercel native integration (preferred):** enable the Neon integration in Vercel so each preview deploy gets an **ephemeral branch** auto-created/destroyed, with `DATABASE_URL` injected per preview. Zero code.
- **B — Manual:** a GitHub Action creates `preview/pr-<n>` on PR open and deletes on merge/close, writing `DATABASE_URL` to the preview env.
**Verify:** open a test PR → preview deploy connects to its own branch; merging removes it.
**Commit:** if Option B, `ci(neon): ephemeral preview branches`.

### ✅ Phase 2 checkpoint

---

## Phase 3 — Migrations & safety rails

### Task 6: Make migrations branch-aware
**Files:** `scripts/migrate.ts`, `package.json`
**Steps:**
1. Confirm `scripts/migrate.ts` reads `DATABASE_URL` (it does) so it targets whatever branch is active.
2. Add a guard: refuse to run if `--prod` is not explicitly passed **and** the URL resolves to the production host (prevents accidental prod migrations from a dev shell).
3. Document: `npm run db:migrate` (active branch) vs an explicit prod migration step.
**Verify:** running against dev branch applies; attempting prod without the flag aborts with a clear message.
**Commit:** `chore(db): guard migrate against accidental prod runs`

### Task 7: Optional — Neon serverless driver for edge/runtime
**Files:** `src/lib/db.ts`, `package.json`
**Decision:** Only if you want HTTP/serverless pooling benefits. Swap `postgres-js` for `@neondatabase/serverless` + `drizzle-orm/neon-http`. **YAGNI unless cold-start pooling is a measured problem** — `postgres-js` + Neon pooled URL already works. Skip by default.
**Commit (if done):** `feat(db): use Neon serverless driver`

### Task 8: Document the workflow
**Files:** Update `docs/DEPLOYMENT.md` with a "Database environments" section: branch map (prod/dev/preview), how to get a connection string, how migrations flow, and the "never point dev at prod" rule + the `.env.local` `#PROD_DISABLED` convention.
**Commit:** `docs: Neon branch-per-environment workflow`

### Task 9 (only if truly migrating data sources)
If moving from a non-Neon DB: `pg_dump $OLD_URL | psql $NEON_PROD_URL`, verify row counts per table, then cut `DATABASE_URL` over. Take a Neon PITR snapshot first.
**Commit:** `chore(db): migrate data into Neon`

### ✅ Final verification
- Local dev + preview each connect to their **own** branch; production untouched by either.
- `npm run db:migrate` works per branch; prod migrations are explicit and guarded.
- A row written in dev/preview never appears in production.

---

## Full Checklist
- [ ] T1 confirm Neon project + prod branch
- [ ] T2 create `development` branch
- [ ] T3 point `.env.local` at dev branch
- [ ] T4 scope `DATABASE_URL` per Vercel environment (incl. Development)
- [ ] T5 ephemeral preview branches (Neon–Vercel integration preferred)
- [ ] T6 branch-aware migrations + prod guard
- [ ] T7 (optional) Neon serverless driver
- [ ] T8 document workflow in DEPLOYMENT.md
- [ ] T9 (only if migrating data sources)

## Immediate next step (when you wake up)
Run `! neonctl auth`, then Task 2 to create the `development` branch and Task 3 to drop its connection string into `.env.local` — that turns tonight's local placeholder into a real, isolated dev database.

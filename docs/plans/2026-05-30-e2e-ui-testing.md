# E2E UI Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reliable end-to-end UI tests that exercise every wireframe flow (auth → collections → items → sort → results → members) across tablet, phone, and desktop, against a real browser and a disposable, fully-isolated test database.

**Architecture:** Playwright (`@playwright/test`) drives real browsers against the production build (`next build && next start`). The full suite runs on **three viewport projects** (iPad landscape — the design target — plus iPhone 13 and desktop 1280×800). Feature specs are written **behaviorally** (flows work, nothing overflows, tap targets are reachable) so they pass on every viewport; exact-layout assertions live in a separate per-viewport `layout.spec.ts`. Auth is established once via `storageState`. The DB is an **ephemeral Postgres** (Docker locally, a service container in CI) — reset between tests, never dev or prod.

**Tech Stack:** Playwright, Next.js 14 (App Router), Drizzle ORM, ephemeral Postgres 16, NextAuth v4 (Credentials provider).

---

## Decisions locked (2026-06-01)

- **Test database:** ephemeral Postgres — local Docker container for dev, `postgres:16` service container in CI. Never the Neon `development` or `main` branch (e2e truncates data).
- **Build target:** test the **production** build (`next build && next start`), not `next dev` — catches build-only issues and matches what ships.
- **Local-first:** build and green the suite locally through Phase 2, then wire CI. Phases 3+ are the iterative feature backlog.
- **Scope now:** Phases 1–2 (harness + smoke + auth). Phases 3+ fully specified for later.
- **Responsiveness:** the app is tablet-first but must work on phone and desktop too. The **full suite runs on all three viewports.** Specs assert behavior, not fixed layout. Exact-layout checks are isolated in `layout.spec.ts` (option b).
- **Interaction model:** tap-first everywhere (no hover-dependent UI). Drag is permitted as an **enhancement** for manual adjustments (e.g. results reordering), layered over an accessible tap/button fallback. Tests cover the button path as the guarantee; drag as an additional path where present.
- **Blob handling:** photo-upload specs **mock the blob boundary** (stub `@vercel/blob` `put()` / intercept the upload route) so they test our code — store the returned URL, render the hero — not Vercel's CDN. No real storage touched, no CI token needed, no teardown. The real Blob integration is verified manually / in preview deploys, not in the gate.
- **Auth strategy:** the **Credentials provider** (email+password against a bcrypt hash) is fully headless-testable and is what e2e drives. The **EmailProvider magic-link** path needs an inbox and is **out of scope** for the gate (optionally one shallow "request link → success" check that never consumes the link).
- **Fixture isolation:** each feature spec seeds its **own** minimal fixture (its own collection/items) rather than depending on another spec's side effects.

---

## Why Playwright over Cypress

- **Multi-device emulation** is first-class (`devices['iPad (gen 7) landscape']`, `devices['iPhone 13']`) — needed for the all-viewport requirement.
- **Multi-browser** (Chromium/WebKit) from one config; WebKit ≈ iOS Safari, the real tablet/phone target.
- **`webServer`** auto-starts/stops the app; **`storageState`** makes per-test auth trivial.
- This repo previously ran Playwright e2e (pre-refactor), so it's the path of least surprise.
- Parallel + trace viewer + auto-waiting reduce flake versus Cypress.

**Decision:** Playwright.

---

## Prerequisites / Assumptions

- **Docker** available locally for the ephemeral Postgres (or a local `postgres` you can point at a throwaway DB).
- The Credentials provider (`src/lib/auth.ts`) allows email+password login, so tests authenticate without OAuth.
- Schema is applied to the test DB via the existing Drizzle migration (`npm run db:migrate` against the test connection string), not hand-maintained.
- A **prod-host guard** throws if the test connection string resolves to the prod Neon host — defense-in-depth so a misconfig can never touch production.

---

## Phase 1 — Harness setup

### Task 1: Install Playwright
**Files:** `package.json`
**Steps:**
1. `npm i -D @playwright/test`
2. `npx playwright install --with-deps chromium webkit`
3. Add scripts:
   ```json
   "test:e2e": "playwright test",
   "test:e2e:ui": "playwright test --ui",
   "test:e2e:report": "playwright show-report"
   ```
**Verify:** `npx playwright --version` prints a version.
**Commit:** `test(e2e): install Playwright + scripts`

### Task 2: Ephemeral test-DB harness
**Files:** Create `e2e/fixtures/test-db.sh` (or a small Node script), document in plan.
**Steps:**
1. Script starts a disposable Postgres: `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=purseinator_test --name pi-e2e-db postgres:16`.
2. Wait for readiness (`pg_isready` loop).
3. Apply schema: `DATABASE_URL=postgresql://postgres:test@localhost:5433/purseinator_test npm run db:migrate`.
4. Teardown stops the container.
5. Define `DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/purseinator_test` (port 5433 to avoid clashing with any local 5432).
**Verify:** script brings DB up, migrate applies all 15 tables, teardown removes the container.
**Commit:** `test(e2e): ephemeral Postgres harness + schema apply`

### Task 3: Playwright config (multi-viewport, prod build)
**Files:** Create `playwright.config.ts`
```ts
import { defineConfig, devices } from "@playwright/test";

const DESKTOP = { viewport: { width: 1280, height: 800 } };

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,            // tests share one seeded DB
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "**/auth.setup.ts" },
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7) landscape"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "phone",
      use: { ...devices["iPhone 13"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], ...DESKTOP, storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "postgresql://postgres:test@localhost:5433/purseinator_test",
      AUTH_URL: "http://localhost:3000",
      AUTH_SECRET: "e2e-only-secret-at-least-32-characters-long-xx",
    },
  },
});
```
**Verify:** `npx playwright test --list` shows specs × {tablet, phone, desktop} and resolves without config errors.
**Commit:** `test(e2e): multi-viewport Playwright config (prod build)`

### Task 4: DB reset + seed helpers (with prod-host guard)
**Files:** Create `e2e/fixtures/db.ts`, `e2e/fixtures/seed.ts`
**Steps:**
1. `db.ts`: connect via `DATABASE_URL_TEST`; export `resetDb()` (truncate all app tables, `RESTART IDENTITY CASCADE`) and `closeDb()`. **Guard:** throw if the connection string contains the prod Neon host (`ep-empty-mode`) or the dev host (`ep-old-meadow`) — e2e only ever talks to the ephemeral DB.
2. `seed.ts`: `seedBaseline()` inserts one known user (`e2e@purseinator.test`, bcrypt of a fixed password) and returns its id; idempotent after `resetDb()`.
**Verify:** `tsx e2e/fixtures/seed.ts` against the test DB inserts the user; rerun-after-reset is clean; pointing it at a non-ephemeral host throws.
**Commit:** `test(e2e): DB reset + baseline seed (prod/dev host guard)`

### Task 5: Programmatic auth (storageState)
**Files:** Create `e2e/auth.setup.ts`
**Steps:**
1. `resetDb()` + `seedBaseline()`.
2. Drive the real `/login` form once (email+password), assert redirect to `/collections`.
3. Save `storageState` to `e2e/.auth/user.json`.
4. Add `e2e/.auth/` to `.gitignore`.
**Verify:** `npx playwright test auth.setup.ts` passes and writes `user.json`.
**Commit:** `test(e2e): authenticated storageState setup`

### ✅ Phase 1 checkpoint — Ready to proceed?
`npm run test:e2e -- --list` shows the four projects; the ephemeral DB harness brings a DB up and down cleanly.

---

## Phase 2 — Smoke + auth specs  ← **stop here for the first iteration**

### Task 6: Unauthenticated routing/redirect smoke
**Files:** Create `e2e/smoke.spec.ts` (runs WITHOUT storageState — `test.use({ storageState: { cookies: [], origins: [] } })`).
**Assertions (behavioral, all viewports):**
- `/` redirects to `/login` (middleware).
- `/collections` while logged out → redirected to `/login`.
- `/login` renders the email + password fields and nothing overflows the viewport.
**Verify:** `npm run test:e2e smoke` green on tablet, phone, desktop.
**Commit:** `test(e2e): unauthenticated redirect smoke (all viewports)`

### Task 7: Login + signup flow
**Files:** `e2e/auth.spec.ts`
**Assertions (Credentials provider only — magic-link is out of scope):** bad creds show an error; good creds (the seeded baseline user) land on `/collections`; signup a **fresh** user via the form → auto-authenticated → lands in the app. All viewports.
**Gotcha:** `POST /api/auth/signup` returns generic success even when the user already exists (anti-enumeration), so the signup spec must use a **unique email per run** (or `resetDb()` first) — otherwise it gets 201 without creating a user and the subsequent login fails.
**Commit:** `test(e2e): login + signup flows (credentials)`

### Task 8: Layout assertions (per-viewport, isolated)
**Files:** Create `e2e/layout.spec.ts`
**Purpose:** the one place exact-layout checks live, branching on `test.info().project.name`.
**Assertions:**
- **tablet:** collections grid is 3 columns; primary tap targets ≥ 44px (h-11).
- **phone:** grid collapses to 1 column; nav remains reachable (no off-screen controls); targets ≥ 44px.
- **desktop:** grid uses the wide layout; no clipped content at 1280×800.
**Verify:** green on each project; deliberately shrinking a target or forcing 3-col on phone fails it.
**Commit:** `test(e2e): per-viewport layout assertions`

### ✅ Phase 2 checkpoint — first iteration done
Suite green locally across all three viewports. **This is the agreed stopping point**; Phases 3+ are the iterative backlog below.

---

## Phase 3 — Core feature specs (iterative; one file per feature)

Each task: write spec → run green on all viewports → commit. Use role/text selectors (`getByRole`, `getByLabel`) — no brittle CSS. Add `data-testid` only where semantics are ambiguous. Specs are **behavioral**; any exact-layout consequence goes in `layout.spec.ts`.

### Task 9: Collections CRUD — `e2e/collections.spec.ts`
Create collection (name + description) → appears in the grid (count, not column-count); open dashboard (4 nav cards: Items/Sort/Results/Members); edit name persists; empty state shows when none.

### Task 10: Items + photo — `e2e/items.spec.ts`
Add item (name/brand/style/color/material/category) → appears in grid; open detail; upload a photo (`setInputFiles` a fixture image) → hero photo renders; set-hero + delete-photo gated by permissions.
**Blob mock:** stub the blob boundary so no real storage is touched — intercept the upload route (`page.route`) to return a deterministic fake URL, or mock `@vercel/blob` `put()` in the test build. Assert our code stores that URL on the photo row and renders it as the hero. This keeps the spec hermetic (no token, no teardown, no accumulation); the real Vercel Blob integration is verified manually / in a preview deploy, not here.
**Fixture:** this spec seeds its own collection + item rather than reusing the collections-CRUD spec's data.

### Task 11: Sort session — `e2e/sort.spec.ts` (most complex)
Start a session (goal picker) → triage every item into buckets → enter pairwise mode → record A/TIE/B/SKIP decisions → progress advances → reach completion → "Generate Draft Results".

### Task 12: Results — `e2e/results.spec.ts`
Draft: reorder rows via **up/down buttons** (the accessible guarantee) → order persists (debounced PATCH); override a bucket → persists. **If drag is implemented** for manual adjustment, add a parallel case using Playwright `dragTo()` asserting the same persisted result. Finalize (ConfirmDialog) → read-only bucketed view. Create a share → open `/shared-results/[token]` unauthenticated → public bucketed view renders.

### Task 13: Members + invitations — `e2e/members.spec.ts`
Invite by email with permission checkboxes → invitation listed; accept-invitation page (`/invitations/[token]`) adds the member; remove member gated by `canManageCollection`.

### ✅ Phase 3 checkpoint

---

## Phase 4 — Stabilize & CI gate

### Task 14: Flake pass
Replace any `waitForTimeout` with web-first assertions (`await expect(locator).toBeVisible()`). Ensure `resetDb()+seedBaseline()` runs in `globalSetup` (or `beforeAll` per worker) so specs are order-independent across all three projects.
**Commit:** `test(e2e): remove arbitrary waits; deterministic DB state`

### Task 15: GitHub Actions — add e2e to the required gate
**Files:** `.github/workflows/ci.yml` (extend) or a new `e2e` job.
**Steps:**
1. Add a `postgres:16` **service container** to the job.
2. `npm ci`; `npx playwright install --with-deps chromium webkit`.
3. Apply schema: `DATABASE_URL=<service> npm run db:migrate`.
4. Run `npm run test:e2e` with `DATABASE_URL_TEST=<service>`, dummy `AUTH_*`.
5. Upload `playwright-report/` as an artifact on failure.
6. Make the e2e job a **required status check** on `main` (alongside "Lint, test, build") — this turns the thin gate into a real one.
**No blob token needed:** upload specs mock the blob boundary (Task 10), so CI requires no `BLOB_READ_WRITE_TOKEN` and touches no real storage.
**Commit:** `ci(e2e): run Playwright (3 viewports) against postgres service; gate main`

### ✅ Final verification
`npm run test:e2e` green locally across tablet/phone/desktop against the **ephemeral** DB; CI runs the same and gates `main`; `playwright-report/` opens; the test env points at neither Neon database branch (`main`/`development`) — only the ephemeral Postgres; no test blobs left in storage after a run.

---

## Full Checklist
**Phase 1 — harness**
- [ ] T1 install Playwright + scripts
- [ ] T2 ephemeral Postgres harness + schema apply
- [ ] T3 multi-viewport config (prod build)
- [ ] T4 DB reset + seed (prod/dev host guard)
- [ ] T5 storageState auth setup

**Phase 2 — smoke + auth (first iteration stops here)**
- [ ] T6 unauthenticated redirect smoke
- [ ] T7 login/signup
- [ ] T8 per-viewport layout assertions

**Phase 3 — feature sweep (iterative)**
- [ ] T9 collections CRUD
- [ ] T10 items + photo (with blob teardown)
- [ ] T11 sort session (triage + pairwise)
- [ ] T12 results reorder/finalize/share (+ drag if present)
- [ ] T13 members + invitations

**Phase 4 — stabilize + gate**
- [ ] T14 flake pass / deterministic DB
- [ ] T15 e2e in CI, required check on main

## Guardrails
- e2e uses **only** the ephemeral Postgres (`DATABASE_URL_TEST`). A hard guard throws if the connection string resolves to the prod (`ep-empty-mode`) or dev (`ep-old-meadow`) Neon host.
- Full suite runs on **all three viewports** (iPad landscape, iPhone 13, desktop 1280×800). Specs assert behavior + no-overflow + reachable tap targets; exact-layout assertions live only in `layout.spec.ts`.
- **Tap-first** everywhere; drag is an optional enhancement (manual adjustments) layered over an accessible button fallback — test the button path always, drag additionally where implemented.
- Photo-upload specs **mock the blob boundary**; no real storage is touched and no CI token is needed.
- **Auth:** e2e drives the Credentials provider only; the EmailProvider magic-link path is out of scope (no inbox dependency in the gate).
- Each feature spec seeds its **own** fixture; no cross-spec data dependencies.
- Tap targets ≥ 44px on touch viewports.

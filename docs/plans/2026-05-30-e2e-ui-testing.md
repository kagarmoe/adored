# E2E UI Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reliable end-to-end UI tests that exercise every wireframe flow (auth → collections → items → sort → results → members) against a real browser and an isolated test database.

**Architecture:** Playwright (`@playwright/test`) drives a real browser against `next dev` started by Playwright's `webServer`. Tests run tablet-first (the app is tablet-only, tap-only). Auth is established programmatically (seeded credentials + storageState) so most specs skip the login UI. The DB is a **disposable test database** (local Postgres or an ephemeral Neon branch — see `2026-05-30-neon-migration.md`), reset between runs, never production.

**Tech Stack:** Playwright, Next.js 14 (App Router), Drizzle ORM, Postgres, NextAuth v4 (Credentials provider).

---

## Why Playwright over Cypress

- **Tablet viewports + device emulation** are first-class (`devices['iPad (gen 7)']`) — matches the tablet-first, tap-only requirement directly.
- **Multi-browser** (Chromium/WebKit/Firefox) from one config; WebKit ≈ iPad Safari, the real target.
- **`webServer`** auto-starts/stops `next dev`; **`storageState`** makes per-test auth trivial.
- This repo previously ran Playwright e2e (pre-refactor), so it's the path of least surprise.
- Parallel + trace viewer + auto-waiting reduce flake versus Cypress for this app shape.

**Decision:** Playwright. (Open to Cypress if you prefer its runner UX — say so and I'll swap the config tasks.)

---

## Prerequisites / Assumptions

- A **test database** exists and `DATABASE_URL_TEST` (or `.env.test`) points at it — NEVER production. Coordinate with the Neon plan; until then use local Postgres `postgresql://localhost:5432/purseinator_test`.
- A **seed script** can create a known user + minimal data deterministically.
- The Credentials provider (`src/lib/auth.ts`) allows email+password login, so tests can authenticate without OAuth.

---

## Phase 1 — Harness setup

### Task 1: Install Playwright
**Files:** `package.json`
**Steps:**
1. `npm i -D @playwright/test`
2. `npx playwright install --with-deps chromium webkit`
3. Add scripts to `package.json`:
   ```json
   "test:e2e": "playwright test",
   "test:e2e:ui": "playwright test --ui",
   "test:e2e:report": "playwright show-report"
   ```
**Verify:** `npx playwright --version` prints a version.
**Commit:** `test(e2e): install Playwright + scripts`

### Task 2: Playwright config (tablet-first)
**Files:** Create `playwright.config.ts`
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,           // tests share one seeded DB
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
      name: "ipad",
      use: { ...devices["iPad (gen 7) landscape"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "postgresql://localhost:5432/purseinator_test" },
  },
});
```
**Verify:** `npx playwright test --list` runs without config errors.
**Commit:** `test(e2e): tablet-first Playwright config with webServer`

### Task 3: Test DB reset + seed helpers
**Files:** Create `e2e/fixtures/db.ts`, `e2e/fixtures/seed.ts`
**Steps:**
1. `db.ts`: connect via `DATABASE_URL_TEST`, expose `resetDb()` (truncate all tables) and `closeDb()`.
2. `seed.ts`: `seedBaseline()` inserts one known user (`e2e@purseinator.test` / bcrypt of a fixed password) and returns its id. Guard: **throw if the connection string contains the prod host** (defense-in-depth against pointing at prod).
**Verify:** `tsx e2e/fixtures/seed.ts` against the test DB inserts the user; re-running is idempotent after `resetDb()`.
**Commit:** `test(e2e): test-DB reset + baseline seed (prod-host guard)`

### Task 4: Programmatic auth (storageState)
**Files:** Create `e2e/auth.setup.ts`
**Steps:**
1. Seed the baseline user.
2. Drive the real `/login` form once (email+password), assert redirect to `/collections`.
3. Save `storageState` to `e2e/.auth/user.json`.
4. Add `e2e/.auth/` to `.gitignore`.
**Verify:** `npx playwright test auth.setup.ts` passes and writes `user.json`.
**Commit:** `test(e2e): authenticated storageState setup`

### ✅ Phase 1 checkpoint — Ready to proceed?
Run `npm run test:e2e -- --list`; confirm the `setup` + `ipad` projects resolve.

---

## Phase 2 — Smoke + auth specs

### Task 5: Unauthenticated routing/redirect smoke
**Files:** Create `e2e/smoke.spec.ts` (runs WITHOUT storageState — its own project or `test.use({ storageState: undefined })`)
**Assertions:**
- `/` redirects to `/login` (middleware).
- `/collections` while logged out → redirected to `/login`.
- `/login` renders the email + password fields.
**Verify:** `npm run test:e2e smoke` green.
**Commit:** `test(e2e): unauthenticated redirect smoke`

### Task 6: Login + signup flow
**Files:** `e2e/auth.spec.ts`
**Assertions:** bad creds show an error; good creds land on `/collections`; signup creates an account and authenticates.
**Commit:** `test(e2e): login + signup flows`

### ✅ Phase 2 checkpoint

---

## Phase 3 — Core feature specs (one file per feature)

Each task: write spec → run green → commit. Use role/text selectors (`getByRole`, `getByLabel`) — no brittle CSS. Add `data-testid` only where semantics are ambiguous.

### Task 7: Collections CRUD — `e2e/collections.spec.ts`
Create collection (name + description) → appears in the 3-col grid; open dashboard (4 nav cards: Items/Sort/Results/Members); edit name persists; empty state shows when none.

### Task 8: Items + photo — `e2e/items.spec.ts`
Add item (name/brand/style/color/material/category); appears in responsive grid; open detail; upload a photo (`setInputFiles` a fixture image) → hero photo renders; set-hero + delete-photo gated by permissions.
**Note:** with blob disabled in dev, stub the upload route or point `BLOB_READ_WRITE_TOKEN` at a test store; assert the API contract, not the CDN.

### Task 9: Sort session — `e2e/sort.spec.ts` (most complex)
Start a session (goal picker) → triage every item into buckets (h-14 buttons) → enter pairwise mode → record A/TIE/B/SKIP decisions → progress bar advances → reach completion → "Generate Draft Results".

### Task 10: Results — `e2e/results.spec.ts`
Draft: reorder rows via up/down buttons (no drag), override a bucket → persists (debounced PATCH). Finalize (ConfirmDialog) → read-only bucketed view. Create a share → open `/shared-results/[token]` in an unauthenticated context → public bucketed view renders.

### Task 11: Members + invitations — `e2e/members.spec.ts`
Invite by email with permission checkboxes → invitation listed; accept-invitation page (`/invitations/[token]`) adds the member; remove member gated by `canManageCollection`.

### ✅ Phase 3 checkpoint

---

## Phase 4 — Stabilize & (optional) CI

### Task 12: Flake pass
Replace any `waitForTimeout` with web-first assertions (`await expect(locator).toBeVisible()`). Ensure `resetDb()+seedBaseline()` runs in a `globalSetup` or a `beforeAll` per worker so specs are order-independent.
**Commit:** `test(e2e): remove arbitrary waits; deterministic DB state`

### Task 13 (optional): GitHub Actions
**Files:** `.github/workflows/e2e.yml` — `postgres:16` service, `npm ci`, `npx playwright install --with-deps`, `DATABASE_URL_TEST` = service, run `npm run test:e2e`, upload `playwright-report/` artifact.
**Note:** CI was intentionally removed in the refactor — only add this if you want the gate back.
**Commit:** `ci(e2e): run Playwright against postgres service`

### ✅ Final verification
`npm run test:e2e` all green locally against the **test** DB; `playwright-report/` opens; zero references to production in any test env.

---

## Full Checklist
- [ ] T1 install Playwright + scripts
- [ ] T2 tablet-first config + webServer
- [ ] T3 test-DB reset/seed (+prod-host guard)
- [ ] T4 storageState auth setup
- [ ] T5 unauth redirect smoke
- [ ] T6 login/signup
- [ ] T7 collections CRUD
- [ ] T8 items + photo
- [ ] T9 sort session (triage + pairwise)
- [ ] T10 results reorder/finalize/share
- [ ] T11 members + invitations
- [ ] T12 flake pass / deterministic DB
- [ ] T13 (optional) CI workflow

## Guardrails
- Tests must use `DATABASE_URL_TEST` (or `.env.test`) — a hard guard throws if it resolves to the prod host.
- Never run e2e with the production `BLOB_READ_WRITE_TOKEN`.
- Tablet viewport (iPad landscape) is the default project; tap-only (no drag) interactions only.

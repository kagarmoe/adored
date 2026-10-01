# Test-coverage Phase 4 — cover the 0% component/page/module layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Each task = one fresh subagent, TDD (failing test first). Security/upload tasks first; skip trivia.

**Goal:** Give the genuinely-dark 0% component/page/module layer real behavioral tests (jsdom + @testing-library), mocking only true external boundaries (`fetch`, `@vercel/blob/client`, `heic`, `signIn`, `next/navigation`, and for `auth.ts`/`env.ts` their module-load deps), and ratchet the merged coverage floor.

**Architecture:** Client components/pages are rendered in jsdom via `@testing-library/react`; interactions driven with `fireEvent`/`user-event`; outcomes asserted on the real DOM + the mocked boundary calls. Pure modules (`api-client`, `env`, `auth.ts` callbacks, `middleware.ts`) are unit-tested directly. These are UNIT-tier tests (no `RUN_DB_TESTS` gate) — they run in the `gate` job and count toward merged coverage.

**Tech Stack:** vitest 4.1.9 (`globals:true`, default env `node`), `@testing-library/react` 16, `@testing-library/jest-dom` 6, `@testing-library/user-event` 14, jsdom 29.

## Global Constraints

- **Per-file jsdom:** every component/page test starts with `// @vitest-environment jsdom` (line 1) — the project default is `node`. Pure-module tests that need no DOM stay `node` (the default; no directive).
- **Mock ONLY true boundaries:** `fetch` (via `vi.stubGlobal("fetch", …)`), `@vercel/blob/client` (`upload`/`handleUpload`), `@/lib/heic` (`convertHeifToJpeg`), `signIn`/`signOut` from `next-auth/react`, `next/navigation` (`useRouter`/`useSearchParams`/`redirect`). For `auth.ts`/`env.ts` unit tests, mock their module-load deps (`@/lib/db` `getDb`, nodemailer/`EmailProvider`) as needed to import the module. **Do NOT mock the component under test or its pure helpers** (`@/lib/uploads`, validation) — exercise the real logic.
- **Assert real behavior, not mock internals:** assert on rendered DOM (roles/text), navigation calls, and the request bodies/args passed to `fetch`/`upload`. A test that only checks "mock was called" with no behavioral consequence is a finding.
- **TDD:** failing test first; capture RED; then GREEN. For characterization of existing components, if a case passes immediately, tighten an assertion until you SEE one fail, then restore.
- **No product-code changes.** If a component has a real bug or an a11y gap, PIN current behavior with a comment + file a bead (`bd create … -t bug`); do not fix in this PR. (Exception: none — this is a test-only PR.)
- **YAGNI does not apply to tests** (user override): cover each component's real branches — happy path, validation/error path, loading/disabled state, and any security-relevant branch (upload token gen, signIn error). Trivial pure re-exports need no test.
- **Skip trivia:** do not test framework re-exports or a component with no logic. `src/lib/middleware-auth.ts` is already 100% — do not touch it.
- Floor currently **73** in `.github/workflows/ci.yml` (job "Merged coverage floor"). Merged baseline entering Phase 4 = **73.14% lines**. Ratchet only in the gate task, only after measuring.

---

## Current 0% targets (merged report, 2026-06-22)

| file | lines | priority | mock surface |
|---|---|---|---|
| `src/features/items/PhotoUpload.tsx` | 60 | **upload/security** | fetch, @vercel/blob/client, @/lib/heic, next/navigation |
| `src/features/pool/PoolUpload.tsx` | 68 | **upload/security** | fetch, @vercel/blob/client, @/lib/heic, next/navigation |
| `src/lib/auth.ts` (callbacks) | 34 | **auth/security** | @/lib/db getDb, nodemailer/EmailProvider (to import) |
| `src/app/login/page.tsx` | 40 | **auth/security** | signIn (next-auth/react), next/navigation |
| `src/app/signup/page.tsx` | 36 | **auth/security** | fetch (signup API) + signIn, next/navigation |
| `src/features/items/ItemForm.tsx` | 29 | forms | fetch, next/navigation |
| `src/features/items/ItemEditForm.tsx` | 20 | forms | fetch, next/navigation |
| `src/features/collections/InviteForm.tsx` | 20 | forms | fetch, next/navigation |
| `src/lib/api-client.ts` | 17 | pure | fetch |
| `src/lib/env.ts` | 22 | pure | process.env (stub + re-import) |
| `src/app/.../middleware.ts` (`src/middleware.ts`) | 3 | trivia? | evaluate — may be a thin re-export |
| `src/features/sessions/SessionAnalytics.tsx` | 18 | low | render-only (no fetch) |

`src/lib/middleware-auth.ts` is already 100% — excluded.

---

## Shared Recipe

**Component/page test (jsdom):**
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { ComponentUnderTest } from "./ComponentUnderTest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ /* … */ }) }));
});
```
Reference blueprints already in the repo: `src/features/sorting/StartSessionForm.test.tsx` (form + fetch + router), `src/features/items/ItemCard.test.tsx`, `src/app/collections/[id]/page.test.tsx`. Match their style.

**Upload-component extras:**
```tsx
const upload = vi.fn().mockResolvedValue({ url: "https://blob.example/x.jpg" });
vi.mock("@vercel/blob/client", () => ({ upload, handleUpload: vi.fn() }));
vi.mock("@/lib/heic", () => ({ convertHeifToJpeg: vi.fn(async (f) => f) }));
// build a File: new File([new Uint8Array([1,2,3])], "x.jpg", { type: "image/jpeg" })
// fire a change on the file input; assert upload() called, then fetch() called with the blob url, then router.refresh/push.
```

**signIn (auth pages):**
```tsx
const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn }));
```

**Run a single test file:** `npm run test:ci -- <path/to/file.test.tsx>` (fast; jsdom). Lint: `npm run lint`.

---

### Task 1: Upload components (PhotoUpload, PoolUpload) — security/upload

**Files:**
- Create: `src/features/items/PhotoUpload.test.tsx`, `src/features/pool/PoolUpload.test.tsx`
- Under test: `src/features/items/PhotoUpload.tsx`, `src/features/pool/PoolUpload.tsx` (+ real helpers `src/lib/uploads.ts`, but NOT mocked).

- [ ] **Step 1: Read** both components + `src/lib/uploads.ts` (`isHeifFile`, `partitionPoolFiles`) + `src/lib/heic.ts`. Note the real flow: select files → (HEIC? convert) → upload via `@vercel/blob/client` → POST/PATCH the resulting blob URL via `fetch` → refresh/navigate. Note loading/disabled state, multi-file handling, and any error branch (upload fails, fetch !ok).
- [ ] **Step 2: Write failing tests** (jsdom). For PhotoUpload: happy single-file upload (assert `upload` called with the file, then `fetch` called with the blob URL in the body, then router refresh/redirect); a HEIC file routes through `convertHeifToJpeg`; an upload/fetch error surfaces an error state and does NOT navigate. For PoolUpload: multi-file pool upload (assert N uploads + the pool count/poll behavior), and an error branch. Mock fetch + @vercel/blob/client + @/lib/heic + next/navigation only.
- [ ] **Step 3: Run, verify FAIL** (`npm run test:ci -- src/features/items/PhotoUpload.test.tsx src/features/pool/PoolUpload.test.tsx`). Use fake timers if the component uses `delay()`/polling (`vi.useFakeTimers()`), or stub the delay.
- [ ] **Step 4: Make green.** PIN (don't fix) + bead any real bug/a11y gap found.
- [ ] **Step 5: Run green + `npm run lint`.**
- [ ] **Step 6: Commit** `test(upload): jsdom behavioral tests for PhotoUpload + PoolUpload (Phase 4)`.

---

### Task 2: Auth pages (login, signup) — security

**Files:**
- Create: `src/app/login/page.test.tsx`, `src/app/signup/page.test.tsx`
- Under test: `src/app/login/page.tsx`, `src/app/signup/page.tsx`.

- [ ] **Step 1: Read** both pages. login: form → `signIn("credentials", …)`; on error shows a message; on success redirects. signup: form → POST `/api/auth/signup` (or similar) via `fetch`, then `signIn`/redirect; validation (password length, mismatch) and duplicate-email error display.
- [ ] **Step 2: Write failing tests** (jsdom): login happy (signIn called with the typed credentials, redirect on success); login failure (signIn returns error → error message shown, no redirect). signup happy (fetch POST with the form body, then signIn/redirect); signup validation error (short password / mismatch → error shown, no fetch); signup duplicate-email (fetch !ok → error shown). Mock `signIn` (next-auth/react) + fetch + next/navigation only.
- [ ] **Step 3: Run, verify FAIL** (`npm run test:ci -- src/app/login/page.test.tsx src/app/signup/page.test.tsx`).
- [ ] **Step 4: Make green.** PIN + bead any real bug (e.g. the signup duplicate-email timing oracle is already tracked as purses-zeyd — reference it, don't refile).
- [ ] **Step 5: Run green + `npm run lint`.**
- [ ] **Step 6: Commit** `test(auth-pages): jsdom tests for login + signup (Phase 4)`.

---

### Task 3: Forms (ItemForm, ItemEditForm, InviteForm)

**Files:**
- Create: `src/features/items/ItemForm.test.tsx`, `src/features/items/ItemEditForm.test.tsx`, `src/features/collections/InviteForm.test.tsx`
- Under test: the three form components.

- [ ] **Step 1: Read** the three forms. Each: controlled inputs → submit → `fetch` (POST/PATCH) → refresh/navigate; note required-field validation and the error branch (fetch !ok).
- [ ] **Step 2: Write failing tests** (jsdom): for each form — happy submit (fetch called with the correct method + body built from the typed fields, then refresh/redirect); a validation branch (missing required field → no fetch, or the component's actual guard); an error branch (fetch !ok → error shown, no navigate). InviteForm: assert the invited email + any permission flags are in the POST body. Mock fetch + next/navigation only.
- [ ] **Step 3: Run, verify FAIL** (`npm run test:ci -- src/features/items/ItemForm.test.tsx src/features/items/ItemEditForm.test.tsx src/features/collections/InviteForm.test.tsx`).
- [ ] **Step 4: Make green.** PIN + bead any real bug.
- [ ] **Step 5: Run green + `npm run lint`.**
- [ ] **Step 6: Commit** `test(forms): jsdom tests for ItemForm/ItemEditForm/InviteForm (Phase 4)`.

---

### Task 4: Pure modules (api-client, env) + middleware.ts + auth.ts callbacks

**Files:**
- Create: `src/lib/api-client.test.ts`, `src/lib/env.test.ts`, `src/lib/auth-callbacks.test.ts` (node env), and (if non-trivial) `src/middleware.test.ts`
- Under test: `src/lib/api-client.ts`, `src/lib/env.ts`, `src/lib/auth.ts` (the `callbacks` only), `src/middleware.ts`.

- [ ] **Step 1: Read** all four. `api-client.ts`: thin `fetch` wrapper (`apiGet/apiPost/apiPatch`?) — note URL building, JSON headers, error throwing on !ok. `env.ts`: validates `process.env` at module load (zod?) — throws on missing/invalid, exports a typed object. `auth.ts`: find the `callbacks.jwt`/`callbacks.session` (and `authorize`?) — they inject `user.id` into the token/session. `middleware.ts`: if it's a thin re-export of `middleware-auth` + a `config.matcher`, it is **trivia → skip** (note why in the report); if it has real redirect logic, test it.
- [ ] **Step 2: Write failing tests** (node env, no jsdom):
  - `api-client`: each verb builds the right `fetch` call (method, headers, body) and throws/returns per !ok. Mock fetch via `vi.stubGlobal`.
  - `env`: stub `process.env` and re-import (`vi.resetModules()` + dynamic `import()`); assert it throws on a missing required var and parses a valid env. (env.ts validates at module load, so use dynamic import after stubbing.)
  - `auth.ts callbacks`: mock `@/lib/db` (`getDb`) and nodemailer/`EmailProvider` enough to import `authOptions`; call `authOptions.callbacks.jwt({token,user})` and `.session({session,token})` and assert `user.id` is injected. If importing `auth.ts` is intractable without heavy mocking, PIN that as a NEEDS_CONTEXT and report — do not over-mock.
  - `middleware.ts`: only if non-trivial.
- [ ] **Step 3: Run, verify FAIL** (`npm run test:ci -- src/lib/api-client.test.ts src/lib/env.test.ts src/lib/auth-callbacks.test.ts`).
- [ ] **Step 4: Make green.** PIN + bead any real bug.
- [ ] **Step 5: Run green + `npm run lint`.**
- [ ] **Step 6: Commit** `test(modules): unit tests for api-client/env/auth-callbacks (Phase 4)`.

---

### Task 5: SessionAnalytics (low priority, render-only)

**Files:**
- Create: `src/features/sessions/SessionAnalytics.test.tsx`
- Under test: `src/features/sessions/SessionAnalytics.tsx`.

- [ ] **Step 1: Read** the component. It is render-only (computes/derives display from props; no fetch). Note: bead `purses-gjr` proposes reframing it (KPI-dashboard-against-tone) — test its CURRENT render only, minimally, and reference purses-gjr in a comment so a reframe is expected.
- [ ] **Step 2: Write failing tests** (jsdom): renders the key computed figures from representative props; handles the empty/zero-data case without crashing. Keep it minimal (it may be reworked).
- [ ] **Step 3: Run, verify FAIL** (`npm run test:ci -- src/features/sessions/SessionAnalytics.test.tsx`).
- [ ] **Step 4: Make green + `npm run lint`.**
- [ ] **Step 5: Commit** `test(analytics): minimal render tests for SessionAnalytics (Phase 4)`.

---

### Task 6: Gate — merged coverage, ratchet floor, document

**Files:**
- Modify: `.github/workflows/ci.yml` (bump floor from 73), `docs/ARCHITECTURE.md` (coverage decision entry), `.superpowers/sdd/progress.md` (ledger).

- [ ] **Step 1: Run the FULL merged coverage CI-style:**
  ```bash
  rm -rf coverage .vitest-reports
  npm run test:ci -- --coverage --reporter=blob --outputFile=.vitest-reports/blob-unit.json
  RUN_DB_TESTS=1 bash e2e/fixtures/run-db-tests.sh --coverage --reporter=blob --outputFile=.vitest-reports/blob-db.json
  npx vitest --merge-reports --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary
  ```
  Record merged lines%.
- [ ] **Step 2: Verify NO regression.** Merged lines% MUST be ≥ 73.14 (Phase 3 baseline). The new component/module tests are unit-tier, so they ADD to the union — expect a rise.
- [ ] **Step 3: Ratchet the floor** in `.github/workflows/ci.yml` to `floor(new merged lines%)`. Never above the measured number.
- [ ] **Step 4: Confirm no skipped/orphaned tests** in the new files (`grep -rn "it.only\|describe.only\|\.skip" src/features src/app src/lib` — only intended gates).
- [ ] **Step 5: Update** `docs/ARCHITECTURE.md` coverage entry (Phase 4 result) and `.superpowers/sdd/progress.md` (Phase 4 DONE; merged %, floor).
- [ ] **Step 6: Commit** `ci(coverage): ratchet floor after Phase 4 component/page layer`.

---

## Self-review notes

- **Spec coverage:** maps to spec item 4 (upload/form components, login/signup, server-component pages via await-render, pure modules `middleware-auth`/`env`/`api-client`/`auth.ts` callbacks). `middleware-auth` is already 100% (excluded, noted). Server-component pages: the named 0% pages (login/signup) are client components; other pages already have `page.test.tsx` coverage — not re-tested (skip trivia).
- **Priority order honored:** upload (T1) + auth pages (T2) first, then forms, modules, analytics.
- **Mock discipline:** only fetch/blob-client/heic/signIn/navigation (and auth.ts/env.ts module-load deps for those unit tests). No mocking the component under test or its pure helpers.
- **No product-code changes;** real bugs/a11y gaps are pinned + beaded (e.g. signup oracle purses-zeyd, analytics reframe purses-gjr referenced).

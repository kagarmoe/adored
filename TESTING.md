# Testing

## The contract

> **Passing tests = the app works.**

Every test in this repo exists to honor that contract. If a green suite can
ship a broken app, the suite is wrong — fix the suite, not the headline.

The 2026-05-15 production outage is the canonical violation: the vitest suite
was 374-green while every authenticated path in production was 500ing,
because the suite mocked `@/lib/db` and so could not see that a migration had
not been applied. The structure described here exists so that class of defect
cannot recur silently.

## Test layers — what each one is responsible for

| Layer        | Tool        | Runs in CI | Mocks DB?    | What it proves                                                                |
|--------------|-------------|------------|--------------|-------------------------------------------------------------------------------|
| unit         | vitest      | yes        | usually yes  | pure logic, render output, narrow contracts                                   |
| integration  | vitest      | yes        | as little as possible | a real handler over a fake/light seam (see `__tests__/auth-send-flow.test.ts`) |
| e2e          | Playwright  | not yet (purses-chh.1) | no — real DB | the deployed app works end-to-end through a browser                           |
| post-deploy smoke | `scripts/smoke.mjs` | yes (on deploy) | no — hits prod | the running production deploy is actually serving real content                |

- **unit**: cheapest, fastest, broadest coverage. Mocking is fine when the
  thing under test is pure logic or a UI component.
- **integration**: where the value lives for backend code. The model is
  `__tests__/auth-send-flow.test.ts` — drive the real handler, mock only what
  you must (network, the email provider). Heavy `vi.mock('@/lib/db', ...)`
  hides schema/contract drift; prefer a lighter seam.
- **e2e**: the only layer that exercises the real app + real DB through a
  real browser. Specs live in `e2e/`. They cannot yet run in CI (no
  browsers, no test DATABASE_URL); landing that is purses-chh.1.
- **post-deploy smoke**: the last-line check. After every Vercel Production
  deploy, `scripts/smoke.mjs` hits the live demo host + the live login page
  and asserts real content (not a Next.js error page). This is the check
  that would have caught the 2026-05-15 outage in seconds. It is wired as a
  deploy gate (see below).

## When to mock vs use the real thing

Default: **use the real thing or a thin functional fake; mock only what you
must.** A whole-`db` mock is a smell, not a default.

- Mock network calls to external services (Resend, Vercel Blob) — there is no
  value in hitting those in tests.
- Mock environment-specific surfaces (`@auth/core`'s transport) only when you
  cannot drive the real one usefully.
- **Do not** mock `@/lib/db` reflexively. If you find yourself reaching for
  it, ask whether a thin schema-aware fake or a real test DB would tell you
  more.

The audit of existing `vi.mock('@/lib/db')` sites is tracked by purses-chh.3.

## Structural enforcement — where the gates live

The contract is held by three structural gates, not by reviewer vigilance.

### Gate 1 — Merge to `main` requires a green CI suite

- Workflow: `.github/workflows/ci.yml` runs `lint`, `typecheck`, and `test`
  on every pull request and every push to `main`.
- Branch protection on `main` requires those three checks to be green before
  a PR can merge. To configure or re-verify:
  ```bash
  scripts/setup-branch-protection.sh
  ```
- **When the e2e gate (purses-chh.1) lands**, add an `e2e` job to
  `ci.yml` and add `"e2e"` to the required checks list in
  `scripts/setup-branch-protection.sh`.

#### How to verify Gate 1

Open a throwaway PR that deliberately breaks a test (e.g. flip an assertion
in `__tests__/auth-send-flow.test.ts`). The `test` check must report
failure, and the GitHub "Merge pull request" button must be disabled. Close
the PR without merging.

### Gate 2 — Vercel deploy success requires the post-deploy smoke to pass

- Workflow: `.github/workflows/post-deploy-smoke.yml` triggers on the
  GitHub `deployment_status` event Vercel fires when a Production deploy
  goes live.
- `scripts/smoke.mjs --public-only` hits the demo host + `/login` and fails
  non-zero if either is an error page or the wrong HTTP status. The
  `--public-only` flag deliberately skips the authenticated probe — see
  the workflow comment for the AUTH_SECRET rationale; the follow-up bead is
  purses-chh.6 (add `/api/health` so smoke can exercise the DB without
  forging a session).
- On smoke failure the workflow POSTs a `deployment_status: failure` back
  onto the same Vercel deployment, so the GitHub Deployments UI marks it
  unhealthy. A green build with a failing smoke is **not** a successful
  deploy.

#### How to verify Gate 2

After a deploy whose smoke is known-bad (e.g. point `scripts/smoke.mjs` at a
URL guaranteed to 500 via `--sanity`), the workflow run is red, the commit
shows a red ✗ for "post-deploy smoke", and the GitHub Deployment for that
commit shows the `failure` state in the Deployments tab.

### Gate 3 — This document

This file is the written record of the contract. Changes to the gates above
must update this file in the same commit. If the rules and the documentation
disagree, the gates are the source of truth — but the documentation drift
is itself a bug, fix it.

## Skipped tests

20 vitest skips currently exist. Each is hard-justified in writing per
purses-chh.4. "Skipped because it's flaky" is not a justification — fix the
environment or move the test to a tier that does run.

## Running things locally

```bash
npm test           # unit + integration (vitest, ~7s)
npm run lint       # eslint
npx tsc --noEmit   # typecheck
npm run e2e        # Playwright (requires a local DATABASE_URL + browsers)
npm run smoke -- --public-only          # smoke against production
npm run smoke -- --sanity --public-only # smoke against a known-bad URL,
                                        # to verify the probe catches a 500
```

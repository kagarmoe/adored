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

## Test surfaces — what each one is responsible for

Start here when something is "failing" — figure out which suite, then read
the relevant section.

| Surface           | Tool        | Runs in                                                              | Mocks DB?           | What it proves                                                |
|-------------------|-------------|----------------------------------------------------------------------|---------------------|---------------------------------------------------------------|
| Unit / integration| Vitest (`npm test`) | Anywhere with Node (pglite via `vitest.global-setup.ts`)     | As little as possible | Pure logic + real handler over a real test DB                |
| E2E browser       | Playwright (`npm run e2e`) | **GitHub Actions** (`.github/workflows/e2e.yml`) — Postgres + browsers | No — real DB | Deployed-shape app works end-to-end through a real browser   |
| Post-deploy smoke | `scripts/smoke.mjs` (`npm run smoke`) | **GitHub Actions** (`.github/workflows/post-deploy-smoke.yml`) | No — hits prod | The running production deploy is actually serving real content|

When to use which:

- **Unit / integration** — cheapest, fastest. Real DB by default (see below).
- **Integration model**: `__tests__/auth-send-flow.test.ts` — drive the
  real handler, mock only what you must (network, the email provider).
- **E2E** — the only layer that exercises the real app + real DB through a
  real browser. Specs in `e2e/`.
- **Smoke** — the last-line check after every Vercel Production deploy. The
  check that would have caught the 2026-05-15 outage in seconds. Wired as a
  deploy gate (Gate 2 below).

## E2E (Playwright)

### Where it runs

**GitHub Actions** — workflow `.github/workflows/e2e.yml`. The job spins up:

- An ephemeral `postgres:16` service container
- `prisma db push` to write the schema from `prisma/schema.prisma` (we don't
  use `prisma migrate deploy` — see `infra.yaml` → `migrations`)
- `npx playwright install --with-deps chromium`
- `npm run e2e` (spawns `npm run dev` via `playwright.config.ts`'s
  `webServer`, then runs every spec in `e2e/*.spec.ts`)

On failure the Playwright HTML report and traces are uploaded as artifacts
(visit the run → Artifacts → `playwright-report` / `playwright-traces`).

### Why not the polecat sandbox?

Polecat worktrees have neither a Postgres daemon nor a Docker socket they can
reach, so they can't bring up a test DB. Browsers are installed in the image
but useless without a DB the seeded specs can talk to. CI has both natively.

This is also why every old "polecat ran e2e" report read `e2e not runnable in
sandbox` — the suite was silently skipped. The fix is "run it where it CAN
run", not "make it skippable".

### Triggering an e2e run on demand

Any agent or human with `gh` auth can fire the suite:

```bash
gh workflow run e2e.yml                # against the default branch
gh workflow run e2e.yml --ref <branch> # against any branch
gh run watch                           # tail the most recent run
gh run view --log-failed               # show failing-step logs of latest run
```

Pushing any branch also triggers it (the workflow listens on `push`), so a
polecat's normal `gt done` push validates e2e along the way.

### Running e2e locally

You need a local Postgres and the env below:

```bash
# 1. Start a throwaway Postgres (Docker)
docker run --rm -d --name purseinator-e2e-pg \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=purseinator_test \
  -p 5432:5432 postgres:16

# 2. Export the test env. Do NOT use a DATABASE_URL pointing at prod — the
#    globalSetup will refuse to seed without ALLOW_DEMO_SEED=1, but better to
#    not have prod creds in the shell at all.
export DATABASE_URL=postgresql://test:test@localhost:5432/purseinator_test
export AUTH_SECRET=$(openssl rand -base64 32)
export AUTH_RESEND_KEY=re_local_unused
export ALLOW_DEMO_SEED=1

# 3. Push schema + run
npx prisma generate
npx prisma db push --skip-generate
npm run e2e

# Interactive UI mode:
npm run e2e:ui

# Tear down
docker rm -f purseinator-e2e-pg
```

The `webServer` in `playwright.config.ts` starts `npm run dev` against the
Postgres above and seeds the demo collection automatically.

### Tripwires worth knowing about

- **`ALLOW_DEMO_SEED=1`** — `e2e/global-setup.ts` refuses to seed without
  this flag (so a stray prod `DATABASE_URL` can't accidentally insert a demo
  collection into prod). `playwright.config.ts` sets it for the spawned dev
  server; you need it set in your own shell for the runner process too.
- **`AUTH_SECRET`** — `e2e/fixtures.ts` forges a NextAuth JWT to bypass
  email auth in role-aware specs. The forged token only works against a DB
  where the corresponding `User` rows exist (the demo seed creates them).
  Use a *test* secret, not the prod one.
- **`DEMO_HOST_TEST_OVERRIDE=localhost:3000`** — set by
  `playwright.config.ts`'s `webServer.env` so the existing `localhost:3000`
  baseURL is treated as a demo host. Don't override this elsewhere.

## Unit / integration (Vitest)

```bash
npm test          # one-shot
npm run test:watch
npm run test:ui
```

Runs in any Node environment. **No external Postgres needed** —
`vitest.global-setup.ts` boots an in-process pglite Postgres (via
`@prisma/dev`) once per run and pushes the current schema. The production
`@/lib/db` module connects to it automatically because `vitest.setup.ts`
pins `process.env.DATABASE_URL` to that server.

### Mocking the DB vs hitting the real test DB

The default for action / lib tests is the **real test DB**, via
`lib/test-db.ts`:

```ts
import { getTestDb, resetTestDb, disconnectTestDb } from '@/lib/test-db'
const db = getTestDb()
afterAll(disconnectTestDb)
beforeEach(resetTestDb)            // TRUNCATE … RESTART IDENTITY CASCADE
```

Then import your action / lib normally — it talks to the real Prisma client.
Only mock `@/auth` and `next/cache`.

`vi.mock('@/lib/db')` is reserved for narrow cases (seam tests of the
@auth/core flow, page tests that only assert routing, callbacks that have
nothing to do with schema shape). **Default: use the real thing or a thin
functional fake; mock only what you must.** The full audit + rationale lives
in [`docs/TESTING.md`](docs/TESTING.md).

**Why this is the default:** the 2026-05-15 demo-500 outage was a
column-rename that landed without a matching migration. Every action test
passed because they all used `vi.mock('@/lib/db')` with a hand-rolled fake —
a mocked Prisma client has whatever shape the test pretends it has, so the
real-schema drift was invisible. `lib/__tests__/schema-drift.test.ts` is the
explicit regression guard for that class of bug.

### When to mock vs use the real thing (rules of thumb)

- **Mock network calls** to external services (Resend, Vercel Blob).
- **Mock environment-specific surfaces** (`@auth/core`'s transport) only
  when you cannot drive the real one usefully.
- **Do not** mock `@/lib/db` reflexively. If you find yourself reaching for
  it, ask whether a thin schema-aware fake or a real test DB would tell you
  more.

## Post-deploy smoke

See [`docs/smoke-test.md`](docs/smoke-test.md). The smoke is a different
animal from e2e: it probes the deployed Vercel production app, not a local
dev server, and its job is to catch deploy / migration drift in seconds.

The probe is fully unauthenticated: demo host + `/login` + `/api/health`
(which does a trivial Prisma → pg → Neon read). No secrets are required in
GitHub — putting `AUTH_SECRET` there would double its exposure surface and
expose it to anyone with repo-write.

## Structural enforcement — where the gates live

The contract is held by three structural gates, not by reviewer vigilance.

### Gate 1 — Merge to `main` requires a green CI suite

- Workflow: `.github/workflows/ci.yml` runs `lint`, `typecheck`, and `test`
  on every PR and every push to `main`.
- `.github/workflows/e2e.yml` runs Playwright on the same triggers.
- Branch protection on `main` requires those checks to be green before a PR
  can merge. To configure or re-verify:
  ```bash
  scripts/setup-branch-protection.sh
  ```

#### How to verify Gate 1

Open a throwaway PR that deliberately breaks a test (e.g. flip an assertion
in `__tests__/auth-send-flow.test.ts`). The `test` check must report failure
and the GitHub "Merge pull request" button must be disabled. Close the PR
without merging.

### Gate 2 — Vercel deploy success requires the post-deploy smoke to pass

- Workflow: `.github/workflows/post-deploy-smoke.yml` triggers on the
  GitHub `deployment_status` event Vercel fires when a Production deploy
  goes live.
- `scripts/smoke.mjs` hits the demo host, `/login`, and `/api/health` and
  fails non-zero if any is an error page or the wrong HTTP status.
- On smoke failure the workflow POSTs a `deployment_status: failure` back
  onto the same Vercel deployment, so the GitHub Deployments UI marks it
  unhealthy. **A green build with a failing smoke is not a successful
  deploy.**

#### How to verify Gate 2

Run `npm run smoke -- --sanity` locally — it points the probe at a
guaranteed-500 endpoint and asserts the probe correctly fails. For the
real gate, force a known-bad deploy (or `gh workflow run post-deploy-smoke.yml`
with a bad `app_url` override): the workflow run is red, the commit shows
a red ✗ for "post-deploy smoke", and the GitHub Deployment shows
`failure` in the Deployments tab.

### Gate 3 — This document

This file is the written record of the contract. Changes to the gates above
must update this file in the same commit. If the rules and the documentation
disagree, the gates are the source of truth — but the documentation drift
is itself a bug, fix it.

## Skipped tests

Hard-justify every skip in writing (per `purses-chh.4`). "Skipped because
it's flaky" is not a justification — fix the environment or move the test
to a tier that does run. The existing 20 opt-in network skips
(`prisma/__tests__/seed-demo.test.ts` Unsplash liveness checks) are
hard-justified inline.

## Running things locally — quick reference

```bash
npm test                           # unit + integration (vitest, ~7s)
npm run lint                       # eslint
npx tsc --noEmit                   # typecheck
npm run e2e                        # Playwright (needs local Postgres + env, see above)
npm run smoke                      # smoke against production
npm run smoke -- --sanity          # smoke against a known-bad URL,
                                   # to verify the probe catches a 500
```

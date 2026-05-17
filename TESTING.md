# Testing

This project has three test surfaces, each with a different runtime + a
different home. Start here when something is "failing" — figure out which
suite, then read the relevant section.

| Surface | Tool | Runs in | When |
|---------|------|---------|------|
| Unit / integration | Vitest (`npm test`) | Anywhere with Node | Every commit; pre-merge |
| E2E browser | Playwright (`npm run e2e`) | **GitHub Actions** (`.github/workflows/e2e.yml`) — needs Postgres + browsers | Every PR + every push; on-demand via `gh workflow run e2e.yml` |
| Post-deploy smoke | `scripts/smoke.mjs` (`npm run smoke`) | **GitHub Actions** (`.github/workflows/post-deploy-smoke.yml`) | After every successful Vercel Production deploy |

## E2E (Playwright)

### Where it runs

**GitHub Actions** — workflow `.github/workflows/e2e.yml`. The job spins up:

- An ephemeral `postgres:16` service container
- `prisma db push` to write the schema from `prisma/schema.prisma` (we don't
  use `prisma migrate deploy` — see `infra.yaml` → `migrations`)
- `npx playwright install --with-deps chromium`
- `npm run e2e` (which spawns `npm run dev` via `playwright.config.ts`'s
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

You need:

1. A local Postgres reachable at some URL (a Docker container is easiest)
2. The four env vars below

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

The `webServer` in `playwright.config.ts` will start `npm run dev` against
the Postgres above and seed the demo collection automatically.

### Tripwires worth knowing about

- **`ALLOW_DEMO_SEED=1`** — `e2e/global-setup.ts` refuses to seed without
  this flag (so a stray prod `DATABASE_URL` in your shell can't accidentally
  insert a demo collection into prod). `playwright.config.ts` sets it for
  the spawned dev server; you need it set in your own shell for the runner
  process too (the config sets it via `process.env.ALLOW_DEMO_SEED ??= '1'`
  at the top).
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

Runs in any Node environment, including the polecat sandbox. No Postgres
needed — DB-touching code is mocked at the Prisma boundary.

## Post-deploy smoke

See [`docs/smoke-test.md`](docs/smoke-test.md). The smoke is a different
animal from e2e: it probes the deployed Vercel production app, not a local
dev server, and its job is to catch deploy / migration drift in seconds.

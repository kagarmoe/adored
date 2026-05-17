# Post-deploy smoke test

The automated gate that would have caught the 2026-05-15 demo-500 in seconds
(at the time it was a manual `curl` that happened to get run).

## What it checks

`scripts/smoke.mjs` probes the live production app and exits non-zero on any
HTTP error, missing-content response, Next.js error-page render, or
non-`status:ok` health body:

| Probe | URL | Why |
|-------|-----|-----|
| `demo-home` | `https://purseinator-demo.kimberlygarmoe.com/` | Server-renders Collection rows. This is the path that 500'd on 2026-05-15 when code shipped before its migration was applied. |
| `login` | `https://purseinator-app.vercel.app/login` | Public, auth-free. Catches the case where even the front door is broken. |
| `health` | `https://purseinator-app.vercel.app/api/health` | Unauthenticated route that runs a trivial Prisma query (`db.collection.count()`). Exercises the Prisma → pg adapter → Neon path — the same surface the 2026-05-15 migration-drift outage broke — without needing a forged session. |

For the HTML probes (`demo-home`, `login`) the script asserts:
- HTTP 200
- The page `<title>` contains a known marker (so a 200 that's actually a stub
  or wrong page still fails)
- The body does not contain Next.js / Vercel error markers
  (`Application error: a server-side exception`, `FUNCTION_INVOCATION_FAILED`,
  etc.)

For `health` it asserts:
- HTTP 200
- JSON body with `status === "ok"` (a 200 with `status: "error"` means the
  route is reachable but the DB is down — still a failure)

## When it runs

**Automatically:** after every successful Vercel Production deploy.
`.github/workflows/post-deploy-smoke.yml` listens for GitHub's
`deployment_status` event (which Vercel posts on every deploy state change),
filters to `state == success && environment == Production`, then runs
`npm run smoke`.

**On demand:**
```bash
npm run smoke
```

No secrets required — every probe is unauthenticated.

**Manually from GitHub:** the workflow has `workflow_dispatch`, so you can
re-run it from the Actions tab — useful after a hotfix or to verify a
suspected outage.

## Failure signal

A failed run shows up as:
- A red ✗ on the commit (GitHub deployment status)
- A failed workflow run in the Actions tab
- An email to the commit author (default GitHub notification setting)

## Why no secrets

The workflow deliberately does NOT use `AUTH_SECRET`. That secret is the JWT
signing key — anyone who holds it can forge a session for any user. Putting it
in GitHub Actions doubles its exposure surface (Vercel + GitHub) and exposes
it to anyone with repo-write (a malicious workflow edit could `curl` it to an
attacker). DB-exercise coverage comes from `/api/health` instead, which is
public-safe (no PII in the response, no per-user data).

## Sanity check (acceptance criterion)

The bead requires "a sanity test (point it at a known-bad endpoint) confirms
it catches a 500". Run:

```bash
npm run smoke -- --sanity
```

The `--sanity` flag adds a probe against `https://httpbin.org/status/500`
which always returns HTTP 500. The probe records ✓ if the smoke logic
*correctly identifies* that as a failure — i.e. proves the error-detection
machinery works.

You can also verify by aiming the script at any guaranteed-500:
```bash
SMOKE_DEMO_URL=https://httpbin.org/status/500 \
SMOKE_APP_URL=https://httpbin.org \
npm run smoke
# Expected: exit code 1 (all three probes fail)
```

## What it does NOT check

- Database schema correctness (a migration-drift bug shows up as 500s, which
  this catches indirectly, but the script doesn't introspect the schema)
- Resend email delivery (the magic-link path is exercised in `__tests__/auth-send-flow.test.ts`)
- The full curator/operator workflow (that's what Playwright e2e is for)
- Per-user authenticated paths (the old `curator-home-authed` probe was
  removed in favor of `/api/health` — see "Why no secrets" above)

This gate is a fast, cheap "is the deployed app actually serving real
pages?" check — not a replacement for the e2e suite.

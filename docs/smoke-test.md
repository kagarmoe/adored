# Post-deploy smoke test

The automated gate that would have caught the 2026-05-15 demo-500 in seconds
(at the time it was a manual `curl` that happened to get run).

## What it checks

`scripts/smoke.mjs` probes the live production app and exits non-zero on any
HTTP error, missing-content response, or Next.js error-page render:

| Probe | URL | Why |
|-------|-----|-----|
| `demo-home` | `https://purseinator-demo.kimberlygarmoe.com/` | Server-renders Collection rows. This is the path that 500'd on 2026-05-15 when code shipped before its migration was applied. |
| `login` | `https://purseinator-app.vercel.app/login` | Public, auth-free. Catches the case where even the front door is broken. |
| `curator-home-authed` | `https://purseinator-app.vercel.app/` with a forged NextAuth JWT (same trick as `e2e/fixtures.ts`) | Exercises `auth()` + a real DB query against `CollectionMembership` / `User`. Catches schema/migration drift on the authenticated path. |

For each probe the script asserts:
- HTTP 200
- The page `<title>` contains a known marker (so a 200 that's actually a stub
  or wrong page still fails)
- The body does not contain Next.js / Vercel error markers
  (`Application error: a server-side exception`, `FUNCTION_INVOCATION_FAILED`,
  etc.)

## When it runs

**Automatically:** after every successful Vercel Production deploy.
`.github/workflows/post-deploy-smoke.yml` listens for GitHub's
`deployment_status` event (which Vercel posts on every deploy state change),
filters to `state == success && environment == Production`, then runs
`npm run smoke`.

**On demand:**
```bash
# Locally, against production:
AUTH_SECRET=$(echo "$SOMEWHERE_SAFE") npm run smoke
# Public probes only (skips the authenticated check; no secret required):
npm run smoke -- --public-only
```

**Manually from GitHub:** the workflow has `workflow_dispatch`, so you can
re-run it from the Actions tab — useful after a hotfix or to verify a
suspected outage.

## Failure signal

A failed run shows up as:
- A red ✗ on the commit (GitHub deployment status)
- A failed workflow run in the Actions tab
- An email to the commit author (default GitHub notification setting)

## Required GitHub Actions secret

The authenticated probe needs `AUTH_SECRET` set as a repository secret
(Settings → Secrets and variables → Actions → New secret). Its value must
match the `AUTH_SECRET` set in the production Vercel project — that secret is
*Sensitive* in Vercel and can't be read back via `vercel env pull`, so the
human who set it originally has to paste it into GitHub.

If `AUTH_SECRET` is not set in the workflow environment, the authenticated
probe fails fast (it does not silently skip — silence here would defeat the
point of the gate). To intentionally skip it (e.g. while you're still wiring
up the secret), pass `--public-only`.

## Sanity check (acceptance criterion)

The bead requires "a sanity test (point it at a known-bad endpoint) confirms
it catches a 500". Run:

```bash
npm run smoke -- --public-only --sanity
```

The `--sanity` flag adds a probe against `https://httpbin.org/status/500`
which always returns HTTP 500. The probe records ✓ if the smoke logic
*correctly identifies* that as a failure — i.e. proves the error-detection
machinery works.

You can also verify by aiming the script at any guaranteed-500:
```bash
SMOKE_DEMO_URL=https://httpbin.org/status/500 \
SMOKE_APP_URL=https://httpbin.org \
npm run smoke -- --public-only
# Expected: exit code 1
```

## What it does NOT check

- Database schema correctness (a migration-drift bug shows up as 500s, which
  this catches indirectly, but the script doesn't introspect the schema)
- Resend email delivery (the magic-link path is exercised in `__tests__/auth-send-flow.test.ts`)
- The full curator/operator workflow (that's what Playwright e2e is for)

This gate is a fast, cheap "is the deployed app actually serving real
pages?" check — not a replacement for the e2e suite.

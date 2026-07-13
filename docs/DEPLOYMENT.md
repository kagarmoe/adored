# Adored Deployment Guide

## Vercel Deployment

Adored is optimized for deployment on [Vercel](https://vercel.com), with automatic environment variable validation and Vercel Blob storage integration for photo uploads.

### Prerequisites

1. **Vercel Account** — Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository** — Project must be pushed to GitHub
3. **PostgreSQL Database** — Vercel Postgres or external managed database
4. **Email Provider** — SMTP credentials for transactional emails (optional for development)

### Step 1: Create Vercel Project

```bash
# Option A: Via Vercel CLI
vercel

# Option B: Via Vercel Dashboard
# 1. Go to https://vercel.com/dashboard
# 2. Click "Add New" → "Project"
# 3. Select GitHub repository
# 4. Vercel auto-detects Next.js configuration
```

### Step 2: Configure Environment Variables

**All environment variables must be set in Vercel Dashboard** (not in vercel.ts).

In Vercel Project Settings → Environment Variables, add:

#### Required (All Environments)

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Vercel Postgres or external DB connection string |
| `AUTH_SECRET` | `(generated value)` | Generate: `openssl rand -base64 32`. Validated by `src/lib/env.ts` (min 32 chars); it is the **fallback source for `BETTER_AUTH_SECRET`** (NextAuth is retired — there is no `NEXTAUTH_*` bridge) |
| `AUTH_URL` | `https://your-domain.vercel.app` | Production domain. Previews derive it from `VERCEL_URL` if unset. Fallback source for `BETTER_AUTH_URL` (`src/lib/auth-server.ts`) |

#### Optional (Production)

| Variable | Example | Notes |
|----------|---------|-------|
| `EMAIL_SERVER_HOST` | `smtp.provider.com` | SMTP hostname (Resend, SendGrid, AWS SES, etc.) |
| `EMAIL_SERVER_PORT` | `587` | SMTP port (usually 587 or 465) |
| `EMAIL_SERVER_USER` | `api_user@provider.com` | SMTP username or API key |
| `EMAIL_SERVER_PASSWORD` | `smtp_password` | SMTP password or API secret |
| `EMAIL_FROM` | `noreply@yourdomain.com` | Sender email address |

#### Auto-Configured by Vercel

- `BLOB_READ_WRITE_TOKEN` — Automatically set for Vercel Blob storage access
- `NODE_ENV` — Automatically set based on deployment environment. **Vercel sets `NODE_ENV=production` for PREVIEW deploys as well as production.** The API's `500` handler relies on exactly that: it inlines full error detail in the response body only when `NODE_ENV !== "production"` (local dev), so preview URLs — which are internet-reachable and get shared — never leak driver text. The gate is deliberately `NODE_ENV`, **not** `VERCEL_ENV`; do not "fix" it to the latter (see [Tracing a 500](#tracing-a-500-in-production)).

### Step 3: Connect Database

#### Option A: Vercel Postgres (Recommended)

```bash
# In Vercel Dashboard:
# 1. Go to Storage tab
# 2. Click "Create Database" → "Postgres"
# 3. Vercel auto-populates DATABASE_URL
```

#### Option B: External PostgreSQL

```bash
# Manually add DATABASE_URL environment variable with your connection string
# Format: postgresql://user:password@host:port/database
```

### Step 4: Run Database Migration

After deployment is connected to database:

```bash
# SSH into Vercel deployment
vercel env pull  # Pull environment variables locally

# Run migration (once per database)
npm run db:migrate
```

Or manually via Vercel CLI:

```bash
vercel env pull
npm run db:migrate
```

### Step 5: Deploy

```bash
# Push to GitHub (automatically triggers Vercel deployment)
git push origin main

# Or manually trigger via Vercel Dashboard
```

### Step 6: Verify Deployment

```bash
# Check build logs
vercel logs

# Test authentication
# 1. Visit https://your-domain.vercel.app/login
# 2. Try sign up or email sign-in
# 3. Check Vercel logs for magic link output (development only)
```

## Skipping the `gh-pages` reports branch

The repo publishes its review/report artifacts to a `gh-pages` branch. That branch is
**not** a deployable app, so Vercel must be told to skip building it — otherwise every
push to `gh-pages` triggers a Vercel build that **errors**.

**The fix lives in the Vercel dashboard, not in `vercel.json`.** Configure
**Settings → Git → Ignored Build Step** with the command:

```bash
bash -c 'if [ "$VERCEL_GIT_COMMIT_REF" = "gh-pages" ]; then exit 0; else exit 1; fi'
```

Exit code `0` tells Vercel to **skip** the build; exit `1` tells it to **proceed**. So
this skips `gh-pages` and builds every other branch.

**Why not `vercel.json`?** The obvious-looking approach —

```json
{ "git": { "deploymentEnabled": { "gh-pages": false } } }
```

— does **nothing** here. Vercel reads `vercel.json` from the branch *being deployed*. The
`gh-pages` reports branch contains only published artifacts and has **no `vercel.json`**,
so the exclusion is never seen and `gh-pages` still deploys (and errors). The non-functional
block was removed in #199; the Ignored Build Step above is the working replacement because
it is configured on the project, not read from the deployed branch.

## Feature Integration on Vercel

### Photo Upload (Vercel Blob)

- **Automatic** — `BLOB_READ_WRITE_TOKEN` is auto-configured
- **Bucket** — Files stored in Vercel Blob storage
- **CDN** — Photos served via Vercel's global CDN
- **Cost** — Included in Vercel project

### Email (Transactional)

#### Development
- Magic links printed to console (no SMTP needed)
- Password reset emails not sent

#### Production
- Configure SMTP provider:
  - **Resend** (recommended) — Free tier, 100 emails/day
  - **SendGrid** — Free tier, 100 emails/day
  - **AWS SES** — Pay-per-email, lowest cost at scale
  - **Postmark** — Enterprise-grade, $1.50/month
  - **Gmail** — Requires app password (not recommended)

Example: Setting up Resend

```bash
# 1. Create account at https://resend.com
# 2. Generate API key
# 3. In Vercel Environment Variables:
#    EMAIL_SERVER_HOST = smtp.resend.com
#    EMAIL_SERVER_PORT = 587
#    EMAIL_SERVER_USER = resend
#    EMAIL_SERVER_PASSWORD = re_xxxxx (your API key)
```

### Database Backup & Recovery

```bash
# Backup database locally
pg_dump $DATABASE_URL > backup.sql

# Restore from backup
psql $DATABASE_URL < backup.sql

# Vercel Postgres automatic backups
# Available in Storage tab → Backups
```

## Environment Validation

All environment variables are validated at build time and runtime using Zod schemas in `src/lib/env.ts`.

Missing or invalid variables will cause:
- **Build Failure** — Configuration errors caught during build
- **Runtime Error** — Invalid values throw on first request

Check Vercel build logs if deployment fails:
```bash
vercel logs --follow
```

## Performance Optimization

### Vercel-Specific Settings

The `vercel.ts` configuration includes:
- Automatic Next.js framework detection
- Static asset caching (1 year for immutable assets)
- Request/response optimization
- Regional latency reduction

### Monitoring

1. **Vercel Dashboard** → Analytics tab
2. **Web Vitals** — Automatically tracked
3. **Serverless Function Duration** — Monitor in deployment logs
4. **Error Tracking** — Failed requests visible in logs

### Tracing a 500 in production

An unhandled API error returns **no detail** to the caller — only generic copy plus a correlation id:

```json
{ "error": "Something went wrong. Please try again.", "errorId": "b1e2…-uuid" }
```

The full error is in the runtime logs under a greppable prefix, keyed by that same `errorId`:

```bash
vercel logs --follow          # then grep for [api_error] or the errorId the user reported
```

```
[api_error] {"errorId":"b1e2…","error":{"name":…,"message":…,"stack":…,"cause":{…},
             "code":"23503","constraint_name":…,"table_name":…, …}}
```

The log line carries the error's `name`/`message`/`stack`, the recursively-unwrapped `cause` chain (drizzle/postgres wrap the real driver error underneath), and the postgres-js driver fields. It deliberately **omits `query` and `parameters`** — those carry user values (PII). So: get the `errorId` from the caller's response, grep one log line, get the whole error. Do **not** re-add raw error text to the response to make debugging easier — that leak is what this replaced (it reached *unauthenticated* callers via `GET /api/shared-results/[token]`). Contract: [`docs/API.md`](API.md#error-bodies-the-errorresponse-contract); rationale: ARCHITECTURE decision 30.

DB-layer failures log separately under `[db_error]` (`src/lib/db-error-log.ts`) and emit one `db_action_failed` PostHog event — same greppable shape.

## Troubleshooting

### Build Failures

```bash
# 1. Check environment variables
vercel env list

# 2. Check build logs
vercel logs

# 3. Verify database connection
vercel env pull
npm run db:migrate
```

### Environment Variable Not Found

```bash
# Variables are case-sensitive. Verify exact names:
vercel env list

# For preview deployments, set environment:
# Vercel Dashboard → Environment Variables → Preview
```

### Photo Upload Not Working

```bash
# Verify Vercel Blob is enabled
vercel env list | grep BLOB

# Check storage usage
# Vercel Dashboard → Storage → Blob Storage
```

### Email Not Sending

```bash
# 1. Verify SMTP credentials in Vercel Dashboard
# 2. Check Vercel logs for SMTP errors:
vercel logs --grep email

# 3. Test locally with environment variables:
vercel env pull
npm run dev
```

## CI gates that stand between a merge and a deploy

Vercel deploys `main` on merge, so CI (`.github/workflows/ci.yml`) is the last gate before production. Notes that surprise people:

- **`Supply-chain scan (osv-scanner)` runs first in the gate job, before `npm ci`** — it vets `package-lock.json` against the OSV database (CVEs *and* npm malware advisories) before any install-lifecycle script can execute. The binary is version-pinned and sha256-verified in the workflow. **There is no ignore file and there are no suppressions** — both former ignores (postcss-inside-next, esbuild-under-drizzle-kit) were fixed outright with npm `overrides`, and `osv-scanner.toml` was deleted (ARCHITECTURE decisions 35 + 39). So **any** finding is a real finding: fix it, or add a reasoned, bead-owned ignore deliberately — never to quiet the gate. `scripts/overrides.test.ts` fails if either override stops being necessary or stops applying, so a stale override cannot rot in the lockfile.
- **`auth:verify` runs in CI — in the `db-tests` job, not `gate`.** It queries the live auth tables, so it needs that job's migrated Postgres service; the DB-less `gate` job cannot run it (locally it only works because `.env.local` exists). The pre-push hook does **not** run it (the hook mirrors lint + test:ci + build only).
- **`Recompute bench (p95 gate)`** — the sort-recompute benchmark is a **blocking gate**, not advisory (it was renamed from `Recompute bench (advisory)`; `continue-on-error` is gone and `scripts/bench-recompute.ts` now exits non-zero). It runs **only when the `hot` paths-filter fires** (`src/server/services/**` and the rest of the recompute hot path) and fails the build when the compare-phase **p95 exceeds 4× the committed baseline** (`bench/recompute-baseline.json`), or when the baseline is missing, or when the bench cannot run. The 4× is deliberately generous — a GitHub runner already measures ~1.5× the dev-Mac baseline from hardware alone, so a tighter gate would flake — and it is a *shape* gate (an O(N²) path returning), not an absolute-latency gate: local Docker p95 ≠ Neon p95. If it fires, **do not re-baseline to go green**; `--update-baseline` is only for a deliberate algorithm change. Rationale: ARCHITECTURE decision 31.
- **E2E Postgres is on a worktree-derived port, not `:5433`.** `e2e/fixtures/test-db.sh` hashes the worktree path into a slot → container `pi-e2e-db-<slot>`, DB port `15432 + slot`, app port `3100 + slot` (parallel worktrees used to clobber each other's container/database). Ask the script (`test-db.sh url` / `app-url`) — never hardcode a literal, and note CI no longer pins `DATABASE_URL_TEST` for the e2e job.

## Rolling Back

```bash
# Revert to previous deployment
vercel rollback

# Or redeploy specific commit
git revert <commit-hash>
git push origin main
```

## Production Readiness Checklist

- [ ] Database URL configured and migration run
- [ ] AUTH_SECRET set and >= 32 characters
- [ ] AUTH_URL matches production domain (or derived from VERCEL_URL on previews)
- [ ] Email provider configured (if using transactional emails)
- [ ] Custom domain added (if not using vercel.app domain)
- [ ] SSL certificate verified
- [ ] Build logs show no errors or warnings
- [ ] Auth flow tested (login, signup, password reset)
- [ ] Photo upload tested
- [ ] Performance metrics acceptable

# Setup Checklist — keys, dashboards, redeploys

Operator punch-list of the **out-of-band** setup this app needs — secrets, external dashboards, and redeploys that live outside the code. Shipped code deploys itself; this file is the "things a human has to go get." Keep it current as new integrations land.

Env vars are set in **Vercel → Settings → Environment Variables** (per environment: Production / Preview / Development), and take effect only on the **next deployment**. Locally, the same vars live in `.env.local`.

---

## 1. Blocking today — shipped features that are dead without these

- [ ] **`RESEND_API_KEY`** — **Live email.** `src/lib/email.ts` silently **no-ops** without it, so magic-link sign-in and collection invitations never send. Get a key at resend.com and set it. The sender domain `kimberlygarmoe.com` is already Resend-verified and `EMAIL_FROM` defaults to `noreply@kimberlygarmoe.com`, so the key is the only missing piece.
- [ ] **`BLOB_READ_WRITE_TOKEN`** — **Photo uploads (local and prod).** The token currently in `.env.local` is rejected (`Access denied` — expired/invalid), so uploads fail. Regenerate it in **Vercel → Storage → Blob**, and set it in **both** the Vercel env and your local `.env.local`. *(A dev-only fallback renders seeded demo images without Blob, but real uploads still need a valid token.)*
- [ ] **`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`** — **All PostHog telemetry** (verify it's set). Without it every capture no-ops silently, which disables the DB observability shipped this cycle — `db_action_failed` (failure rate) and `db_action_slow` (latency > 1s) — as well as product analytics. Confirm the PostHog project token is present in the env.

## 2. External dashboards (no code, no redeploy)

- [ ] **Neon → enable `pg_stat_statements`.** The per-normalized-query latency view referenced by `docs/runbooks/db-performance-monitoring.md` (mean/p95/calls — "which query is slow"). One extension toggle / `CREATE EXTENSION` in the Neon console.
- [ ] **Vercel → confirm the "deployment failed" emails stop.** The `gh-pages` coverage branch is no longer built (`vercel.json` `git.deploymentEnabled`), effective on the **next production deploy**. If any failure emails linger, set **Settings → Git → Ignored Build Step**.
- [ ] *(Optional)* **Vercel Observability Plus** — only if you want `[db_slow]` / `[db_error]` runtime-log history beyond the default retention (Hobby ~1h, Pro ~1d). PostHog is the durable aggregate regardless.

## 3. Redeploys / restarts

- [ ] **Redeploy prod** after setting any of the §1 vars — env changes apply only on a new deployment (redeploy, or push).
- [ ] **Restart local dev** (`npm run dev`) after updating `.env.local` (esp. the regenerated Blob token).
- [ ] **Do not** keep Vercel system vars (e.g. `VERCEL=1`) in `.env.local` — the env guard warns that `VERCEL=1` + an `http://` `AUTH_URL` makes NextAuth write `Secure` cookies the browser drops, silently breaking local auth (every request bounces to `/login`).

## 4. Future — better-auth migration (bead `purses-74tx`), only when you start it

Parked until it's done as its own effort. When you begin:

- [ ] **Google Cloud OAuth 2.0 client** — create it, get the **client ID + secret**, and register the **authorized redirect URIs**: `https://adored.kimberlygarmoe.com/api/auth/callback/google` (Production + Preview) and `http://localhost:3000/api/auth/callback/google` (local).
- [ ] **`BETTER_AUTH_SECRET`** (may reuse `AUTH_SECRET`, ≥32 chars) and **`BETTER_AUTH_URL`** set per environment (a mismatch is the classic `redirect_uri_mismatch`).
- Decisions already settled: **reset** path (no data migration; keeps email+password + Google + magic-link); the one-time everyone-out is moot with no real users. See `docs/superpowers/specs/2026-07-01-better-auth-migration-design.md` + the plan.

## 5. Needs no action (ships with the next deploy)

The code from this cycle carries itself: authz hardening (CI page-guard), the DB slow-op sink, `statement_timeout = 25s` on the DB client, the advisory recompute benchmark, and the telemetry-hygiene fixes. Nothing to configure — they land when `main` deploys.

---

### Quick reference — env vars

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes (set) | Neon Postgres connection |
| `AUTH_URL` / `AUTH_SECRET` | yes (set) | NextAuth (bridged to `NEXTAUTH_URL`/`NEXTAUTH_SECRET`) |
| `RESEND_API_KEY` | **needed** | Live email (magic-link + invitations) |
| `BLOB_READ_WRITE_TOKEN` | **needed (regen)** | Photo uploads |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | **verify** | Analytics + DB observability |
| `EMAIL_FROM` | default | Sender (`noreply@kimberlygarmoe.com`) |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | future | better-auth (`74tx`) |

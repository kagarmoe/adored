# Auth Middleware Session Bug (#62) — Env Hygiene Fix Design

**Date:** 2026-06-01
**Issue:** #62 (auth middleware rejects valid sessions); related #59 (post-login redirect flake); unblocks #31 (T8 layout spec) and all authenticated e2e specs.

## Problem

`withAuth` middleware redirects authenticated requests (`/collections`) to `/login`, even though `GET /api/auth/session` accepts the same session cookie. This blocks every authenticated e2e spec.

## Root cause (proven by diagnostics)

`vercel env pull` wrote Vercel **system** environment variables into `.env.local`, including:

```
VERCEL="1"
VERCEL_ENV="production"
```

NextAuth decides cookie security from `VERCEL` / `NEXTAUTH_URL`: when `VERCEL=1`, it writes the session cookie as **`__Secure-next-auth.session-token`** with the `Secure` flag. The local / e2e server runs on **`http://localhost`**, and browsers **drop `Secure` cookies over http**. So:

- The cookie is *written* but never *sent back* by the browser.
- Middleware's internal `getToken()` finds no session token → `authorized` returns false → redirect to `/login`.
- The API route path appeared to "work" in earlier probes because of how the request context carried cookies; the real browser navigation (which middleware gates) correctly dropped the Secure cookie.

Diagnostic evidence: middleware saw cookies `[next-auth.csrf-token, next-auth.callback-url]` (no session token), with `VERCEL: "1"` and `NEXTAUTH_URL: http://localhost:3100`.

**Production is unaffected:** real Vercel deploys are https, so `VERCEL=1` correctly selects Secure cookies that the browser sends. The defect is local/e2e only, caused by an environment file that lies ("you are on Vercel in production" on a localhost http machine).

## Principle

Cookie security is correctly handled by NextAuth + Vercel's native detection **in the environment where Vercel actually runs**. The bug is not in the auth code or in Vercel's feature — it is a polluted `.env.local`. The fix is **subtraction** (remove the lie) and **isolation** (give e2e its own authoritative environment), with **no app/auth/middleware code changes**. Vercel's Secure-cookie auto-detection stays intact in prod/preview, where it is correct.

## Decisions made during brainstorming

- **Keep auth in e2e, but as a one-time gate** (the auth spec + storageState setup), not per-spec. Unit/DB tests cover credential logic; only e2e catches integration failures like this Secure-cookie-over-http bug — which is exactly why auth belongs in e2e.
- **Do NOT harden auth** by overriding `useSecureCookies` from `AUTH_URL`. That was considered and rejected: it needlessly disables Vercel's useful native cookie detection where it works correctly. The bug is the env, not the code.
- **Trust Vercel in production**; do **not** treat raw `vercel env pull` output as a local dev file — its system vars (`VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_GIT_*`, `VERCEL_OIDC_TOKEN`) describe where Vercel runs the app, not where you run it, and must never live in `.env.local`.
- **The Playwright `env:` block is the canonical e2e environment definition** — preferred over a separate `.env.e2e` / `.env.test.local` file (Next does not load `.env.test.local` for a `next start` production build anyway).

## Fix (three parts, no app code)

### Part 1 — Clean `.env.local`
Remove all Vercel system / tooling vars; keep only our own config:
- **Remove:** `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_GIT_*`, `VERCEL_OIDC_TOKEN`, `NX_DAEMON`, `TURBO_*`.
- **Keep:** `DATABASE_URL` (dev Neon branch), `AUTH_URL`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`, any email vars.
- Fixes local `npm run dev` (also currently broken by the leaked `VERCEL=1`).

### Part 2 — Make the Playwright `env:` block authoritative
In `playwright.config.ts` `webServer.env`, explicitly neutralize `VERCEL` so the e2e server always writes a non-Secure cookie that survives `http://localhost`, regardless of `.env.local` state:
```ts
env: {
  DATABASE_URL: TEST_DATABASE_URL,
  AUTH_URL: BASE_URL,            // http://localhost:3100
  AUTH_SECRET: "e2e-only-secret-at-least-32-characters-long-xx",
  VERCEL: "",                    // neutralize any inherited VERCEL=1 → plain cookie over http
},
```
The config becomes the single source of truth for the test environment; tests are correct even if `.env.local` is re-polluted.

### Part 3 — Document the rule
- `.env.example`: comment that Vercel system vars must not be added to `.env.local`.
- `docs/DEPLOYMENT.md`: short note — `vercel env pull` dumps system vars; pull-then-strip, or pull only specific keys, before using as a local env.

## Verification

1. Clean `.env.local`; `npm run dev` → log in via UI → reach `/collections` (no bounce).
2. e2e: finish/unblock **T8 `layout.spec.ts`** — the storageState session authenticates through middleware, `/collections` loads, layout assertions pass on tablet/phone/desktop.
3. Re-run the full e2e suite (smoke + auth + layout) green across all viewports.
4. Close **#62** and **#59** (same root cause).

## Out of scope / follow-ups (already filed)
- **#61** collections grid not responsive — once fixed, add a per-viewport column-count assertion to `layout.spec.ts`.
- **#43** duplicate-index migration NOTICE.
- e2e CI wiring (#38 / T15).

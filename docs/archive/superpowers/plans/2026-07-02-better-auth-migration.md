# Plan — better-auth migration (bead purses-74tx)

Spec: `docs/superpowers/specs/2026-07-01-better-auth-migration-design.md` (approved; decisions settled). Path = **RESET** (no data migration). Methods = **email+password + Google + magic-link**. Execute phased via subagent-driven-development; each phase is independently mergeable and leaves the app working.

## Global constraints
- **The façade is sacred:** `getSession()`/`requireAuth()` keep their signatures and return exactly `{ user: { id, email, name } }` + `UnauthorizedError`. The 249 call sites and the `userId`-string DAL must not change.
- No authz change — better-auth changes *authentication* only; the DAL capability model is untouched.
- Standard test discipline; each phase green on `test:ci` before the next.
- **Prerequisite for Phase 4's Google path + all validation (USER):** a Google Cloud OAuth client (client id/secret + authorized redirect URIs incl. `…/api/auth/callback/google` for prod/preview/local), `BETTER_AUTH_SECRET` (reuse `AUTH_SECRET`), `BETTER_AUTH_URL` per env. Email+password + magic-link build and test without Google.

---

## Phase 0 — Install + auth instance alongside NextAuth (no cutover)
Install `better-auth`. Create `src/lib/auth-server.ts` (the better-auth `auth` instance): `drizzleAdapter(db, { provider: "pg" })`, `emailAndPassword: { enabled: true }`, `socialProviders.google` (reads `GOOGLE_CLIENT_ID/SECRET`, optional until set), the `magicLink` plugin (its `sendMagicLink` → our existing `src/lib/email.ts sendMagicLink`), and `nextCookies()` **as the last plugin**. Mount `src/app/api/auth/[...all]/route.ts` via `toNextJsHandler(auth)`. Add env vars (optional-typed so the app still boots pre-Google). NextAuth stays live; nothing switches yet.
> **Teaching — plugin order & the two handlers.** better-auth is one server `auth` object; `toNextJsHandler` exposes its whole surface (sign-in/out, callbacks, magic-link verify) under one catch-all route — contrast NextAuth's `[...nextauth]`. `nextCookies()` **must be last** because plugins wrap each other like middleware; the cookie-writer has to see the final response to attach the `Set-Cookie`. This is the "issue the browser session" step from spec §0.

## Phase 1 — Schema reset (forward-only migration)
Generate better-auth's `user/account/session/verification` schema (CLI `@better-auth/cli generate` or hand-author into `src/lib/db/schema.ts`). Write a **forward-only** Drizzle migration that drops the NextAuth auth tables and any user-FK'd rows (no real users → clean), and creates better-auth's tables. Because app tables FK `user.id`, the reset clears them too (disposable). Update `schema.ts` types.
> **Teaching — the four tables (spec §0).** `user` = identities; `account` = provider links + the password hash (so one person can hold a `credential` account **and** a `google` account under one `user`); `session` = live DB sessions (the opaque token the cookie carries); `verification` = pending magic-link tokens (hashed, expiring). Reset is clean here only because there's no data to preserve — with real users this phase would be the migrate-SQL from spec §5.

## Phase 2 — The session-shape façade (keystone)
Rewrite `getSession()`/`requireAuth()` in `src/lib/auth.ts` to call `auth.api.getSession({ headers: await headers() })` and return the **byte-identical** `{ user: { id, email, name } }` (+ `UnauthorizedError`). Handle **name-freshness**: after a profile display-name edit, the live session must reflect it (better-auth session refresh / cookie-cache invalidation on save) — not a stale cached name. Tests: exact shape + **post-profile-edit freshness**.
> **Teaching — why this one file collapses the blast radius.** 249 call sites read auth through these two functions, and the DAL takes a plain `userId: string` (decoupled). Keep the return shape and none of them know the engine changed underneath — the migration's whole risk profile rides on this façade. The name-freshness wrinkle is the one thing DB-sessions+cookie-cache change vs the old mutable-JWT-claim: a cached session can lag a DB write until refreshed.

## Phase 3 — Middleware → optimistic
Replace `withAuth` (`src/middleware.ts`) with better-auth's `getSessionCookie(request)` optimistic redirect, preserving the exact matcher and the `SESSIONLESS_POST_ROUTES` allowlist (verify the Blob-upload callback still passes).
> **Teaching — optimistic vs authoritative, and why it's safe here.** better-auth's middleware checks only *cookie presence* (no DB read at the edge) — it can't tell a valid session from a forged cookie. That's fine **because real enforcement lives in the DAL**: the review verified all 49 routes + 27 pages independently call `requireAuth`/`requireApiCapability`. Middleware is a UX redirect, not the security boundary — losing its authority costs nothing. (One cosmetic change: an unauthenticated invite-link visitor now sees the client shell before the API 401s.)

## Phase 4 — UI cutover to the better-auth client
Replace `next-auth/react` with better-auth's `authClient` (`createAuthClient()`): login page (`signIn.email` + `signIn.magicLink` + a **Google button** `signIn.social({provider:"google"})`), signup, `Header` (`signOut`), `ProfileForm`, `PostHogProvider`, `SessionProviderWrapper` (replace `SessionProvider`/`useSession`). Google button ships but needs the user's creds to function.
> **Teaching — the OAuth redirect dance in practice.** `signIn.social({provider:"google"})` sends the browser to Google with your `client_id` + registered `redirect_uri`; Google returns a `code` to `…/callback/google`; better-auth exchanges it (server-side, with the `client_secret`) for the OIDC `id_token`, verifies Google's signature, and links/creates the local `user`+`account`. This is spec §0's federation flow — the `redirect_uri` allow-list in Google Cloud is the trust boundary.

## Phase 5 — Retire NextAuth
Delete the custom `POST /api/auth/signup` route (better-auth owns signup), `next-auth` + `@auth/drizzle-adapter` deps, `next-auth.d.ts`, `auth-callbacks.ts`, the old `[...nextauth]` route, and any now-dead env (`EMAIL_SERVER_*`). Confirm nothing imports `next-auth`.
> **Teaching — what each deletion did.** `auth-callbacks.ts` = the jwt/session callbacks that injected `id`/`name` and the `trigger:"update"` name refresh (now the façade's job); the signup route = manual bcrypt hashing (now better-auth); `next-auth.d.ts` = the TS module augmentation that widened the `Session` type (unneeded — the façade owns the shape).

## Validation (with the user — cannot be automated)
Google login round-trip (their OAuth client), a real magic-link email end-to-end (prod Resend), email+password signup/login, and the one-time everyone-out. **Do not merge the cutover (Phases 3–5) unreviewed.**

## Sequencing
Phase 0–2 are safe alongside NextAuth (nothing switches; mergeable independently). Phase 3–5 are the cutover — build behind the same branch, validate with the user, merge together. Google creds gate Phase 4's Google path + validation, not the earlier phases.

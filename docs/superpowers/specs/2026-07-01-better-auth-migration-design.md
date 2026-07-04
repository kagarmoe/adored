# Design — Migrate auth to better-auth (email + Google + magic-link) — bead purses-74tx

Status: DRAFT for review (research complete; **no code cutover** — this is the plan + the teaching). Governing authorities: `PRODUCT.md`, `TONE.md`. Written to be read by an engineer fluent in **AWS IAM, AuthN/Z, and cryptography** but new to the web-app / Next.js / NextAuth / better-auth ecosystem.

---

## 0. Primer — web-app auth, mapped to what you already know

You know IAM: principals, policies, roles, STS temporary credentials, trust policies, federation. Web-app auth is a **different layer** — it's about *end-user identity for one app* and *carrying that identity across stateless HTTP requests*. The mapping:

- **Session ≈ STS temporary credential, but for a browser.** HTTP is stateless; after you prove who you are (login), the server issues a **session** the browser presents on every later request. It rides in a **cookie** (an `httpOnly` cookie the browser attaches automatically — JS can't read it, which blunts XSS token theft). Two ways to build it:
  - **JWT session (stateless):** the cookie *is* a signed token carrying the claims (user id, email). The server verifies the signature (HMAC/asymmetric — your crypto) and trusts the claims without a lookup. Fast, but **you cannot revoke it** before expiry — like an STS token with a fixed TTL and no way to invalidate early. **This is what we run today** (NextAuth JWT strategy, 30-day TTL).
  - **DB session (stateful):** the cookie holds an opaque random **token**; the server looks it up in a `session` table each request. Revocable (delete the row = instant logout everywhere), at the cost of a DB read per request (mitigated by a short-lived cookie cache). **This is better-auth's default.** The migration therefore trades JWT-statelessness for **server-side revocability** — a trade an IAM person will read immediately as "session invalidation becomes possible."
  - Cookie hardening is layered, not one thing: `httpOnly` blunts token theft via XSS, `Secure` forces TLS, and `SameSite=Lax` blocks cross-site cookie replay on top-level navigation — but SameSite is a *mitigation*, not a complete CSRF defense; the actual CSRF stop is the library's **origin / CSRF-token check** (better-auth ships `trustedOrigins`). Together, the web equivalent of scoping and protecting a credential.

- **Google sign-in = OAuth2 / OIDC authorization-code flow = federation.** Exactly the shape of federating an external OIDC IdP into AWS, minus AWS specifics: (1) redirect the user to Google with your `client_id` + a pre-registered `redirect_uri`; (2) user consents; (3) Google redirects back with a short-lived `code`; (4) your server exchanges `code` + `client_secret` for tokens, including an **OIDC `id_token`** — a JWT **signed by Google** whose signature you verify against Google's public keys (your crypto again); (5) you map the verified Google identity to a local user (create or link). The **authorized redirect URI allow-list** in Google Cloud is precisely a **trust boundary** — like a trust policy naming who may assume: only your registered callback can receive the code. better-auth runs steps 1–5; you supply the `client_id`/`client_secret` and register the redirect URIs.

- **Magic-link = a single-use, time-boxed bearer proof of email control.** The server generates a high-entropy random token, stores it **hashed** with a short expiry, and emails a link containing it. Clicking proves the person controls the inbox → the server mints a session. Conceptually a short-lived, one-shot credential delivered out-of-band; the hash-at-rest + expiry are the same hygiene you'd apply to any secret.

- **The "adapter" + auth tables.** A web auth library persists four things: **`user`** (identities), **`account`** (external-provider links + password hashes — one user can have a `credential` account *and* a `google` account), **`session`** (live DB sessions, if stateful), **`verification`** (pending magic-link/verification tokens). The **adapter** is the shim that maps the library's reads/writes onto your DB (here, Drizzle/Postgres). Migration friction lives almost entirely in these four tables.

With that scaffolding, the rest of this doc is concrete.

---

## 1. Problem & goal
Offer **email, Google, and magic-link** sign-in, and **simplify** the auth code. Today: NextAuth v4 with a hand-wired Credentials provider + a magic-link `EmailProvider`, **no Google**, a custom signup route, and manual jwt/session callbacks. Google is first-class in better-auth (free win); magic-link is a supported plugin; and the boilerplate (Credentials provider, sign-in callback that inserts email users, jwt/session callbacks, custom signup, the `next-auth.d.ts` module augmentation) largely **deletes**.

## 2. Current auth (the picture)
- **Library:** NextAuth v4.24 + `@auth/drizzle-adapter`. **Session = JWT**, 30-day TTL (the `session` table exists but is unused). Providers: Credentials (bcrypt cost 12) + EmailProvider (magic-link via Resend). No Google.
- **Session shape:** `{ user: { id, email, name? } }`, injected in the jwt→session callbacks.
- **Server access, and the key lever:** ~**249** call sites hit `getSession()` / `requireAuth()` across ~130 files, and **153** lines read `session.user.id`. **But they all funnel through two functions** (`getSession`/`requireAuth` in `src/lib/auth.ts`) and the authz chokepoint (`requireApiCapability`, `src/server/dal/collection-access.ts`) takes a plain **`userId: string`** — decoupled from the session shape. **If the migration preserves those two signatures and the `{user:{id,email,name}}` shape, the blast radius collapses from ~130 files to ~15.** This is the single most important design decision in the whole migration.
- **~12 files** import `next-auth` directly (middleware, login, signup, `Header`, `ProfileForm`, `DeleteAccountSection`, `PostHogProvider`, `SessionProviderWrapper`, `auth.ts`, `auth-callbacks.ts`, the `[...nextauth]` route, `next-auth.d.ts`).

## 3. better-auth fit — genuine simplification, one honest trade
- **email** → `emailAndPassword` (keeps password login) or fully passwordless; **Google** → `socialProviders.google`; **magic-link** → the `magicLink` plugin (`sendMagicLink` wires straight to our existing Resend `sendMagicLink` in `src/lib/email.ts`). All three first-class.
- **Deletes:** the Credentials provider, the sign-in callback that inserts email users, the jwt/session callbacks (`auth-callbacks.ts`), the custom signup route's bcrypt handling, `next-auth.d.ts`.
- **The trade (state it plainly):** JWT → **DB-backed sessions**. Adds a per-request session read (cookie-cache mitigated) and makes middleware "optimistic" (cookie-presence only) rather than authoritative. **Low impact here** because our real enforcement already lives in the DAL capability chokepoint, not middleware. Net: a simplification, not lateral — but you're taking on a `session` table you must maintain, in exchange for revocable sessions.

## 4. The session-shape façade (the keystone)
Rewrite `getSession()` / `requireAuth()` in `src/lib/auth.ts` to call better-auth's `auth.api.getSession({ headers })` and **return the byte-identical `{ user: { id, email, name } }` shape** (and keep `requireAuth`'s `UnauthorizedError` throw). Do this and the 249 call sites + the `userId`-string DAL never change. Any drift in the shape ripples to 153 `user.id` consumers — so the façade gets its own focused tests asserting the exact shape.

**Mutable fields — the one behavior "byte-identical shape" quietly omits.** Today the session `name` is refreshed live via NextAuth's `trigger:"update"` callback (`auth-callbacks.ts`), which `ProfileForm` relies on after a display-name edit. Deleting `auth-callbacks.ts` removes that path, and better-auth's DB sessions + cookie cache mean a stale cached `name` until the session refreshes. So the façade work must **define how a profile name-change re-reflects into the live session** (better-auth's session refresh / cookie-cache invalidation on profile save) — and the façade tests must assert **post-update freshness**, not only the initial shape.

## 5. DB / schema migration — the sharpest edges
Both systems use the table *names* `user`/`account`/`session`/`verification`, but the **columns differ** — so during the "alongside" phase the two schemas cannot both own those names (better-auth's tables need distinct names, or NextAuth's are dropped first).

| Table | Ours | better-auth | Conflict |
|---|---|---|---|
| `user` | `emailVerified` **timestamp**, `name` nullable, `password` column | `emailVerified` **boolean**, `name` notNull, `createdAt/updatedAt`, **no password** | type + nullability; password moves out |
| `account` | PK `(provider, providerAccountId)` | PK `id`; `accountId/providerId/...`, **`password` lives here** | different PK + renames; password relocates |
| `session` | `sessionToken/userId/expires` — **unused (JWT)** | `id/token/expiresAt/userId/ipAddress/userAgent` — **actually used** | ours vestigial |
| `verificationToken` | `identifier/token/expires` | `verification`: `id/identifier/value/expiresAt` | renamed table + columns |

**The decisive fork — do we have real production users?** *Cannot be answered from the repo* (no user seed; `seed-load.ts` is demo collection data). **You must confirm against the prod DB.**
- **No / disposable users → hard reset (recommended).** Generate better-auth's fresh schema, drop the NextAuth auth tables. Cleanest by far. Caveat: app tables FK to `user.id` (`collections.ownerId`, `memberships.userId`, `sessions.curatorId`, …), so a reset means those must be empty or re-seeded too.
- **Real users must survive → data migration.** Map `user` (convert `emailVerified` timestamp→bool; backfill `name`/`createdAt`); **move `user.password` → an `account` row `providerId='credential'`** — and here's the crypto edge: **better-auth defaults to scrypt, our hashes are bcrypt**; either configure a custom `password.verify` that accepts bcrypt, or force password reset on next login. `session`/`verification` are dropped either way, so **every user re-logs in regardless of path** (JWT→DB session can't carry over). Because `user.id` values are preserved, the app-table FKs survive untouched — a real advantage of the migrate path.

## 6. Phased migration path (low-risk, façade-first)
1. **Add better-auth alongside** — install; build the `auth` instance (drizzleAdapter + emailAndPassword + google + magicLink + `nextCookies()` last); generate its schema under **distinct table names**; mount `app/api/auth/[...all]/route.ts`. NextAuth still live; no cutover.
2. **Re-implement the façade (§4)** — `getSession`/`requireAuth` now call better-auth and return the identical shape. If the shape matches, the 249-site steps are zero-diff.
3. **Swap middleware** — replace `withAuth` with better-auth's optimistic `getSessionCookie` redirect, preserving the matcher + the `SESSIONLESS_POST_ROUTES` allowlist (verify the Blob-upload callback still passes). Real enforcement stays in the DAL.
4. **Cut over the UI** — `authClient` replaces `next-auth/react`: add the **Google button** (`signIn.social({provider:"google"})`), `signIn.magicLink`, `signIn.email`, `signOut`, `useSession`, replace `SessionProvider`. ~5 client files.
5. **Retire the custom signup route** — better-auth owns signup.
6. **Remove NextAuth** — drop `next-auth`, `@auth/drizzle-adapter`, `next-auth.d.ts`, `auth-callbacks.ts`, the old auth tables.

**Riskiest seams:** (a) the §4 façade shape (drift → 143 consumers); (b) middleware downgraded to optimistic (acceptable *because* the DAL enforces — must be verified, not assumed); (c) the bcrypt-hash acceptance question; (d) the table-name collision during phase 1.

## 7. What you (the user) must provide
- **Google Cloud OAuth 2.0 Client** (Web): `client_id` + `client_secret`, and **authorized redirect URIs** for prod + preview + local (e.g. `https://adored.kimberlygarmoe.com/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`). Confirm the exact callback path against better-auth's Google-plugin docs before finalizing.
- **`BETTER_AUTH_SECRET`** (can reuse the existing `AUTH_SECRET`, ≥32 chars) and **`BETTER_AUTH_URL` / base URL set per environment** (prod + preview + local). A mismatch here is the classic Google `redirect_uri_mismatch` failure — the callback URL better-auth builds must exactly match a URI registered in the Google client.
- **Email transport** — already done (Resend, `src/lib/email.ts`); just point better-auth's `sendMagicLink` at it.
- **One decision:** confirm whether prod has real users → **reset vs migrate** (§5).

## 8. Effort / risk / recommendation
- **Size:** medium; **net deletion** of code if the façade holds (~15 files change; the 249 call sites stay). The schema migration + Google setup are the real work.
- **Cannot be validated without you:** the Google login round-trip (your OAuth client), a real magic-link email end-to-end (prod Resend), and reset-vs-migrate (prod DB). Every path forces **all users to re-login** — schedule accordingly.
- **Recommendation: DO IT, phased**, gated on: (1) the reset-vs-migrate decision, (2) the façade preserving the exact session shape *with tests*, (3) the DB-integration tests re-pointed at the new `getSession`, (4) manual Google + magic-link validation with your creds. **Do not merge the cutover unreviewed.**

## 9. Decisions (settled 2026-07-02)
1. **Reset vs migrate → RESET.** No real prod users. Drop the NextAuth auth tables and any user-FK'd app data, generate better-auth's fresh schema. This removes §5's entire migrate path: no data-mapping SQL, no bcrypt→scrypt hazard, no FK-preservation. The user re-creates their account post-cutover.
2. **Password strategy → moot (reset).** No hashes to carry, so the bcrypt/scrypt question disappears.
3. **Keep email+password → YES.** Three methods: email+password **and** Google **and** magic-link.
4. **One-time logout → accepted** (effectively free — no users to log out).

## Testing (when we build)
Façade shape tests (exact `{user:{id,email,name}}`, **including post-profile-edit name freshness** — the behavior the shape-only framing omits); the DB-integration suite re-pointed at the new `getSession`; middleware redirect + `SESSIONLESS_POST_ROUTES` still pass; magic-link + Google flows behind manual validation with real creds; a migration test on a seeded copy if we take the migrate path.

## Out of scope
Anything beyond the three methods (passkeys, 2FA, org/teams); changing the DAL capability model (untouched — better-auth only changes *authentication*, not our *authorization*).

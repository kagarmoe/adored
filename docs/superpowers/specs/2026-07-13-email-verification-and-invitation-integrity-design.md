# Email verification + invitation integrity — design

**Beads:** `purses-3i5s.3` (verification), `purses-3i5s.4` (gate invitation accept — release blocker), `purses-3i5s.5` (invitation expiry).
**Status:** draft — pending adversarial review, then owner approval. NOT approved for implementation.

**Why one spec, not three:** they interlock. The `.4` gate is meaningless without `.3` (nothing can be verified) and *harmful* if it lands first (it would lock every existing user out of invitations). `.5` needs a schema change that should ride the same migration. Specifying them separately is how you discover that halfway through.

**Constraint:** must work under **either** outcome of `purses-3i5s.1` (whether email+password survives). That decision is the owner's and is not assumed here.

## The problem, in one line each

1. **Nothing verifies an email.** `emailAndPassword: { enabled: true }` has no `emailVerification` hook (`auth-server.ts:71`). `emailVerified` is stored and read nowhere but the account-deletion scrub.
2. **An unverified email claim authorizes access to another person's photos.** `InvitationAcceptService.ts:45` binds on `dbUser.email === invitation.email` with zero `emailVerified` checks. Anyone can register `alice@example.com` in ten seconds, with no proof, and *be* Alice for that check.
3. **Invitation tokens never expire, and the code says they do.** `invitationsTable` has no `expiresAt`; `accept/route.ts:23` returns *"Invitation not found or expired"*. A forwarded invite from last year is still a live capability.

The three compound: the email match is the control that's supposed to save you **when a token leaks** — and the token is an eternal bearer token that travels by email.

## Facts established from the code (not assumed)

- **`requireEmailVerification` without `sendVerificationEmail` locks everyone out.** `better-auth/dist/api/routes/sign-in.mjs:230-231` throws `EMAIL_NOT_VERIFIED` when the flag is on and no send hook exists. The two must land together, or not at all.
- **Magic link self-verifies.** `plugins/magic-link/index.mjs:131,140` sets `emailVerified: true` on create *and* upgrades an existing unverified user. Google is verified by the IdP.
- **Every existing user is unverified** (`emailVerified` defaults false and nothing sets it). Any gate keyed on it locks out 100% of current accounts unless they have a path to become verified.
- **better-auth already defuses the pre-hijack:** `db/revoke-unproven-account-access.mjs:15-21` — when a magic link resolves to an unverified row it **deletes the credential account and revokes sessions** before flipping the flag. Consequence: **the first magic link an existing password user clicks silently destroys their password.** That is the behaviour we want, but it is a migration event, not a no-op.
- **The invitation row is committed before the email is sent** (`invitations.ts:38-45`). A send failure therefore leaves a phantom pending invitation the recipient never received.

## Design

### 1. Make addresses verifiable (`.3`)

Wire `emailVerification.sendVerificationEmail` in `auth-server.ts`, sending through the existing Resend helper (same path as magic link and invitations — one seam, already fixed to fail loudly).

**Do NOT set `requireEmailVerification` yet.** Verification must be *possible* before it is *mandatory*, or the flag locks out every existing account. Sequencing:
- **This spec:** addresses can be verified. New signups get a verification email. Existing users become verified the moment they use a magic link or Google (both set the flag for free).
- **Later, once `.1` is decided:** if passwords survive, turn on `requireEmailVerification` *and* build password reset. If they don't, the flag is moot — the surviving methods verify by construction.

### 2. Gate invitation acceptance on a *proven* email (`.4` — the release blocker)

In `InvitationAcceptService`, alongside the existing email match:

> reject with `403` when the accepting user's email is not verified.

**This is safe only because of the recovery path**, and that path must exist before the gate ships: an unverified user who receives an invitation can sign in by **magic link** (which verifies them, per `index.mjs:140`) or **Google**, then accept. Nobody is stranded — but they *are* stranded if the gate ships before `.3` and before the Resend fix (`.2`) is deployed. **Order matters: `.2` → `.3` → `.4`.**

**Refused alternative:** "temporarily auto-verify on signup so the gate passes." That turns the invitation binding into pure decoration — it's the same bug with a bow on it.

**Copy (TONE.md — speak from the person's side):** not *"email not verified (403)"*. Something like *"Let's make sure this is you — check your email for a link, then come back to this invitation."* The person is being welcomed, not rejected.

### 3. Invitations expire (`.5`)

Add `invitations.expiresAt` (`timestamp`, **NOT NULL**, default `now() + 14 days`). Enforce it in **both** `findByToken` and the accept path — a check in only one is the kind of half-guard this codebase has been bitten by (`partial-index-every-writer-must-respect-slot`).

- **14 days**, not 7: this is a gentle, unhurried product (TONE.md) whose users are sorting a lifetime of belongings, not completing a checkout. A week is a deadline; a fortnight is an invitation.
- **The error copy becomes true.** Today `accept/route.ts:23` claims "not found or expired" while nothing expires. Split them: an expired invite gets its own gentle message and, ideally, tells the person who can re-send it.
- **Cheap now, expensive later:** the DB is empty, so this is a metadata-only migration with a default. After the first real user it needs a backfill.

### 4. Fix the partial failure my own `.2` fix exposed

`invitations.ts:38-45` commits the invitation row, *then* sends. Now that a failed send throws, the owner sees a 500 and a phantom pending invitation appears.

**Decision: an invitation that could not be delivered must not exist.** Wrap the create+send so a send failure removes the row and rethrows — the recipient cannot accept what they never received, and a phantom "pending" entry in the members list is a lie to the owner. (The existing `resend` route stays for the case where delivery fails *later*, which is a different problem.)

## Testing

- **The gate is proven by a failing test first** (TDD): an unverified user with a valid token gets `403`; the same user, after magic-link verification, gets `200`. Un-mocked, at the DB tier — this is an authz boundary (`db-route-authz-test-recipe`).
- **Expiry:** an invitation past `expiresAt` is rejected by `findByToken` *and* by accept; assert **state** (no membership row created), not just the status code.
- **The partial-failure fix:** make the send throw and assert **no invitation row survives**. Mutation-check it — remove the compensating delete and the test must go red.
- **e2e:** `auth.setup.ts` signs up via password, so its user is unverified and would now fail the invitation gate. Seed `emailVerified: true` directly in the e2e fixture (it is a test fixture asserting a *verified* user, not a bypass of the production path).

## What this spec deliberately does NOT do

- **It does not decide `.1`** (whether email+password survives). Everything above holds either way.
- **It does not turn on `requireEmailVerification`** — that is a policy change gated on `.1`, and without password reset it would strand users.
- **It does not build password reset.** If `.1` keeps passwords, that is its own work — and it is the argument *against* keeping them.

## Open questions for the owner

1. **14 days for invitation expiry** — or a different window?
2. **Do existing accounts get a "verify your email" nudge**, or do they simply become verified the next time they use magic link / Google? (Recommend the latter: silent, no interruption, no email blast — and it costs nothing.)

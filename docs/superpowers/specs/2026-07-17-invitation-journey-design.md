# Invitation journey: link-first, welcoming, resilient — design

**Date:** 2026-07-17 · **Epic:** purses-puuj (children .1 and .3; .2 is an owner decision, untouched) · **Branch:** feat/invitation-journey · **Rev 2** (adversarial spec review folded: Security CLEAN; UX+Craftsman findings integrated)
**Provenance:** verified reconciliation findings + a fresh code fact-check (2026-07-17); owner granted overnight execute-and-merge authority. The #351 fixes (public share links, login callbackUrl) already landed.

## Facts this design stands on (verified)

- The pending-invitation rows reaching `MemberList` already carry `token` (loader → `listByCollection`; `Invitation` includes token) — the component just never renders a copy affordance.
- `src/lib/email.ts` without `RESEND_API_KEY`: **silent no-op** in production (dev console-logs the link); callers can't tell. With a key, a Resend API error throws.
- The invitations table has **no inviter column** — but only owners can invite (`invitations:manage: "owner"`), so inviter = collection owner, derivable by join. No migration.
- The preview endpoint (`GET /api/invitations/accept?token`) returns the raw row; the accept page then second-fetches the collection for its name.
- Accept page today: "You're invited!", collection card, Accept + a "Decline" button that only routes home (no API action — the label lies).
- SharePanel's copy pattern: `navigator.clipboard.writeText` + adjacent read-only `Input` as the visible fallback.

## Changes

### 1. Copy-link on pending invitation rows (purses-puuj.1)

In `MemberList`, each pending row (when `canManage`) gains a **"Copy link"** secondary button mirroring SharePanel's pattern: `writeText(`${origin}/invitations/${invite.token}`)`, with a transient "Copied" confirmation announced via a **persistently mounted `role="status"` node beside the button** — the `InviteForm.tsx` precedent, whose own comment warns that a region mounted together with its text is skipped by screen readers. No read-only Input (rows are dense). Implementation shape is fixed (review finding): a new small `"use client"` child component (`CopyInviteLinkButton`) rendered by the server-component `MemberList` — do NOT convert `MemberList` to a client component (matches the MemberRemoveButton/InviteForm island pattern).

### 2. Email transport is never silently absent (purses-puuj.1)

- `send()` in `src/lib/email.ts` returns **`{ sent: boolean }`**: `false` on the no-key path (unchanged dev console.log), `true` after a successful Resend call (API errors still throw).
- In **production** the no-key path also logs `console.error("[email] RESEND_API_KEY missing — invitation email NOT sent")` — greppable in Vercel logs.
- `InvitationController.createInvitation` (and the resend route) propagate it: the POST response gains **`emailSent: boolean`**. The invite-creation UI (members page invite form) shows, when `emailSent === false`, a gentle inline notice: **"The invite is saved — the email didn't go out, so share the link yourself with Copy link."** (role=status, info tone, not an error; softened toward the SharePanel failure voice per review). The invitation itself is still created — the link is the capability; email is best-effort delivery.

### 3. Accept screen enrichment (purses-puuj.3) — no schema change

- The preview endpoint returns a **shaped payload** instead of the raw row: `{ collectionName, collectionDescription, inviterName, invitedEmail, status }` — collection + owner joined server-side (owner's `user.name`, falling back to nothing rather than an email address; never leak more than a display name). Drop `token` echo (requester already holds it) and internal ids the page doesn't need — the page's second fetch to `/api/collections/[id]` (which 401s for signed-out visitors anyway) goes away.
- Page copy: heading **"You're invited!"** stays; below the collection card add the inviter line — **"{inviterName} invited you to help sort this collection."** (omit the line if no name) — and the own-sort promise: **"You'll sort it your own way — your choices never overwrite anyone else's."**
- **Capability line, not pills:** one gentle sentence — **"You'll be able to add photos, name things, and sort."** (three curator capability groups in plain words; seven permission-flag pills would be machine voice and Hick's-law noise).
- CTA stays **"Accept invitation"** — it routes to the collection workspace, so "Start my sort" would over-promise (review finding: the label must say what happens).
- **The invitation page becomes public** (review CRITICAL: today the proxy 307s signed-out visitors before the page renders, so any signed-out UI would be dead code). The matcher's negative lookahead gains `invitations(?:/|$)` AND `api/invitations/accept(?:/|$)` (the page's GET preview; the POST accept keeps its own session check — DAL enforcement, the proxy is only the UX redirect, same as shared-results). A signed-out visitor sees the enriched preview with one primary action: **"Sign in to accept"** → `/login?callbackUrl=/invitations/{token}`. Matcher tests mirror the shared-results ones (public page + preview GET, lookalike `/invitationsish` protected, POST accept still 401s without a session); the existing login-redirect unit test switches its example path off `/invitations/tok_1`. Security basis (from the Security pass): 256-bit token gates the data; the shaped payload leaks less than today's raw row; accept remains session-gated.
- **"Decline" → "Not now"**, still routing home — the honest label for what it does. A true server-side decline (status flip + owner visibility) is new API surface; out of scope, noted for the epic if the owner wants it.

## Security notes

- The shaped preview payload leaks only: collection name/description, owner display name, invited email, status — all things the emailed recipient already legitimately sees or needs. Token continues to be the read capability; no new write surface. `POST` accept unchanged (session required; email match — purses-puuj.2 owner decision pending).
- Copy-link renders only under `canManage` (owner) — the token is not exposed to curators on the members page (check what non-managers currently receive; if `pending` is passed to non-managers, keep tokens out of their rows).

## Testing

- `email.ts` unit: no-key → `{sent:false}` + prod error log (spy console.error, stub NODE_ENV) + dev console.log unchanged; key+success → `{sent:true}`; Resend error still throws.
- Controller/route: create-invitation response carries `emailSent` both ways (mock transport).
- `MemberList` component: Copy link renders on pending rows only when canManage; click writes the URL (stub clipboard) and shows the transient confirmation; token absent from non-manager render if applicable.
- Accept page: shaped payload rendered (inviter line, promise line, capability sentence); signed-out state shows the sign-in CTA with the callbackUrl link (component-level) AND the matcher tests prove the page is reachable signed-out; "Not now" label; accept flow unchanged (existing tests keep passing).
- Proxy: matcher exclusions for `invitations` + `api/invitations/accept`; lookalike-path protection; POST accept 401 without session (route-level, existing).
- Per-task review check (Security): the prod `console.error` string in email.ts must stay a static string — no interpolated token/email.
- Preview endpoint: shaped payload fields; 404 for bad token unchanged; no token echo.
- e2e: extend `members.spec.ts` (copy-link visible on a pending row) if cheap; the accept flow e2e (if any exists) keeps passing. `npm run auth:verify` (email/auth adjacent).

## Out of scope

- purses-puuj.2 (token-possession accept) — owner decision.
- True decline endpoint; invitation expiry UX; `purses-3i5s.*` transport/security P0s (separate epic owned elsewhere).

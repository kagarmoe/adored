# Invitation journey: link-first, welcoming, resilient — design

**Date:** 2026-07-17 · **Epic:** purses-puuj (children .1 and .3; .2 is an owner decision, untouched) · **Branch:** feat/invitation-journey
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

In `MemberList`, each pending row (when `canManage`) gains a **"Copy link"** secondary button mirroring SharePanel's pattern: `writeText(`${origin}/invitations/${invite.token}`)`, with a transient "Copied" confirmation on the button itself (state flips back after ~2s; SharePanel's bare fire-and-forget is the floor, the confirmation is the accessibility feedback Norman requires — `aria-live="polite"` on the label swap). No read-only Input (rows are dense; the button + confirmation suffice). `MemberList` becomes (or gains an island that is) a client component for the row action only — check its current "use client" status and keep the change minimal.

### 2. Email transport is never silently absent (purses-puuj.1)

- `send()` in `src/lib/email.ts` returns **`{ sent: boolean }`**: `false` on the no-key path (unchanged dev console.log), `true` after a successful Resend call (API errors still throw).
- In **production** the no-key path also logs `console.error("[email] RESEND_API_KEY missing — invitation email NOT sent")` — greppable in Vercel logs.
- `InvitationController.createInvitation` (and the resend route) propagate it: the POST response gains **`emailSent: boolean`**. The invite-creation UI (members page invite form) shows, when `emailSent === false`, a gentle inline notice: **"The invite is saved, but the email couldn't be sent — use Copy link to share it yourself."** (role=status, info tone, not an error). The invitation itself is still created — the link is the capability; email is best-effort delivery.

### 3. Accept screen enrichment (purses-puuj.3) — no schema change

- The preview endpoint returns a **shaped payload** instead of the raw row: `{ collectionName, collectionDescription, inviterName, invitedEmail, status }` — collection + owner joined server-side (owner's `user.name`, falling back to nothing rather than an email address; never leak more than a display name). Drop `token` echo (requester already holds it) and internal ids the page doesn't need — the page's second fetch to `/api/collections/[id]` (which 401s for signed-out visitors anyway) goes away.
- Page copy: heading **"You're invited!"** stays; below the collection card add the inviter line — **"{inviterName} invited you to help sort this collection."** (omit the line if no name) — and the own-sort promise: **"You'll sort it your own way — your choices never overwrite anyone else's."**
- **Capability line, not pills:** one gentle sentence — **"You'll be able to add photos, name things, and sort."** (three curator capability groups in plain words; seven permission-flag pills would be machine voice and Hick's-law noise).
- CTA: **"Accept invitation" → "Start my sort"** after acceptance routes to the collection as today; while signed out the page shows **"Sign in to accept"** linking to `/login?callbackUrl=/invitations/{token}` (the #351 round-trip now works — surface it instead of relying on the proxy redirect).
- **"Decline" → "Not now"**, still routing home — the honest label for what it does. A true server-side decline (status flip + owner visibility) is new API surface; out of scope, noted for the epic if the owner wants it.

## Security notes

- The shaped preview payload leaks only: collection name/description, owner display name, invited email, status — all things the emailed recipient already legitimately sees or needs. Token continues to be the read capability; no new write surface. `POST` accept unchanged (session required; email match — purses-puuj.2 owner decision pending).
- Copy-link renders only under `canManage` (owner) — the token is not exposed to curators on the members page (check what non-managers currently receive; if `pending` is passed to non-managers, keep tokens out of their rows).

## Testing

- `email.ts` unit: no-key → `{sent:false}` + prod error log (spy console.error, stub NODE_ENV) + dev console.log unchanged; key+success → `{sent:true}`; Resend error still throws.
- Controller/route: create-invitation response carries `emailSent` both ways (mock transport).
- `MemberList` component: Copy link renders on pending rows only when canManage; click writes the URL (stub clipboard) and shows the transient confirmation; token absent from non-manager render if applicable.
- Accept page: shaped payload rendered (inviter line, promise line, capability sentence); signed-out state shows the sign-in CTA with the callbackUrl link; "Not now" label; accept flow unchanged (existing tests keep passing).
- Preview endpoint: shaped payload fields; 404 for bad token unchanged; no token echo.
- e2e: extend `members.spec.ts` (copy-link visible on a pending row) if cheap; the accept flow e2e (if any exists) keeps passing. `npm run auth:verify` (email/auth adjacent).

## Out of scope

- purses-puuj.2 (token-possession accept) — owner decision.
- True decline endpoint; invitation expiry UX; `purses-3i5s.*` transport/security P0s (separate epic owned elsewhere).

# Invitation Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy-linkable invitations, loud email transport, and a public enriched accept page (per `docs/superpowers/specs/2026-07-17-invitation-journey-design.md`, rev 2 — read it first; its Facts and Security sections bind).

**Architecture:** Three seams: (1) `email.ts` returns `{sent}` and the invite routes surface `emailSent`; (2) a `CopyInviteLinkButton` client island inside the server `MemberList`; (3) the proxy opens `/invitations` + the GET preview, whose payload becomes a shaped join (collection + owner) rendered by an enriched accept page.

**Tech Stack:** Next.js App Router, better-auth session checks at routes (proxy = UX only), Resend, vitest+RTL, Playwright.

## Global Constraints

- Copy verbatim (spec §1–3): notice **"The invite is saved — the email didn't go out, so share the link yourself with Copy link."**; inviter line **"{inviterName} invited you to help sort this collection."**; promise **"You'll sort it your own way — your choices never overwrite anyone else's."**; capability line **"You'll be able to add photos, name things, and sort."**; CTA **"Accept invitation"** (unchanged); decline label **"Not now"**.
- The prod `console.error` in email.ts is the STATIC string `"[email] RESEND_API_KEY missing — invitation email NOT sent"` — no interpolation, ever (Security pin).
- Copied-confirmation a11y follows the `InviteForm.tsx` persistent `role="status"` pattern (never a conditionally-mounted region).
- `MemberList` stays a server component; the button is a new `"use client"` child.
- Shaped preview payload EXACTLY `{ collectionName, collectionDescription, inviterName, invitedEmail, status }` — no token echo, no ids.
- Matcher additions: `invitations(?:/|$)` and `api/invitations/accept(?:/|$)` only; POST accept keeps its route-level session 401.
- TDD; commit per task; lint 0 errors per task; `npm run auth:verify` in the final gates.

---

### Task 1: Loud email transport + `emailSent` surfacing

**Files:** Modify `src/lib/email.ts` (+ its test), `src/server/api/invitations.ts`, `src/app/api/collections/[id]/invitations/route.ts`, `src/app/api/invitations/[id]/resend/route.ts`, `src/features/collections/InviteForm.tsx` (+ its test).

**Interfaces — Produces:** `send(...): Promise<{ sent: boolean }>`; `sendInvitation(...): Promise<{ sent: boolean }>`; `createInvitation` returns its current shape plus `emailSent: boolean`; both POST routes include `emailSent` in the JSON. InviteForm shows the spec's notice (role=status, info tone, persistent-node pattern it already uses) when `emailSent === false` in the response.

- [ ] Failing tests first: email.ts unit (no-key → `{sent:false}`, prod console.error spy sees EXACTLY the static string, dev console.log unchanged, key+success → `{sent:true}` with Resend mocked, API error still throws); route/controller test asserting `emailSent` in the POST response both ways; InviteForm test for the notice on `emailSent:false`.
- [ ] Implement minimally. The no-key branch:

```ts
if (!resend) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV ${args.devLabel}] ${args.to}\n${args.buildUrl()}`);
  }
  if (process.env.NODE_ENV === "production") {
    // Static string — never interpolate token/email here (Security pin).
    console.error("[email] RESEND_API_KEY missing — invitation email NOT sent");
  }
  return { sent: false };
}
```

- [ ] Gates: `npx vitest run src/lib/email.test.ts src/features/collections src/server` (adjust to real test paths) + `npm run lint`. Commit: `feat(invite): email transport reports sent state; owners see when the email didn't go out`

### Task 2: `CopyInviteLinkButton` in pending rows

**Files:** Create `src/features/collections/CopyInviteLinkButton.tsx` (+ test); modify `src/features/collections/MemberList.tsx` (+ its test if one exists); optionally extend `e2e/members.spec.ts` (one assertion: the button is visible on a pending row).

**Interfaces — Produces:** `<CopyInviteLinkButton token={invite.token} />` — client island; builds `${window.location.origin}/invitations/${token}`; `navigator.clipboard.writeText`; label flips "Copy link" → "Copied" for ~2s; a persistent `role="status"` sibling announces "Invite link copied". Rendered in each pending row (page is owner-gated; `canMange` prop check mirrors existing row actions).

- [ ] Failing tests → implement → green (`stub navigator.clipboard`); e2e assertion if the members spec already seeds a pending invitation (check; if not, skip and say so — don't build a new seed for one assertion).
- [ ] Commit: `feat(invite): copy the invite link from pending member rows`

### Task 3: Public enriched accept page + shaped preview + proxy

**Files:** Modify `src/proxy.ts`, `src/lib/middleware-auth.test.ts`, `src/app/api/invitations/accept/route.ts` (+ service if the join lives there), `src/app/invitations/[token]/page.tsx` (+ its test if any).

- [ ] Matcher: add `invitations(?:/|$)|api/invitations/accept(?:/|$)` to the negative lookahead (comment: the token is the read capability; POST accept still session-401s at the route — proxy is only the UX redirect). Tests mirror shared-results: `isPublic("/invitations/tok_1")` true, `isPublic("/api/invitations/accept")` true, `isPublic("/invitationsish")` false; RETARGET the existing login-redirect test's example path (it currently uses `/invitations/tok_1` — switch to `/collections/col_1` keeping the callbackUrl assertion).
- [ ] GET preview: shape the payload exactly per Global Constraints via a server-side join (collection name/description + owner user.name via `collections.ownerId`; `inviterName: name ?? null` — never an email). 404 behavior unchanged. Update/port endpoint tests.
- [ ] Accept page: single fetch of the shaped payload; add inviter line (omit when null), promise line, capability sentence; "Not now"; signed-out (no session — page can check via its existing session hook or the accept POST's 401 path) renders primary **"Sign in to accept"** → `/login?callbackUrl=/invitations/{token}` instead of the Accept button. Keep loading/error states.
- [ ] Full gates: `npm run lint`, `npm run test:ci`, `npm run build`, `npm run auth:verify`, then e2e: `npx playwright test e2e/members.spec.ts e2e/auth-navigation.spec.ts e2e/shared-results.spec.ts --project=tablet` plus any invitation e2e that exists.
- [ ] Commit: `feat(invite): public enriched accept page; shaped preview; proxy opens the invitation route`

### Task 4: Review + PR + merge

- [ ] Whole-branch adversarial review (Security REQUIRED — proxy/auth/email; + UX/QA), fold findings.
- [ ] Screenshots light+dark: accept page (signed-out + signed-in), pending row with Copy link, invite form notice (mock no-key locally if feasible; otherwise skip that shot and note it).
- [ ] sync-docs: `src/app/api/**` changed → **docs/API.md** must be updated (preview payload shape, public-route note, emailSent field) per doc-ownership; `src/proxy.ts` → ARCHITECTURE.md middleware line. graphify update. Push, PR with gate evidence, merge when green, /close-out (close purses-puuj.1 and .3; epic stays open on .2 — owner decision).

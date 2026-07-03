# Teaching — How Adored does Authorization

For an engineer fluent in **AWS IAM, AuthN/Z, and cryptography** but new to web-app conventions. It explains *what may you do* (authorization), not *who are you* (authentication — that's the better-auth doc). Every piece of jargon is defined; the IAM analogies are there to bridge, not to equate exactly.

## The two questions, kept apart
- **Authentication (AuthN):** prove identity → produces a `userId`. (better-auth's job.)
- **Authorization (AuthZ):** given that `userId`, may it perform *this operation* on *this resource*? (This doc.)
Adored keeps these in separate layers on purpose — the same discipline as IAM, where "who is this principal" (STS/federation) is distinct from "does a policy allow this call."

## Jargon, defined
- **IDOR — Insecure Direct Object Reference.** A web app takes an object id straight from the request (URL path, query, body) and acts on it **without checking the caller is authorized for that object**. The id is a "direct reference" to a database row; "insecure" because the only thing gating access is knowing the id. In your terms: a resource operation that checks *authentication* ("are you signed in?") but skips the *resource policy* ("may THIS principal touch THIS resource?"). It's the app-layer cousin of an S3 policy that checks "valid AWS user?" but not "may this user read this object?"
  - **Concrete example here:** `GET /api/collections/[id]/items`. The `[id]` is a collection's ULID taken from the URL. Without a check, any signed-in user could try ULIDs and read another tenant's items. The hole is closed by one line — `requireApiCapability(db, params.id, userId, "items:read")` — which confirms the caller owns or belongs to *that* collection before the items query runs. Absent → `404`; exists-but-not-yours → `403`.
- **DAL — Data Access Layer.** Generically, the code between the app and the database. **Here it means `src/server/dal/`: the authorization boundary** — the one layer every collection-scoped operation passes through to reach data. Think of it as the app's **policy enforcement point (PEP)**: routes never talk to the database directly (a lint rule forbids it — see below); they ask the DAL, which decides allow/deny and *then* hands back the data.
- **Chokepoint.** The single function every data access funnels through, so authorization is decided in exactly one place instead of scattered `if (isOwner)` checks. One PEP, not fifty.

## The model — two roles, *derived* not stored
`src/server/dal/capabilities.ts`. There are exactly two roles: **owner** and **curator**. The effective role is *computed*, never read from a column:
```ts
resolveEffectiveRole(collection, membership, userId):
  collection.ownerId === userId        → "owner"
  else membership row exists           → "curator"
  else                                 → null
```
The membership row *has* a `role` column, but **it is a display label only — never read for an authz decision.** Why derived-not-stored matters (and an IAM person will feel this): there is no "promote a member to owner" write path, so there is **no privilege-escalation surface and no role-drift** — the source of truth for "owner" is collection ownership, full stop. (This was a deliberate collapse from an earlier, riskier 9-permission-flag model — ARCHITECTURE decision 17.)

## The policy — the `CAPABILITIES` map (the app's "IAM policy document")
One required role per operation, a single table:
```ts
export const CAPABILITIES: Record<Operation, Role> = {
  "collection:read": "curator",  "members:read": "curator",
  "items:read": "curator",       "items:write": "curator",
  "photos:write": "curator",     "sessions:write": "curator",
  "preferences:write": "curator",
  "invitations:read": "owner",   "collection:manage": "owner",
  "collection:purge": "owner",   "collection:audit": "owner",
  "members:manage": "owner",     "invitations:manage": "owner",
  "items:purge": "owner",
};
```
Read it like a policy document: curators can read the collection and do the sorting work (items/photos/sessions/preferences); owners additionally hold the destructive and administrative operations (manage/purge/audit, members, invitations).

**Why it's `Record<Operation, Role>` and not a plain object — this is the clever bit.** `Operation` is a *closed* union of string literals. A `Record<Operation, Role>` **requires every member of the union as a key** — omit one and TypeScript fails the build. So: add a new operation to the union without giving it a policy entry, and `npm run build` goes red. **You cannot ship an operation that has no authorization rule.** That's a compile-time guarantee, not a hope.

## The enforcement — the chokepoint
`requireApiCapability(db, collectionId, userId, op)` in `src/server/dal/collection-access.ts`, in this exact order:
1. `findById(collectionId)` → not found ⇒ **404**.
2. resolve the caller's effective role → `null` ⇒ **403**.
3. `roleSatisfies(role, CAPABILITIES[op])` false ⇒ **403** (owner satisfies everything; curator satisfies only curator-level ops).
4. success ⇒ returns the `Collection`.

**Why 404 *before* 403 (this is a security decision, not pedantry).** If the app returned `403 Forbidden` for a collection that exists but isn't yours, and `404` for one that doesn't exist, an attacker could **enumerate which ids are real** by watching the status code — a classic existence oracle. Returning `404` for both "doesn't exist" and "not yours" (at the outer layer) denies that oracle. (The one nuance: `requireApiResultAccess` does reveal, to a *member of the collection*, that a result exists but belongs to another curator — a deliberate, bounded exception.)

**Resource wrappers** handle child objects by resolving them to their collection, then delegating:
- `requireApiItemCapability(itemId, …)` → resolves the item (404 if absent) → gates on `item.collectionId`. Subtlety: a soft-deleted item is invisible (404) to reads/edits, but *lifecycle* ops that must act on a deleted row (restore, purge) pass `{includeDeleted: true}` — because "restore" and "edit" are both `items:write`, the operation name alone can't decide visibility.
- `requireApiInvitationCapability(invitationId, …)` → same shape via `invitation.collectionId`.
- `requireApiResultAccess(resultId, …)` → collection access **plus** `result.curatorId === userId`: sort results are **curator-private** (each curator sorts independently), so even a fellow member gets `403` on another curator's result.

**Pages** (Server Components) use a sibling that *redirects* instead of returning a response: `requireCollectionAccess` / `requireCollectionOwnerPage` in `src/lib/collection-access.ts` — same policy, different failure mode (a browser redirect to `/collections` or `/login`).

## The two safety nets (why this is hard to get wrong)
1. **Compile-time.** (a) The `Record<Operation, Role>` exhaustiveness above. (b) An ESLint rule forbids anything under `src/app/**` from importing a repository directly — routes/pages *must* go through a controller or the DAL. So you can't quietly `new ItemRepository(db)` and skip the gate; you're forced through the abstraction.
2. **Runtime/CI.** `route-authz-enumeration.integration.test.ts` walks **every** `route.ts` under `src/app/api/**`, and for each route+method: (a) requires it to be explicitly categorized as public-or-self **or** given a "stranger" case — an *uncategorized new route fails the test*; (b) invokes the real handler as an authenticated non-member and asserts the status is `403`/`404` (a `200` fails; a `500` fails, because authz must resolve before any error). This is the filesystem-exhaustive backstop: **add an unguarded API route and CI goes red.**

## What is *not* yet guaranteed — the hardening targets
No holes exist today (every route and page checks before fetching). But three things rest on convention rather than automation — the hardening plan closes them:
1. **Pages have no equivalent of the route enumeration test (bead `6fk`).** All collection pages guard-before-fetch today, but only by manual reading — a new page that forgets `requireCollectionAccess`, or a refactor that fetches before it, would ship green. Highest-value fix.
2. **The capability map's *values* aren't pinned.** `Record` forces an entry to *exist*, but nothing asserts it's *correct* — a typo mapping `items:purge` to `"curator"` compiles and passes the enumeration test (a curator legitimately gets `200`). A table test pinning each operation's required role closes this.
3. **Bespoke guards' consistency** (`requireApiResultAccess`, the inline session authz) isn't structurally asserted to all follow 404-before-403 + the curator check.

## The IAM mapping, in one line each
- **`CAPABILITIES` map** ≈ your policy document (operation → who's allowed).
- **`requireApiCapability`** ≈ the policy evaluator / PEP (one place, allow or deny).
- **owner/curator derived from ownership+membership** ≈ principals resolved from relationships, not a mutable role attribute (no escalation path).
- **404-before-403** ≈ denying an existence oracle.
- **the enumeration test + Record exhaustiveness** ≈ a policy linter that fails CI if any operation or route is left without a rule.

## Files
`src/server/dal/capabilities.ts` (policy), `src/server/dal/collection-access.ts` (API chokepoint + wrappers), `src/lib/collection-access.ts` (page guards), `src/lib/db/route-authz-enumeration.integration.test.ts` (CI backstop), `.eslintrc.js` (import boundary), `docs/API.md` §Authorization (prose spec).

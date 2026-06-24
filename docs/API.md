# API reference (agent-first)

Structured reference for an AI agent (or developer) calling the **Adored** HTTP API. Not OpenAPI — markdown optimized for reading, not codegen. Every route lives under `/api`, speaks JSON in and JSON out (except binary image streams and the NextAuth handler), and is a Next.js App Router route handler.

**How to read this:** [Authentication](#authentication), [Authorization model](#authorization-model), and [Status-code semantics](#status-code-semantics) apply to every route — read them first. Then use the [Route index](#route-index) and the per-family detail. Returned-entity field shapes (`Collection`, `Item`, `Photo`, `SortResult`, `SortResultItem`, `Membership`, `Invitation`, `Session`, `DecisionEvent`) live in `src/types` and the Drizzle schema (`src/lib/db/schema.ts`) — this doc names the entity rather than duplicating fields that would drift.

> **Accuracy note:** this documents what the code does **today**. The cross-tenant **IDOR holes** are **closed** (pv9 PR1): every collection-scoped route is scoped to its collection via `requireApiCollectionAccess` (member-or-owner; `404` absent / `403` forbidden). Error handling is consistent (pv9 PR2: validation→`400`, state→`409`). The **role model core** is in (pv9 PR3): `membership.role` reconciled + CHECK-constrained, invitation-accept creates a curator membership, and the client-flag/`role` mass-assignment surface is closed. Every collection-scoped route is now wired through the **capability map** (`requireApiCapability`, pv9 PR4) — owner/curator from one chokepoint; member/invitation management is owner-only. Remaining pv9 work is correctness only (account-deletion `purses-hybm`, the route-enumeration backstop `purses-o03`); see [Known authz gaps](#known-authz-gaps).

## Authentication

- **Mechanism:** NextAuth v4 with a **JWT session** in the session cookie. Authenticate via the NextAuth flow (`/api/auth/[...nextauth]`) and send the session cookie on subsequent requests.
- **Two server-side checks appear in the code, both meaning "must be signed in":**
  - `requireAuth()` (`src/lib/auth.ts`) — throws `"Unauthorized"`; the handler maps it to **`401`**.
  - `getSession()` + an inline `if (!session?.user) → 401` — same effect, used by the newer routes that then call a DAL guard.
- **Sign-up:** `POST /api/auth/signup` (public) creates a credentials account; sign-in goes through the NextAuth handler.
- **public** routes need no session: the NextAuth handler, signup, `GET /invitations/accept` (token preview), and `shared-results/[token]`. (**`POST /invitations/accept` now requires a session** — it binds the invite to the caller's account; see its detail.)

## Authorization model

Authentication is *who you are*; authorization is *what you may touch*. The model is **two roles** — **owner** (`collection.ownerId`) and **curator** (any member) — and one chokepoint in `src/server/dal/` (do not hand-roll):

- **Effective role** (`capabilities.ts` `resolveEffectiveRole`): **owner** iff `collection.ownerId === userId`; **curator** iff a membership row exists; else **none**. `membership.role` is a **display label only**, never read for an authz decision. The legacy `can*` permission flags are **inert** (kept for the out-of-scope UI; never enforced).
- **`requireApiCapability(db, collectionId, userId, op)`** — the gate. `op` is an `Operation` mapped to a minimum role by the compile-exhaustive **`CAPABILITIES`** table: curator ops (`collection:read`, `members:read`, `items:read`, `items:write`, `photos:write`, `sessions:write`, `preferences:write`) and owner ops (`collection:manage`/`:purge`/`:audit`, `members:manage`, `invitations:read`/`:manage`, `items:purge`). Returns the collection, or a `NextResponse`: **`404`** absent, **`403`** if the effective role doesn't satisfy `op`.
- **Resource wrappers** `requireApiItemCapability(db, itemId, userId, op, {includeDeleted?})` and `requireApiInvitationCapability(db, invitationId, userId, op)` resolve the resource → its `collectionId` → delegate, returning the resolved entity. Item resolution is `findById` by default (soft-deleted → `404`); lifecycle ops (`restore`/`purge`/`remove-from-sorts`) pass `includeDeleted:true`.
- **`requireApiCollectionAccess`** / **`requireApiCollectionOwner`** are thin wrappers over `requireApiCapability` (`collection:read` / `collection:manage`) — behavior-identical (member-or-owner / owner-only).
- **`requireApiResultAccess(db, resultId, userId)`** — for `sort-results`: collection gate on `result.collectionId` **plus** `result.curatorId === userId` (curator-private). **Sessions** use an inline `authorizeSession` of the same shape.
- **Child routes** (`members/[mid]`, `items/[rid]`, `shares/[sid]`, item-photo routes) also enforce **belongs-to-parent**: resolve the child and return **`404`** if `child.parentId !== pathId`. Prevents IDOR-via-path-id.

Path params at the API layer are **always ULIDs**, never slugs (slugs are client-side nav). Handlers narrow a guard result with `instanceof NextResponse` and otherwise proceed with the resolved entity.

## Status-code semantics

| Code | Meaning |
|---|---|
| `200` | OK (read / update / idempotent action) |
| `201` | Created |
| `304` | Not Modified (binary image routes, conditional `If-None-Match`) |
| `400` | Bad input — malformed JSON, failed validation, missing field, wrong file type |
| `401` | **Unauthenticated** — no valid session |
| `403` | **Authenticated but not allowed** — not member/owner/manager, or not the owning curator |
| `404` | Absent **or** hidden for tenant isolation (a collection/result you may not see resolves to `404` before membership is checked) |
| `409` | Conflict (pool group/reassign) |
| `413` | Payload too large (photo upload over the size limit) |
| `500` | Unhandled server error |

**403-vs-404:** absence is reported `404` before membership is evaluated; a resource that exists but is off-limits is `403`. A `404` can mean "not visible to you," not only "no such id."

**Validation & state errors are consistent (pv9 PR2):** every body-parsing route maps a failed Zod `.parse` (and malformed JSON) to **`400`** — not `500` — via the shared `errorResponse` helper (`src/server/api/http-errors.ts`), which also maps typed state errors (`DeleteResultStateError`/`SupersedeStateError`/`FinalizeStateError`) to **`409`** and `UnauthorizedError` to **`401`**. Authz guards still return their `401`/`403`/`404` **before** the parse.

## Cross-cutting invariants

- **ULID for data, slug for nav** — every `[id]`/`[itemId]`/`[rid]`/`[sid]`/`[mid]` in an API path is a ULID.
- **Curator-scoped** — `sessions` and `sort-results` (and children) are private to the creating curator, enforced on top of collection membership.
- **`ownerId`/`curatorId` come from the session, never the body** — create routes force them from the authenticated user.
- **Belongs-to-parent on child routes** — see Authorization model.
- **Soft-delete vs purge** — `archive`/`restore` are reversible; `purge` is the permanent path. `POST /api/items/[id]/purge` is now real: an **owner-only** permanent hard-delete cascade (preferences + photos + blobs, then the item) in one transaction, **`409`** if the item is in any sort result (see detail). **`POST /api/collections/[id]/purge` is now real too** — an owner-only whole-collection cascade purge with a type-the-collection-name confirm (see detail). `DELETE /api/sort-results/[id]` and `…/items/[rid]` are hard deletes restricted to **draft** results (see detail).

## Route index

**Access** legend (`requireApiCapability(op)` unless noted): **public** · **self** (`requireAuth`, acts only on the caller's own data) · **curator** (any collection member — curator-level `op`; `member` is used interchangeably) · **owner** (`collection.ownerId` — owner-level `op`) · **result-curator** (`requireApiResultAccess`/`authorizeSession` — collection access **+** `curatorId === userId`, for sessions/sort-results).

### auth & user
| Method | Path | Access |
|---|---|---|
| GET·POST | `/api/auth/[...nextauth]` | public |
| POST | `/api/auth/signup` | public |
| GET·PATCH·DELETE | `/api/users/me` | self |

### collections (core)
| Method | Path | Access |
|---|---|---|
| GET·POST | `/api/collections` | self |
| GET | `/api/collections/[id]` | member |
| PATCH | `/api/collections/[id]` | manager |
| DELETE | `/api/collections/[id]` | owner |
| POST | `/api/collections/[id]/archive` | manager |
| POST | `/api/collections/[id]/restore` | manager |
| POST | `/api/collections/[id]/purge` | owner |
| GET | `/api/collections/[id]/audit` | owner |

### collection items
| Method | Path | Access |
|---|---|---|
| GET·POST | `/api/collections/[id]/items` | member |
| PATCH | `/api/collections/[id]/items/[itemId]` | curator (`items:write`) |

### item photos
| Method | Path | Access |
|---|---|---|
| POST | `/api/collections/[id]/items/[itemId]/photos` | curator (`photos:write`) |
| DELETE | `…/photos/[photoId]` | curator (`photos:write`) |
| PATCH | `…/photos/[photoId]` | curator (`photos:write`) |
| GET | `…/photos/[photoId]/file` | curator (`items:read`) |
| POST | `…/photos/[photoId]/set-hero` | curator (`photos:write`) |

### pool & photos
| Method | Path | Access |
|---|---|---|
| POST | `/api/collections/[id]/pool/group` | curator (`photos:write`) |
| GET | `/api/collections/[id]/pool/photos` | curator (`items:read`) |
| GET | `/api/collections/[id]/pool/photos/[photoId]/file` | curator (`items:read`) |
| POST | `/api/collections/[id]/pool/upload` | curator (`photos:write`) |
| POST | `/api/collections/[id]/photos/reassign` | curator (`photos:write`) |

### members & invitations
| Method | Path | Access |
|---|---|---|
| GET | `/api/collections/[id]/members` | curator (`members:read`) |
| POST | `/api/collections/[id]/members` | owner (`members:manage`) |
| GET·DELETE | `/api/collections/[id]/members/[mid]` | curator (GET) / owner (DELETE) |
| GET·POST | `/api/collections/[id]/invitations` | owner (`invitations:read`/`:manage`) |
| GET·PATCH·DELETE | `/api/invitations/[id]` | owner (`invitations:manage`) |
| POST | `/api/invitations/[id]/resend` | owner (`invitations:manage`) |
| GET | `/api/invitations/accept` | public (token) |
| POST | `/api/invitations/accept` | self (token + email match) |

### preferences
| Method | Path | Access |
|---|---|---|
| GET | `/api/collections/[id]/preferences/items` | member (scoped to caller) |
| POST | `/api/collections/[id]/preferences/recalculate` | member (scoped to caller) |

### dispositions
| Method | Path | Access |
|---|---|---|
| POST | `/api/collections/[id]/dispositions` | curator (`preferences:write`, scoped to caller) |
| GET | `/api/collections/[id]/dispositions` | member (scoped to caller) |
| DELETE | `/api/collections/[id]/dispositions/[itemId]` | curator (`preferences:write`, scoped to caller) |

### items (top-level)
| Method | Path | Access |
|---|---|---|
| POST | `/api/items?collectionId=` | member |
| GET·PATCH·DELETE | `/api/items/[id]` | member |
| POST | `/api/items/[id]/restore` | member |
| POST | `/api/items/[id]/purge` | owner |
| POST | `/api/items/[id]/remove-from-sorts` | owner |

### sessions
| Method | Path | Access |
|---|---|---|
| POST | `/api/sessions` | member |
| GET·PATCH·DELETE | `/api/sessions/[id]` | curator |
| POST | `/api/sessions/[id]/decisions` | curator |

### sort-results
| Method | Path | Access |
|---|---|---|
| POST | `/api/sort-results` | member |
| GET·PATCH·DELETE | `/api/sort-results/[id]` | curator |
| POST | `/api/sort-results/[id]/finalize` | curator |
| POST | `/api/sort-results/[id]/supersede` | curator |
| GET | `/api/sort-results/[id]/items` | curator |
| GET·PATCH·DELETE | `/api/sort-results/[id]/items/[rid]` | curator |
| POST | `/api/sort-results/[id]/items/[rid]/reset` | curator |

### shares
| Method | Path | Access |
|---|---|---|
| GET·POST | `/api/sort-results/[id]/shares` | curator |
| GET·PATCH·DELETE | `/api/sort-results/[id]/shares/[sid]` | curator |
| GET | `/api/shared-results/[token]` | public (token) |

---

## auth & user

### `GET·POST /api/auth/[...nextauth]`
NextAuth v4 handler (sign-in, callback, session, sign-out). Public. Drives the JWT session every other route depends on.

### `POST /api/auth/signup`
Public. Create a credentials account. **Body:** `{ email, password }`. Email normalized + regex-validated; password ≥ 8 chars. **Returns** `201 { message }`. To prevent email enumeration it returns the **same** `201 { message: "Account created successfully" }` whether or not the email already exists. **Errors:** `400` missing/invalid email or short password; `500`.

### `GET·PATCH·DELETE /api/users/me`
Authenticated; acts **only on the caller** (`session.user.id`), so no IDOR. `GET` → `User`. `PATCH` is **name-only** (`{ name }` via `UpdateUserSchema` in `src/server/api/users.ts`): trimmed, ≤80 chars; an **empty name clears** the display name (persists `null`, returns `200` — not a `400`); any other key (incl. `email`) is **stripped** — email is intentionally not mutable here (spec §5.1) — so an email-only or empty body is a `200` **no-op**. `400` only on malformed JSON; returns the updated `User`. The display name carries through the JWT session (see ARCHITECTURE decisions log, entry 2). `DELETE` → **real account deletion** via `AccountDeletionService` (pv9 PR6, `purses-hybm`): purges **every** collection the caller owns — active **and** soft-deleted — by reusing `CollectionPurgeService` (cascade + `collection.purge` audit + blob `del`); deletes the caller's curator-private rows (sessions/sort-results/+children/preferences/memberships) in collections owned by others; **scrubs** the caller's account-linking identifiers on retained shared content (`photos.uploaded_by` and accepted `invitations.email` → a per-id tombstone); scrubs the `user` row PII (`email`→`deleted+<id>@deleted.invalid`, `name`/`image`/`password`/`emailVerified`→null) and deletes `account`/`session`/`verificationToken` rows — all so login is dead and no PII survives. **Fail-loud:** if any owned-collection purge throws, the op aborts **before** the PII scrub (PII intact, retryable) and returns **`500`** — never a partial-scrub success. `200 { message }` on success; `401` if no session.

## collections (core)

### `GET /api/collections`
Authenticated. Returns the caller's `Collection[]`. `401`/`500`.

### `POST /api/collections`
Authenticated. **Body** → `createCollection`; also creates the caller's **owner** `Membership` (`role:"owner"`) **in one transaction** (pv9 PR3 — no orphaned-owner window). **Returns** `201 Collection`. `400` invalid JSON. Owner is forced from the session.

### `GET /api/collections/[id]`
`getSession` + `requireApiCollectionAccess` (member-or-owner). Returns the `Collection`. `401`/`403`/`404` (`404` absent before membership is evaluated). (IDOR closed — pv9 PR1, `purses-55c`.)

### `PATCH /api/collections/[id]`
`requireAuth` + `canManageCollection` → `403`. Body → updated `Collection`. `400` invalid JSON.

### `DELETE /api/collections/[id]`
`requireAuth` + `isOwner` → `403`. Returns `{ message, collection }` (soft delete).

### `POST /api/collections/[id]/archive` · `/restore`
`requireAuth` + `canManageCollection` → `403`. Returns the updated `Collection`. Reversible pair.

### `POST /api/collections/[id]/purge`
`requireAuth` → resolve the collection **including soft-deleted** (`CollectionRepository.findByIdIncludingDeleted`; `404` if absent — the canonical path is `DELETE`/soft-delete *then* purge) → **owner-only** inline check (`collection.ownerId !== user.id` → `403`) → **only then** parse `{ confirm }`, which must **echo the exact collection name** (`400` invalid JSON or name-mismatch — "Type the collection name to confirm"). On success, `CollectionPurgeService` permanently **hard-deletes the ENTIRE collection in one transaction** — `sort_result_shares → sort_result_items → sort_results → decision_events → sessions → preferences → photos → items → invitations → memberships → the collection` (deepest-child-first; no FK has `ON DELETE CASCADE`) — **total-erase** (draft AND finalized results, all curators; **no `409` block**), writes one `collection.purge` `audit_log` row in the same tx, then deletes photo **blobs best-effort after commit**. `200 { message: "Collection purged" }`. Authz precedes body parsing (a non-owner gets `403`/`404`, never a `400` that leaks existence/name). (`purgeCollection` realized — `purses-u3p`.)

### `GET /api/collections/[id]/audit`
`requireAuth` + **owner-only** `requireApiCollectionOwner` (`404` absent *before* `403` non-owner — the existence-oracle convention; a member-not-owner gets `403`). Returns the collection's permanent-purge trail as `AuditLog[]`, **newest-first** (`created_at DESC, id DESC`). `?limit=` is clamped server-side (default `100`, hard cap `200`; `NaN`/`≤0`/absent → `100`) — never an unbounded scan. Append-only; rows carry only ids + counts (no PII). `200 []` when empty; `401`/`404`/`403`. (`purses-ite`.)

## collection items

### `GET·POST /api/collections/[id]/items`
`getSession` + `requireApiCollectionAccess` (member-or-owner). `GET` → `Item[]`. `POST` body → `201 Item`. `400` invalid JSON; `401`/`403`/`404`.

### `PATCH /api/collections/[id]/items/[itemId]`
`getSession` + **belongs-to-parent** (`item.collectionId !== id` → `404`) + `requireApiCapability("items:write")` (**curator** — any member; the old `canEditMetadata` flag is inert). **Body:** `{ name?, brand?, style?, color?, material?, category?, notes? }` (all nullable). Returns updated `Item`. `400` invalid input; `401`/`403`/`404`.

## item photos

### `POST /api/collections/[id]/items/[itemId]/photos`
`getSession` + belongs-to-parent (`404`) + `requireApiCapability("photos:write")` (**curator**; the old `canAddPhotos` flag is inert). **Body:** `multipart/form-data` with `file` (must be `image/*`). Stores to Vercel Blob (private). **Returns** `201 Photo`. `400` no file / not an image; `413` over `MAX_UPLOAD_BYTES`; `401`/`403`/`404`.

### `DELETE /api/collections/[id]/items/[itemId]/photos/[photoId]`
`getSession` + belongs-to-parent (`404`) + `requireApiCapability("photos:write")` (**curator**; the old `canDeletePhotos` flag is inert); also `photo.itemId` must match (`404`). Deletes blob + row, then best-effort sweeps the photo's persisted resized variants (`variants/<collectionId>/<photoId>/`). `200 { success: true }`. `400` on failure; `401`/`403`/`404`.

### `GET /api/collections/[id]/items/[itemId]/photos/[photoId]/file`
`getSession` + belongs-to-parent (`404`) + (member or owner) → `403`. Then delegates to `servePhotoFile` (`src/lib/photo-serving.ts`). Optional `?w=` selects a server-resized variant (allowlist `160|320|640|1280`; other/invalid → `400`); omitted → the full-resolution original streamed verbatim. Resized variants are EXIF auto-oriented `image/webp`; originals keep their stored `Content-Type`. Caching: `Cache-Control: private, max-age=300, must-revalidate` + a strong variant `ETag` (`"photoId:w|orig:updatedAtMs"`) compared **app-side** (the client `If-None-Match` is **not** forwarded to Vercel Blob) → `304`. Source over `RESIZE_MAX_SOURCE_BYTES` (25 MB) or excess decoded pixels → `400`; blob missing → `404`; processing failure → generic `500`; `401`. `runtime = "nodejs"` (sharp). `next/image` keeps `unoptimized` (private blobs + cookie auth). Resized variants are **persisted** to Blob (`variants/<collectionId>/<photoId>/w<w>-v<v>.webp`, resize-once-globally) and served on a HIT without re-decoding; the variant store is best-effort (a get/put failure falls back to on-the-fly resize).

### `PATCH /api/collections/[id]/items/[itemId]/photos/[photoId]`
Rotate a photo (persisted, non-destructive). **Body:** `{ rotation: 0|90|180|270 }` (absolute clockwise degrees). `getSession` + belongs-to-parent (`404`) resolved **before** the permission check, then `requireApiCapability("photos:write")` (**curator**; the old `canAddPhotos` flag is inert). Validates `rotation` ∈ the set (else `400`, incl. bad/missing JSON); `PhotoRepository.update` runs only after authz+validation pass. `200 { rotation, updatedAt }` (the new `updatedAt` cache-busts the image URL). `401`. Applied at serve time by `servePhotoFile` (`.rotate()` EXIF then `.rotate(rotation)`); the blob is never rewritten.

### `POST /api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero`
`getSession` + belongs-to-parent (`404`) + `requireApiCollectionAccess` (`403`/`404`). Sets the item's hero photo. `200 { success: true }`. `400` on failure; `401`.

## pool & photos

The **pool** is a collection's uploaded-but-unassigned photos. All pool routes are member-or-owner (inline).

### `POST /api/collections/[id]/pool/group`
Group pooled photos into item(s). **Body:** `{ photoIds: string[] (1..MAX_GROUP_PHOTOS), mode?: "each" | "combine" }` (`mode` lenient — unknown ⇒ `"combine"`, never a 400). `"combine"` → `201 { number }` (one new item); `"each"` → `201 { count }` (one item per photo). `400` bad/empty/oversized `photoIds`; `409` conflict; `401`/`403`/`404`.

### `GET /api/collections/[id]/pool/photos`
Lists pooled photos. **Returns** `{ photos: [{ id, filename }] }`. (The bulk uploader polls this until async-recorded rows appear.) `401`/`403`/`404`.

### `GET /api/collections/[id]/pool/photos/[photoId]/file`
A **pooled** photo (must be this collection's and unassigned — `itemId === null`, else `404`). Same serving contract as the item `/file` route above (delegates to `servePhotoFile`): optional `?w=` resize allowlist, EXIF auto-orient → webp, `private, max-age=300, must-revalidate` + app-side variant `ETag`/`304`, decode-bomb guards, generic `500`, `runtime = "nodejs"`. `401`/`403`.

### `POST /api/collections/[id]/pool/upload`
Client-direct upload via `@vercel/blob` `handleUpload`. `onBeforeGenerateToken` authorizes (`canAddPhotos` or owner; `401`/`404`/`403`) and signs a token; `onUploadCompleted` (no session — trusts the signed token) records the pooled `Photo`. **Body:** the Vercel Blob `HandleUploadBody`. Allowed types `POOL_ALLOWED_CONTENT_TYPES`, max `POOL_MAX_BYTES`. Returns the `handleUpload` JSON; `500` on unexpected failure.

### `POST /api/collections/[id]/photos/reassign`
Unified "Move to…". **Body:** `{ photoIds: string[], destination: { type: "item", itemId } | { type: "new" } | { type: "pool" } }`. `200 { number }`. `400` bad `photoIds`/invalid `destination`; `409` conflict; `401`/`403`/`404`.

## members & invitations

### `GET /api/collections/[id]/members`
`getSession` + `requireApiCollectionAccess` (member-or-owner). Lists the collection's members. `401`/`403`/`404`. (IDOR closed — pv9 PR1, `purses-55c`.)

### `POST /api/collections/[id]/members`
`requireAuth` + `requireApiCapability("members:manage")` (**owner**; pv9 PR4 — closes `purses-lgql`). **Body:** `{ userId }` only — permission flags and `role` are **not accepted** (pv9 PR3); the added member is always a **curator**. `201` member. `400` invalid input; `403`/`404`.

### `GET·DELETE /api/collections/[id]/members/[mid]`
`getSession` + belongs-to-parent (`membership.collectionId !== id` → `404`). `GET` requires `members:read` (**curator**). `DELETE` requires `members:manage` (**owner**) → `{ message }`. **There is no `PATCH`** — members have no mutable fields under the role model (role is fixed at curator, permission flags are inert), so the endpoint was removed (`purses-2wzz`); an unexported method returns `405`. `401`/`403`/`404`.

### `GET·POST /api/collections/[id]/invitations`
`getSession` + `requireApiCapability` — **owner** (`invitations:read` for `GET`, `invitations:manage` for `POST`; pv9 PR4 — closes `purses-4wj2` GAP A). `GET` → `Invitation[]`. `POST` **body:** `{ email }` only (normalized) — no permission flags (an accepted invite becomes a curator). `201 Invitation`; invalid/missing email → `400`. `403`/`404`.

### `GET·PATCH·DELETE /api/invitations/[id]`
`requireAuth` + `requireApiInvitationCapability(id, userId, "invitations:manage")` — resolves the invitation (`404` absent) then requires **owner** of its collection. `PATCH` body → updated `Invitation` (`400` invalid input); `DELETE` → `{ message }`. `401`/`403`/`404`. (pv9 PR4 tightened this from member-or-owner to owner; `purses-nj7`/`purses-g6o`.)

### `POST /api/invitations/[id]/resend`
`requireAuth` + `requireApiInvitationCapability(id, userId, "invitations:manage")` (**owner**). `401`/`403`/`404`.

### `GET·POST /api/invitations/accept?token=`
`GET` is **public** (token-based) — returns the `Invitation` for the token (a preview for the accept landing page). `POST` is **authenticated** and binds the invitation to the caller: `getSession` (`401` if none) → resolve by `?token=` (`400` missing, `404` unknown) → the invitation must be **`pending`** (else **`409`**) → the caller's **DB-canonical email** must equal the invitation email (both `normalizeEmail`d — trim + lowercase; else **`403`**) → in one transaction, create a **`role:"curator"`** `Membership` for the caller and set the invitation `status:"accepted", acceptedAt`. **Idempotent** via the `(collectionId,userId)` unique index (`createIfAbsent` / `onConflictDoNothing` — a repeat/concurrent accept yields `200` with exactly one membership, never a `500`). `200` on success. (`purses-8zcc`, pv9 PR3.)

## preferences

Curator preference state derived from decision events. Both routes now require collection access (`requireApiCollectionAccess`, member-or-owner) **and** scope work to the **caller's own** `user.id` — a non-member gets `403`; a member sees only their own rows. (Membership gate added — pv9 PR1, `purses-55c`.)

### `GET /api/collections/[id]/preferences/items`
Returns the caller's per-item preference state for the collection. `401`/`403`/`404`/`500`.

### `POST /api/collections/[id]/preferences/recalculate`
Recomputes the caller's preferences. `{ message, preferences }`. `401`/`403`/`404`/`500`.

## dispositions

Curator-private triage shelving (Epic C PR1). A **disposition** parks an *untriaged* item out of the sort queue without a verdict: `set_aside` (Not Mine — excluded entirely) or `deferred` (Not Yet — resurfaces at the end of the pass). Rows are scoped per `(item_id, curator_id)` (`UNIQUE`); `curatorId` is always the session user. The governing invariant is **`disposed ⟺ untriaged`**: an item with a `CollectionPreferenceItem` row may not be disposed (`POST` → `409`), and triaging a disposed item clears its disposition (see `POST …/decisions`). Disposed items emit no decision events, so they are simply absent from results with no `ScoringService` change. PR1 wires only `deferred` (Not Yet) in the UI; `set_aside` (Not Mine) is a later PR.

### `POST /api/collections/[id]/dispositions`
`getSession` → resolve the item via `requireApiItemCapability(itemId, "preferences:write")` (gates on the item's **real** collection; `404` absent / `403` forbidden) → **then** assert `item.collectionId === params.id` else `404` (no cross-collection oracle). **Body:** `{ itemId, disposition: "set_aside" | "deferred" }` (zod; `400` invalid JSON / missing `itemId` / bad enum). `curatorId` forced from session. **`409`** (`PreferenceExistsError`) if the item already has a preference row for the caller (the `disposed ⟺ untriaged` invariant). On success, upserts the disposition (`ON CONFLICT (item_id, curator_id)`) → `201 ItemDisposition`. `401`/`500`.

### `GET /api/collections/[id]/dispositions?disposition=set_aside|deferred`
`getSession` + `requireApiCollectionAccess` (member-or-owner; `404` absent / `403` forbidden). Lists the **caller's own** dispositions for the collection (scoped to the session `curatorId` server-side). The `disposition` query param is a **filter hint only** — an absent/unrecognized value returns the full list; it never widens scope. `200 ItemDisposition[]`. `401`/`500`.

### `DELETE /api/collections/[id]/dispositions/[itemId]`
"Bring back." Same guard as `POST`: `requireApiItemCapability(itemId, "preferences:write")` + `item.collectionId === params.id` else `404`. Deletes the caller's disposition for the item, keyed `(item_id, curator_id = session)`. **Idempotent** — a no-op when no row exists still returns `200 { message: "Brought back" }`. `401`/`403`/`404`.

## items (top-level)

These routes are now scoped to the item's collection (IDOR closed — pv9 PR1, `purses-3al`). The collection-scoped `…/collections/[id]/items*` routes remain the primary surface.

### `POST /api/items?collectionId=`
`requireAuth` + `requireApiCollectionAccess(collectionId)` (member-or-owner). `collectionId` is a **query param** (`400` if missing); body → `createItem(collectionId, body)`. `201 Item`. `401`/`403`/`404`.

### `GET·PATCH·DELETE /api/items/[id]`
`requireAuth` + resolve the item (`404` absent/deleted) + `requireApiCollectionAccess(item.collectionId)` (member-or-owner). `GET` → `Item`; `PATCH` body → updated `Item` (`400` invalid JSON); `DELETE` → `{ message, item }` (soft delete). `401`/`403`/`404`.

### `POST /api/items/[id]/restore`
`requireAuth` + resolve the item including soft-deleted (`findByIdIncludingDeleted`; `404` absent) + `requireApiCollectionAccess(item.collectionId)` (member-or-owner). Restores a soft-deleted item.

### `POST /api/items/[id]/purge`
`requireAuth` → resolve the item **including soft-deleted** (`findByIdIncludingDeleted`; `404` if absent) → **owner-only** `requireApiCollectionOwner(item.collectionId)` (`404`/`403`) → **only then** parse `{ confirm: "PURGE" }` (zod; `400` invalid JSON, `400` if confirm missing/wrong). Authz precedes body validation deliberately — a non-owner with a malformed body gets `403`, never a `400` that would leak the item's existence. On success, `ItemPurgeService` permanently **hard-deletes the item + its `CollectionPreferenceItem` rows + its photos atomically** (children-first in one `withTransaction`, since the `items` FK has no `ON DELETE CASCADE`) — and **writes one append-only `audit_log` row in the same transaction** (`item.purge`, actor from the session, photo/preference counts; `purses-ite`), so a committed purge always has its audit record. Then deletes the photo **blobs best-effort after commit** (a blob `del` failure is logged, never rolls back the committed delete — orphans are inert/sweepable). **`409`** (`ItemInResultError`) if the item is referenced by **any** sort result (draft or finalized) — the owner must first detach drafts via `remove-from-sorts`; finalized membership is a hard block. `200 { message: "Item purged" }`.

### `POST /api/items/[id]/remove-from-sorts`
`requireAuth` → resolve item including soft-deleted (`404`) → **owner-only** `requireApiCollectionOwner` (`404`/`403`). No confirm body. Bulk-detaches the item from **every draft** sort result across all curators in one `withTransaction` (purge-prep companion); **finalized results and the curator's `CollectionPreferenceItem` rows are left untouched**. `200 { removed, remainingInFinalized }` — count detached from drafts, and how many finalized results still reference it. This is a deliberate, scoped **t9l exception**: results are normally curator-private, but purge is a collection-owner op, so clearing draft sorts is its necessary consequence.

## sessions

Curator-scoped sorting sessions. `goal` is optional free text.

### `POST /api/sessions`
`getSession` + `requireApiCollectionAccess(body.collectionId)`. **Body:** `{ collectionId, goal? }` (`400` missing `collectionId`). `curatorId` forced from session. `201 Session`.

### `GET·PATCH·DELETE /api/sessions/[id]`
`getSession` + `authorizeSession` (`404` absent; `403` not a member; `403` not the session's curator — even other members/owners are denied). `GET` → `Session`; `PATCH` body → updated `Session` (`400` invalid JSON); `DELETE` → `{ message }`.

### `POST /api/sessions/[id]/decisions`
`getSession` + session resolve (`404`) + `requireApiCollectionAccess` + curator-scope (`403`) — authorized **before any write**. **Body:** `{ type: "triage" | "pairwise_compare" | "bucket_assign", decision: object }`. The event insert, the preference recalc, and — for `type: "triage"` — clearing any disposition for the triaged item all run in **one `withTransaction`** (atomic: all commit or all roll back). Clearing on triage enforces `disposed ⟺ untriaged` (a previously `set_aside`/`deferred` item can't be both ranked and disposed). `201` event; `500` on failure. (Hardening note: the triage branch reads `decision.itemId` untyped and does not assert it is in-scope — `purses-mels`, LOW, not exploitable since `bringBack`'s delete is keyed to the caller's own `curatorId` and idempotent.)

## sort-results

Curator-private results, gated by `requireApiResultAccess` (member-or-owner **and** owning curator). Children also enforce belongs-to-parent.

### `POST /api/sort-results`
`getSession` + `requireApiCollectionAccess(body.collectionId)`. **Body:** `{ collectionId, name }` (`400` if either missing, or invalid JSON). `curatorId` from session, `status: "draft"`. Delegates to `SortResultService.createDraftResult`, which reads the curator's `CollectionPreferenceItem` rows for the collection and **materializes one `SortResultItem` per preference** (ranked by descending score, carrying each row's bucket) before returning. **Materialization is atomic** — the result row + all item rows are written in one `withTransaction`, so a mid-materialization failure commits nothing (`purses-nea`). `201 SortResult` (the created draft; items are fetched via `GET …/[id]/items`).

### `GET·PATCH·DELETE /api/sort-results/[id]`
`requireAuth` + `requireApiResultAccess` (`401`/`403`/`404`). `GET` → `SortResult`; `PATCH` body → updated `SortResult` (`400` invalid JSON), but rejects a **finalized** result with **`409`** (`"Result is finalized"`) — a finalized result is immutable, name included (infra §11.3; `purses-gmn`, mirroring `purses-526`'s item-level guards). `DELETE` delegates to `SortResultService.deleteResult`, which **hard-deletes a draft result and its child items** (children first — the `sort_result_items → sort_results` FK has no `ON DELETE CASCADE`; **atomic** — both deletes in one `withTransaction`, a `purses-nea` follow-up): `200 { message }` when a draft was deleted; **`409`** (`"Can only delete draft results"`) if the result is finalized; **`404`** if absent.

### `POST /api/sort-results/[id]/finalize`
`requireApiResultAccess`. Finalizes a **draft** result → `200 SortResult`. **`409`** (`FinalizeStateError`, "Can only finalize draft results") if the result is already finalized — finalize is once-only, not idempotent (pv9 PR2, `purses-ydph`).

### `POST /api/sort-results/[id]/supersede`
`requireAuth` + `requireApiResultAccess`. Delegates to `SortResultService.supersedeResult`. When the source is **finalized**, creates a new **draft** result (`name` = `"<source name> (Revision)"`) with the source's items **cloned** (computed rank/bucket carried over) **atomically** (result + items in one transaction — `purses-nea`) → **`201`** the new draft `SortResult`. **`409`** (`"Can only supersede finalized results"`) if the source is not finalized; **`404`** if the source is absent.

### `GET /api/sort-results/[id]/items`
`requireApiResultAccess`. Returns `SortResultItem[]`.

### `GET·PATCH·DELETE /api/sort-results/[id]/items/[rid]`
`requireApiResultAccess` + belongs-to-parent (`item.sortResultId !== id` → `404`). `PATCH`/`DELETE` reject a **finalized** parent result with **`409`** (finalized results are immutable — infra §11.3; `purses-526`). `GET` → `SortResultItem`; `PATCH` body → updated item (`400` invalid JSON); `DELETE` removes the item via `SortResultService.deleteResultItem` → `200 { message }`.

### `POST /api/sort-results/[id]/items/[rid]/reset`
`requireApiResultAccess` + belongs-to-parent (`404`); rejects a **finalized** parent result with **`409`** (`purses-526`). Resets the item's placement. Returns the `SortResultItem`.

## shares

### `GET·POST /api/sort-results/[id]/shares`
`requireAuth` + `requireApiResultAccess`. `GET` → the result's `SortResultShare[]`, scoped via `SortResultShareRepository.findByResult(id)`. `POST` body → `201` `SortResultShare` (e.g. `{ expiresAt? }`, per `createShare`). `400` invalid JSON.

### `GET·PATCH·DELETE /api/sort-results/[id]/shares/[sid]`
`requireApiResultAccess` + belongs-to-parent (`share.sortResultId !== id` → `404`). `GET` → share; `PATCH` body → updated share (`400` invalid JSON); `DELETE` → `{ message }`.

### `GET /api/shared-results/[token]`
**Public**, token-based — the recipient view of a shared result. Returns the shared result for `token`; any error (absent/expired) → `404`.

## Known authz gaps

The cross-tenant **IDOR holes are closed** (pv9 PR1, 2026-06-22): `GET /api/collections/[id]`, `GET …/members`, `GET·PATCH·DELETE /api/invitations/[id]` + `/resend`, `POST /api/items` + `GET·PATCH·DELETE /api/items/[id]` + `/restore`, and `…/preferences/*` are all scoped to their collection via `requireApiCollectionAccess` (member-or-owner; `404` absent / `403` forbidden).

**The role model is fully wired (pv9 PR1–PR4).** There are no known tenant-isolation holes. Authorization for every collection-scoped route flows through `requireApiCapability(op)` against the Owner/Curator `CAPABILITIES` map (`src/server/dal/capabilities.ts`): owner = `collection.ownerId`, curator = any member, `membership.role` display-only, the legacy `can*` flags inert. Member management and invitation create/read/manage are **owner-only** (`purses-lgql`, `purses-4wj2` GAP A — closed in PR4); item/photo CRUD is **curator** (full-curator). `POST /api/invitations/accept` creates a curator membership bound to the caller's email, pending-guarded, idempotent (`purses-8zcc`). Create/update routes reject client-supplied flags/`role` (escalation surface closed); owner bootstrap is transactional. Migration `0006` reconciles `memberships.role` + `CHECK (role IN ('owner','curator'))`.

**Account deletion is real (pv9 PR6, `purses-hybm`):** `DELETE /api/users/me` purges all owned data (incl. soft-deleted collections) + scrubs PII (see its detail). The pv9 epic's in-scope work is **complete**.

**Audit attribution (pv9 PR7):** destructive ops are attributed in the append-only `audit_log` (actor from session, written tx-bound with the mutation): `item.delete` / `photo.delete` on curator soft-delete/delete (`purses-wfgj`), `account.delete` on account deletion (`purses-obe0`), alongside the existing `item.purge` / `collection.purge`. Curator photo-delete is kept (owner's full-curator decision) and now attributed (`purses-opir`). The no-op member `PATCH` was removed (`purses-2wzz`).

**Inert flag fields removed (pv9 PR8, `purses-us3d`):** the permission-flag fields are gone from the `CollectionMembership`/`Invitation` types, the repos, the owner bootstrap, and the UI (MemberList shows the role badge only; the invite form is email-only; `PermissionCheckboxes` deleted). Per **expand/contract**, PR8 ships only the column-free *code* (the DB keeps the now-inert columns); a follow-up deploy runs the `0007` DROP once the column-free code is live — because `vercel-build` auto-runs `db:migrate` and the repos' `.select()` names every schema column, so dropping in the same deploy would 500 the still-live old code during the build.

The `0007` DROP of the inert flag columns shipped as the second deploy of `purses-us3d` (after the PR8 column-free code went live).

**Repos are import-private to `src/app` (pv9 PR10, `purses-25ca`):** no route or page imports a repository directly — data flows only through the DAL guards, controllers (`XController.fromDb(db)`), and services; an ESLint rule enforces it across `src/app/**`. See ARCHITECTURE decision 19. **This completes the pv9 epic** — all in-scope work and every filed follow-up are shipped.

**Lockdown backstop shipped (pv9 PR5, `purses-o03`):** `src/lib/db/route-authz-enumeration.integration.test.ts` walks every `route.ts`, exercises each collection-scoped/curator-private route+method as a **stranger** and asserts `403`/`404` (never `200`/leaky `500`), and asserts **filesystem-exhaustiveness** — a new route in neither the `PUBLIC_OR_SELF` allowlist nor the stranger set fails CI. (Also fixed: `POST /api/sort-results/[id]/shares` now authorizes before parsing the body.)

Implemented (formerly no-op stubs): `POST /api/items/[id]/purge` is a real owner-only hard-delete cascade with a `409`-in-result guard, alongside owner-only `POST /api/items/[id]/remove-from-sorts` — **purses-u3p** resolved for item purge. **`POST /api/collections/[id]/purge`** is a real owner-only whole-collection cascade purge (name-confirm + `collection.purge` audit). The former sort-results no-op-success stubs — `DELETE /api/sort-results/[id]`, `DELETE /api/sort-results/[id]/items/[rid]`, and the empty `GET …/shares` listing — are also implemented.

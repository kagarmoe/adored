# API reference (agent-first)

Structured reference for an AI agent (or developer) calling the **Adored** HTTP API. Not OpenAPI — markdown optimized for reading, not codegen. Every route lives under `/api`, speaks JSON in and JSON out (except binary image streams and the NextAuth handler), and is a Next.js App Router route handler.

**How to read this:** [Authentication](#authentication), [Authorization model](#authorization-model), and [Status-code semantics](#status-code-semantics) apply to every route — read them first. Then use the [Route index](#route-index) and the per-family detail. Returned-entity field shapes (`Collection`, `Item`, `Photo`, `SortResult`, `SortResultItem`, `Membership`, `Invitation`, `Session`, `DecisionEvent`) live in `src/types` and the Drizzle schema (`src/lib/db/schema.ts`) — this doc names the entity rather than duplicating fields that would drift.

> **Accuracy note:** this documents what the code does **today**. Several routes enforce only authentication, not collection membership — they are flagged **`⚠ requireAuth-only`**. Closing them is the in-flight **pv9 authz epic** (`purses-55c`, `purses-g6o`, `purses-82r`); see [Known authz gaps](#known-authz-gaps). Do not rely on `⚠` routes for tenant isolation.

## Authentication

- **Mechanism:** NextAuth v4 with a **JWT session** in the session cookie. Authenticate via the NextAuth flow (`/api/auth/[...nextauth]`) and send the session cookie on subsequent requests.
- **Two server-side checks appear in the code, both meaning "must be signed in":**
  - `requireAuth()` (`src/lib/auth.ts`) — throws `"Unauthorized"`; the handler maps it to **`401`**.
  - `getSession()` + an inline `if (!session?.user) → 401` — same effect, used by the newer routes that then call a DAL guard.
- **Sign-up:** `POST /api/auth/signup` (public) creates a credentials account; sign-in goes through the NextAuth handler.
- **public** routes need no session: the NextAuth handler, signup, `invitations/accept`, and `shared-results/[token]`.

## Authorization model

Authentication is *who you are*; authorization is *what you may touch*. The chokepoint is `src/server/dal/collection-access.ts` (do not hand-roll):

- **`requireApiCollectionAccess(db, collectionId, userId)`** — tenant gate. Returns the collection only if the user is **member or owner**; otherwise a `NextResponse`: **`404`** if the collection is absent, **`403`** if it exists but the caller is neither.
- **`requireApiCollectionOwner(db, collectionId, userId)`** — owner-only sibling of `requireApiCollectionAccess` (a stricter gate). Returns the collection only if **`collection.ownerId === userId`**; otherwise a `NextResponse`: **`404`** if absent, **`403`** if it exists but the caller is not the owner (a member-not-owner gets `403`, same as a non-member). Used by destructive collection-owner ops where membership is insufficient (item `purge`, `remove-from-sorts`).
- **`requireApiResultAccess(db, resultId, userId)`** — for `sort-results`. Resolves the result, runs the collection gate on `result.collectionId`, then additionally requires **`result.curatorId === userId`** (results are curator-private). `404` absent, `403` if not a member **or** not the owning curator.
- **Sessions** use an inline `authorizeSession` of the same shape (collection access + `session.curatorId === userId`).
- **Older routes** (`requireAuth`-only) sometimes add an **inline** check instead of the DAL guard — `canManageCollection`, `isOwner`, `isCollectionManager`, or a `membership.canX` flag → `403`. These are correctly guarded; the detail names the exact check per method.
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

## Cross-cutting invariants

- **ULID for data, slug for nav** — every `[id]`/`[itemId]`/`[rid]`/`[sid]`/`[mid]` in an API path is a ULID.
- **Curator-scoped** — `sessions` and `sort-results` (and children) are private to the creating curator, enforced on top of collection membership.
- **`ownerId`/`curatorId` come from the session, never the body** — create routes force them from the authenticated user.
- **Belongs-to-parent on child routes** — see Authorization model.
- **Soft-delete vs purge** — `archive`/`restore` are reversible; `purge` is the permanent path. `POST /api/items/[id]/purge` is now real: an **owner-only** permanent hard-delete cascade (preferences + photos + blobs, then the item) in one transaction, **`409`** if the item is in any sort result (see detail). **`POST /api/collections/[id]/purge` is now real too** — an owner-only whole-collection cascade purge with a type-the-collection-name confirm (see detail). `DELETE /api/sort-results/[id]` and `…/items/[rid]` are hard deletes restricted to **draft** results (see detail).

## Route index

**Access** legend: **public** · **self** (`requireAuth`, acts only on the caller's own data) · **member** (collection member-or-owner) · **manager** (`canManage`/`canEditMetadata`/`isCollectionManager`) · **owner** · **curator** (`requireApiResultAccess`/`authorizeSession`) · **`⚠`** `requireAuth`-only with no tenant check (pv9 gap).

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
| GET | `/api/collections/[id]` | **⚠** |
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
| PATCH | `/api/collections/[id]/items/[itemId]` | manager (`canEditMetadata`) |

### item photos
| Method | Path | Access |
|---|---|---|
| POST | `/api/collections/[id]/items/[itemId]/photos` | member (`canAddPhotos`/owner) |
| DELETE | `…/photos/[photoId]` | member (`canDeletePhotos`/owner) |
| PATCH | `…/photos/[photoId]` | member (`canAddPhotos`/owner) |
| GET | `…/photos/[photoId]/file` | member |
| POST | `…/photos/[photoId]/set-hero` | member |

### pool & photos
| Method | Path | Access |
|---|---|---|
| POST | `/api/collections/[id]/pool/group` | member |
| GET | `/api/collections/[id]/pool/photos` | member |
| GET | `/api/collections/[id]/pool/photos/[photoId]/file` | member |
| POST | `/api/collections/[id]/pool/upload` | member (`canAddPhotos`/owner) |
| POST | `/api/collections/[id]/photos/reassign` | member |

### members & invitations
| Method | Path | Access |
|---|---|---|
| GET | `/api/collections/[id]/members` | **⚠** |
| POST | `/api/collections/[id]/members` | manager |
| GET·PATCH·DELETE | `/api/collections/[id]/members/[mid]` | member (GET) / manager (PATCH·DELETE) |
| GET·POST | `/api/collections/[id]/invitations` | member |
| GET·PATCH·DELETE | `/api/invitations/[id]` | **⚠** |
| POST | `/api/invitations/[id]/resend` | **⚠** |
| GET·POST | `/api/invitations/accept` | public (token) |

### preferences
| Method | Path | Access |
|---|---|---|
| GET | `/api/collections/[id]/preferences/items` | **⚠** (scoped to caller) |
| POST | `/api/collections/[id]/preferences/recalculate` | **⚠** (scoped to caller) |

### items (top-level)
| Method | Path | Access |
|---|---|---|
| POST | `/api/items?collectionId=` | **⚠** |
| GET·PATCH·DELETE | `/api/items/[id]` | **⚠** |
| POST | `/api/items/[id]/restore` | **⚠** |
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
Authenticated; acts **only on the caller** (`session.user.id`), so no IDOR. `GET` → `User`. `PATCH` body → updated `User` (`400` invalid JSON). `DELETE` → `{ message, user }`. `401` if no session; `500` on error.

## collections (core)

### `GET /api/collections`
Authenticated. Returns the caller's `Collection[]`. `401`/`500`.

### `POST /api/collections`
Authenticated. **Body** → `createCollection`; also creates the caller's **owner** `Membership` (all permission flags true). **Returns** `201 Collection`. `400` invalid JSON. Owner is forced from the session.

### `GET /api/collections/[id]`  ⚠ requireAuth-only
Returns the `Collection` by id **without a membership check** — any signed-in user can read any collection. `401`/`500`. (pv9 gap.)

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
`getSession` + **belongs-to-parent** (`item.collectionId !== id` → `404`) + `membership.canEditMetadata` → `403`. **Body:** `{ name?, brand?, style?, color?, material?, category?, notes? }` (all nullable). Returns updated `Item`. `400` on failure; `401`.

## item photos

### `POST /api/collections/[id]/items/[itemId]/photos`
`getSession` + belongs-to-parent (`404`) + (`canAddPhotos` or owner) → `403`. **Body:** `multipart/form-data` with `file` (must be `image/*`). Stores to Vercel Blob (private). **Returns** `201 Photo`. `400` no file / not an image; `413` over `MAX_UPLOAD_BYTES`; `401`.

### `DELETE /api/collections/[id]/items/[itemId]/photos/[photoId]`
`getSession` + belongs-to-parent (`404`) + (`canDeletePhotos` or owner) → `403`; also `photo.itemId` must match (`404`). Deletes blob + row. `200 { success: true }`. `400` on failure; `401`.

### `GET /api/collections/[id]/items/[itemId]/photos/[photoId]/file`
`getSession` + belongs-to-parent (`404`) + (member or owner) → `403`. Then delegates to `servePhotoFile` (`src/lib/photo-serving.ts`). Optional `?w=` selects a server-resized variant (allowlist `160|320|640|1280`; other/invalid → `400`); omitted → the full-resolution original streamed verbatim. Resized variants are EXIF auto-oriented `image/webp`; originals keep their stored `Content-Type`. Caching: `Cache-Control: private, max-age=300, must-revalidate` + a strong variant `ETag` (`"photoId:w|orig:updatedAtMs"`) compared **app-side** (the client `If-None-Match` is **not** forwarded to Vercel Blob) → `304`. Source over `RESIZE_MAX_SOURCE_BYTES` (25 MB) or excess decoded pixels → `400`; blob missing → `404`; processing failure → generic `500`; `401`. `runtime = "nodejs"` (sharp). `next/image` keeps `unoptimized` (private blobs + cookie auth).

### `PATCH /api/collections/[id]/items/[itemId]/photos/[photoId]`
Rotate a photo (persisted, non-destructive). **Body:** `{ rotation: 0|90|180|270 }` (absolute clockwise degrees). `getSession` + belongs-to-parent (`404`) resolved **before** the permission check, then **`canAddPhotos` or owner** (`403`) — a write tier, not the bare-member read tier (a view-only curator cannot re-orient shared photos). Validates `rotation` ∈ the set (else `400`, incl. bad/missing JSON); `PhotoRepository.update` runs only after authz+validation pass. `200 { rotation, updatedAt }` (the new `updatedAt` cache-busts the image URL). `401`. Applied at serve time by `servePhotoFile` (`.rotate()` EXIF then `.rotate(rotation)`); the blob is never rewritten.

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

### `GET /api/collections/[id]/members`  ⚠ requireAuth-only
Lists a collection's members **without a membership check** — any signed-in user can read any collection's member list. `401`/`500`. (pv9 gap.)

### `POST /api/collections/[id]/members`
`requireAuth` + `isCollectionManager` → `403`. Body → `201` member. `400` invalid JSON.

### `GET·PATCH·DELETE /api/collections/[id]/members/[mid]`
`getSession` + belongs-to-parent (`membership.collectionId !== id` → `404`). `GET` additionally `requireApiCollectionAccess` (member). `PATCH`/`DELETE` require `isCollectionManager` → `403`. `PATCH` body → updated member (`400` invalid JSON); `DELETE` → `{ message }`.

### `GET·POST /api/collections/[id]/invitations`
`getSession` + `requireApiCollectionAccess` (member). `GET` → `Invitation[]`. `POST` body → `201 Invitation` (`500` on failure).

### `GET·PATCH·DELETE /api/invitations/[id]`  ⚠ requireAuth-only
Reads/updates/revokes an invitation by id **without an ownership/collection check**. `PATCH` body → updated `Invitation` (`400` invalid JSON); `DELETE` → `{ message }`. `401`/`500`. (pv9 gap.)

### `POST /api/invitations/[id]/resend`  ⚠ requireAuth-only
Resends an invitation by id, no ownership check. `401`/`500`. (pv9 gap.)

### `GET·POST /api/invitations/accept?token=`
**Public**, token-based. `GET` returns the `Invitation` for the token. `POST` marks it `accepted`. `400` missing token; `404` token not found; `500`. **Note:** `POST` currently only flips status — it does **not** create a `Membership` (incomplete).

## preferences

Curator preference state derived from decision events. Both routes are **`⚠ requireAuth-only`** (no collection-membership gate) but the controller scopes work to the **caller's own** `user.id`, so they expose only the caller's data — lower severity than the read-IDOR routes, but still missing the documented membership check (pv9).

### `GET /api/collections/[id]/preferences/items`
Returns the caller's per-item preference state for the collection. `401`/`500`.

### `POST /api/collections/[id]/preferences/recalculate`
Recomputes the caller's preferences. `{ message, preferences }`. `401`/`500`.

## items (top-level)  ⚠ requireAuth-only family

All routes here enforce only authentication — **no collection membership/ownership check** — so any signed-in user can act on any item by id (cross-tenant IDOR). Prefer the collection-scoped `…/collections/[id]/items*` routes. (pv9 gap.)

### `POST /api/items?collectionId=`
`requireAuth`. `collectionId` is a **query param** (`400` if missing); body → `createItem(collectionId, body)`. `201 Item`. Membership on `collectionId` is **not** checked.

### `GET·PATCH·DELETE /api/items/[id]`
`requireAuth` only. `GET` → `Item` (**`404`** if absent/deleted); `PATCH` body → updated `Item` (`400` invalid JSON); `DELETE` → `{ message, item }` (soft delete). Any item, any caller.

### `POST /api/items/[id]/restore`
`requireAuth` only. Restores a soft-deleted item.

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
`getSession` + session resolve (`404`) + `requireApiCollectionAccess` + curator-scope (`403`) — authorized **before any write**. **Body:** `{ type: "triage" | "pairwise_compare" | "bucket_assign", decision: object }`. Inserts a `DecisionEvent`, then recalculates the curator's preferences. `201` event; `500` on failure.

## sort-results

Curator-private results, gated by `requireApiResultAccess` (member-or-owner **and** owning curator). Children also enforce belongs-to-parent.

### `POST /api/sort-results`
`getSession` + `requireApiCollectionAccess(body.collectionId)`. **Body:** `{ collectionId, name }` (`400` if either missing, or invalid JSON). `curatorId` from session, `status: "draft"`. Delegates to `SortResultService.createDraftResult`, which reads the curator's `CollectionPreferenceItem` rows for the collection and **materializes one `SortResultItem` per preference** (ranked by descending score, carrying each row's bucket) before returning. **Materialization is atomic** — the result row + all item rows are written in one `withTransaction`, so a mid-materialization failure commits nothing (`purses-nea`). `201 SortResult` (the created draft; items are fetched via `GET …/[id]/items`).

### `GET·PATCH·DELETE /api/sort-results/[id]`
`requireAuth` + `requireApiResultAccess` (`401`/`403`/`404`). `GET` → `SortResult`; `PATCH` body → updated `SortResult` (`400` invalid JSON), but rejects a **finalized** result with **`409`** (`"Result is finalized"`) — a finalized result is immutable, name included (infra §11.3; `purses-gmn`, mirroring `purses-526`'s item-level guards). `DELETE` delegates to `SortResultService.deleteResult`, which **hard-deletes a draft result and its child items** (children first — the `sort_result_items → sort_results` FK has no `ON DELETE CASCADE`; **atomic** — both deletes in one `withTransaction`, a `purses-nea` follow-up): `200 { message }` when a draft was deleted; **`409`** (`"Can only delete draft results"`) if the result is finalized; **`404`** if absent.

### `POST /api/sort-results/[id]/finalize`
`requireApiResultAccess`. Finalizes the result. Returns `SortResult` (`200`).

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

These routes enforce **authentication only** (no collection membership/ownership), tracked under the **pv9** epic. An agent should treat them as unsafe for tenant isolation:

- `GET /api/collections/[id]` — reads any collection.
- `GET /api/collections/[id]/members` — reads any collection's member list.
- `GET·PATCH·DELETE /api/invitations/[id]`, `POST /api/invitations/[id]/resend` — manage any invitation by id.
- `POST /api/items`, `GET·PATCH·DELETE /api/items/[id]`, `/restore` — act on any item by id (read/update/soft-delete). **`/purge` is no longer in this set:** it now gates **owner-only** via `requireApiCollectionOwner` (as does the new `/remove-from-sorts`).
- `GET·POST /api/collections/[id]/preferences/*` — no membership gate (but scoped to the caller's own data).

Implemented (formerly no-op stubs): `POST /api/items/[id]/purge` is now a real owner-only hard-delete cascade with a `409`-in-result guard, alongside the new owner-only `POST /api/items/[id]/remove-from-sorts` — **purses-u3p** is resolved for item purge. **`POST /api/collections/[id]/purge` is now a real owner-only whole-collection cascade purge too** (name-confirm + `collection.purge` audit). The former sort-results no-op-success stubs — `DELETE /api/sort-results/[id]`, `DELETE /api/sort-results/[id]/items/[rid]`, and the empty `GET …/shares` listing — are also implemented.

# PurseInator MVP API Specification

Scope: full CRUD-style API for the collaborative MVP. Auth is handled by Next.js Auth. All routes require an authenticated user unless marked public. Collections are private by default. Collection access is membership-based. Curator judgment is private until explicitly shared.

## Conventions

- Base path: `/api`
- IDs are opaque strings.
- Full CRUD means: create, read/list, update, delete where the operation makes sense.
- `delete` usually means soft delete. `purge` permanently removes records and blobs.
- DecisionEvents are append-only and cannot be updated or deleted.
- Finalized SortResults are immutable. They may be superseded, shared, or unshared.

## Users

| Method | Route | Purpose |
|---|---|---|
| GET | `/users/me` | Get current authenticated user |
| PATCH | `/users/me` | Update current user profile |
| DELETE | `/users/me` | Soft-delete/deactivate current user account |

## Collections

| Method | Route | Purpose |
|---|---|---|
| GET | `/collections` | List collections visible to current user |
| POST | `/collections` | Create collection |
| GET | `/collections/{collectionId}` | Get collection |
| PATCH | `/collections/{collectionId}` | Update collection metadata |
| POST | `/collections/{collectionId}/archive` | Archive collection |
| POST | `/collections/{collectionId}/restore` | Restore archived collection |
| DELETE | `/collections/{collectionId}` | Soft-delete collection |
| POST | `/collections/{collectionId}/purge` | Permanently delete collection, dependent records, and blobs |

## Collection Members and Permissions

Permissions live on `CollectionMembership`, not `User`.

Permissions: `can_manage_collection`, `can_invite_members`, `can_add_items`, `can_edit_metadata`, `can_add_photos`, `can_delete_photos`, `can_sort`, `can_view_outputs`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/collections/{collectionId}/members` | List members |
| POST | `/collections/{collectionId}/members` | Add member directly, admin-only |
| GET | `/collections/{collectionId}/members/{membershipId}` | Get membership |
| PATCH | `/collections/{collectionId}/members/{membershipId}` | Update permissions/label/status |
| DELETE | `/collections/{collectionId}/members/{membershipId}` | Remove member |

## Invitations

| Method | Route | Purpose |
|---|---|---|
| GET | `/collections/{collectionId}/invitations` | List pending invitations |
| POST | `/collections/{collectionId}/invitations` | Create invitation |
| GET | `/invitations/{invitationId}` | Get invitation |
| PATCH | `/invitations/{invitationId}` | Update invitation permissions before acceptance |
| DELETE | `/invitations/{invitationId}` | Revoke invitation |
| POST | `/invitations/{invitationId}/resend` | Resend invitation |
| POST | `/invitations/{token}/accept` | Accept invitation and create membership |

## Items

Item metadata is shared factual collection data.

| Method | Route | Purpose |
|---|---|---|
| GET | `/collections/{collectionId}/items` | List items, with filters/search |
| POST | `/collections/{collectionId}/items` | Create item |
| GET | `/items/{itemId}` | Get item, photos, and current curator preference |
| PATCH | `/items/{itemId}` | Update shared item metadata |
| DELETE | `/items/{itemId}` | Soft-delete/archive item |
| POST | `/items/{itemId}/restore` | Restore item |
| POST | `/items/{itemId}/purge` | Permanently delete item and photos |

## Photos

Photos are stored in blob storage. Photo records store blob metadata.

| Method | Route | Purpose |
|---|---|---|
| GET | `/items/{itemId}/photos` | List item photos |
| POST | `/items/{itemId}/photos` | Upload/add photo |
| GET | `/items/{itemId}/photos/{photoId}` | Get photo metadata |
| PATCH | `/items/{itemId}/photos/{photoId}` | Update photo metadata, including `isHero` |
| DELETE | `/items/{itemId}/photos/{photoId}` | Delete photo record and blob |

## Sessions

One active session per curator per collection.

| Method | Route | Purpose |
|---|---|---|
| GET | `/collections/{collectionId}/sessions` | List current curator sessions for collection |
| POST | `/collections/{collectionId}/sessions` | Create session |
| GET | `/collections/{collectionId}/sessions/active` | Get current curator active session |
| GET | `/sessions/{sessionId}` | Get session |
| PATCH | `/sessions/{sessionId}` | Pause, complete, abandon, or update session |
| DELETE | `/sessions/{sessionId}` | Soft-delete abandoned/draft session |

Valid session statuses: `active`, `paused`, `completed`, `abandoned`, `deleted`.

## Decision Events

DecisionEvents are immutable, append-only curator judgments.

| Method | Route | Purpose |
|---|---|---|
| GET | `/sessions/{sessionId}/decisions` | List session DecisionEvents |
| POST | `/sessions/{sessionId}/decisions` | Create DecisionEvent |
| GET | `/decision-events/{decisionEventId}` | Get DecisionEvent |

Supported `decisionType` values:

- `triage`: one item, result `top | high | medium | low`
- `pairwise_compare`: two items, result `item_a | item_b | tie | skip`

## Collection Preference State

Derived, curator-private state. Recalculated from DecisionEvents.

| Method | Route | Purpose |
|---|---|---|
| GET | `/collections/{collectionId}/preferences` | Get current curator preference summary |
| GET | `/collections/{collectionId}/preferences/items` | List current curator item preference state |
| GET | `/collections/{collectionId}/preferences/items/{itemId}` | Get preference state for one item |
| POST | `/collections/{collectionId}/preferences/recalculate` | Recalculate preference state from events |
| DELETE | `/collections/{collectionId}/preferences` | Clear derived preference state for current curator |

## Sort Results

SortResults are reviewable snapshots derived from preferences and DecisionEvents.

| Method | Route | Purpose |
|---|---|---|
| GET | `/collections/{collectionId}/sort-results` | List current curator SortResults |
| POST | `/sessions/{sessionId}/results/draft` | Generate draft SortResult |
| GET | `/sessions/{sessionId}/results/draft` | Get draft SortResult for session |
| GET | `/sort-results/{sortResultId}` | Get SortResult |
| PATCH | `/sort-results/{sortResultId}` | Update draft result name/visibility |
| DELETE | `/sort-results/{sortResultId}` | Delete draft result |
| POST | `/sort-results/{sortResultId}/finalize` | Finalize immutable SortResult |
| POST | `/sort-results/{sortResultId}/supersede` | Create new draft from finalized result |

## Sort Result Items and Manual Re-Rank

Manual overrides are stored separately from computed ranks and buckets.

| Method | Route | Purpose |
|---|---|---|
| GET | `/sort-results/{sortResultId}/items` | List SortResultItems |
| GET | `/sort-results/{sortResultId}/items/{sortResultItemId}` | Get SortResultItem |
| PATCH | `/sort-results/{sortResultId}/items/{sortResultItemId}` | Set `manualRank` and/or `manualBucket` |
| POST | `/sort-results/{sortResultId}/items/{sortResultItemId}/reset` | Remove manual override |
| DELETE | `/sort-results/{sortResultId}/items/{sortResultItemId}` | Remove item from draft result |

Bucket values: `top`, `high`, `medium`, `low`.

## Result Sharing

Sharing exposes finalized output only. It never exposes DecisionEvents, scores, session history, or private annotations.

| Method | Route | Purpose |
|---|---|---|
| GET | `/sort-results/{sortResultId}/shares` | List shares |
| POST | `/sort-results/{sortResultId}/shares` | Share finalized result |
| GET | `/sort-results/{sortResultId}/shares/{shareId}` | Get share |
| PATCH | `/sort-results/{sortResultId}/shares/{shareId}` | Update share status/expiration |
| DELETE | `/sort-results/{sortResultId}/shares/{shareId}` | Revoke share |
| GET | `/shared-results/{shareToken}` | View shared result, read-only |

## Cleanup and Safety Rules

- Owner or `can_manage_collection` may archive collections.
- Owner only may delete or purge collections.
- Purge requires explicit confirmation, for example `{ "confirm": "PURGE" }`.
- Normal users should see archived/deleted data only through explicit filters.
- Blob cleanup must be part of purge operations.
- DecisionEvents remain immutable except through collection/item/session purge.

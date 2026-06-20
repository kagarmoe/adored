# purgeCollection — real collection-level cascade purge — design

## Why
`POST /api/collections/[id]/purge` → `CollectionController.purgeCollection` today just
`softDelete`s the collection row and **orphans everything else** — items, photos, blobs, sessions,
decisions, results, shares, preferences, invitations, memberships all survive. This makes it a real,
permanent, owner-only cascade purge: hard-delete the **entire** collection in one transaction,
record a `collection.purge` audit row (reusing `purses-ite`), and clean up blobs. The collection-level
sibling of `ItemPurgeService` (`purses-u3p`).

## Decisions (brainstorm forks resolved)
- **Total-erase.** The owner owns the whole collection; purging erases all of it — every curator's
  sessions, preferences, sort results (**draft AND finalized**), and shares. Finalized-immutability
  forbids *mutating* a result, not deleting the collection that contains it. **No 409 block** — a
  shared/finalized collection stays purgeable. The audit row records who purged it.
- **Confirm = the collection name.** The request body must echo the exact `collection.name`
  (GitHub-repo-deletion friction), proportional to the blast radius. Replaces item-purge's
  `{confirm:"PURGE"}` for this route.
- **Owner-only via `requireApiCollectionOwner`** (the u3p gate) — replaces the route's ad-hoc
  `isOwner`, for consistency (404 absent before 403 non-owner).
- **The collection row is HARD-deleted**, not soft (it's a purge — total erasure).

## Scope
**In:** `CollectionPurgeService`; 11 thin by-collection repo deletes; rewire the route + remove the
`CollectionController.purgeCollection` stub; the `collection.purge` audit write; un-mocked DB
integration tests.
**Out:** any UI/confirmation screen (API-level only); restoring/exporting before purge; the items
top-level IDOR (`purses-3al`).

## The cascade (one `withTransaction`, deepest-child-first)
No table among these has `ON DELETE CASCADE`, so order is load-bearing — every child before its
parent. All scoped to `collectionId` (directly, or via a subquery on the collection's results/sessions):

1. `sort_result_shares` — `WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id=$1)`
2. `sort_result_items` — `WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id=$1)`
3. `sort_results` — `WHERE collection_id=$1`
4. `decision_events` — `WHERE session_id IN (SELECT id FROM sessions WHERE collection_id=$1)`
5. `sessions` — `WHERE collection_id=$1`
6. `preferences` — `WHERE collection_id=$1` (all curators)
7. `photos` — `WHERE collection_id=$1` **RETURNING blob_key** (collect for post-commit del; all rows incl. soft-deleted)
8. `items` — `WHERE collection_id=$1`
9. `invitations` — `WHERE collection_id=$1`
10. `memberships` — `WHERE collection_id=$1`
11. `collections` — `WHERE id=$1` (hard delete)

Then, **still inside the tx**, the audit row (below). After commit: blob `del` best-effort.

Ordering proof: items (8) is safe only after preferences (6), photos (7), and sort_result_items (2)
— all its referrers — are gone; sort_results (3) after shares (1) + sort_result_items (2); sessions
(5) after decision_events (4); the collection (11) last. ✓

## New repo methods (each a thin tx-capable DELETE; constructed on the `tx`)
- `SortResultShareRepository.deleteByCollection(collectionId): Promise<void>` (subquery on results)
- `SortResultItemRepository.deleteByCollection(collectionId): Promise<void>` (subquery on results)
- `SortResultRepository.deleteByCollection(collectionId): Promise<void>`
- `DecisionEventRepository.deleteByCollection(collectionId): Promise<void>` (subquery on sessions)
- `SessionRepository.deleteByCollection(collectionId): Promise<void>`
- `CollectionPreferenceItemRepository.deleteByCollection(collectionId): Promise<void>` (all curators; distinct from `clear`/`deleteByItem`)
- `PhotoRepository.hardDeleteByCollection(collectionId): Promise<string[]>` (`RETURNING blob_key`; all rows)
- `ItemRepository.hardDeleteByCollection(collectionId): Promise<number>` (`.returning({id}).length` for the audit count)
- `InvitationRepository.deleteByCollection(collectionId): Promise<void>`
- `MembershipRepository.deleteByCollection(collectionId): Promise<void>`
- `CollectionRepository.hardDelete(collectionId): Promise<void>` (`DELETE`, distinct from `softDelete`)

Their **authoritative** coverage is the full-collection integration test (purge → every table empty);
add a focused unit only where a repo already has a unit-test file. These are thin; no count/return
except `hardDeleteByCollection` (blob keys). For audit metadata counts, the service can capture
`photos.length` from the RETURNING and, if cheap, count items before the delete (see metadata).

## `CollectionPurgeService.purge(collection: Collection, actorId: string): Promise<void>`
- Constructor takes `db: Database` (builds tx-bound repos, mirroring `ItemPurgeService`).
- `withTransaction(this.db, async (tx) => { ...steps 1–11 on `new XRepository(tx)`...; const blobKeys = photos result; await new AuditLogRepository(tx).record({ actorId, action:"collection.purge", targetType:"collection", targetId: collection.id, collectionId: collection.id, metadata }); return blobKeys; })`.
- **metadata** = `{ photosDeleted: blobKeys.length, itemsDeleted }` (counts only, no PII) — `itemsDeleted` from `ItemRepository.hardDeleteByCollection`'s `.returning({id}).length`. The other deletes return `void` (their effect is proven by the integration test's empty-table assertions, not the metadata).
- Post-commit: `Promise.allSettled(blobKeys.filter(k=>k.startsWith("http")).map(del))`, failures logged not fatal (identical to `ItemPurgeService`).
- **No 409 block** — total-erase.

## Route — `POST /api/collections/[id]/purge`
`requireAuth` → resolve the collection (404 if absent) → **`requireApiCollectionOwner`** (404/403) →
**only then** parse the body `{ confirm: string }` (400 invalid JSON / shape) → **`if (confirm !==
collection.name) → 400`** ("Type the collection name to confirm") → `CollectionPurgeService.purge(collection,
user.id)` → `200 { message: "Collection purged" }`. Authz precedes body parsing (a non-owner with a
malformed/wrong-name body gets 403, never a 400 that leaks existence). Remove the
`CollectionController.purgeCollection` stub + its `PurgeConfirmSchema` usage for this route.

## Error handling
- Cascade: all 11 deletes + the audit write are in one tx — any failure rolls back the whole purge
  (nothing partially deleted). Blob `del` is post-commit, best-effort.
- Route: `401` unauth / `404` absent / `403` non-owner / `400` invalid-JSON or name-mismatch / `200`.

## Migration
**None** — reuses the `audit_log` table from `purses-ite`. No schema change.

## Testing (un-mocked DB integration — `src/lib/db/collection-purge.integration.test.ts`)
Mock only `@/lib/auth`, `@/lib/db`, `@vercel/blob` `del`. Seed a **full** collection: owner + a 2nd
member; ≥2 items; ≥2 photos (real `blobKey`s, incl. one soft-deleted); a session + ≥1 decision_event;
the 2nd member's preferences; a **draft** result + items; a **finalized** result + items + a share.
- **Total cascade:** owner purge with `{confirm: collection.name}` → `200`; assert **every** table is
  empty for that collection — `items`, `photos`, `preferences`, `sessions`, `decision_events`,
  `sort_results`, `sort_result_items`, `sort_result_shares`, `invitations`, `memberships` all `0`
  rows, and the `collections` row is **hard-gone** (`findByIdIncludingDeleted` style / direct count `0`);
  exactly **one** `audit_log` row (`collection.purge`, `actorId === owner`, metadata counts); `del`
  called with every http blob key.
- **Atomicity (named injection):** `vi.spyOn(CollectionRepository.prototype, "hardDelete")` (or
  `AuditLogRepository.prototype.record`) `.mockRejectedValueOnce` → purge `500`; assert **nothing**
  deleted (all tables still populated, the collection still present, zero audit rows). Proves the
  whole cascade rolls back. `mockRestore` after.
- **Authz/confirm:** non-owner member → `403` (collection + children survive); absent id → `404`;
  owner with **wrong** `confirm` (not the name) → `400` (nothing deleted); non-owner with a wrong-name
  body → `403` (authz precedes confirm).

## Risks the review must probe
- **Data/Persistence:** cascade **completeness** (every FK referrer covered — the headline risk; a
  missed table = 23503 or an orphan) + **ordering** (each child before its parent); the subquery
  deletes; no `ON DELETE CASCADE` assumption; the RETURNING blob-key collection.
- **Security:** owner-only + 404-before-403; confirm = name compared server-side against the resolved
  row (never trust a client-supplied name); total-erase is the intended authority (owner erases the
  whole collection incl. others' data) — confirm the audit records the actor.
- **Architect:** all 11 deletes tx-bound (not injected db); the "all-or-nothing" invariant tested via
  the named injection; the stub fully removed; no silent failure.
- **QA:** the integration test asserts **every** table empty (not just a few) — a missed table in the
  cascade must fail the test; the atomicity test is RED-capable.

## Follow-ups (not this PR)
- A UI confirmation flow for collection purge (API-level only here).
- `purges-3al` (items top-level IDOR) is separate.

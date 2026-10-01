# purgeCollection — real collection-level cascade purge — design

> rev-2 — adversarial spec review folded in (Data/Persistence CLEAN; Security + Architect/QA CONCERNS). Changes marked **[review]**.

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
  (GitHub-repo-deletion friction), proportional to the blast radius.
- **[review] Owner-only, resolving the collection INCLUDING soft-deleted.** The canonical lifecycle
  is `DELETE` (soft-delete) **then** purge, so the purge MUST be able to resolve a soft-deleted
  collection — `requireApiCollectionOwner` can't be reused verbatim because its `findById` filters
  `deletedAt` (a soft-deleted collection would 404 → permanently un-purgeable, blobs leak). Instead
  the route resolves via **`CollectionRepository.findByIdIncludingDeleted`** (new) and does the owner
  check **inline** (`404` if null, then `403` if `ownerId !== userId`) — mirroring `ItemPurgeService`'s
  route, which resolves the item including-deleted before gating. 404-before-403 preserved.
- **The collection row is HARD-deleted**, not soft (it's a purge — total erasure).

## Scope
**In:** `CollectionPurgeService`; 12 thin by-collection repo methods (11 deletes + `findByIdIncludingDeleted`);
rewire the route + remove the `CollectionController.purgeCollection` stub; the `collection.purge` audit
write; un-mocked DB integration tests.
**Out:** any UI/confirmation screen (API-level only); restoring/exporting before purge; `purses-3al`
(items top-level IDOR).

## The cascade (one `withTransaction`, deepest-child-first)
No table among these has `ON DELETE CASCADE` (verified — the only cascades in the schema are NextAuth
`account.userId`/`session.userId`), so order is load-bearing — every child before its parent. All
scoped to `collectionId` (directly, or via a subquery on the collection's results/sessions):

1. `sort_result_shares` — `WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id=$1)`
2. `sort_result_items` — `WHERE sort_result_id IN (SELECT id FROM sort_results WHERE collection_id=$1)`
3. `sort_results` — `WHERE collection_id=$1`
4. `decision_events` — `WHERE session_id IN (SELECT id FROM sessions WHERE collection_id=$1)`
5. `sessions` — `WHERE collection_id=$1`
6. `preferences` — `WHERE collection_id=$1` (all curators)
7. `photos` — `WHERE collection_id=$1` **RETURNING blob_key** (all rows incl. soft-deleted; `blob_key` is NOT NULL)
8. `items` — `WHERE collection_id=$1` (**RETURNING id** → count for audit metadata)
9. `invitations` — `WHERE collection_id=$1`
10. `memberships` — `WHERE collection_id=$1`
11. `collections` — `WHERE id=$1` (hard delete)

Then, **still inside the tx**, the audit row (below). After commit: blob `del` best-effort.

Ordering proof: items (8) safe only after preferences (6), photos (7), sort_result_items (2) — all
its referrers — gone; sort_results (3) after shares (1) + sort_result_items (2); sessions (5) after
decision_events (4); collection (11) last. The three subquery deletes (1,2,4) run **before** their
parent tables (3,5) are emptied, so the subqueries still resolve. ✓ (Data review verified the set is
complete — all 10 FK-referring tables + the collection.)

## New repo methods (each thin, tx-capable; **net-new alongside** the existing single-id methods, not replacements)
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
- **[review] `CollectionRepository.findByIdIncludingDeleted(collectionId): Promise<Collection | null>`** (no `deletedAt` filter — mirrors `ItemRepository.findByIdIncludingDeleted`; used by the route to resolve a soft-deleted collection)

The deletes' **authoritative** coverage is the full-collection integration test (purge → every table
empty); add a focused unit only where a repo already has a unit-test file.

## `CollectionPurgeService.purge(collection: Collection, actorId: string): Promise<void>`
- Constructor takes `db: Database`; builds tx-bound repos (mirrors `ItemPurgeService`).
- **[review] Port `ItemPurgeService`'s invariant comment verbatim:** "inside the transaction, EVERY
  write goes through a tx-bound repo (`new XRepository(tx)`), never an injected/`this.db` repo." The
  only pre-tx read is the already-resolved `collection` (passed in by the route).
- `withTransaction(this.db, async (tx) => { …steps 1–11 on `new XRepository(tx)`…; capture
  `blobKeys` (step 7) + `itemsDeleted` (step 8); await new AuditLogRepository(tx).record({ actorId,
  action:"collection.purge", targetType:"collection", targetId: collection.id, collectionId:
  collection.id, metadata: { photosDeleted: blobKeys.length, itemsDeleted } }); return blobKeys; })`.
- **[review] The audit write is non-optional and in-tx** — a committed total-erase ALWAYS carries an
  actor row (accountability for the most destructive op); never move it to post-commit.
- Post-commit: `Promise.allSettled(blobKeys.filter(k=>k.startsWith("http")).map(del))`, failures
  logged not fatal (identical to `ItemPurgeService`).
- **No 409 block** — total-erase.

## Route — `POST /api/collections/[id]/purge`
`requireAuth` → **`CollectionRepository.findByIdIncludingDeleted(params.id)`** (`404` if null) →
**inline owner check** (`collection.ownerId !== user.id` → `403`) → **only then** parse the body
`{ confirm: string }` (`400` invalid JSON / shape) → **`if (confirm !== collection.name) → 400`**
("Type the collection name to confirm") → `CollectionPurgeService.purge(collection, user.id)` →
`200 { message: "Collection purged" }`. Authz precedes body parsing (a non-owner with a
malformed/wrong-name body gets `403`/`404`, never a `400` that leaks existence or the name).
**[review] No inner try/catch around `purge`** — a cascade failure propagates to the route's outer
catch → `500` (there is no typed "blocked" error here; total-erase has no 409). Remove the
`CollectionController.purgeCollection` stub + its `PurgeConfirmSchema` (confirm `next build`/grep find
no other caller).

## Error handling
- Cascade: all 11 deletes + the audit write are in one tx — any failure rolls back the whole purge
  (nothing partially deleted). Blob `del` is post-commit, best-effort.
- Route: `401` unauth / `404` absent / `403` non-owner / `400` invalid-JSON or name-mismatch / `200`.

## Data notes (Data review)
- **`audit_log` has no FK** (`purses-ite` design) — so the `collection.purge` row's `collectionId`/
  `targetId` intentionally **outlive** the deleted collection; this is correct (an immutable trail
  references purged ids by value), NOT an orphan bug. Do not add an FK (it would make the in-tx audit
  write FK-violate against the just-deleted collection row).
- **Migration: none** — reuses `audit_log`.
- **Known follow-up (not this PR):** a `del` failure orphans blobs in storage with no DB row left to
  retry from; unlike item-purge this can orphan a large batch at once. A reconciliation sweep is a
  separate concern (logged, DB stays consistent).

## Testing (un-mocked DB integration — `src/lib/db/collection-purge.integration.test.ts`)
Mock only `@/lib/auth`, `@/lib/db`, `@vercel/blob` `del`. Seed a **full** collection: owner + a 2nd
member (membership row); ≥2 items; ≥2 photos (real `blobKey`s, incl. one soft-deleted); a session +
≥1 decision_event; the 2nd member's preferences; a **draft** result + items; a **finalized** result +
items + a share; **[review] ≥1 `invitations` row** (else its empty-assertion is vacuous).
- **Total cascade:** owner purge with `{confirm: collection.name}` → `200`; assert **every** table is
  empty for that collection and the `collections` row is hard-gone (count `0` via
  `findByIdIncludingDeleted` / direct count). **[review] The 3 transitively-scoped tables have NO
  `collection_id` column** — count them via the subquery form (`decision_events WHERE session_id IN
  (… )`, `sort_result_items`/`sort_result_shares WHERE sort_result_id IN (… )`) OR by asserting the
  specific seeded child-row ids are gone — never a bare `WHERE collection_id` (which would error or
  vacuously pass). Plus exactly **one** `audit_log` row (`collection.purge`, `actorId === owner`,
  `metadata` counts match the seed); `del` called with every http blob key (incl. the soft-deleted
  photo's).
- **[review] Soft-delete → purge:** `softDelete` the collection first, then owner purge with the name
  → `200`, everything empty (proves the include-deleted resolution; the canonical path).
- **Atomicity (named injection):** `vi.spyOn(CollectionRepository.prototype, "hardDelete")`
  `.mockRejectedValueOnce` → purge `500`; assert **nothing** deleted (all tables still populated, the
  collection still present, zero audit rows) — proves the whole cascade rolls back (stronger than
  spying the audit write: it proves the *child* deletes roll back). `mockRestore` after.
- **Authz/confirm:** non-owner member → `403` (collection + children survive); absent id → `404`;
  owner with **wrong** `confirm` → `400` (nothing deleted); non-owner with a wrong-name body → `403`
  (authz precedes confirm — no existence/name oracle).

## Risks the review must probe (carried for the whole-branch review)
- **Data:** cascade completeness + ordering (rev-1: CLEAN); the subquery deletes; the include-deleted
  resolution.
- **Security:** owner-only + 404-before-403 on the include-deleted resolve; confirm-name server-side;
  total-erase authority + actor accountability. *(rev-1: the soft-deleted-unpurgeable HIGH — folded.)*
- **Architect/QA:** all-or-nothing tx (tx-bound writes); stub fully removed; no inner try/catch; the
  "every table empty" assertions are **non-vacuous** (seeded rows in every table, subquery counts for
  the FK-scoped ones); the atomicity injection is RED-capable. *(rev-1: the vacuous-invitations +
  wrong-count-query MEDIUMs — folded.)*

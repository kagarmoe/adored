# Audit log for permanent purges — design (purses-ite)

> rev-2 — adversarial spec review folded in (Data/Persistence, Security, Architect+QA; all CONCERNS, no BLOCK). Changes from rev-1 are marked **[review]**.

## Why
Permanent purges (item purge — shipped in #213; collection purge — next PR) are
**irreversible** and **owner-only**, but leave **no record** of who purged what.
This adds an append-only `audit_log`, makes the item purge write an entry
**atomically** (so a committed purge always has its record), and exposes an
owner-scoped read endpoint so the trail is usable.

## Scope
**In:** the `audit_log` table + migration; `AuditLogRepository` (`record` + `findByCollection`);
`ItemPurgeService.purge` writing an entry inside its transaction; `GET /api/collections/[id]/audit`
(owner-only read).
**Out (deliberate):** auditing reversible ops (soft-delete/archive/restore) — only the two
**permanent purges** are audited. `purgeCollection`'s own audit write lands in the next PR
(this PR builds the table + repo it will use). No audit-edit/delete surface (append-only).

## Data model — `audit_log` (append-only, immutable)
Mirrors `decision_events` shape, but **no foreign keys** — the targets (item, collection) are
being deleted, so the log references them by id as a standalone historical record; `actorId`
is likewise a plain id (the log outlives users).

| column | type | notes |
|---|---|---|
| `id` | `text` PK | app-generated ULID (`generateId("audit")` → `audit_<ulid>`) |
| `actorId` | `text` NOT NULL | the acting user's id (no FK) |
| `action` | `text` NOT NULL | `"item.purge"` \| `"collection.purge"` |
| `targetType` | `text` NOT NULL | `"item"` \| `"collection"` |
| `targetId` | `text` NOT NULL | the purged entity's id (no FK — it's gone) |
| `collectionId` | `text` NOT NULL | scope for the read query (item.purge = item's collection; collection.purge = the collection) |
| `metadata` | `jsonb` NULL | counts, e.g. `{ photosDeleted, preferencesDeleted }` |
| `createdAt` | `timestamp` NOT NULL `defaultNow()` | |

**[review] Index + total order:** composite `audit_log_collection_created_idx` on
`(collection_id, created_at, id)` — backs the read query `WHERE collection_id=$1 ORDER BY
created_at DESC, id DESC LIMIT n` (Postgres scans the btree backwards for `DESC` at no cost; no
separate sort node). The `id` tie-breaker makes the order **total** — two purges in the same
millisecond (`timestamp`, no sub-ms guarantee) would otherwise sort non-deterministically and
break a future keyset cursor. No `deletedAt`; no UPDATE/DELETE paths (append-only).

**[review] Known limitation — immutability is application-level only:** no UPDATE/DELETE repo
method or route exists, but the DB does not prevent a future migration or raw SQL from mutating
audit rows. DB-level enforcement (revoked grants / trigger) is out of scope for v1; acceptable
for this app's threat model (owner-only, no compliance requirement).

## `AuditLogRepository`
**[review] No optional-`tx` overload** (the convergent footgun: a caller that forgets `tx` writes
on autocommit → "logged but not purged"). Instead the repo is constructed on whatever `Database`
it's given — the injected `db` for reads, a `tx` for the atomic purge write — exactly as the
codebase's other repos are (`new XRepository(tx)`).

- `record(entry: NewAuditLog): Promise<void>` — single INSERT on the repo's bound db/tx. The repo
  generates `id` + `createdAt`.
- `findByCollection(collectionId, opts?: { limit?: number }): Promise<AuditLog[]>` — `ORDER BY
  created_at DESC, id DESC`, bounded `limit`. **[review] Caller clamps; the repo also defends:**
  `limit = Number.isFinite(n) ? Math.min(200, Math.max(1, Math.trunc(n))) : 100` (default 100,
  hard cap 200). **v1 is a bounded list — at >200 rows it truncates silently (no `hasMore`/cursor);
  keyset pagination is the documented fix when volume warrants** (YAGNI now, named here so it isn't
  a hidden cap).

**[review] Types make illegal states unrepresentable:** `NewAuditLog` uses literal unions, not
bare `string` — `action: "item.purge" | "collection.purge"`, `targetType: "item" | "collection"`,
plus `actorId/targetId/collectionId: string` and `metadata?: Record<string, number>`. The next-PR
`collection.purge` caller gets the compile-time check for free.

## `ItemPurgeService.purge` — atomic audit write
Today: `purge(itemId)` runs `withTransaction` { deleteByItem(prefs) → hardDeleteByItem(photos) →
hardDelete(item) } then best-effort blob `del` post-commit. Changes:
- **Signature gains the actor:** `purge(itemId, actorId)`; the route passes the authenticated
  `userId` (single call site — `src/app/api/items/[id]/purge/route.ts`). `collectionId` is already
  resolved from the item.
- **[review] `deleteByItem` (preferences) returns its affected count** (`Promise<void>` →
  `Promise<number>`) so metadata can record it — **counted via `.returning({ id }).length`, NOT a
  driver `rowCount`** (the repo already documents postgres-js's inconsistent delete-result shape in
  `SortResultItemRepository.deleteByItemInDraftResults` — mirror it). Update **both** the interface
  `ICollectionPreferenceItemRepository` and the impl (widening the return is non-breaking for the
  one caller). `hardDeleteByItem` already returns the blob keys (photos count = `keys.length`).
- **[review] The audit write is tx-bound by construction:** inside the same `withTransaction`,
  after the deletes, `await new AuditLogRepository(tx).record({ actorId, action: "item.purge",
  targetType: "item", targetId: itemId, collectionId, metadata: { photosDeleted: keys.length,
  preferencesDeleted } })`. Built on `tx` like the other tx-bound repos (`ItemPurgeService.ts`
  already mandates "every write inside the tx goes through a `new XRepository(tx)`"), so a non-tx
  audit write is **structurally impossible**. A committed purge therefore always has exactly one
  audit row; if the audit insert throws, the whole purge rolls back.
- Blob `del` stays best-effort post-commit (unchanged) — only blob keys that `startsWith("http")`.

## Read endpoint — `GET /api/collections/[id]/audit`
`requireAuth` → **`requireApiCollectionOwner(db, params.id, userId)`** (reuse the u3p gate —
**404 absent *before* 403 non-owner**, matching the existence-oracle convention in API.md §46) →
`AuditLogRepository.findByCollection(params.id, { limit })` → `200` newest-first array. Owner-only
because the purge trail is the owner's concern and purges are themselves owner-only; a member must
**not** read another curator's purge trail. Empty collection → `200 []`.
**[review] `?limit=` is parsed with the clamp above** (NaN/≤0/non-finite → 100; >200 → 200) — never
trusted raw, so no unbounded scan or crash.

## Error handling
- Purge: audit insert is in the tx → a failure rolls back the purge (rare — a single INSERT, no
  FKs). No partial "purged-but-unlogged" or "logged-but-not-purged" state.
- Read: `401` unauth / `404` absent / `403` non-owner / `200` list.

## Migration (additive — safe)
`npm run db:generate` emits a new `drizzle/000X_*.sql` creating `audit_log` + its index. Additive
(new empty table, no lock/rewrite of a hot table, every `NOT NULL` is on the new table, `createdAt`
has `defaultNow()`). Reversible (drop table). Applied by `db:migrate`, which `vercel-build` runs
before `next build` on deploy — prod gets it automatically (the `prod-migration-requires-explicit-db-url`
caveat is about **manual** runs, not the deploy path).

## Testing
Un-mocked DB integration in `src/lib/db/audit-log.integration.test.ts` (`describeDb`, mock only
`@/lib/auth`, `@/lib/db`, `@vercel/blob` `del`) — extends the `item-purge.integration.test.ts`
model (route→service/repo→Postgres un-mocked):

1. **Happy-path audit write:** a committed item purge (owner, `{confirm:"PURGE"}`) writes **exactly
   one** `audit_log` row; assert `action="item.purge"`, `targetType="item"`, `targetId=itemId`,
   `collectionId`, and **`metadata.photosDeleted`/`preferencesDeleted` equal the seeded counts**
   (RED-capable against real rows — the model test already asserts those rows go to 0). **[review]
   Assert `actorId === session.user.id`** (provenance), and seed a decoy `actorId` in the request
   body to prove it's ignored.
2. **[review] Atomicity — named injection (no FK is available post-deletes):** `vi.spyOn` the
   tx-bound `AuditLogRepository.prototype.record` to **reject inside the tx**; drive the purge;
   assert it throws AND the item, all photos, and all preferences **survive** (rolled back) and
   **zero** `audit_log` rows exist. This one test mocks *only the audit write* to force the failure
   the FK-less table can't otherwise produce — everything else stays real; it proves the rollback,
   not the audit content (covered by test 1).
3. **Read — owner:** seed ≥2 purges; `GET …/audit` as owner → the entries **newest-first**
   (asserts the `created_at DESC, id DESC` order on ≥2 rows).
4. **[review] Read — authz/IDOR:** non-owner **member** → `403`; authenticated **non-member with a
   valid foreign collection id** → `403` (exists); **truly-absent** id → `404` (existence-oracle
   ordering); empty collection → `200 []`.
5. **[review] Read — limit clamp:** seed >200 rows (or assert at a smaller boundary); `?limit=99999`
   → ≤200; default → ≤100; `?limit=abc` and `?limit=-5` → bounded `200`, not a `500` or unbounded set.

## Risks the review must probe (carried for the whole-branch review)
- **Data:** index actually backs the ordered read; the `.returning().length` count; tx-bound (not
  injected) audit write; migration additivity. *(rev-1 review: CONCERNS — folded.)*
- **Security:** owner-only read + 404-before-403; `actorId` from session; append-only; no PII in
  `metadata`; `?limit=` clamp. *(rev-1 review: CONCERNS — folded.)*
- **Architect/QA:** single-call-site signature change; the "exactly one row per committed purge"
  invariant; the **named** atomicity injection; literal-union types. *(rev-1 review: CONCERNS — folded.)*

## Follow-ups (not this PR)
- `purgeCollection` writes its own `"collection.purge"` entry (next PR — uses this table/repo).
- Keyset/cursor pagination + a UI surface for the trail, if/when volume warrants.

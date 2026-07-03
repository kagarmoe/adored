-- Hand-authored: drizzle-kit cannot serialize partial-index predicates (see 0009).
-- The 0010 db:generate emitted UNCONDITIONAL unique indexes for these (predicate
-- dropped), which would be WRONG — they were stripped from 0010, leaving only the
-- two ADD COLUMN statements. The correct PARTIAL unique indexes live here.
-- order_rank: at most one item per rank per (collection,curator); NULL rank = unranked
--   (loved-but-never-compared items still exist, they just have no order).
-- client_key: idempotency — one decision event per (session, client_key); legacy rows
--   have NULL client_key and are exempt.
-- Reversal is FORWARD-ONLY.
--
-- SNAPSHOT NOTE: drizzle-kit 0.20.17 cannot serialize a partial-index predicate, so
-- the drizzle meta snapshots record these two indexes WITHOUT their `WHERE ... IS NOT
-- NULL` clause (same limitation as 0009). A future `npm run db:generate` may therefore
-- emit a spurious "index changed" diff for these — IGNORE it. The applied SQL here (not
-- the snapshot) governs; the DB-backed tests assert the real predicate via pg_indexes.indexdef.
CREATE UNIQUE INDEX "preferences_order_rank_unique" ON "preferences" ("collection_id","curator_id","order_rank") WHERE "preferences"."order_rank" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_events_client_key_unique" ON "decision_events" ("session_id","client_key") WHERE "decision_events"."client_key" is not null;

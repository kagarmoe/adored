-- Hand-authored: drizzle-kit 0.20.17 (snapshot v5) cannot serialize a partial-index
-- predicate, so db:generate emits nothing for this change. Replaces the unconditional
-- UNIQUE(collection_id,curator_id) with a PARTIAL unique index so only ONE in-progress
-- session (deleted_at IS NULL AND status IN ('active','paused')) is enforced per slot;
-- terminal/soft-deleted rows free the slot (purses-4bhh).
--
-- Name stays "sessions_active_unique" — SessionRepository.isCurrentSessionConflict
-- matches that substring on 23505 to map to the 409 net.
--
-- Reversal is FORWARD-ONLY: recreating the unconditional index would raise 23505 once
-- more than one terminal/soft-deleted row per slot exists. There is no safe down migration.
DROP INDEX IF EXISTS "sessions_active_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_active_unique" ON "sessions" ("collection_id","curator_id") WHERE "sessions"."deleted_at" is null and "sessions"."status" in ('active','paused');

-- Hand-authored, FORWARD-ONLY clean reset (spec §3 Epic 0). Elo-era DRAFT sort
-- results carry a computedRank derived from the retired Elo/pairwise scoring; under
-- the new binary-insertion ranking that order is dead, so a draft must not be allowed
-- to finalize with it. Discard every draft result (and its now-orphaned items) so the
-- only path to a finalized result is a fresh recompute. Finalized results are immutable,
-- self-contained snapshots (they carry their own computed_rank/computed_bucket) — untouched.
--
-- Items first: sort_result_items.sort_result_id has an FK to sort_results(id), so the
-- children must go before the parents.
--
-- Reversal is FORWARD-ONLY: the discarded drafts cannot be reconstructed. There is no
-- safe down migration.
DELETE FROM "sort_result_items" WHERE "sort_result_id" IN (SELECT "id" FROM "sort_results" WHERE "status" = 'draft');--> statement-breakpoint
DELETE FROM "sort_results" WHERE "status" = 'draft';

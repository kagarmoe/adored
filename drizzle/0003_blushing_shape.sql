ALTER TABLE "sort_results" ADD COLUMN "save_key" text;--> statement-breakpoint
-- Data step (owner ruling, amends spec §6): keep the NEWEST open draft per (collection, curator)
-- and remove the rest (items first; no ON DELETE CASCADE), so the partial unique index below
-- can build on production data. Finalized rows, other curators and answers are untouched.
DELETE FROM "sort_result_items" WHERE "sort_result_id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "collection_id", "curator_id" ORDER BY "created_at" DESC, "id" DESC
    ) AS "rn"
    FROM "sort_results" WHERE "status" = 'draft'
  ) AS "ranked" WHERE "ranked"."rn" > 1
);--> statement-breakpoint
DELETE FROM "sort_results" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "collection_id", "curator_id" ORDER BY "created_at" DESC, "id" DESC
    ) AS "rn"
    FROM "sort_results" WHERE "status" = 'draft'
  ) AS "ranked" WHERE "ranked"."rn" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "sort_results_open_draft_unique" ON "sort_results" USING btree ("collection_id","curator_id") WHERE "sort_results"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "sort_results_save_key_unique" ON "sort_results" USING btree ("curator_id","save_key") WHERE "sort_results"."save_key" is not null;
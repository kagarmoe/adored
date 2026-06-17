ALTER TABLE "sessions" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "sort_results" ADD COLUMN "number" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_collection_number_unique" ON "sessions" ("collection_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sort_results_collection_number_unique" ON "sort_results" ("collection_id","number");
CREATE TABLE IF NOT EXISTS "item_dispositions" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"item_id" text NOT NULL,
	"disposition" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_dispositions_item_curator_unique" ON "item_dispositions" ("item_id","curator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_dispositions_collection_curator_idx" ON "item_dispositions" ("collection_id","curator_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_dispositions" ADD CONSTRAINT "item_dispositions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_dispositions" ADD CONSTRAINT "item_dispositions_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_dispositions" ADD CONSTRAINT "item_dispositions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

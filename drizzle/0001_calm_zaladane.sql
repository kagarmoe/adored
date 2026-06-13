ALTER TABLE "items" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "height" numeric;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "width" numeric;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "depth" numeric;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "weight" numeric;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "unit" text DEFAULT 'imperial' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "collection_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "items_collection_number_unique" ON "items" ("collection_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_collection_id_idx" ON "photos" ("collection_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photos" ADD CONSTRAINT "photos_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

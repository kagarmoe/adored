ALTER TABLE "collections" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "collections_slug_unique" ON "collections" ("slug");
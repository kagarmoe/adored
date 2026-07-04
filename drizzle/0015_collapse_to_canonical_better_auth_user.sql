-- Cutover Pass 2b-ii: collapse the two-table auth split into ONE canonical
-- better-auth-owned `user` table, and drop the mirroring bridge.
--
-- Reset path (spec §9: no real users/data to preserve). This migration is
-- DESTRUCTIVE and forward-only: it wipes all auth rows and drops+recreates the
-- `user` table (the domain FKs are re-pointed to the new one). Seeded demo data
-- is re-seeded after migrate. Nothing here preserves auth or domain rows.
--
-- Final state: one canonical `user` (better-auth shape), canonical
-- `account`/`session`/`verification` (better-auth defaults), no `ba_*` tables,
-- no NextAuth `verificationToken`, all domain FKs resolving to `user`.

-- 1. Drop the better-auth `ba_*` mirror tables (children first).
DROP TABLE IF EXISTS "ba_account" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ba_session" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ba_verification" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "ba_user" CASCADE;
--> statement-breakpoint

-- 2. Drop domain FK constraints that reference the old `user` so it can be
--    dropped and recreated with the canonical better-auth shape.
ALTER TABLE "collections" DROP CONSTRAINT IF EXISTS "collections_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_curator_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "preferences" DROP CONSTRAINT IF EXISTS "preferences_curator_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "item_dispositions" DROP CONSTRAINT IF EXISTS "item_dispositions_curator_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "sort_results" DROP CONSTRAINT IF EXISTS "sort_results_curator_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_user_id_user_id_fk";
--> statement-breakpoint

-- 3. Drop the leftover NextAuth auth tables (account/session/verificationToken)
--    and the old `user`. CASCADE clears their own FKs onto `user`.
DROP TABLE IF EXISTS "account" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "session" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "verificationToken" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "user" CASCADE;
--> statement-breakpoint

-- 4. Recreate the canonical better-auth `user` (the ONE user table).
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint

-- 5. Recreate canonical better-auth account/session/verification.
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 6. Indexes on the better-auth child tables + verification identifier.
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
--> statement-breakpoint

-- 7. FKs from the better-auth child tables to the new `user` (cascade).
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- 8. Re-point the domain FKs to the canonical `user`. Names match drizzle-kit's
--    convention so a later `db:generate` sees no drift.
DO $$ BEGIN
 ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preferences" ADD CONSTRAINT "preferences_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "sort_results" ADD CONSTRAINT "sort_results_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" bigint,
	"token_type" text,
	"scope" text,
	"id_token" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"decision" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"can_manage_collection" boolean DEFAULT false,
	"can_invite_members" boolean DEFAULT false,
	"can_add_items" boolean DEFAULT true,
	"can_edit_metadata" boolean DEFAULT true,
	"can_add_photos" boolean DEFAULT true,
	"can_delete_photos" boolean DEFAULT false,
	"can_sort" boolean DEFAULT true,
	"can_view_outputs" boolean DEFAULT true,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"style" text,
	"color" text,
	"material" text,
	"category" text,
	"status" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'curator' NOT NULL,
	"can_manage_collection" boolean DEFAULT false,
	"can_invite_members" boolean DEFAULT false,
	"can_add_items" boolean DEFAULT true,
	"can_delete_items" boolean DEFAULT false,
	"can_edit_metadata" boolean DEFAULT true,
	"can_add_photos" boolean DEFAULT true,
	"can_delete_photos" boolean DEFAULT false,
	"can_sort" boolean DEFAULT true,
	"can_view_outputs" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"blob_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer,
	"uploaded_by" text NOT NULL,
	"is_hero" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"item_id" text NOT NULL,
	"score" numeric(10, 4) NOT NULL,
	"confidence" numeric(10, 4) NOT NULL,
	"rank_bucket" text NOT NULL,
	"comparison_count" integer NOT NULL,
	"last_seen" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"goal" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sort_result_items" (
	"id" text PRIMARY KEY NOT NULL,
	"sort_result_id" text NOT NULL,
	"item_id" text NOT NULL,
	"computed_rank" integer NOT NULL,
	"computed_bucket" text NOT NULL,
	"manual_rank" integer,
	"manual_bucket" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sort_result_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"sort_result_id" text NOT NULL,
	"share_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sort_result_shares_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sort_results" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finalized_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"password" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collections_owner_id_idx" ON "collections" ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decision_events_session_id_idx" ON "decision_events" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_collection_id_idx" ON "invitations" ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_unique" ON "invitations" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_email_idx" ON "invitations" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_collection_id_idx" ON "items" ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_collection_user_unique" ON "memberships" ("collection_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_item_id_idx" ON "photos" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_uploaded_by_idx" ON "photos" ("uploaded_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_deleted_at_idx" ON "photos" ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "preferences_collection_curator_idx" ON "preferences" ("collection_id","curator_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "preferences_item_curator_unique" ON "preferences" ("item_id","curator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_collection_id_idx" ON "sessions" ("collection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_curator_id_idx" ON "sessions" ("curator_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_active_unique" ON "sessions" ("collection_id","curator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sort_result_items_result_id_idx" ON "sort_result_items" ("sort_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sort_shares_token_unique" ON "sort_result_shares" ("share_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sort_shares_result_id_idx" ON "sort_result_shares" ("sort_result_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sort_results_collection_id_idx" ON "sort_results" ("collection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sort_results_curator_id_idx" ON "sort_results" ("curator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_email_idx" ON "user" ("email");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "decision_events" ADD CONSTRAINT "decision_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photos" ADD CONSTRAINT "photos_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preferences" ADD CONSTRAINT "preferences_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "preferences" ADD CONSTRAINT "preferences_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "sort_result_items" ADD CONSTRAINT "sort_result_items_sort_result_id_sort_results_id_fk" FOREIGN KEY ("sort_result_id") REFERENCES "sort_results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sort_result_items" ADD CONSTRAINT "sort_result_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sort_result_shares" ADD CONSTRAINT "sort_result_shares_sort_result_id_sort_results_id_fk" FOREIGN KEY ("sort_result_id") REFERENCES "sort_results"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sort_results" ADD CONSTRAINT "sort_results_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sort_results" ADD CONSTRAINT "sort_results_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

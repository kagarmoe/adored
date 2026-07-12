CREATE TABLE "account" (
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
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "decision_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"decision" jsonb NOT NULL,
	"client_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "item_dispositions" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"item_id" text NOT NULL,
	"disposition" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"name" text,
	"brand" text,
	"style" text,
	"color" text,
	"material" text,
	"category" text,
	"number" integer,
	"height" numeric,
	"width" numeric,
	"depth" numeric,
	"weight" numeric,
	"unit" text DEFAULT 'imperial' NOT NULL,
	"status" text,
	"notes" text,
	"story" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'curator' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" in ('owner', 'curator'))
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text,
	"collection_id" text NOT NULL,
	"blob_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer,
	"uploaded_by" text NOT NULL,
	"is_hero" boolean DEFAULT false,
	"rotation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"item_id" text NOT NULL,
	"score" numeric(10, 4) NOT NULL,
	"confidence" numeric(10, 4) NOT NULL,
	"rank_bucket" text NOT NULL,
	"comparison_count" integer NOT NULL,
	"order_rank" integer,
	"last_seen" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
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
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"number" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"goal" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sort_result_items" (
	"id" text PRIMARY KEY NOT NULL,
	"sort_result_id" text NOT NULL,
	"item_id" text NOT NULL,
	"computed_rank" integer NOT NULL,
	"computed_bucket" text NOT NULL,
	"manual_rank" integer,
	"manual_bucket" text,
	"usage" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sort_result_shares" (
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
CREATE TABLE "sort_results" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"curator_id" text NOT NULL,
	"number" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finalized_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
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
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_events" ADD CONSTRAINT "decision_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dispositions" ADD CONSTRAINT "item_dispositions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dispositions" ADD CONSTRAINT "item_dispositions_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dispositions" ADD CONSTRAINT "item_dispositions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sort_result_items" ADD CONSTRAINT "sort_result_items_sort_result_id_sort_results_id_fk" FOREIGN KEY ("sort_result_id") REFERENCES "public"."sort_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sort_result_items" ADD CONSTRAINT "sort_result_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sort_result_shares" ADD CONSTRAINT "sort_result_shares_sort_result_id_sort_results_id_fk" FOREIGN KEY ("sort_result_id") REFERENCES "public"."sort_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sort_results" ADD CONSTRAINT "sort_results_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sort_results" ADD CONSTRAINT "sort_results_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_collection_created_idx" ON "audit_log" USING btree ("collection_id","created_at","id");--> statement-breakpoint
CREATE INDEX "collections_owner_id_idx" ON "collections" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_slug_unique" ON "collections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "decision_events_session_id_idx" ON "decision_events" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_events_client_key_unique" ON "decision_events" USING btree ("session_id","client_key") WHERE "decision_events"."client_key" is not null;--> statement-breakpoint
CREATE INDEX "invitations_collection_id_idx" ON "invitations" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "item_dispositions_item_curator_unique" ON "item_dispositions" USING btree ("item_id","curator_id");--> statement-breakpoint
CREATE INDEX "item_dispositions_collection_curator_idx" ON "item_dispositions" USING btree ("collection_id","curator_id");--> statement-breakpoint
CREATE INDEX "items_collection_id_idx" ON "items" USING btree ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_collection_number_unique" ON "items" USING btree ("collection_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_collection_user_unique" ON "memberships" USING btree ("collection_id","user_id");--> statement-breakpoint
CREATE INDEX "photos_item_id_idx" ON "photos" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "photos_collection_id_idx" ON "photos" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "photos_uploaded_by_idx" ON "photos" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "photos_deleted_at_idx" ON "photos" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "preferences_collection_curator_idx" ON "preferences" USING btree ("collection_id","curator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preferences_item_curator_unique" ON "preferences" USING btree ("item_id","curator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preferences_order_rank_unique" ON "preferences" USING btree ("collection_id","curator_id","order_rank") WHERE "preferences"."order_rank" is not null;--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_collection_id_idx" ON "sessions" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "sessions_curator_id_idx" ON "sessions" USING btree ("curator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_active_unique" ON "sessions" USING btree ("collection_id","curator_id") WHERE "sessions"."deleted_at" is null and "sessions"."status" in ('active','paused');--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_collection_number_unique" ON "sessions" USING btree ("collection_id","number");--> statement-breakpoint
CREATE INDEX "sort_result_items_result_id_idx" ON "sort_result_items" USING btree ("sort_result_id");--> statement-breakpoint
CREATE INDEX "sort_shares_result_id_idx" ON "sort_result_shares" USING btree ("sort_result_id");--> statement-breakpoint
CREATE INDEX "sort_results_collection_id_idx" ON "sort_results" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "sort_results_curator_id_idx" ON "sort_results" USING btree ("curator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sort_results_collection_number_unique" ON "sort_results" USING btree ("collection_id","number");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
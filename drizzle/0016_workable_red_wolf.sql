CREATE TABLE IF NOT EXISTS "voice_usage" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "voice_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "voice_usage" ADD CONSTRAINT "voice_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

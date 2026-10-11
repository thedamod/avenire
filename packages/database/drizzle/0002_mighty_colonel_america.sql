CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"media_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"thread_id" text,
	"message_id" text,
	"run_id" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "artifact" CASCADE;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_thread_id_ruth_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ruth_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_message_id_ruth_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ruth_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_run_id_cloud_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cloud_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_user_created_idx" ON "asset" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "asset_user_thread_created_idx" ON "asset" USING btree ("user_id","thread_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_user_run_created_idx" ON "asset" USING btree ("user_id","run_id","created_at");
-- Derived legacy transcripts have no ownership provenance and cannot be safely backfilled.
-- Discard only cache data; originals, published files and run history are retained.
DELETE FROM "transcript_cache";--> statement-breakpoint
DELETE FROM "search_cache";--> statement-breakpoint
DROP INDEX "search_cache_lookup_idx";--> statement-breakpoint
ALTER TABLE "transcript_cache" DROP CONSTRAINT "transcript_cache_model_content_hash_pk";--> statement-breakpoint
ALTER TABLE "cloud_task" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "purge_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ingestion_job" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "search_cache" ADD COLUMN "corpus_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_cache" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_cache" ADD COLUMN "file_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_cache" ADD COLUMN "expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "corpus_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_id_user_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "transcript_cache" ADD CONSTRAINT "transcript_cache_user_id_file_id_model_content_hash_pk" PRIMARY KEY("user_id","file_id","model","content_hash");--> statement-breakpoint
ALTER TABLE "transcript_cache" ADD CONSTRAINT "transcript_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_cache" ADD CONSTRAINT "transcript_cache_file_owner_fk" FOREIGN KEY ("file_id","user_id") REFERENCES "public"."file"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_cache_expires_idx" ON "transcript_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "search_cache_lookup_idx" ON "search_cache" USING btree ("user_id","corpus_revision","options_key","query_text");

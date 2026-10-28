ALTER TABLE "file" ADD COLUMN "origin" jsonb;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "access" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_upload" ADD COLUMN "origin" jsonb;--> statement-breakpoint
ALTER TABLE "source_upload" ADD COLUMN "access" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
CREATE INDEX "source_upload_user_sha256_idx" ON "source_upload" USING btree ("user_id","sha256");
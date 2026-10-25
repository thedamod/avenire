CREATE TABLE "source_upload" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"file_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"source_url" text,
	"storage_key" text,
	"abandoned_storage_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claim_token" text,
	"claim_expires_at" timestamp with time zone,
	"completed_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_upload_user_idempotency_unique" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "source_upload_file_id_unique" UNIQUE("file_id"),
	CONSTRAINT "source_upload_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
-- Remove only obsolete board references from persisted chat metadata.
-- File and notebook references, message parts and library content are retained.
UPDATE "ruth_message"
SET "metadata" = jsonb_set(
  "metadata",
  '{references}',
  COALESCE((
    SELECT jsonb_agg(reference)
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof("metadata"->'references') = 'array'
        THEN "metadata"->'references' ELSE '[]'::jsonb END
    ) AS reference
    WHERE reference->>'kind' IS DISTINCT FROM 'canvasNode'
  ), '[]'::jsonb)
)
WHERE jsonb_typeof("metadata"->'references') = 'array'
  AND "metadata"->'references' @> '[{"kind":"canvasNode"}]'::jsonb;
--> statement-breakpoint
DROP TABLE "canvas_node";--> statement-breakpoint
ALTER TABLE "source_upload" ADD CONSTRAINT "source_upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_upload" ADD CONSTRAINT "source_upload_completed_file_id_file_id_fk" FOREIGN KEY ("completed_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_upload_user_status_idx" ON "source_upload" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "source_upload_expiry_idx" ON "source_upload" USING btree ("expires_at");

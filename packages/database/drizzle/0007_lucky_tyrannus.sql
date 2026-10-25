CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferences" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "archived_via_folder_id" text;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "purge_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "preview" text;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "note_revision" text;--> statement-breakpoint
ALTER TABLE "folder" ADD COLUMN "color" text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
ALTER TABLE "folder" ADD COLUMN "cover" text DEFAULT 'book' NOT NULL;--> statement-breakpoint
ALTER TABLE "folder" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "folder" ADD COLUMN "purge_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "folder" ADD COLUMN "purge_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ruth_thread" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_archived_via_folder_id_folder_id_fk" FOREIGN KEY ("archived_via_folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruth_thread" ADD CONSTRAINT "ruth_thread_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_archived_via_folder_idx" ON "file" USING btree ("archived_via_folder_id");--> statement-breakpoint
CREATE INDEX "file_purge_requested_idx" ON "file" USING btree ("purge_requested_at");--> statement-breakpoint
CREATE INDEX "folder_archived_at_idx" ON "folder" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "ruth_thread_folder_id_idx" ON "ruth_thread" USING btree ("folder_id");
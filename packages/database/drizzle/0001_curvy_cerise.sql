CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cloud_run_id" text,
	"thread_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"source_file_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_node" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ref" jsonb NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"location" jsonb NOT NULL,
	"token_count" integer NOT NULL,
	"content_hash" text NOT NULL,
	"content_norm" text NOT NULL,
	"embedding" vector(1536),
	"search" "tsvector" NOT NULL,
	"embedding_model" text,
	"graph_indexed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_hydration" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trigger" text NOT NULL,
	"selector" jsonb NOT NULL,
	"max_files" integer NOT NULL,
	"max_bytes" bigint NOT NULL,
	"files" jsonb NOT NULL,
	"total_bytes" bigint NOT NULL,
	"truncated" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"folder_id" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"summary" text,
	"report_message_id" text,
	"log_tail" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"sandbox_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_run_token" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_run_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "cloud_task" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"schedule" jsonb NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"pre_hydration" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivery" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"builtin" text,
	"max_attempts" integer DEFAULT 2 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_workspace_file" (
	"user_id" text NOT NULL,
	"file_id" text NOT NULL,
	"sandbox_path" text NOT NULL,
	"content_hash" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"hydrated_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"last_run_id" text,
	CONSTRAINT "cloud_workspace_file_user_id_file_id_pk" PRIMARY KEY("user_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"to_address" text NOT NULL,
	"template" text NOT NULL,
	"props" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_cache" (
	"model" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embedding_cache_model_content_hash_pk" PRIMARY KEY("model","content_hash")
);
--> statement-breakpoint
CREATE TABLE "entity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_user_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "entity_mention" (
	"entity_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"file_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "entity_mention_entity_id_chunk_id_pk" PRIMARY KEY("entity_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "entity_relation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"predicate" text NOT NULL,
	"description" text NOT NULL,
	"weight" real NOT NULL,
	"chunk_id" text NOT NULL,
	"file_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"placement" text DEFAULT 'inbox' NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"content_modified_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"archived_at" timestamp with time zone,
	"source_url" text,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" bigint,
	"capture_id" text,
	"dedupe_key" text NOT NULL,
	"media_position_sec" real,
	"content_hash" text,
	"document_key" text,
	"extractor_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_user_dedupe_key_unique" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "file_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_id" text NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "file_folder" (
	"file_id" text NOT NULL,
	"folder_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_folder_file_id_folder_id_pk" PRIMARY KEY("file_id","folder_id")
);
--> statement-breakpoint
CREATE TABLE "folder" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"suggested" boolean DEFAULT false NOT NULL,
	"centroid" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"coverage" jsonb,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_job_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "pending_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text NOT NULL,
	"file_id" text NOT NULL,
	"kind" text DEFAULT 'sync' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"base_hash" text NOT NULL,
	"proposed_key" text NOT NULL,
	"proposed_hash" text NOT NULL,
	"proposed_size" bigint NOT NULL,
	"conflict" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ruth_message" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruth_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"title" text NOT NULL,
	"full_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_usage" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"chat_seconds" integer DEFAULT 0 NOT NULL,
	"cloud_seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sandbox_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "search_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"options_key" text NOT NULL,
	"query_text" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text NOT NULL,
	"result" jsonb NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "transcript_cache" (
	"model" text NOT NULL,
	"content_hash" text NOT NULL,
	"segments" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_cache_model_content_hash_pk" PRIMARY KEY("model","content_hash")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_cloud_run_id_cloud_run_id_fk" FOREIGN KEY ("cloud_run_id") REFERENCES "public"."cloud_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_thread_id_ruth_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ruth_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_node" ADD CONSTRAINT "canvas_node_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_hydration" ADD CONSTRAINT "cloud_hydration_run_id_cloud_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cloud_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_hydration" ADD CONSTRAINT "cloud_hydration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD CONSTRAINT "cloud_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD CONSTRAINT "cloud_run_task_id_cloud_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."cloud_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD CONSTRAINT "cloud_run_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_run_token" ADD CONSTRAINT "cloud_run_token_run_id_cloud_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cloud_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_run_token" ADD CONSTRAINT "cloud_run_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_task" ADD CONSTRAINT "cloud_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_file" ADD CONSTRAINT "cloud_workspace_file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_file" ADD CONSTRAINT "cloud_workspace_file_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity" ADD CONSTRAINT "entity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_mention" ADD CONSTRAINT "entity_mention_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_mention" ADD CONSTRAINT "entity_mention_chunk_id_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_mention" ADD CONSTRAINT "entity_mention_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_mention" ADD CONSTRAINT "entity_mention_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relation" ADD CONSTRAINT "entity_relation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relation" ADD CONSTRAINT "entity_relation_source_id_entity_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relation" ADD CONSTRAINT "entity_relation_target_id_entity_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relation" ADD CONSTRAINT "entity_relation_chunk_id_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relation" ADD CONSTRAINT "entity_relation_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_event" ADD CONSTRAINT "file_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_event" ADD CONSTRAINT "file_event_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_job" ADD CONSTRAINT "ingestion_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_job" ADD CONSTRAINT "ingestion_job_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approval" ADD CONSTRAINT "pending_approval_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approval" ADD CONSTRAINT "pending_approval_run_id_cloud_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cloud_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approval" ADD CONSTRAINT "pending_approval_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruth_message" ADD CONSTRAINT "ruth_message_thread_id_ruth_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ruth_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruth_message" ADD CONSTRAINT "ruth_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruth_thread" ADD CONSTRAINT "ruth_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_usage" ADD CONSTRAINT "sandbox_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_cache" ADD CONSTRAINT "search_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artifact_user_created_idx" ON "artifact" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "artifact_cloud_run_id_idx" ON "artifact" USING btree ("cloud_run_id");--> statement-breakpoint
CREATE INDEX "artifact_thread_id_idx" ON "artifact" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "canvas_node_user_id_idx" ON "canvas_node" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "capture_user_captured_at_idx" ON "capture" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE INDEX "chunk_embedding_hnsw_idx" ON "chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunk_search_gin_idx" ON "chunk" USING gin ("search");--> statement-breakpoint
CREATE INDEX "chunk_content_norm_trgm_idx" ON "chunk" USING gin ("content_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "chunk_file_id_idx" ON "chunk" USING btree ("file_id","ordinal");--> statement-breakpoint
CREATE INDEX "chunk_user_id_idx" ON "chunk" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloud_hydration_run_idx" ON "cloud_hydration" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "cloud_hydration_user_id_idx" ON "cloud_hydration" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloud_run_status_not_before_idx" ON "cloud_run" USING btree ("status","not_before");--> statement-breakpoint
CREATE INDEX "cloud_run_user_status_idx" ON "cloud_run" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "cloud_run_status_scheduled_for_idx" ON "cloud_run" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "cloud_run_folder_id_idx" ON "cloud_run" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_run_task_scheduled_attempt_unique" ON "cloud_run" USING btree ("task_id","scheduled_for","attempt");--> statement-breakpoint
CREATE INDEX "cloud_run_token_run_id_idx" ON "cloud_run_token" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "cloud_run_token_user_id_idx" ON "cloud_run_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloud_task_enabled_next_run_idx" ON "cloud_task" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "cloud_task_user_updated_at_idx" ON "cloud_task" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_task_user_builtin_unique" ON "cloud_task" USING btree ("user_id","builtin") WHERE "cloud_task"."builtin" is not null;--> statement-breakpoint
CREATE INDEX "cloud_workspace_file_user_last_used_idx" ON "cloud_workspace_file" USING btree ("user_id","last_used_at");--> statement-breakpoint
CREATE INDEX "cloud_workspace_file_file_id_idx" ON "cloud_workspace_file" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "email_outbox_status_send_after_idx" ON "email_outbox" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "email_outbox_user_id_idx" ON "email_outbox" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entity_embedding_hnsw_idx" ON "entity" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "entity_mention_chunk_id_idx" ON "entity_mention" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "entity_mention_file_id_idx" ON "entity_mention" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "entity_mention_user_id_idx" ON "entity_mention" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entity_relation_source_idx" ON "entity_relation" USING btree ("user_id","source_id");--> statement-breakpoint
CREATE INDEX "entity_relation_target_idx" ON "entity_relation" USING btree ("user_id","target_id");--> statement-breakpoint
CREATE INDEX "entity_relation_chunk_id_idx" ON "entity_relation" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "entity_relation_source_id_idx" ON "entity_relation" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "entity_relation_target_id_idx" ON "entity_relation" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "entity_relation_file_id_idx" ON "entity_relation" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_user_placement_idx" ON "file" USING btree ("user_id","placement");--> statement-breakpoint
CREATE INDEX "file_user_content_modified_idx" ON "file" USING btree ("user_id","content_modified_at");--> statement-breakpoint
CREATE INDEX "file_capture_id_idx" ON "file" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "file_placement_archived_at_idx" ON "file" USING btree ("placement","archived_at");--> statement-breakpoint
CREATE INDEX "file_event_user_at_idx" ON "file_event" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "file_event_user_file_at_idx" ON "file_event" USING btree ("user_id","file_id","at");--> statement-breakpoint
CREATE INDEX "file_event_file_id_idx" ON "file_event" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_folder_folder_id_idx" ON "file_folder" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "file_folder_user_id_idx" ON "file_folder" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "folder_user_id_idx" ON "folder" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ingestion_job_status_locked_until_created_at_idx" ON "ingestion_job" USING btree ("status","locked_until","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_job_user_id_idx" ON "ingestion_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pending_approval_user_status_idx" ON "pending_approval" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "pending_approval_run_idx" ON "pending_approval" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "pending_approval_file_id_idx" ON "pending_approval" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "ruth_message_thread_created_idx" ON "ruth_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ruth_message_user_id_idx" ON "ruth_message" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ruth_thread_user_cloud_unique" ON "ruth_thread" USING btree ("user_id") WHERE "ruth_thread"."kind" = 'ruth-cloud';--> statement-breakpoint
CREATE INDEX "ruth_thread_user_updated_at_idx" ON "ruth_thread" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "search_cache_lookup_idx" ON "search_cache" USING btree ("user_id","options_key","query_text");--> statement-breakpoint
CREATE INDEX "search_cache_expires_at_idx" ON "search_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
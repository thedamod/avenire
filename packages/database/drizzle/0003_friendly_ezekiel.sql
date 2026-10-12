CREATE TABLE "cloud_tool_call" (
	"run_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"session_id" text,
	"command_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "cloud_tool_call_run_id_tool_call_id_pk" PRIMARY KEY("run_id","tool_call_id")
);
--> statement-breakpoint
DROP TABLE "cloud_run_token" CASCADE;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "leased_by" text;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "messages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "step_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "usage" jsonb DEFAULT '{"inputTokens":0,"outputTokens":0,"cost":0,"actions":0}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "recording_id" text;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "model_name" text;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "cloud_run" ADD COLUMN "inputs_slug" text;--> statement-breakpoint
ALTER TABLE "cloud_task" ADD COLUMN "model" text DEFAULT 'ruth-core' NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_task" ADD COLUMN "network" text DEFAULT 'packages' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cloud_inputs_slug" text;--> statement-breakpoint
ALTER TABLE "cloud_tool_call" ADD CONSTRAINT "cloud_tool_call_run_id_cloud_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cloud_run"("id") ON DELETE cascade ON UPDATE no action;
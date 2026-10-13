CREATE TABLE "cloud_run_event" (
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"chunk" jsonb NOT NULL,
	"terminal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_run_event_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);
--> statement-breakpoint
ALTER TABLE "cloud_task" ADD COLUMN "one_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_run_event" ADD CONSTRAINT "cloud_run_event_run_id_cloud_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."cloud_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_run_event_terminal_unique" ON "cloud_run_event" USING btree ("run_id") WHERE "cloud_run_event"."terminal";
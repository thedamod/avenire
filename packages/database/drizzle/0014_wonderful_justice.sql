CREATE INDEX "ingestion_job_user_updated_id_idx" ON "ingestion_job" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE FUNCTION avenire_notify_ingestion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('avenire_ingestion', json_build_object('userId', NEW.user_id, 'id', NEW.id)::text);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ingestion_job_notify AFTER INSERT OR UPDATE ON ingestion_job
FOR EACH ROW EXECUTE FUNCTION avenire_notify_ingestion();

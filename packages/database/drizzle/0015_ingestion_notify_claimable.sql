-- Lease heartbeats (locked_until/updated_at only) no longer notify, and each payload says
-- whether the row is claimable now, so idle workers wake only for work they can take.
CREATE OR REPLACE FUNCTION avenire_notify_ingestion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.generation IS NOT DISTINCT FROM OLD.generation
    AND NEW.attempts IS NOT DISTINCT FROM OLD.attempts
    AND NEW.error IS NOT DISTINCT FROM OLD.error
    AND NEW.coverage IS NOT DISTINCT FROM OLD.coverage
    AND NEW.claim_token IS NOT DISTINCT FROM OLD.claim_token
  THEN
    RETURN NEW;
  END IF;
  PERFORM pg_notify('avenire_ingestion', json_build_object(
    'userId', NEW.user_id,
    'id', NEW.id,
    'status', NEW.status,
    -- Mirrors claimJobs: queued once its retry delay passes; indexed with a scheduled retry.
    'claimable', (NEW.status = 'queued' AND (NEW.locked_until IS NULL OR NEW.locked_until <= now()))
      OR (NEW.status = 'indexed' AND NEW.locked_until IS NOT NULL AND NEW.locked_until <= now())
  )::text);
  RETURN NEW;
END;
$$;

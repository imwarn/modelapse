BEGIN;

SET search_path TO modelapse, public;

CREATE OR REPLACE FUNCTION protect_sealed_run()
RETURNS trigger LANGUAGE plpgsql AS $sealed_run$
BEGIN
  IF OLD.sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'sealed runs are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$sealed_run$;

CREATE TRIGGER runs_immutable_after_seal
BEFORE UPDATE OR DELETE ON runs
FOR EACH ROW EXECUTE FUNCTION protect_sealed_run();

CREATE TRIGGER blobs_append_only
BEFORE UPDATE OR DELETE ON blobs
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

COMMIT;

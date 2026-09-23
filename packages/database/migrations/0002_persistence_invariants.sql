BEGIN;

SET search_path TO modelapse, public;

CREATE TRIGGER blobs_append_only
BEFORE UPDATE OR DELETE ON blobs
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

COMMIT;

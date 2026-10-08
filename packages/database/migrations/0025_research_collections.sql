BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE research_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  description text,
  filters jsonb NOT NULL CHECK (jsonb_typeof(filters) = 'object'),
  run_ids uuid[] NOT NULL CHECK (cardinality(run_ids) BETWEEN 1 AND 50),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL CHECK (char_length(btrim(created_by)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  selection_limit integer NOT NULL DEFAULT 50 CHECK (selection_limit = 50)
);

CREATE INDEX research_collections_created_idx
  ON research_collections (created_at DESC, id DESC);

CREATE FUNCTION validate_research_collection_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_count integer;
BEGIN
  IF cardinality(NEW.run_ids) <> (
    SELECT COUNT(DISTINCT input.run_id)
    FROM unnest(NEW.run_ids) AS input(run_id)
  ) THEN
    RAISE EXCEPTION 'research collection contains duplicate Run IDs';
  END IF;

  SELECT COUNT(*) INTO run_count
  FROM unnest(NEW.run_ids) AS item(run_id)
  JOIN runs r ON r.id = item.run_id
  JOIN test_cases tc ON tc.id = r.test_case_id
  WHERE r.status = 'completed'
    AND r.sealed_at IS NOT NULL
    AND r.completed_at IS NOT NULL
    AND tc.visibility = 'public'
    AND tc.case_type <> 'calibration';

  IF run_count <> cardinality(NEW.run_ids) THEN
    RAISE EXCEPTION 'research collection requires sealed public non-calibration Runs';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_collections_validate
BEFORE INSERT ON research_collections
FOR EACH ROW EXECUTE FUNCTION validate_research_collection_snapshot();

CREATE TRIGGER research_collections_append_only
BEFORE UPDATE OR DELETE ON research_collections
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

COMMIT;

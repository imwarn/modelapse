BEGIN;

SET search_path TO modelapse, public;

ALTER TABLE models
  ADD COLUMN canonical_source_id uuid REFERENCES source_records(id);

CREATE TABLE model_execution_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id),
  endpoint_id uuid NOT NULL REFERENCES provider_endpoints(id),
  api_model_id text NOT NULL,
  snapshot_id uuid REFERENCES model_snapshots(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  source_id uuid NOT NULL REFERENCES source_records(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(api_model_id)) > 0),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX model_execution_bindings_current_idx
  ON model_execution_bindings (model_id, endpoint_id)
  WHERE valid_to IS NULL;

CREATE INDEX model_execution_bindings_model_time_idx
  ON model_execution_bindings (model_id, valid_from DESC);

CREATE OR REPLACE FUNCTION validate_model_execution_binding()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  model_provider uuid;
  endpoint_provider uuid;
  snapshot_model uuid;
BEGIN
  SELECT provider_id INTO model_provider
  FROM models
  WHERE id = NEW.model_id;

  SELECT provider_id INTO endpoint_provider
  FROM provider_endpoints
  WHERE id = NEW.endpoint_id;

  IF model_provider IS NULL OR endpoint_provider IS NULL THEN
    RAISE EXCEPTION 'model execution binding references missing model or endpoint';
  END IF;

  IF model_provider <> endpoint_provider THEN
    RAISE EXCEPTION 'model execution binding provider mismatch';
  END IF;

  IF NEW.snapshot_id IS NOT NULL THEN
    SELECT model_id INTO snapshot_model
    FROM model_snapshots
    WHERE id = NEW.snapshot_id;

    IF snapshot_model IS NULL OR snapshot_model <> NEW.model_id THEN
      RAISE EXCEPTION 'model execution binding snapshot mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER model_execution_bindings_validate
BEFORE INSERT OR UPDATE ON model_execution_bindings
FOR EACH ROW EXECUTE FUNCTION validate_model_execution_binding();

COMMIT;

BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE catalog_promotion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES catalog_discovery_candidates(id),
  model_id uuid NOT NULL REFERENCES models(id),
  source_record_id uuid NOT NULL REFERENCES source_records(id),
  canonical_slug text NOT NULL CHECK (canonical_slug = btrim(canonical_slug) AND canonical_slug <> ''),
  marketing_name text NOT NULL CHECK (marketing_name = btrim(marketing_name) AND marketing_name <> ''),
  model_status text NOT NULL CHECK (model_status IN ('preview', 'active')),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  promoted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

CREATE OR REPLACE FUNCTION validate_catalog_promotion_event()
RETURNS trigger LANGUAGE plpgsql AS $catalog_promotion$
DECLARE
  candidate_provider uuid;
  candidate_status text;
  model_provider uuid;
  model_source uuid;
BEGIN
  SELECT provider_id, status
    INTO candidate_provider, candidate_status
  FROM catalog_discovery_candidates
  WHERE id = NEW.candidate_id;

  IF candidate_provider IS NULL THEN
    RAISE EXCEPTION 'catalog promotion references a missing candidate';
  END IF;

  IF candidate_status <> 'matched' THEN
    RAISE EXCEPTION 'catalog promotion candidate must be matched before event insertion';
  END IF;

  SELECT provider_id, canonical_source_id
    INTO model_provider, model_source
  FROM models
  WHERE id = NEW.model_id;

  IF model_provider IS NULL OR model_provider <> candidate_provider THEN
    RAISE EXCEPTION 'catalog promotion model provider mismatch';
  END IF;

  IF model_source IS DISTINCT FROM NEW.source_record_id THEN
    RAISE EXCEPTION 'catalog promotion source must be the canonical model source';
  END IF;

  RETURN NEW;
END;
$catalog_promotion$;

CREATE TRIGGER catalog_promotion_events_validate
BEFORE INSERT ON catalog_promotion_events
FOR EACH ROW EXECUTE FUNCTION validate_catalog_promotion_event();

CREATE TRIGGER catalog_promotion_events_append_only
BEFORE UPDATE OR DELETE ON catalog_promotion_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX catalog_promotion_events_model_promoted_idx
  ON catalog_promotion_events (model_id, promoted_at DESC);

COMMIT;

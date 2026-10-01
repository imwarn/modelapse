BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE catalog_discovery_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  remote_model_id text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  first_source_record_id uuid NOT NULL REFERENCES source_records(id),
  last_source_record_id uuid NOT NULL REFERENCES source_records(id),
  first_collection_run_id uuid NOT NULL REFERENCES catalog_collection_runs(id),
  last_collection_run_id uuid NOT NULL REFERENCES catalog_collection_runs(id),
  latest_provider_snapshot_id text,
  observation_count bigint NOT NULL DEFAULT 1 CHECK (observation_count >= 1),
  status text NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'matched', 'ignored', 'promotion_ready')),
  resolved_model_id uuid REFERENCES models(id),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, remote_model_id),
  CHECK (remote_model_id = btrim(remote_model_id) AND remote_model_id <> ''),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (
    (status = 'matched' AND resolved_model_id IS NOT NULL AND resolved_at IS NOT NULL)
    OR
    (status <> 'matched' AND resolved_model_id IS NULL AND resolved_at IS NULL)
  )
);

CREATE TABLE catalog_discovery_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES catalog_discovery_candidates(id),
  collection_run_id uuid NOT NULL REFERENCES catalog_collection_runs(id),
  source_record_id uuid NOT NULL REFERENCES source_records(id),
  observed_at timestamptz NOT NULL,
  provider_snapshot_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, collection_run_id)
);

CREATE TABLE catalog_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES catalog_discovery_candidates(id),
  action text NOT NULL
    CHECK (action IN ('match_existing', 'ignore', 'mark_promotion_ready', 'reopen')),
  resolved_model_id uuid REFERENCES models(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (action = 'match_existing' AND resolved_model_id IS NOT NULL)
    OR
    (action <> 'match_existing' AND resolved_model_id IS NULL)
  )
);

CREATE OR REPLACE FUNCTION validate_catalog_reconciliation_event()
RETURNS trigger LANGUAGE plpgsql AS $catalog_reconciliation$
DECLARE
  candidate_provider uuid;
  model_provider uuid;
BEGIN
  SELECT provider_id INTO candidate_provider
  FROM catalog_discovery_candidates
  WHERE id = NEW.candidate_id;

  IF candidate_provider IS NULL THEN
    RAISE EXCEPTION 'catalog reconciliation references a missing candidate';
  END IF;

  IF NEW.action = 'match_existing' THEN
    SELECT provider_id INTO model_provider
    FROM models
    WHERE id = NEW.resolved_model_id;

    IF model_provider IS NULL OR model_provider <> candidate_provider THEN
      RAISE EXCEPTION 'catalog reconciliation model provider mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$catalog_reconciliation$;

CREATE TRIGGER catalog_reconciliation_events_validate
BEFORE INSERT ON catalog_reconciliation_events
FOR EACH ROW EXECUTE FUNCTION validate_catalog_reconciliation_event();

CREATE TRIGGER catalog_discovery_observations_append_only
BEFORE UPDATE OR DELETE ON catalog_discovery_observations
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER catalog_reconciliation_events_append_only
BEFORE UPDATE OR DELETE ON catalog_reconciliation_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX catalog_discovery_candidates_status_seen_idx
  ON catalog_discovery_candidates (status, last_seen_at DESC);

CREATE INDEX catalog_discovery_candidates_provider_seen_idx
  ON catalog_discovery_candidates (provider_id, last_seen_at DESC);

CREATE INDEX catalog_discovery_observations_candidate_seen_idx
  ON catalog_discovery_observations (candidate_id, observed_at DESC);

CREATE INDEX catalog_reconciliation_events_candidate_created_idx
  ON catalog_reconciliation_events (candidate_id, created_at DESC, id DESC);

COMMIT;

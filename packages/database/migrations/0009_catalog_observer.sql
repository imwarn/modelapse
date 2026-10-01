BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE catalog_observer_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  source_key text NOT NULL CHECK (source_key ~ '^[a-z0-9][a-z0-9-]*$'),
  source_kind text NOT NULL CHECK (source_kind IN ('model_list', 'docs')),
  url text NOT NULL CHECK (url ~ '^https://'),
  title text NOT NULL,
  parser text NOT NULL CHECK (parser IN ('openai_models', 'snapshot_only')),
  credential_env text,
  interval_seconds integer NOT NULL DEFAULT 21600
    CHECK (interval_seconds BETWEEN 300 AND 604800),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, source_key)
);

CREATE TABLE catalog_collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observer_source_id uuid NOT NULL REFERENCES catalog_observer_sources(id),
  status text NOT NULL
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  http_status integer,
  item_count integer CHECK (item_count IS NULL OR item_count >= 0),
  observations_emitted integer NOT NULL DEFAULT 0
    CHECK (observations_emitted >= 0),
  collector_build text NOT NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE catalog_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observer_source_id uuid NOT NULL REFERENCES catalog_observer_sources(id),
  collection_run_id uuid NOT NULL UNIQUE REFERENCES catalog_collection_runs(id),
  source_record_id uuid NOT NULL REFERENCES source_records(id),
  retrieved_at timestamptz NOT NULL,
  content_sha256 char(64) NOT NULL
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_type text,
  etag text,
  last_modified text,
  response_body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER catalog_source_snapshots_append_only
BEFORE UPDATE OR DELETE ON catalog_source_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX catalog_observer_sources_due_idx
  ON catalog_observer_sources (enabled, next_run_at, provider_id);

CREATE INDEX catalog_collection_runs_source_started_idx
  ON catalog_collection_runs (observer_source_id, started_at DESC);

CREATE INDEX catalog_source_snapshots_source_retrieved_idx
  ON catalog_source_snapshots (observer_source_id, retrieved_at DESC);

COMMIT;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS modelapse;
SET search_path TO modelapse, public;

CREATE TYPE execution_path AS ENUM (
  'first_party_direct',
  'first_party_product',
  'routed_provider',
  'cloud_hosted',
  'community_claimed'
);

CREATE TYPE evidence_level AS ENUM ('E0', 'E1', 'E2', 'E3', 'E4', 'E5');
CREATE TYPE model_status AS ENUM ('preview', 'active', 'deprecated', 'retired', 'archived');
CREATE TYPE model_relation_type AS ENUM (
  'successor_of',
  'replacement_for',
  'derived_from',
  'specialized_from',
  'same_generation_as'
);
CREATE TYPE provider_position AS ENUM ('flagship', 'balanced', 'fast', 'economical', 'specialist');
CREATE TYPE test_origin AS ENUM ('modelapse', 'external', 'hybrid');
CREATE TYPE test_version_status AS ENUM ('draft', 'published', 'retired');
CREATE TYPE test_case_type AS ENUM ('icon', 'public', 'shadow', 'fixture', 'calibration');
CREATE TYPE visibility_scope AS ENUM ('public', 'private');
CREATE TYPE test_case_status AS ENUM ('active', 'retired');
CREATE TYPE artifact_kind AS ENUM ('text', 'svg', 'html', 'web_bundle', 'image', 'video', 'repo', 'agent_trace');
CREATE TYPE run_status AS ENUM (
  'planned',
  'executing',
  'response_captured',
  'completed',
  'failed_request',
  'blocked',
  'timeout',
  'invalid_output',
  'artifact_failed'
);
CREATE TYPE evaluator_kind AS ENUM ('deterministic', 'structural', 'visual', 'judge', 'hybrid');
CREATE TYPE candidate_status AS ENUM ('discovered', 'triage', 'referenced', 'imported', 'adopted', 'rejected');
CREATE TYPE run_relation_type AS ENUM ('reproduces', 'retry_of', 'repeat_of', 'derived_from');

CREATE TABLE source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  url text,
  title text,
  author text,
  published_at timestamptz,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  content_sha256 char(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE blobs (
  sha256 char(64) PRIMARY KEY,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  mime_type text NOT NULL,
  object_key text NOT NULL UNIQUE,
  visibility visibility_scope NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text NOT NULL,
  homepage text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provider_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  path execution_path NOT NULL,
  base_url text NOT NULL,
  hostname text NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  source_id uuid REFERENCES source_records(id),
  UNIQUE (provider_id, path, base_url),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE TABLE model_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  display_name text NOT NULL,
  UNIQUE (provider_id, slug)
);

CREATE TABLE model_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES model_families(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  display_name text NOT NULL,
  track_type text,
  UNIQUE (family_id, slug)
);

CREATE TABLE models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  family_id uuid REFERENCES model_families(id),
  track_id uuid REFERENCES model_tracks(id),
  canonical_slug text NOT NULL CHECK (canonical_slug ~ '^[a-z0-9][a-z0-9._-]*$'),
  marketing_name text NOT NULL,
  released_at timestamptz,
  retired_at timestamptz,
  status model_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider_id, canonical_slug),
  CHECK (retired_at IS NULL OR released_at IS NULL OR retired_at >= released_at)
);

CREATE TABLE model_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id),
  provider_snapshot_id text NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  source_id uuid REFERENCES source_records(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (model_id, provider_snapshot_id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE TABLE model_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  alias text NOT NULL,
  UNIQUE (provider_id, alias)
);

CREATE TABLE alias_resolution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_id uuid NOT NULL REFERENCES model_aliases(id),
  resolved_model_id uuid REFERENCES models(id),
  resolved_snapshot_id uuid REFERENCES model_snapshots(id),
  observed_at timestamptz NOT NULL,
  source_type text NOT NULL,
  source_id uuid REFERENCES source_records(id),
  confidence numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  raw_observation jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (resolved_model_id IS NOT NULL OR resolved_snapshot_id IS NOT NULL)
);

CREATE TABLE model_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_model_id uuid NOT NULL REFERENCES models(id),
  to_model_id uuid NOT NULL REFERENCES models(id),
  relation_type model_relation_type NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  source_id uuid REFERENCES source_records(id),
  confidence numeric(5,4) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (from_model_id, to_model_id, relation_type),
  CHECK (from_model_id <> to_model_id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE TABLE provider_positioning_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id),
  position provider_position NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  source_id uuid REFERENCES source_records(id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE test_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text NOT NULL,
  origin test_origin NOT NULL,
  canonical_source_id uuid REFERENCES source_records(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE test_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES test_families(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text NOT NULL,
  category text NOT NULL,
  artifact_type artifact_kind NOT NULL,
  UNIQUE (family_id, slug)
);

CREATE TABLE test_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES test_variants(id),
  version text NOT NULL,
  status test_version_status NOT NULL DEFAULT 'draft',
  definition_sha256 char(64) NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  license text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, version),
  UNIQUE (definition_sha256),
  CHECK ((status = 'draft' AND published_at IS NULL) OR (status <> 'draft' AND published_at IS NOT NULL))
);

CREATE TABLE test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_version_id uuid NOT NULL REFERENCES test_versions(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  case_type test_case_type NOT NULL,
  visibility visibility_scope NOT NULL,
  status test_case_status NOT NULL DEFAULT 'active',
  prompt_blob_sha256 char(64) REFERENCES blobs(sha256),
  fixture_manifest_blob_sha256 char(64) REFERENCES blobs(sha256),
  active_from timestamptz,
  active_to timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (test_version_id, slug),
  CHECK (prompt_blob_sha256 IS NOT NULL),
  CHECK (case_type <> 'shadow' OR status = 'retired' OR visibility = 'private'),
  CHECK (active_to IS NULL OR active_from IS NULL OR active_to > active_from)
);

CREATE TABLE evaluators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  version text NOT NULL,
  kind evaluator_kind NOT NULL,
  definition_sha256 char(64) NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version),
  UNIQUE (definition_sha256)
);

CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id uuid NOT NULL REFERENCES test_cases(id),
  model_id uuid REFERENCES models(id),
  snapshot_id uuid REFERENCES model_snapshots(id),
  provider_id uuid NOT NULL REFERENCES providers(id),
  execution_path execution_path NOT NULL,
  requested_model text NOT NULL,
  returned_model text,
  status run_status NOT NULL DEFAULT 'planned',
  runner_build text NOT NULL,
  request_blob_sha256 char(64) REFERENCES blobs(sha256),
  response_blob_sha256 char(64) REFERENCES blobs(sha256),
  started_at timestamptz,
  completed_at timestamptz,
  sealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  CHECK (sealed_at IS NULL OR completed_at IS NULL OR sealed_at >= completed_at)
);

CREATE TABLE run_configs (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  temperature double precision,
  top_p double precision,
  max_output_tokens integer CHECK (max_output_tokens IS NULL OR max_output_tokens > 0),
  reasoning_mode text,
  reasoning_effort text,
  seed bigint,
  service_tier text,
  tool_config jsonb,
  provider_config jsonb
);

CREATE TABLE provider_run_metadata (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  provider_request_id text,
  provider_response_id text,
  model_version_string text,
  upstream_id text,
  routed_provider_name text,
  usage jsonb,
  timing jsonb,
  response_headers_blob_sha256 char(64) REFERENCES blobs(sha256),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE run_relations (
  from_run_id uuid NOT NULL REFERENCES runs(id),
  to_run_id uuid NOT NULL REFERENCES runs(id),
  relation_type run_relation_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_run_id, to_run_id, relation_type),
  CHECK (from_run_id <> to_run_id)
);

CREATE TABLE attestation_keys (
  id text PRIMARY KEY,
  algorithm text NOT NULL,
  public_key_pem text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE run_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id),
  key_id text NOT NULL REFERENCES attestation_keys(id),
  payload_blob_sha256 char(64) NOT NULL REFERENCES blobs(sha256),
  signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, key_id, payload_blob_sha256)
);

CREATE TABLE evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id),
  level evidence_level NOT NULL,
  execution_path execution_path NOT NULL,
  collector text NOT NULL,
  source_id uuid REFERENCES source_records(id),
  attestation_id uuid REFERENCES run_attestations(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (execution_path = 'community_claimed' AND level IN ('E3', 'E4', 'E5'))),
  CHECK (NOT (level = 'E4' AND execution_path <> 'first_party_direct'))
);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id),
  kind artifact_kind NOT NULL,
  original_blob_sha256 char(64) NOT NULL REFERENCES blobs(sha256),
  manifest_blob_sha256 char(64) REFERENCES blobs(sha256),
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, kind, original_blob_sha256)
);

CREATE TABLE artifact_derivations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_artifact_id uuid NOT NULL REFERENCES artifacts(id),
  derivation_kind text NOT NULL,
  renderer_id text NOT NULL,
  renderer_version text NOT NULL,
  blob_sha256 char(64) NOT NULL REFERENCES blobs(sha256),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_artifact_id, derivation_kind, renderer_id, renderer_version, blob_sha256)
);

CREATE TABLE evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id),
  evaluator_id uuid NOT NULL REFERENCES evaluators(id),
  status text NOT NULL,
  raw_result_blob_sha256 char(64) REFERENCES blobs(sha256),
  judge_run_id uuid REFERENCES runs(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, evaluator_id),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE metric_values (
  evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  numeric_value double precision,
  text_value text,
  json_value jsonb,
  unit text,
  PRIMARY KEY (evaluation_id, metric_key),
  CHECK (num_nonnulls(numeric_value, text_value, json_value) = 1)
);

CREATE TABLE test_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  canonical_source_url text NOT NULL,
  author text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  first_published_at timestamptz,
  prompt_available boolean NOT NULL DEFAULT false,
  fixtures_available boolean NOT NULL DEFAULT false,
  artifact_available boolean NOT NULL DEFAULT false,
  code_available boolean NOT NULL DEFAULT false,
  license text,
  claimed_execution_path execution_path,
  social_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  replayability smallint CHECK (replayability BETWEEN 0 AND 5),
  contamination_risk smallint CHECK (contamination_risk BETWEEN 0 AND 5),
  rights_risk smallint CHECK (rights_risk BETWEEN 0 AND 5),
  shadow_suite_potential smallint CHECK (shadow_suite_potential BETWEEN 0 AND 5),
  status candidate_status NOT NULL DEFAULT 'discovered',
  notes text,
  UNIQUE (canonical_source_url)
);

CREATE TABLE community_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES test_candidates(id),
  source_url text,
  claimed_model text,
  claimed_provider text,
  claimed_execution_path execution_path,
  prompt_blob_sha256 char(64) REFERENCES blobs(sha256),
  files_manifest_blob_sha256 char(64) REFERENCES blobs(sha256),
  rights_attestation text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX runs_test_case_completed_idx ON runs (test_case_id, completed_at DESC);
CREATE INDEX runs_model_completed_idx ON runs (model_id, completed_at DESC);
CREATE INDEX runs_execution_path_idx ON runs (execution_path);
CREATE INDEX alias_resolution_alias_time_idx ON alias_resolution_events (alias_id, observed_at DESC);
CREATE INDEX model_relations_from_idx ON model_relations (from_model_id, relation_type);
CREATE INDEX model_relations_to_idx ON model_relations (to_model_id, relation_type);
CREATE INDEX evidence_run_created_idx ON evidence_records (run_id, created_at DESC);
CREATE INDEX artifacts_run_idx ON artifacts (run_id);
CREATE INDEX evaluations_run_idx ON evaluations (run_id);
CREATE INDEX candidates_status_idx ON test_candidates (status, first_seen_at DESC);

CREATE VIEW run_evidence_summary AS
WITH ranked AS (
  SELECT
    e.*,
    CASE e.level
      WHEN 'E0' THEN 0
      WHEN 'E1' THEN 1
      WHEN 'E2' THEN 2
      WHEN 'E3' THEN 3
      WHEN 'E4' THEN 4
      WHEN 'E5' THEN 5
    END AS evidence_rank
  FROM evidence_records e
), best AS (
  SELECT DISTINCT ON (run_id)
    run_id,
    level,
    execution_path,
    collector,
    source_id,
    attestation_id,
    created_at,
    evidence_rank
  FROM ranked
  ORDER BY run_id, evidence_rank DESC, created_at DESC
)
SELECT * FROM best;

CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER evidence_records_append_only
BEFORE UPDATE OR DELETE ON evidence_records
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER run_attestations_append_only
BEFORE UPDATE OR DELETE ON run_attestations
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE OR REPLACE FUNCTION protect_published_test_version()
RETURNS trigger LANGUAGE plpgsql AS $published_version$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'published or retired test versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft', 'published') THEN
      RAISE EXCEPTION 'draft test version may only remain draft or become published';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.variant_id IS DISTINCT FROM OLD.variant_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.definition_sha256 IS DISTINCT FROM OLD.definition_sha256
     OR NEW.license IS DISTINCT FROM OLD.license
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'published test version definition is immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status NOT IN ('published', 'retired') THEN
    RAISE EXCEPTION 'published test version may only become retired';
  END IF;

  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'retired test version cannot be reactivated';
  END IF;

  RETURN NEW;
END;
$published_version$;

CREATE TRIGGER test_versions_immutable_after_publish
BEFORE UPDATE OR DELETE ON test_versions
FOR EACH ROW EXECUTE FUNCTION protect_published_test_version();

CREATE OR REPLACE FUNCTION protect_test_case_definition()
RETURNS trigger LANGUAGE plpgsql AS $test_case_definition$
DECLARE
  parent_status test_version_status;
  version_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    version_id := OLD.test_version_id;
  ELSE
    version_id := NEW.test_version_id;
  END IF;

  SELECT status INTO parent_status
  FROM test_versions
  WHERE id = version_id;

  IF parent_status <> 'draft' THEN
    RAISE EXCEPTION 'cases belonging to published or retired test versions are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$test_case_definition$;

CREATE TRIGGER test_cases_immutable_after_publish
BEFORE INSERT OR UPDATE OR DELETE ON test_cases
FOR EACH ROW EXECUTE FUNCTION protect_test_case_definition();

CREATE OR REPLACE FUNCTION protect_sealed_run()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'sealed runs are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER runs_immutable_after_seal
BEFORE UPDATE OR DELETE ON runs
FOR EACH ROW EXECUTE FUNCTION protect_sealed_run();

CREATE OR REPLACE FUNCTION protect_original_artifact()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.original_blob_sha256 IS DISTINCT FROM OLD.original_blob_sha256
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'original artifact identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER artifacts_original_immutable
BEFORE UPDATE ON artifacts
FOR EACH ROW EXECUTE FUNCTION protect_original_artifact();

COMMIT;

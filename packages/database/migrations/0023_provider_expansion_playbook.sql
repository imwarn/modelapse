BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE provider_expansion_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE
    CHECK (version ~ '^[a-z0-9][a-z0-9._-]*$'),
  required_capabilities text[] NOT NULL DEFAULT ARRAY[
    'returned_model_metadata',
    'model_version_metadata',
    'provider_request_id',
    'provider_response_id',
    'service_tier_metadata',
    'token_usage'
  ]::text[],
  require_identity_provenance boolean NOT NULL DEFAULT true,
  require_catalog_collection boolean NOT NULL DEFAULT true,
  require_provider_policy boolean NOT NULL DEFAULT true,
  require_pricing_evidence boolean NOT NULL DEFAULT true,
  require_runner_context boolean NOT NULL DEFAULT true,
  require_direct_run boolean NOT NULL DEFAULT true,
  require_calibration boolean NOT NULL DEFAULT true,
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    required_capabilities <@ ARRAY[
      'returned_model_metadata',
      'model_version_metadata',
      'provider_request_id',
      'provider_response_id',
      'service_tier_metadata',
      'token_usage',
      'catalog_model_list'
    ]::text[]
  )
);

CREATE TRIGGER provider_expansion_policies_append_only
BEFORE UPDATE OR DELETE ON provider_expansion_policies
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

INSERT INTO provider_expansion_policies
  (
    version,
    actor,
    note
  )
VALUES (
  'provider-expansion-v1',
  'archive-v0.24-migration',
  'Provider onboarding requires sourced identity, collection, access, pricing, runner context, direct execution, calibration, and explicit runtime capability declarations.'
)
ON CONFLICT (version) DO NOTHING;

CREATE VIEW provider_expansion_policy_current AS
SELECT *
FROM provider_expansion_policies
ORDER BY created_at DESC, version DESC, id DESC
LIMIT 1;

CREATE TABLE provider_capability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  capability text NOT NULL CHECK (
    capability IN (
      'returned_model_metadata',
      'model_version_metadata',
      'provider_request_id',
      'provider_response_id',
      'service_tier_metadata',
      'token_usage',
      'catalog_model_list'
    )
  ),
  support_state text NOT NULL
    CHECK (support_state IN ('supported', 'unsupported')),
  source_id uuid REFERENCES source_records(id),
  declared_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER provider_capability_events_append_only
BEFORE UPDATE OR DELETE ON provider_capability_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX provider_capability_events_lookup_idx
  ON provider_capability_events(
    provider_id,
    capability,
    declared_at DESC,
    id DESC
  );

CREATE VIEW provider_capability_current AS
SELECT DISTINCT ON (provider_id, capability)
  *
FROM provider_capability_events
ORDER BY
  provider_id,
  capability,
  declared_at DESC,
  id DESC;

COMMIT;

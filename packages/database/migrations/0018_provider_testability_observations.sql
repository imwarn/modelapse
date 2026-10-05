BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE provider_testability_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id),
  model_id uuid REFERENCES models(id),
  execution_path execution_path NOT NULL,
  subject_kind text NOT NULL
    CHECK (subject_kind IN ('provider_policy', 'runner_access')),
  access_state text NOT NULL DEFAULT 'unknown'
    CHECK (access_state IN ('available', 'restricted', 'unavailable', 'unknown')),
  registration_requirement text NOT NULL DEFAULT 'unknown'
    CHECK (registration_requirement IN (
      'open_signup',
      'restricted_signup',
      'invite_only',
      'enterprise_only',
      'unknown'
    )),
  billing_requirement text NOT NULL DEFAULT 'unknown'
    CHECK (billing_requirement IN (
      'free',
      'paid_account',
      'prepaid_credit',
      'subscription',
      'enterprise_contract',
      'unknown'
    )),
  region_policy text NOT NULL DEFAULT 'unknown'
    CHECK (region_policy IN ('unrestricted', 'restricted', 'unknown')),
  allowed_regions text[] NOT NULL DEFAULT '{}'::text[],
  blocked_regions text[] NOT NULL DEFAULT '{}'::text[],
  account_tier text,
  service_tier text,
  service_assurance text NOT NULL DEFAULT 'unknown'
    CHECK (service_assurance IN (
      'documented_default',
      'documented_variant',
      'operator_uncertain',
      'unknown'
    )),
  pricing_currency char(3),
  input_price_per_million numeric(20,6),
  output_price_per_million numeric(20,6),
  request_price numeric(20,6),
  source_id uuid NOT NULL REFERENCES source_records(id),
  observed_at timestamptz NOT NULL,
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (account_tier IS NULL OR length(btrim(account_tier)) > 0),
  CHECK (service_tier IS NULL OR length(btrim(service_tier)) > 0),
  CHECK (pricing_currency IS NULL OR pricing_currency ~ '^[A-Z]{3}$'),
  CHECK (input_price_per_million IS NULL OR input_price_per_million >= 0),
  CHECK (output_price_per_million IS NULL OR output_price_per_million >= 0),
  CHECK (request_price IS NULL OR request_price >= 0)
);

CREATE OR REPLACE FUNCTION validate_provider_testability_observation()
RETURNS trigger LANGUAGE plpgsql AS $provider_testability$
DECLARE
  model_provider uuid;
BEGIN
  IF NEW.model_id IS NOT NULL THEN
    SELECT provider_id INTO model_provider
      FROM models
     WHERE id = NEW.model_id;

    IF model_provider IS NULL OR model_provider <> NEW.provider_id THEN
      RAISE EXCEPTION 'provider testability model provider mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$provider_testability$;

CREATE TRIGGER provider_testability_observations_validate
BEFORE INSERT ON provider_testability_observations
FOR EACH ROW EXECUTE FUNCTION validate_provider_testability_observation();

CREATE TRIGGER provider_testability_observations_append_only
BEFORE UPDATE OR DELETE ON provider_testability_observations
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX provider_testability_provider_observed_idx
  ON provider_testability_observations
    (provider_id, execution_path, subject_kind, observed_at DESC, id DESC);

CREATE INDEX provider_testability_model_observed_idx
  ON provider_testability_observations
    (model_id, execution_path, subject_kind, observed_at DESC, id DESC)
  WHERE model_id IS NOT NULL;

CREATE VIEW provider_testability_current AS
SELECT DISTINCT ON (
  provider_id,
  model_id,
  execution_path,
  subject_kind
)
  *
FROM provider_testability_observations
ORDER BY
  provider_id,
  model_id,
  execution_path,
  subject_kind,
  observed_at DESC,
  id DESC;

COMMIT;

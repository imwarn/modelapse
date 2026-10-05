BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE execution_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  region text NOT NULL CHECK (length(btrim(region)) > 0),
  account_tier text,
  service_tier text,
  service_assurance text NOT NULL DEFAULT 'unknown'
    CHECK (service_assurance IN (
      'documented_default',
      'documented_variant',
      'operator_uncertain',
      'unknown'
    )),
  created_by text NOT NULL CHECK (length(btrim(created_by)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (account_tier IS NULL OR length(btrim(account_tier)) > 0),
  CHECK (service_tier IS NULL OR length(btrim(service_tier)) > 0)
);

CREATE TRIGGER execution_environments_append_only
BEFORE UPDATE OR DELETE ON execution_environments
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TABLE execution_environment_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid NOT NULL REFERENCES execution_environments(id),
  enabled boolean NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER execution_environment_state_events_append_only
BEFORE UPDATE OR DELETE ON execution_environment_state_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX execution_environment_state_lookup_idx
  ON execution_environment_state_events
    (environment_id, effective_at DESC, id DESC);

CREATE VIEW execution_environment_current_state AS
SELECT DISTINCT ON (environment_id)
  *
FROM execution_environment_state_events
WHERE effective_at <= now()
ORDER BY environment_id, effective_at DESC, id DESC;

CREATE TABLE execution_environment_capability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid NOT NULL REFERENCES execution_environments(id),
  provider_id uuid NOT NULL REFERENCES providers(id),
  execution_path execution_path NOT NULL,
  enabled boolean NOT NULL,
  selection_priority integer NOT NULL DEFAULT 100
    CHECK (selection_priority BETWEEN 0 AND 100000),
  effective_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER execution_environment_capability_events_append_only
BEFORE UPDATE OR DELETE ON execution_environment_capability_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX execution_environment_capability_lookup_idx
  ON execution_environment_capability_events
    (
      environment_id,
      provider_id,
      execution_path,
      effective_at DESC,
      id DESC
    );

CREATE VIEW execution_environment_capabilities_current AS
SELECT DISTINCT ON (environment_id, provider_id, execution_path)
  *
FROM execution_environment_capability_events
WHERE effective_at <= now()
ORDER BY
  environment_id,
  provider_id,
  execution_path,
  effective_at DESC,
  id DESC;

ALTER TABLE run_jobs
  ADD COLUMN target_execution_environment_id uuid
  REFERENCES execution_environments(id);

CREATE INDEX run_jobs_target_environment_claim_idx
  ON run_jobs
    (target_execution_environment_id, available_at, created_at)
  WHERE status = 'queued';

ALTER TABLE run_execution_qualification_envelopes
  ADD COLUMN execution_environment_id uuid
  REFERENCES execution_environments(id);

CREATE INDEX run_execution_qualification_environment_idx
  ON run_execution_qualification_envelopes(execution_environment_id)
  WHERE execution_environment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_run_execution_qualification_envelope()
RETURNS trigger LANGUAGE plpgsql AS $run_execution_qualification$
DECLARE
  run_provider uuid;
  run_model uuid;
  run_path execution_path;
  policy provider_testability_observations%ROWTYPE;
  runner provider_testability_observations%ROWTYPE;
  environment execution_environments%ROWTYPE;
BEGIN
  SELECT provider_id, model_id, execution_path
    INTO run_provider, run_model, run_path
    FROM runs
   WHERE id = NEW.run_id;

  IF run_provider IS NULL THEN
    RAISE EXCEPTION 'run execution qualification run not found';
  END IF;

  IF NEW.provider_policy_observation_id IS NOT NULL THEN
    SELECT * INTO policy
      FROM provider_testability_observations
     WHERE id = NEW.provider_policy_observation_id;

    IF policy.id IS NULL
       OR policy.provider_id <> run_provider
       OR policy.execution_path <> run_path
       OR policy.subject_kind <> 'provider_policy'
       OR (policy.model_id IS NOT NULL AND policy.model_id IS DISTINCT FROM run_model) THEN
      RAISE EXCEPTION 'run execution qualification provider-policy evidence mismatch';
    END IF;
  END IF;

  IF NEW.runner_access_observation_id IS NOT NULL THEN
    SELECT * INTO runner
      FROM provider_testability_observations
     WHERE id = NEW.runner_access_observation_id;

    IF runner.id IS NULL
       OR runner.provider_id <> run_provider
       OR runner.execution_path <> run_path
       OR runner.subject_kind <> 'runner_access'
       OR (runner.model_id IS NOT NULL AND runner.model_id IS DISTINCT FROM run_model) THEN
      RAISE EXCEPTION 'run execution qualification runner-access evidence mismatch';
    END IF;
  END IF;

  IF NEW.execution_environment_id IS NOT NULL THEN
    SELECT * INTO environment
      FROM execution_environments
     WHERE id = NEW.execution_environment_id;

    IF environment.id IS NULL THEN
      RAISE EXCEPTION 'run execution qualification environment not found';
    END IF;

    IF NEW.execution_region IS DISTINCT FROM environment.region
       OR NEW.account_tier IS DISTINCT FROM environment.account_tier
       OR NEW.service_tier IS DISTINCT FROM environment.service_tier
       OR NEW.service_assurance IS DISTINCT FROM environment.service_assurance THEN
      RAISE EXCEPTION 'run execution qualification environment snapshot mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$run_execution_qualification$;

CREATE OR REPLACE VIEW run_execution_qualification AS
SELECT
  envelope.run_id,
  envelope.selected_at,
  envelope.execution_environment_id,
  environment.slug AS execution_environment_slug,
  envelope.execution_region,
  envelope.provider_policy_observation_id,
  policy.source_id AS provider_policy_source_id,
  policy.access_state AS provider_policy_access_state,
  envelope.runner_access_observation_id,
  runner.source_id AS runner_access_source_id,
  runner.access_state AS runner_access_state,
  envelope.account_tier,
  envelope.service_tier,
  envelope.requested_service_tier,
  outcome.returned_service_tier,
  envelope.service_assurance,
  envelope.caveats || COALESCE(outcome.caveats, '{}'::text[]) AS caveats,
  outcome.captured_at,
  envelope.created_at
FROM run_execution_qualification_envelopes envelope
LEFT JOIN execution_environments environment
  ON environment.id = envelope.execution_environment_id
LEFT JOIN provider_testability_observations policy
  ON policy.id = envelope.provider_policy_observation_id
LEFT JOIN provider_testability_observations runner
  ON runner.id = envelope.runner_access_observation_id
LEFT JOIN run_execution_qualification_outcomes outcome
  ON outcome.run_id = envelope.run_id;

COMMIT;

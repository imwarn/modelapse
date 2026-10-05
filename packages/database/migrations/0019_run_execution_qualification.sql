BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE run_execution_qualification_envelopes (
  run_id uuid PRIMARY KEY REFERENCES runs(id),
  selected_at timestamptz NOT NULL,
  execution_region text,
  provider_policy_observation_id uuid REFERENCES provider_testability_observations(id),
  runner_access_observation_id uuid REFERENCES provider_testability_observations(id),
  account_tier text,
  service_tier text,
  requested_service_tier text,
  service_assurance text NOT NULL DEFAULT 'unknown'
    CHECK (service_assurance IN (
      'documented_default',
      'documented_variant',
      'operator_uncertain',
      'unknown'
    )),
  caveats text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (execution_region IS NULL OR length(btrim(execution_region)) > 0),
  CHECK (account_tier IS NULL OR length(btrim(account_tier)) > 0),
  CHECK (service_tier IS NULL OR length(btrim(service_tier)) > 0),
  CHECK (requested_service_tier IS NULL OR length(btrim(requested_service_tier)) > 0)
);

CREATE TABLE run_execution_qualification_outcomes (
  run_id uuid PRIMARY KEY REFERENCES runs(id),
  returned_service_tier text,
  caveats text[] NOT NULL DEFAULT '{}'::text[],
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (returned_service_tier IS NULL OR length(btrim(returned_service_tier)) > 0)
);

CREATE OR REPLACE FUNCTION validate_run_execution_qualification_envelope()
RETURNS trigger LANGUAGE plpgsql AS $run_execution_qualification$
DECLARE
  run_provider uuid;
  run_model uuid;
  run_path execution_path;
  policy provider_testability_observations%ROWTYPE;
  runner provider_testability_observations%ROWTYPE;
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

  RETURN NEW;
END;
$run_execution_qualification$;

CREATE TRIGGER run_execution_qualification_envelopes_validate
BEFORE INSERT ON run_execution_qualification_envelopes
FOR EACH ROW EXECUTE FUNCTION validate_run_execution_qualification_envelope();

CREATE TRIGGER run_execution_qualification_envelopes_append_only
BEFORE UPDATE OR DELETE ON run_execution_qualification_envelopes
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER run_execution_qualification_outcomes_append_only
BEFORE UPDATE OR DELETE ON run_execution_qualification_outcomes
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX run_execution_qualification_provider_policy_idx
  ON run_execution_qualification_envelopes(provider_policy_observation_id)
  WHERE provider_policy_observation_id IS NOT NULL;

CREATE INDEX run_execution_qualification_runner_access_idx
  ON run_execution_qualification_envelopes(runner_access_observation_id)
  WHERE runner_access_observation_id IS NOT NULL;

CREATE VIEW run_execution_qualification AS
SELECT
  envelope.run_id,
  envelope.selected_at,
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
LEFT JOIN provider_testability_observations policy
  ON policy.id = envelope.provider_policy_observation_id
LEFT JOIN provider_testability_observations runner
  ON runner.id = envelope.runner_access_observation_id
LEFT JOIN run_execution_qualification_outcomes outcome
  ON outcome.run_id = envelope.run_id;

COMMIT;

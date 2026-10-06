BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE calibration_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE CHECK (length(btrim(version)) > 0),
  window_size integer NOT NULL DEFAULT 3
    CHECK (window_size BETWEEN 1 AND 20),
  repeated_anomaly_threshold integer NOT NULL DEFAULT 2
    CHECK (repeated_anomaly_threshold BETWEEN 1 AND 20),
  max_age_hours integer NOT NULL DEFAULT 24
    CHECK (max_age_hours BETWEEN 1 AND 720),
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (repeated_anomaly_threshold <= window_size)
);

CREATE TRIGGER calibration_policies_append_only
BEFORE UPDATE OR DELETE ON calibration_policies
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

INSERT INTO calibration_policies
  (
    version,
    window_size,
    repeated_anomaly_threshold,
    max_age_hours,
    actor,
    note
  )
VALUES (
  'calibration-v1',
  3,
  2,
  24,
  'archive-v0.22-migration',
  'Initial deterministic calibration policy: first anomaly requests repetition; two consecutive anomalies are repeated evidence.'
)
ON CONFLICT (version) DO NOTHING;

CREATE VIEW calibration_policy_current AS
SELECT *
FROM calibration_policies
ORDER BY created_at DESC, version DESC, id DESC
LIMIT 1;

CREATE TABLE calibration_run_assessments (
  run_id uuid PRIMARY KEY REFERENCES runs(id),
  policy_id uuid NOT NULL REFERENCES calibration_policies(id),
  status text NOT NULL
    CHECK (status IN ('pass', 'anomaly', 'unknown')),
  exact_match boolean,
  anomaly_streak integer NOT NULL DEFAULT 0 CHECK (anomaly_streak >= 0),
  repeated_anomaly boolean NOT NULL DEFAULT false,
  repeat_recommended boolean NOT NULL DEFAULT false,
  caveats text[] NOT NULL DEFAULT '{}'::text[],
  assessed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pass' AND exact_match IS TRUE AND anomaly_streak = 0 AND NOT repeated_anomaly)
    OR
    (status = 'anomaly' AND exact_match IS FALSE AND anomaly_streak >= 1)
    OR
    (status = 'unknown' AND exact_match IS NULL)
  ),
  CHECK (NOT repeated_anomaly OR anomaly_streak >= 2)
);

CREATE OR REPLACE FUNCTION validate_calibration_run_assessment()
RETURNS trigger LANGUAGE plpgsql AS $calibration_assessment$
DECLARE
  run_status_value run_status;
  run_sealed_at timestamptz;
  case_type_value test_case_type;
  evaluation_exact_match double precision;
BEGIN
  SELECT r.status, r.sealed_at, tc.case_type
    INTO run_status_value, run_sealed_at, case_type_value
    FROM runs r
    JOIN test_cases tc ON tc.id = r.test_case_id
   WHERE r.id = NEW.run_id;

  IF run_status_value IS NULL THEN
    RAISE EXCEPTION 'calibration assessment run not found';
  END IF;

  IF run_status_value <> 'completed' OR run_sealed_at IS NULL THEN
    RAISE EXCEPTION 'calibration assessment requires a sealed completed Run';
  END IF;

  IF case_type_value <> 'calibration' THEN
    RAISE EXCEPTION 'calibration assessment requires a calibration Test Case';
  END IF;

  SELECT mv.numeric_value
    INTO evaluation_exact_match
    FROM evaluations ev
    JOIN evaluators evaluator ON evaluator.id = ev.evaluator_id
    JOIN metric_values mv
      ON mv.evaluation_id = ev.id
     AND mv.metric_key = 'exact_match'
   WHERE ev.run_id = NEW.run_id
     AND ev.status = 'completed'
     AND evaluator.slug = 'exact-text'
   ORDER BY ev.created_at DESC
   LIMIT 1;

  IF evaluation_exact_match IS NULL THEN
    IF NEW.exact_match IS NOT NULL OR NEW.status <> 'unknown' THEN
      RAISE EXCEPTION 'calibration assessment cannot claim a result without exact-match evaluation';
    END IF;
  ELSIF NEW.exact_match IS DISTINCT FROM (evaluation_exact_match = 1) THEN
    RAISE EXCEPTION 'calibration assessment exact-match result conflicts with Evaluation';
  END IF;

  RETURN NEW;
END;
$calibration_assessment$;

CREATE TRIGGER calibration_run_assessments_validate
BEFORE INSERT ON calibration_run_assessments
FOR EACH ROW EXECUTE FUNCTION validate_calibration_run_assessment();

CREATE TRIGGER calibration_run_assessments_append_only
BEFORE UPDATE OR DELETE ON calibration_run_assessments
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX calibration_assessments_policy_idx
  ON calibration_run_assessments(policy_id, assessed_at DESC);

CREATE INDEX calibration_run_context_idx
  ON runs(provider_id, model_id, completed_at DESC)
  WHERE sealed_at IS NOT NULL;

CREATE VIEW calibration_service_health_current AS
SELECT DISTINCT ON (
  run.provider_id,
  run.model_id,
  qualification.execution_environment_id,
  run.test_case_id
)
  assessment.run_id,
  assessment.policy_id,
  policy.version AS policy_version,
  assessment.status,
  assessment.exact_match,
  assessment.anomaly_streak,
  assessment.repeated_anomaly,
  assessment.repeat_recommended,
  assessment.caveats,
  assessment.assessed_at,
  run.provider_id,
  run.model_id,
  run.test_case_id,
  run.execution_path,
  qualification.execution_environment_id,
  qualification.execution_environment_slug,
  qualification.execution_region,
  qualification.account_tier,
  qualification.service_tier,
  qualification.service_assurance,
  run.completed_at
FROM calibration_run_assessments assessment
JOIN calibration_policies policy ON policy.id = assessment.policy_id
JOIN runs run ON run.id = assessment.run_id
LEFT JOIN run_execution_qualification qualification
  ON qualification.run_id = run.id
ORDER BY
  run.provider_id,
  run.model_id,
  qualification.execution_environment_id,
  run.test_case_id,
  run.completed_at DESC,
  assessment.run_id DESC;

CREATE TABLE comparability_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE CHECK (length(btrim(version)) > 0),
  minimum_evidence_level evidence_level NOT NULL DEFAULT 'E4',
  require_same_execution_path boolean NOT NULL DEFAULT true,
  require_region boolean NOT NULL DEFAULT true,
  require_account_tier boolean NOT NULL DEFAULT true,
  require_service_tier boolean NOT NULL DEFAULT true,
  require_documented_service_assurance boolean NOT NULL DEFAULT true,
  reject_qualification_caveats boolean NOT NULL DEFAULT true,
  require_recent_calibration boolean NOT NULL DEFAULT false,
  reject_repeated_calibration_anomaly boolean NOT NULL DEFAULT true,
  calibration_max_age_hours integer NOT NULL DEFAULT 24
    CHECK (calibration_max_age_hours BETWEEN 1 AND 720),
  default_min_repeat_count integer NOT NULL DEFAULT 1
    CHECK (default_min_repeat_count BETWEEN 1 AND 20),
  unstable_min_repeat_count integer NOT NULL DEFAULT 3
    CHECK (unstable_min_repeat_count BETWEEN 1 AND 20),
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER comparability_policies_append_only
BEFORE UPDATE OR DELETE ON comparability_policies
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

INSERT INTO comparability_policies
  (
    version,
    minimum_evidence_level,
    require_same_execution_path,
    require_region,
    require_account_tier,
    require_service_tier,
    require_documented_service_assurance,
    reject_qualification_caveats,
    require_recent_calibration,
    reject_repeated_calibration_anomaly,
    calibration_max_age_hours,
    default_min_repeat_count,
    unstable_min_repeat_count,
    actor,
    note
  )
VALUES (
  'comparability-v1',
  'E4',
  true,
  true,
  true,
  true,
  true,
  true,
  false,
  true,
  24,
  1,
  3,
  'archive-v0.23-migration',
  'Strict execution qualification with optional calibration presence; repeated calibration anomalies exclude a Run from comparable sets.'
)
ON CONFLICT (version) DO NOTHING;

CREATE VIEW comparability_policy_current AS
SELECT *
FROM comparability_policies
ORDER BY created_at DESC, version DESC, id DESC
LIMIT 1;

COMMIT;

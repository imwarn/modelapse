BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE test_version_evaluators (
  test_version_id uuid PRIMARY KEY REFERENCES test_versions(id),
  evaluator_id uuid NOT NULL REFERENCES evaluators(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER test_version_evaluators_append_only
BEFORE UPDATE OR DELETE ON test_version_evaluators
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

INSERT INTO evaluators
  (slug, version, kind, definition_sha256)
VALUES
  (
    'exact-text',
    '1.0.0',
    'deterministic',
    '513621b96e389527409b735499aaa3f5c2d0d6bd438ffc752d3060fba066c7b5'
  )
ON CONFLICT (slug, version) DO NOTHING;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM evaluators
    WHERE slug = 'exact-text'
      AND version = '1.0.0'
      AND kind = 'deterministic'
      AND definition_sha256 =
        '513621b96e389527409b735499aaa3f5c2d0d6bd438ffc752d3060fba066c7b5'
  ) THEN
    RAISE EXCEPTION 'exact-text evaluator v1.0.0 conflicts with catalog';
  END IF;
END;
$verify$;

INSERT INTO test_version_evaluators (test_version_id, evaluator_id)
SELECT tv.id, e.id
FROM test_versions tv
JOIN test_variants tvar ON tvar.id = tv.variant_id
JOIN test_families tf ON tf.id = tvar.family_id
JOIN evaluators e
  ON e.slug = 'exact-text'
 AND e.version = '1.0.0'
WHERE tf.slug IN ('modelapse-direct-smoke', 'modelapse-smoke')
ON CONFLICT (test_version_id) DO NOTHING;

CREATE TRIGGER evaluations_append_only
BEFORE UPDATE OR DELETE ON evaluations
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TRIGGER metric_values_append_only
BEFORE UPDATE OR DELETE ON metric_values
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX evaluations_evaluator_created_idx
  ON evaluations (evaluator_id, created_at DESC);

COMMIT;

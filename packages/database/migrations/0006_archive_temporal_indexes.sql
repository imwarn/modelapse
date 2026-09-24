BEGIN;

SET search_path TO modelapse, public;

CREATE INDEX runs_model_test_sealed_completed_idx
  ON runs (model_id, test_case_id, completed_at DESC, created_at DESC)
  WHERE sealed_at IS NOT NULL;

CREATE INDEX run_relations_to_created_idx
  ON run_relations (to_run_id, created_at DESC);

COMMIT;

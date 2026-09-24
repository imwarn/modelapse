BEGIN;

SET search_path TO modelapse, public;

ALTER TABLE run_jobs
  DROP CONSTRAINT run_jobs_kind_check;

ALTER TABLE run_jobs
  ADD CONSTRAINT run_jobs_kind_check
  CHECK (kind IN ('openai_direct', 'deepseek_direct'));

COMMIT;

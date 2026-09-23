BEGIN;

SET search_path TO modelapse, public;

CREATE TYPE run_job_status AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed'
);

CREATE TABLE run_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind = 'openai_direct'),
  payload jsonb NOT NULL,
  status run_job_status NOT NULL DEFAULT 'queued',
  idempotency_key text UNIQUE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  worker_id text,
  run_id uuid REFERENCES runs(id),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 128),
  CHECK (
    (status = 'queued' AND worker_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
    OR
    (status = 'running' AND worker_id IS NOT NULL AND claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL)
    OR
    (status = 'succeeded' AND run_id IS NOT NULL AND completed_at IS NOT NULL AND worker_id IS NULL AND lease_expires_at IS NULL)
    OR
    (status = 'failed' AND completed_at IS NOT NULL AND worker_id IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX run_jobs_claim_idx
  ON run_jobs (available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX run_jobs_expired_lease_idx
  ON run_jobs (lease_expires_at)
  WHERE status = 'running';

CREATE INDEX run_jobs_run_idx
  ON run_jobs (run_id)
  WHERE run_id IS NOT NULL;

COMMIT;

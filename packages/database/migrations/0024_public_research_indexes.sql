BEGIN;

SET search_path TO modelapse, public;

-- Stable newest-first keyset traversal, including deterministic same-timestamp ties.
-- Calibration/visibility conditions are enforced by the query's Test Case join.
CREATE INDEX runs_research_sealed_completed_cursor_idx
  ON runs (completed_at DESC, id DESC)
  WHERE status = 'completed'
    AND sealed_at IS NOT NULL
    AND completed_at IS NOT NULL;

CREATE INDEX runs_research_provider_cursor_idx
  ON runs (provider_id, completed_at DESC, id DESC)
  WHERE status = 'completed'
    AND sealed_at IS NOT NULL
    AND completed_at IS NOT NULL;

COMMIT;

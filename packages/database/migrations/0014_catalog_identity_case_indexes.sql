BEGIN;

SET search_path TO modelapse, public;

CREATE INDEX catalog_discovery_candidates_resolved_model_idx
  ON catalog_discovery_candidates (resolved_model_id, last_seen_at DESC)
  WHERE resolved_model_id IS NOT NULL;

CREATE INDEX catalog_reconciliation_events_resolved_model_idx
  ON catalog_reconciliation_events (resolved_model_id, decided_at DESC, id DESC)
  WHERE resolved_model_id IS NOT NULL;

COMMIT;

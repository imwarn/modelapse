BEGIN;

SET search_path TO modelapse, public;

CREATE INDEX catalog_source_snapshots_source_record_idx
  ON catalog_source_snapshots (source_record_id);

CREATE INDEX catalog_discovery_observations_run_candidate_idx
  ON catalog_discovery_observations (collection_run_id, candidate_id);

CREATE INDEX alias_resolution_source_observed_idx
  ON alias_resolution_events (source_id, observed_at DESC, id DESC)
  WHERE source_id IS NOT NULL;

COMMIT;

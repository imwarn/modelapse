BEGIN;

SET search_path TO modelapse, public;

ALTER TABLE test_versions
  ADD COLUMN source_id uuid REFERENCES source_records(id);

UPDATE test_versions tv
   SET source_id = tf.canonical_source_id
  FROM test_variants tvar
  JOIN test_families tf ON tf.id = tvar.family_id
 WHERE tv.variant_id = tvar.id
   AND tv.source_id IS NULL
   AND tf.canonical_source_id IS NOT NULL;

CREATE INDEX alias_resolution_model_observed_idx
  ON alias_resolution_events (resolved_model_id, observed_at DESC)
  WHERE resolved_model_id IS NOT NULL;

CREATE INDEX alias_resolution_snapshot_observed_idx
  ON alias_resolution_events (resolved_snapshot_id, observed_at DESC)
  WHERE resolved_snapshot_id IS NOT NULL;

CREATE INDEX test_versions_variant_published_idx
  ON test_versions (variant_id, published_at DESC NULLS LAST, created_at DESC);

COMMIT;

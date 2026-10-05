BEGIN;

SET search_path TO modelapse, public;

CREATE INDEX catalog_presence_reviews_provider_remote_idx
  ON catalog_presence_reviews (provider_id, remote_model_id, occurred_at DESC);

COMMIT;

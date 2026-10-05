BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE catalog_presence_reviews (
  presence_event_id text PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES providers(id),
  observer_source_id uuid NOT NULL REFERENCES catalog_observer_sources(id),
  run_id uuid NOT NULL REFERENCES catalog_collection_runs(id),
  previous_complete_run_id uuid REFERENCES catalog_collection_runs(id),
  remote_model_id text NOT NULL CHECK (btrim(remote_model_id) <> ''),
  occurred_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'open' AND acknowledged_at IS NULL AND resolved_at IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL)
  )
);

CREATE TABLE catalog_presence_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_event_id text NOT NULL REFERENCES catalog_presence_reviews(presence_event_id),
  action text NOT NULL CHECK (action IN ('acknowledge', 'resolve', 'reopen')),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  note text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER catalog_presence_review_events_append_only
BEFORE UPDATE OR DELETE ON catalog_presence_review_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX catalog_presence_reviews_status_idx
  ON catalog_presence_reviews (status, updated_at DESC);

CREATE INDEX catalog_presence_reviews_provider_idx
  ON catalog_presence_reviews (provider_id, occurred_at DESC);

CREATE INDEX catalog_presence_review_events_presence_idx
  ON catalog_presence_review_events (presence_event_id, created_at DESC, id DESC);

COMMIT;

BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE catalog_identity_drift_reviews (
  drift_event_id text PRIMARY KEY,
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

CREATE TABLE catalog_identity_drift_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drift_event_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('acknowledge', 'resolve', 'reopen')),
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  note text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER catalog_identity_drift_review_events_append_only
BEFORE UPDATE OR DELETE ON catalog_identity_drift_review_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX catalog_identity_drift_review_events_drift_idx
  ON catalog_identity_drift_review_events (drift_event_id, created_at DESC, id DESC);

CREATE INDEX catalog_identity_drift_reviews_status_idx
  ON catalog_identity_drift_reviews (status, updated_at DESC);

COMMIT;

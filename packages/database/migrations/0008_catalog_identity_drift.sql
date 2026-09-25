BEGIN;

SET search_path TO modelapse, public;

CREATE TRIGGER alias_resolution_events_append_only
BEFORE UPDATE OR DELETE ON alias_resolution_events
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE OR REPLACE FUNCTION protect_model_execution_binding_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'model execution bindings cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.model_id IS DISTINCT FROM OLD.model_id
     OR NEW.endpoint_id IS DISTINCT FROM OLD.endpoint_id
     OR NEW.api_model_id IS DISTINCT FROM OLD.api_model_id
     OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
     OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.metadata IS DISTINCT FROM OLD.metadata
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'model execution binding identity is immutable';
  END IF;

  IF OLD.valid_to IS NOT NULL
     AND NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN
    RAISE EXCEPTION 'closed model execution bindings cannot be rewritten';
  END IF;

  IF OLD.valid_to IS NULL
     AND NEW.valid_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.valid_to IS NULL
     AND NEW.valid_to IS NOT NULL
     AND NEW.valid_to > OLD.valid_from THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'model execution binding may only be closed once';
END;
$$;

CREATE TRIGGER model_execution_bindings_history_guard
BEFORE UPDATE OR DELETE ON model_execution_bindings
FOR EACH ROW EXECUTE FUNCTION protect_model_execution_binding_history();

CREATE VIEW catalog_identity_drift_events AS
WITH alias_history AS (
  SELECT
    are.id AS current_record_id,
    are.alias_id,
    ma.provider_id,
    ma.alias,
    are.observed_at AS occurred_at,
    COALESCE(are.resolved_model_id, ms.model_id) AS current_model_id,
    are.resolved_snapshot_id AS current_snapshot_id,
    are.source_id AS current_source_id,
    lag(are.id) OVER alias_order AS previous_record_id,
    lag(COALESCE(are.resolved_model_id, ms.model_id)) OVER alias_order
      AS previous_model_id,
    lag(are.resolved_snapshot_id) OVER alias_order AS previous_snapshot_id,
    lag(are.source_id) OVER alias_order AS previous_source_id
  FROM alias_resolution_events are
  JOIN model_aliases ma ON ma.id = are.alias_id
  LEFT JOIN model_snapshots ms ON ms.id = are.resolved_snapshot_id
  WINDOW alias_order AS (
    PARTITION BY are.alias_id
    ORDER BY are.observed_at, are.id
  )
),
alias_changes AS (
  SELECT
    'alias:' || current_record_id::text AS event_id,
    'alias_target_changed'::text AS change_type,
    occurred_at,
    provider_id,
    alias_id,
    alias,
    previous_model_id,
    current_model_id,
    previous_snapshot_id,
    current_snapshot_id,
    NULL::uuid AS previous_endpoint_id,
    NULL::uuid AS current_endpoint_id,
    NULL::text AS previous_api_model_id,
    NULL::text AS current_api_model_id,
    previous_record_id,
    current_record_id,
    previous_source_id,
    current_source_id,
    array_remove(ARRAY[
      CASE
        WHEN previous_model_id IS DISTINCT FROM current_model_id
          THEN 'model'
      END,
      CASE
        WHEN previous_snapshot_id IS DISTINCT FROM current_snapshot_id
          THEN 'snapshot'
      END
    ], NULL)::text[] AS changed_fields
  FROM alias_history
  WHERE previous_record_id IS NOT NULL
    AND current_source_id IS NOT NULL
    AND (
      previous_model_id IS DISTINCT FROM current_model_id
      OR previous_snapshot_id IS DISTINCT FROM current_snapshot_id
    )
),
binding_history AS (
  SELECT
    meb.id AS current_record_id,
    m.provider_id,
    meb.model_id AS current_model_id,
    meb.snapshot_id AS current_snapshot_id,
    meb.endpoint_id AS current_endpoint_id,
    meb.api_model_id AS current_api_model_id,
    meb.source_id AS current_source_id,
    meb.valid_from AS occurred_at,
    pe.path,
    lag(meb.id) OVER binding_order AS previous_record_id,
    lag(meb.model_id) OVER binding_order AS previous_model_id,
    lag(meb.snapshot_id) OVER binding_order AS previous_snapshot_id,
    lag(meb.endpoint_id) OVER binding_order AS previous_endpoint_id,
    lag(meb.api_model_id) OVER binding_order AS previous_api_model_id,
    lag(meb.source_id) OVER binding_order AS previous_source_id,
    lag(meb.valid_to) OVER binding_order AS previous_valid_to
  FROM model_execution_bindings meb
  JOIN models m ON m.id = meb.model_id
  JOIN provider_endpoints pe ON pe.id = meb.endpoint_id
  WINDOW binding_order AS (
    PARTITION BY meb.model_id, pe.path
    ORDER BY meb.valid_from, meb.created_at, meb.id
  )
),
binding_changes AS (
  SELECT
    'binding:' || current_record_id::text AS event_id,
    'execution_binding_changed'::text AS change_type,
    occurred_at,
    provider_id,
    NULL::uuid AS alias_id,
    NULL::text AS alias,
    previous_model_id,
    current_model_id,
    previous_snapshot_id,
    current_snapshot_id,
    previous_endpoint_id,
    current_endpoint_id,
    previous_api_model_id,
    current_api_model_id,
    previous_record_id,
    current_record_id,
    previous_source_id,
    current_source_id,
    array_remove(ARRAY[
      CASE
        WHEN previous_endpoint_id IS DISTINCT FROM current_endpoint_id
          THEN 'endpoint'
      END,
      CASE
        WHEN previous_api_model_id IS DISTINCT FROM current_api_model_id
          THEN 'api_model'
      END,
      CASE
        WHEN previous_snapshot_id IS DISTINCT FROM current_snapshot_id
          THEN 'snapshot'
      END
    ], NULL)::text[] AS changed_fields
  FROM binding_history
  WHERE previous_record_id IS NOT NULL
    AND previous_valid_to IS NOT NULL
    AND previous_valid_to <= occurred_at
    AND (
      previous_endpoint_id IS DISTINCT FROM current_endpoint_id
      OR previous_api_model_id IS DISTINCT FROM current_api_model_id
      OR previous_snapshot_id IS DISTINCT FROM current_snapshot_id
    )
)
SELECT * FROM alias_changes
UNION ALL
SELECT * FROM binding_changes;

CREATE INDEX model_execution_bindings_model_validity_idx
  ON model_execution_bindings
    (model_id, valid_from ASC, created_at ASC);

COMMIT;

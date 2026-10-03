BEGIN;

SET search_path TO modelapse, public;

ALTER TABLE catalog_promotion_events
  ADD COLUMN policy_version text NOT NULL DEFAULT 'provider-catalog-v1'
    CHECK (btrim(policy_version) <> ''),
  ADD COLUMN evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION validate_catalog_promotion_event()
RETURNS trigger LANGUAGE plpgsql AS $catalog_promotion$
DECLARE
  candidate_provider uuid;
  candidate_status text;
  candidate_last_source uuid;
  model_provider uuid;
  model_source uuid;
  source_type_value text;
  source_url_value text;
  source_title_value text;
  source_sha_value text;
BEGIN
  SELECT provider_id, status, last_source_record_id
    INTO candidate_provider, candidate_status, candidate_last_source
  FROM catalog_discovery_candidates
  WHERE id = NEW.candidate_id;

  IF candidate_provider IS NULL THEN
    RAISE EXCEPTION 'catalog promotion references a missing candidate';
  END IF;

  IF candidate_status <> 'matched' THEN
    RAISE EXCEPTION 'catalog promotion candidate must be matched before event insertion';
  END IF;

  IF candidate_last_source IS DISTINCT FROM NEW.source_record_id THEN
    RAISE EXCEPTION 'catalog promotion must use the candidate latest source';
  END IF;

  SELECT provider_id, canonical_source_id
    INTO model_provider, model_source
  FROM models
  WHERE id = NEW.model_id;

  IF model_provider IS NULL OR model_provider <> candidate_provider THEN
    RAISE EXCEPTION 'catalog promotion model provider mismatch';
  END IF;

  IF model_source IS DISTINCT FROM NEW.source_record_id THEN
    RAISE EXCEPTION 'catalog promotion source must be the canonical model source';
  END IF;

  SELECT source_type, url, title, content_sha256
    INTO source_type_value, source_url_value, source_title_value, source_sha_value
  FROM source_records
  WHERE id = NEW.source_record_id;

  IF source_type_value IS DISTINCT FROM 'provider_catalog' THEN
    RAISE EXCEPTION 'catalog promotion requires provider_catalog evidence';
  END IF;

  IF source_url_value IS NULL OR source_title_value IS NULL THEN
    RAISE EXCEPTION 'catalog promotion requires URL-backed titled evidence';
  END IF;

  IF source_sha_value IS NULL OR source_sha_value !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'catalog promotion requires content-addressed evidence';
  END IF;

  IF NEW.policy_version <> 'provider-catalog-v1' THEN
    RAISE EXCEPTION 'unsupported catalog promotion policy version';
  END IF;

  IF NEW.evidence ->> 'sourceRecordId' IS DISTINCT FROM NEW.source_record_id::text
     OR NEW.evidence ->> 'sourceType' IS DISTINCT FROM source_type_value
     OR NEW.evidence ->> 'contentSha256' IS DISTINCT FROM source_sha_value THEN
    RAISE EXCEPTION 'catalog promotion evidence snapshot does not match source record';
  END IF;

  RETURN NEW;
END;
$catalog_promotion$;

COMMIT;

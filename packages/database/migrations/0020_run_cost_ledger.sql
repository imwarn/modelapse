BEGIN;

SET search_path TO modelapse, public;

CREATE TABLE run_cost_envelopes (
  run_id uuid PRIMARY KEY REFERENCES runs(id),
  selected_at timestamptz NOT NULL,
  pricing_observation_id uuid REFERENCES provider_testability_observations(id),
  pricing_currency char(3),
  input_price_per_million numeric(20,6),
  output_price_per_million numeric(20,6),
  request_price numeric(20,6),
  caveats text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pricing_currency IS NULL OR pricing_currency ~ '^[A-Z]{3}$'),
  CHECK (input_price_per_million IS NULL OR input_price_per_million >= 0),
  CHECK (output_price_per_million IS NULL OR output_price_per_million >= 0),
  CHECK (request_price IS NULL OR request_price >= 0)
);

CREATE OR REPLACE FUNCTION validate_run_cost_envelope()
RETURNS trigger LANGUAGE plpgsql AS $run_cost_envelope$
DECLARE
  run_provider uuid;
  run_model uuid;
  run_path execution_path;
  pricing provider_testability_observations%ROWTYPE;
BEGIN
  SELECT provider_id, model_id, execution_path
    INTO run_provider, run_model, run_path
    FROM runs
   WHERE id = NEW.run_id;

  IF run_provider IS NULL THEN
    RAISE EXCEPTION 'run cost envelope run not found';
  END IF;

  IF NEW.pricing_observation_id IS NULL THEN
    IF NEW.pricing_currency IS NOT NULL
       OR NEW.input_price_per_million IS NOT NULL
       OR NEW.output_price_per_million IS NOT NULL
       OR NEW.request_price IS NOT NULL THEN
      RAISE EXCEPTION 'run cost envelope cannot contain unsourced pricing';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO pricing
    FROM provider_testability_observations
   WHERE id = NEW.pricing_observation_id;

  IF pricing.id IS NULL
     OR pricing.provider_id <> run_provider
     OR pricing.execution_path <> run_path
     OR (pricing.model_id IS NOT NULL AND pricing.model_id IS DISTINCT FROM run_model)
     OR pricing.pricing_currency IS NULL THEN
    RAISE EXCEPTION 'run cost pricing evidence mismatch';
  END IF;

  IF NEW.pricing_currency IS DISTINCT FROM pricing.pricing_currency
     OR NEW.input_price_per_million IS DISTINCT FROM pricing.input_price_per_million
     OR NEW.output_price_per_million IS DISTINCT FROM pricing.output_price_per_million
     OR NEW.request_price IS DISTINCT FROM pricing.request_price THEN
    RAISE EXCEPTION 'run cost pricing snapshot does not match evidence';
  END IF;

  RETURN NEW;
END;
$run_cost_envelope$;

CREATE TRIGGER run_cost_envelopes_validate
BEFORE INSERT ON run_cost_envelopes
FOR EACH ROW EXECUTE FUNCTION validate_run_cost_envelope();

CREATE TRIGGER run_cost_envelopes_append_only
BEFORE UPDATE OR DELETE ON run_cost_envelopes
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE TABLE run_cost_facts (
  run_id uuid PRIMARY KEY REFERENCES runs(id),
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  request_count integer NOT NULL DEFAULT 1,
  native_currency char(3),
  estimated_native_cost numeric(24,10),
  caveats text[] NOT NULL DEFAULT '{}'::text[],
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (input_tokens IS NULL OR input_tokens >= 0),
  CHECK (output_tokens IS NULL OR output_tokens >= 0),
  CHECK (total_tokens IS NULL OR total_tokens >= 0),
  CHECK (request_count > 0),
  CHECK (native_currency IS NULL OR native_currency ~ '^[A-Z]{3}$'),
  CHECK (estimated_native_cost IS NULL OR estimated_native_cost >= 0)
);

CREATE OR REPLACE FUNCTION validate_run_cost_fact()
RETURNS trigger LANGUAGE plpgsql AS $run_cost_fact$
DECLARE
  run_state run_status;
  run_sealed_at timestamptz;
BEGIN
  SELECT status, sealed_at
    INTO run_state, run_sealed_at
    FROM runs
   WHERE id = NEW.run_id;

  IF run_state IS NULL THEN
    RAISE EXCEPTION 'run cost fact run not found';
  END IF;

  IF run_state <> 'completed' OR run_sealed_at IS NULL THEN
    RAISE EXCEPTION 'run cost fact requires a sealed completed run';
  END IF;

  RETURN NEW;
END;
$run_cost_fact$;

CREATE TRIGGER run_cost_facts_validate
BEFORE INSERT ON run_cost_facts
FOR EACH ROW EXECUTE FUNCTION validate_run_cost_fact();

CREATE TRIGGER run_cost_facts_append_only
BEFORE UPDATE OR DELETE ON run_cost_facts
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX run_cost_pricing_observation_idx
  ON run_cost_envelopes(pricing_observation_id)
  WHERE pricing_observation_id IS NOT NULL;

CREATE VIEW run_cost_ledger AS
SELECT
  envelope.run_id,
  envelope.selected_at,
  envelope.pricing_observation_id,
  pricing.source_id AS pricing_source_id,
  envelope.pricing_currency,
  envelope.input_price_per_million,
  envelope.output_price_per_million,
  envelope.request_price,
  fact.input_tokens,
  fact.output_tokens,
  fact.total_tokens,
  fact.request_count,
  fact.native_currency,
  fact.estimated_native_cost,
  envelope.caveats || COALESCE(fact.caveats, '{}'::text[]) AS caveats,
  fact.captured_at,
  envelope.created_at
FROM run_cost_envelopes envelope
LEFT JOIN provider_testability_observations pricing
  ON pricing.id = envelope.pricing_observation_id
LEFT JOIN run_cost_facts fact
  ON fact.run_id = envelope.run_id;

CREATE VIEW collection_cost_daily AS
SELECT
  date_trunc('day', run.completed_at) AS day,
  provider.id AS provider_id,
  provider.slug AS provider_slug,
  provider.name AS provider_name,
  fact.native_currency AS currency,
  count(*)::bigint AS completed_runs,
  count(*) FILTER (WHERE fact.estimated_native_cost IS NOT NULL)::bigint AS estimated_runs,
  count(*) FILTER (WHERE fact.estimated_native_cost IS NULL)::bigint AS unknown_cost_runs,
  COALESCE(sum(fact.estimated_native_cost), 0::numeric) AS estimated_native_cost
FROM runs run
JOIN providers provider ON provider.id = run.provider_id
JOIN run_cost_facts fact ON fact.run_id = run.id
WHERE run.status = 'completed'
  AND run.sealed_at IS NOT NULL
GROUP BY
  date_trunc('day', run.completed_at),
  provider.id,
  fact.native_currency;

CREATE TABLE collection_budget_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES providers(id),
  currency char(3) NOT NULL,
  period text NOT NULL CHECK (period IN ('day', 'month')),
  budget_amount numeric(24,10) NOT NULL CHECK (budget_amount > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE TRIGGER collection_budget_policies_append_only
BEFORE UPDATE OR DELETE ON collection_budget_policies
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

CREATE INDEX collection_budget_policy_lookup_idx
  ON collection_budget_policies(
    provider_id,
    currency,
    period,
    effective_from DESC,
    id DESC
  );

CREATE VIEW collection_budget_current AS
SELECT DISTINCT ON (provider_id, currency, period)
  *
FROM collection_budget_policies
WHERE effective_from <= now()
ORDER BY
  provider_id,
  currency,
  period,
  effective_from DESC,
  id DESC;

CREATE VIEW collection_budget_status AS
SELECT
  policy.id AS policy_id,
  policy.provider_id,
  provider.slug AS provider_slug,
  provider.name AS provider_name,
  policy.currency,
  policy.period,
  policy.budget_amount,
  policy.effective_from,
  date_trunc(policy.period, now()) AS period_start,
  COALESCE(spend.estimated_spend, 0::numeric) AS estimated_spend,
  COALESCE(spend.unknown_cost_runs, 0::bigint) AS unknown_cost_runs,
  policy.budget_amount - COALESCE(spend.estimated_spend, 0::numeric) AS remaining_budget
FROM collection_budget_current policy
LEFT JOIN providers provider ON provider.id = policy.provider_id
LEFT JOIN LATERAL (
  SELECT
    COALESCE(
      sum(fact.estimated_native_cost)
        FILTER (WHERE fact.native_currency = policy.currency),
      0::numeric
    ) AS estimated_spend,
    count(*) FILTER (
      WHERE fact.estimated_native_cost IS NULL
        AND (fact.native_currency = policy.currency OR fact.native_currency IS NULL)
    )::bigint AS unknown_cost_runs
  FROM runs run
  JOIN run_cost_facts fact ON fact.run_id = run.id
  WHERE run.status = 'completed'
    AND run.sealed_at IS NOT NULL
    AND run.completed_at >= date_trunc(policy.period, now())
    AND (policy.provider_id IS NULL OR run.provider_id = policy.provider_id)
) spend ON true;

COMMIT;

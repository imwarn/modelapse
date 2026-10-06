import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "@modelapse/database";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgProviderExpansion } from "../src/index.js";

const ADMIN_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

function databaseUrl(databaseName: string): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = "/" + databaseName;
  return url.toString();
}

describe("Provider Expansion Playbook", () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
  const databaseName =
    "modelapse_expansion_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const isolatedDatabaseUrl = databaseUrl(databaseName);
  let pool: Pool;
  let expansion: PgProviderExpansion;
  let providerId = "";
  let capabilitySourceId = "";

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    await migrateDatabase({
      connectionString: isolatedDatabaseUrl,
      migrationsDirectory: fileURLToPath(
        new URL("../../database/migrations/", import.meta.url),
      ),
      runnerBuild: "provider-expansion-integration",
    });
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    expansion = PgProviderExpansion.connect(isolatedDatabaseUrl, { max: 2 });

    const source = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.source_records
        (source_type, url, title, content_sha256)
       VALUES
        ('provider_docs', 'https://expansion.example.test/docs', 'Provider docs', $1),
        ('provider_catalog', 'https://expansion.example.test/models', 'Provider model list', $2),
        ('operator_verification', NULL, 'Runner verification', $3),
        ('modelapse_definition', 'https://github.com/imwarn/modelapse', 'Adapter definition', $4)
       RETURNING id`,
      [
        randomBytes(32).toString("hex"),
        randomBytes(32).toString("hex"),
        randomBytes(32).toString("hex"),
        randomBytes(32).toString("hex"),
      ],
    );
    const [docsSource, catalogSource, runnerSource, capabilitySource] =
      source.rows;
    capabilitySourceId = capabilitySource!.id;

    const provider = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.providers (slug, name, homepage)
       VALUES ('expansion-fixture', 'Expansion Fixture', 'https://expansion.example.test/')
       RETURNING id`,
    );
    providerId = provider.rows[0]!.id;

    const endpoint = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.provider_endpoints
        (provider_id, path, base_url, hostname, valid_from, source_id)
       VALUES (
         $1,
         'first_party_direct',
         'https://api.expansion.example.test',
         'api.expansion.example.test',
         '2026-08-01T00:00:00Z',
         $2
       )
       RETURNING id`,
      [providerId, docsSource!.id],
    );

    const model = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.models
        (
          provider_id,
          canonical_slug,
          marketing_name,
          status,
          canonical_source_id
        )
       VALUES ($1, 'expansion-model', 'Expansion Model', 'active', $2)
       RETURNING id`,
      [providerId, docsSource!.id],
    );
    const modelId = model.rows[0]!.id;

    await pool.query(
      `INSERT INTO modelapse.model_execution_bindings
        (
          model_id,
          endpoint_id,
          api_model_id,
          valid_from,
          source_id
        )
       VALUES ($1, $2, 'expansion-model', '2026-08-01T00:00:00Z', $3)`,
      [modelId, endpoint.rows[0]!.id, docsSource!.id],
    );

    const observer = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.catalog_observer_sources
        (
          provider_id,
          source_key,
          source_kind,
          url,
          title,
          parser,
          interval_seconds,
          enabled
        )
       VALUES (
         $1,
         'models',
         'model_list',
         'https://api.expansion.example.test/models',
         'Expansion model list',
         'openai_models',
         3600,
         true
       )
       RETURNING id`,
      [providerId],
    );
    const collection = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.catalog_collection_runs
        (
          observer_source_id,
          status,
          started_at,
          completed_at,
          item_count,
          observations_emitted,
          collector_build
        )
       VALUES (
         $1,
         'succeeded',
         '2026-09-01T00:00:00Z',
         '2026-09-01T00:00:01Z',
         1,
         1,
         'provider-expansion-test'
       )
       RETURNING id`,
      [observer.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO modelapse.catalog_source_snapshots
        (
          observer_source_id,
          collection_run_id,
          source_record_id,
          retrieved_at,
          content_sha256,
          response_body
        )
       VALUES ($1, $2, $3, '2026-09-01T00:00:01Z', $4, '{"data":[]}'::text)`,
      [
        observer.rows[0]!.id,
        collection.rows[0]!.id,
        catalogSource!.id,
        randomBytes(32).toString("hex"),
      ],
    );

    const providerPolicy = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.provider_testability_observations
        (
          provider_id,
          execution_path,
          subject_kind,
          access_state,
          registration_requirement,
          billing_requirement,
          region_policy,
          allowed_regions,
          service_assurance,
          pricing_currency,
          input_price_per_million,
          output_price_per_million,
          source_id,
          observed_at,
          actor
        )
       VALUES (
         $1,
         'first_party_direct',
         'provider_policy',
         'available',
         'open_signup',
         'paid_account',
         'unrestricted',
         ARRAY['US'],
         'documented_default',
         'USD',
         1.000000,
         2.000000,
         $2,
         '2026-09-01T00:10:00Z',
         'provider-expansion-test'
       )
       RETURNING id`,
      [providerId, docsSource!.id],
    );

    await pool.query(
      `INSERT INTO modelapse.provider_testability_observations
        (
          provider_id,
          execution_path,
          subject_kind,
          access_state,
          registration_requirement,
          billing_requirement,
          region_policy,
          allowed_regions,
          account_tier,
          service_tier,
          service_assurance,
          source_id,
          observed_at,
          actor
        )
       VALUES (
         $1,
         'first_party_direct',
         'runner_access',
         'available',
         'open_signup',
         'paid_account',
         'unrestricted',
         ARRAY['US'],
         'paid-standard',
         'default',
         'documented_default',
         $2,
         '2026-09-01T00:11:00Z',
         'provider-expansion-test'
       )`,
      [providerId, runnerSource!.id],
    );

    const environment = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.execution_environments
        (
          slug,
          region,
          account_tier,
          service_tier,
          service_assurance,
          created_by
        )
       VALUES (
         'expansion-us-paid',
         'US',
         'paid-standard',
         'default',
         'documented_default',
         'provider-expansion-test'
       )
       RETURNING id`,
    );
    await pool.query(
      `INSERT INTO modelapse.execution_environment_state_events
        (environment_id, enabled, effective_at, actor)
       VALUES ($1, true, '2026-09-01T00:12:00Z', 'provider-expansion-test')`,
      [environment.rows[0]!.id],
    );
    const fleetCapability = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.execution_environment_capability_events
        (
          environment_id,
          provider_id,
          execution_path,
          enabled,
          selection_priority,
          effective_at,
          actor
        )
       VALUES (
         $1,
         $2,
         'first_party_direct',
         true,
         10,
         '2026-09-01T00:12:00Z',
         'provider-expansion-test'
       )
       RETURNING id`,
      [environment.rows[0]!.id, providerId],
    );

    const promptSha = randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO modelapse.blobs
        (sha256, size_bytes, mime_type, object_key, visibility)
       VALUES ($1, 1, 'text/plain', $2, 'public')`,
      [promptSha, "provider-expansion/" + promptSha],
    );

    const family = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_families
        (slug, name, origin, canonical_source_id)
       VALUES ('provider-expansion-fixture', 'Provider Expansion Fixture', 'modelapse', $1)
       RETURNING id`,
      [docsSource!.id],
    );
    const benchmarkVariant = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_variants
        (family_id, slug, name, category, artifact_type)
       VALUES ($1, 'benchmark', 'Benchmark', 'smoke', 'text')
       RETURNING id`,
      [family.rows[0]!.id],
    );
    const benchmarkVersion = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_versions
        (variant_id, version, status, definition_sha256, source_id)
       VALUES ($1, '1.0.0', 'draft', $2, $3)
       RETURNING id`,
      [
        benchmarkVariant.rows[0]!.id,
        randomBytes(32).toString("hex"),
        docsSource!.id,
      ],
    );
    const benchmarkCase = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_cases
        (
          test_version_id,
          slug,
          case_type,
          visibility,
          status,
          prompt_blob_sha256
        )
       VALUES ($1, 'smoke', 'public', 'public', 'active', $2)
       RETURNING id`,
      [benchmarkVersion.rows[0]!.id, promptSha],
    );
    await pool.query(
      `UPDATE modelapse.test_versions
          SET status = 'published',
              published_at = '2026-09-01T00:13:00Z'
        WHERE id = $1`,
      [benchmarkVersion.rows[0]!.id],
    );

    const directRun = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.runs
        (
          test_case_id,
          model_id,
          provider_id,
          execution_path,
          requested_model,
          returned_model,
          status,
          runner_build,
          started_at,
          completed_at,
          sealed_at
        )
       VALUES (
         $1,
         $2,
         $3,
         'first_party_direct',
         'expansion-model',
         'expansion-model',
         'completed',
         'provider-expansion-test',
         '2026-09-01T00:20:00Z',
         '2026-09-01T00:20:01Z',
         '2026-09-01T00:20:02Z'
       )
       RETURNING id`,
      [benchmarkCase.rows[0]!.id, modelId, providerId],
    );
    const directRunId = directRun.rows[0]!.id;
    await pool.query(
      `INSERT INTO modelapse.run_execution_qualification_envelopes
        (
          run_id,
          selected_at,
          execution_environment_id,
          execution_capability_event_id,
          execution_region,
          provider_policy_observation_id,
          account_tier,
          service_tier,
          requested_service_tier,
          service_assurance,
          caveats
        )
       VALUES (
         $1,
         '2026-09-01T00:19:59Z',
         $2,
         $3,
         'US',
         $4,
         'paid-standard',
         'default',
         'default',
         'documented_default',
         '{}'::text[]
       )`,
      [
        directRunId,
        environment.rows[0]!.id,
        fleetCapability.rows[0]!.id,
        providerPolicy.rows[0]!.id,
      ],
    );
    await pool.query(
      `INSERT INTO modelapse.run_execution_qualification_outcomes
        (run_id, returned_service_tier, captured_at)
       VALUES ($1, 'default', '2026-09-01T00:20:01Z')`,
      [directRunId],
    );
    await pool.query(
      `INSERT INTO modelapse.provider_run_metadata
        (
          run_id,
          provider_request_id,
          provider_response_id,
          usage,
          timing,
          metadata
        )
       VALUES (
         $1,
         'req-expansion',
         'resp-expansion',
         '{"inputTokens":4,"outputTokens":1,"totalTokens":5}'::jsonb,
         '{"durationMs":1}'::jsonb,
         '{"serviceTier":"default"}'::jsonb
       )`,
      [directRunId],
    );
    await pool.query(
      `INSERT INTO modelapse.evidence_records
        (run_id, level, execution_path, collector)
       VALUES ($1, 'E4', 'first_party_direct', 'provider-expansion-test')`,
      [directRunId],
    );

    const calibrationVariant = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_variants
        (family_id, slug, name, category, artifact_type)
       VALUES ($1, 'calibration', 'Calibration', 'calibration', 'text')
       RETURNING id`,
      [family.rows[0]!.id],
    );
    const calibrationVersion = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_versions
        (variant_id, version, status, definition_sha256, source_id)
       VALUES ($1, '1.0.0', 'draft', $2, $3)
       RETURNING id`,
      [
        calibrationVariant.rows[0]!.id,
        randomBytes(32).toString("hex"),
        docsSource!.id,
      ],
    );
    const calibrationCase = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_cases
        (
          test_version_id,
          slug,
          case_type,
          visibility,
          status,
          prompt_blob_sha256,
          metadata
        )
       VALUES (
         $1,
         'service-health',
         'calibration',
         'public',
         'active',
         $2,
         '{"expected":"ok","assertion":"exact-text","leaderboardEligible":false}'::jsonb
       )
       RETURNING id`,
      [calibrationVersion.rows[0]!.id, promptSha],
    );
    const evaluator = await pool.query<{ id: string }>(
      `SELECT id
         FROM modelapse.evaluators
        WHERE slug = 'exact-text'
          AND version = '1.0.0'
        LIMIT 1`,
    );
    await pool.query(
      `INSERT INTO modelapse.test_version_evaluators
        (test_version_id, evaluator_id)
       VALUES ($1, $2)`,
      [calibrationVersion.rows[0]!.id, evaluator.rows[0]!.id],
    );
    await pool.query(
      `UPDATE modelapse.test_versions
          SET status = 'published',
              published_at = '2026-09-01T00:21:00Z'
        WHERE id = $1`,
      [calibrationVersion.rows[0]!.id],
    );

    const calibrationRun = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.runs
        (
          test_case_id,
          model_id,
          provider_id,
          execution_path,
          requested_model,
          returned_model,
          status,
          runner_build,
          started_at,
          completed_at,
          sealed_at
        )
       VALUES (
         $1,
         $2,
         $3,
         'first_party_direct',
         'expansion-model',
         'expansion-model',
         'completed',
         'provider-expansion-test',
         '2026-09-01T00:22:00Z',
         '2026-09-01T00:22:01Z',
         '2026-09-01T00:22:02Z'
       )
       RETURNING id`,
      [calibrationCase.rows[0]!.id, modelId, providerId],
    );
    const calibrationRunId = calibrationRun.rows[0]!.id;
    const evaluation = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.evaluations
        (
          run_id,
          evaluator_id,
          status,
          started_at,
          completed_at
        )
       VALUES (
         $1,
         $2,
         'completed',
         '2026-09-01T00:22:01Z',
         '2026-09-01T00:22:01Z'
       )
       RETURNING id`,
      [calibrationRunId, evaluator.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO modelapse.metric_values
        (evaluation_id, metric_key, numeric_value)
       VALUES ($1, 'exact_match', 1)`,
      [evaluation.rows[0]!.id],
    );
    const calibrationPolicy = await pool.query<{ id: string }>(
      `SELECT id
         FROM modelapse.calibration_policies
        WHERE version = 'calibration-v1'`,
    );
    await pool.query(
      `INSERT INTO modelapse.calibration_run_assessments
        (
          run_id,
          policy_id,
          status,
          exact_match,
          anomaly_streak,
          repeated_anomaly,
          repeat_recommended,
          assessed_at
        )
       VALUES (
         $1,
         $2,
         'pass',
         true,
         0,
         false,
         false,
         '2026-09-01T00:22:02Z'
       )`,
      [calibrationRunId, calibrationPolicy.rows[0]!.id],
    );
  });

  afterAll(async () => {
    await expansion?.close();
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
  });

  it("starts incomplete, then becomes limited only by an explicit unsupported capability", async () => {
    const initial = await expansion.getProvider(providerId);
    expect(initial).not.toBeNull();
    expect(initial).toMatchObject({
      policyVersion: "provider-expansion-v1",
      status: "incomplete",
      activeModelCount: 1,
      latestCalibration: {
        status: "pass",
        repeatedAnomaly: false,
      },
    });
    expect(initial!.blockers).toEqual(
      expect.arrayContaining([
        "capability_declaration_missing:returned_model_metadata",
        "capability_declaration_missing:model_version_metadata",
        "capability_declaration_missing:provider_request_id",
        "capability_declaration_missing:provider_response_id",
        "capability_declaration_missing:service_tier_metadata",
        "capability_declaration_missing:token_usage",
      ]),
    );

    const declarations = [
      ["returned_model_metadata", "supported"],
      ["model_version_metadata", "unsupported"],
      ["provider_request_id", "supported"],
      ["provider_response_id", "supported"],
      ["service_tier_metadata", "supported"],
      ["token_usage", "supported"],
    ] as const;

    for (const [capability, supportState] of declarations) {
      await expansion.recordCapability({
        providerId,
        capability,
        supportState,
        sourceId: capabilitySourceId,
        actor: "provider-expansion-test",
      });
    }

    const limited = await expansion.getProvider(providerId);
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe("limited");
    expect(limited!.blockers).toEqual([]);
    expect(limited!.caveats).toContain(
      "capability_explicitly_unsupported:model_version_metadata",
    );
    expect(
      limited!.capabilities.find(
        (item) => item.capability === "returned_model_metadata",
      ),
    ).toMatchObject({
      supportState: "supported",
      observed: true,
    });
    expect(
      limited!.capabilities.find(
        (item) => item.capability === "service_tier_metadata",
      ),
    ).toMatchObject({
      supportState: "supported",
      observed: true,
    });
  });

  it("supports versioned playbook policies without rewriting old declarations", async () => {
    const policy = await expansion.recordPolicy({
      version: "provider-expansion-fixture-v2",
      requiredCapabilities: [
        "returned_model_metadata",
        "provider_request_id",
        "provider_response_id",
        "service_tier_metadata",
        "token_usage",
      ],
      requireIdentityProvenance: true,
      requireCatalogCollection: true,
      requireProviderPolicy: true,
      requirePricingEvidence: true,
      requireRunnerContext: true,
      requireDirectRun: true,
      requireCalibration: true,
      actor: "provider-expansion-test",
      note: "Fixture policy excludes model version capture.",
    });

    const ready = await expansion.getProvider(providerId, policy.version);
    expect(ready).not.toBeNull();
    expect(ready).toMatchObject({
      policyVersion: "provider-expansion-fixture-v2",
      status: "ready",
      blockers: [],
      caveats: [],
    });

    const listed = await expansion.listProviders(policy.version);
    expect(
      listed.find((item) => item.provider.id === providerId),
    ).toMatchObject({
      status: "ready",
      blockerCount: 0,
      caveatCount: 0,
    });

    const capabilityEvent = await pool.query<{ id: string }>(
      `SELECT id
         FROM modelapse.provider_capability_events
        WHERE provider_id = $1
        ORDER BY created_at
        LIMIT 1`,
      [providerId],
    );
    await expect(
      pool.query(
        `UPDATE modelapse.provider_capability_events
            SET note = 'rewritten'
          WHERE id = $1`,
        [capabilityEvent.rows[0]!.id],
      ),
    ).rejects.toThrow(/append-only/i);

    await expect(
      pool.query(
        `UPDATE modelapse.provider_expansion_policies
            SET note = 'rewritten'
          WHERE id = $1`,
        [policy.id],
      ),
    ).rejects.toThrow(/append-only/i);
  });
});

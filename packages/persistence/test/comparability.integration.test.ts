import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  PgArchiveRepository,
  PgComparabilityRepository,
} from "../src/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

describe("Archive comparability policy", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const archive = PgArchiveRepository.connect(DATABASE_URL, { max: 2 });
  const policies = PgComparabilityRepository.connect(DATABASE_URL, { max: 2 });

  afterAll(async () => {
    await archive.close();
    await policies.close();
    await pool.end();
  });

  it("forms matched sets, excludes repeated canary anomalies, and detects context mismatch", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
    const source = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.source_records
        (source_type, url, title, content_sha256)
       VALUES (
         'modelapse_definition',
         $1,
         'Comparability integration source',
         $2
       )
       RETURNING id`,
      [
        "https://comparability.example.test/" + suffix,
        randomBytes(32).toString("hex"),
      ],
    );
    const sourceId = source.rows[0]!.id;

    const providers: string[] = [];
    const models: string[] = [];
    for (const index of [1, 2]) {
      const provider = await pool.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ($1, $2)
         RETURNING id`,
        [
          "comparability-provider-" + suffix + "-" + index,
          "Comparability Provider " + index,
        ],
      );
      providers.push(provider.rows[0]!.id);

      const model = await pool.query<{ id: string }>(
        `INSERT INTO modelapse.models
          (
            provider_id,
            canonical_slug,
            marketing_name,
            status,
            canonical_source_id
          )
         VALUES ($1, $2, $3, 'active', $4)
         RETURNING id`,
        [
          provider.rows[0]!.id,
          "comparability-model-" + suffix + "-" + index,
          "Comparability Model " + index,
          sourceId,
        ],
      );
      models.push(model.rows[0]!.id);
    }

    const promptSha = randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO modelapse.blobs
        (sha256, size_bytes, mime_type, object_key, visibility)
       VALUES ($1, 1, 'text/plain', $2, 'public')`,
      [promptSha, "comparability/" + promptSha],
    );

    const family = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_families
        (slug, name, origin, canonical_source_id)
       VALUES ($1, 'Comparability Integration', 'modelapse', $2)
       RETURNING id`,
      ["comparability-" + suffix, sourceId],
    );
    const variant = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_variants
        (family_id, slug, name, category, artifact_type)
       VALUES ($1, 'exact', 'Exact', 'benchmark', 'text')
       RETURNING id`,
      [family.rows[0]!.id],
    );
    const version = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_versions
        (
          variant_id,
          version,
          status,
          definition_sha256,
          source_id
        )
       VALUES ($1, '1.0.0', 'draft', $2, $3)
       RETURNING id`,
      [
        variant.rows[0]!.id,
        randomBytes(32).toString("hex"),
        sourceId,
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
          prompt_blob_sha256,
          metadata
        )
       VALUES (
         $1,
         'benchmark',
         'public',
         'public',
         'active',
         $2,
         '{"comparabilityMinRepeats":1}'::jsonb
       )
       RETURNING id`,
      [version.rows[0]!.id, promptSha],
    );
    await pool.query(
      `UPDATE modelapse.test_versions
          SET status = 'published',
              published_at = now()
        WHERE id = $1`,
      [version.rows[0]!.id],
    );

    const calibrationVariant = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_variants
        (family_id, slug, name, category, artifact_type)
       VALUES ($1, 'canary', 'Canary', 'calibration', 'text')
       RETURNING id`,
      [family.rows[0]!.id],
    );
    const calibrationVersion = await pool.query<{ id: string }>(
      `INSERT INTO modelapse.test_versions
        (
          variant_id,
          version,
          status,
          definition_sha256,
          source_id
        )
       VALUES ($1, '1.0.0', 'draft', $2, $3)
       RETURNING id`,
      [
        calibrationVariant.rows[0]!.id,
        randomBytes(32).toString("hex"),
        sourceId,
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
    await pool.query(
      `UPDATE modelapse.test_versions
          SET status = 'published',
              published_at = now()
        WHERE id = $1`,
      [calibrationVersion.rows[0]!.id],
    );

    const createBenchmarkRun = async (input: {
      modelIndex: 0 | 1;
      region: string;
      completedAt: string;
    }): Promise<string> => {
      const run = await pool.query<{ id: string }>(
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
           $4,
           $4,
           'completed',
           'comparability-integration',
           $5::timestamptz - interval '1 second',
           $5,
           $5::timestamptz + interval '1 second'
         )
         RETURNING id`,
        [
          benchmarkCase.rows[0]!.id,
          models[input.modelIndex],
          providers[input.modelIndex],
          "comparability-model-" + suffix + "-" + (input.modelIndex + 1),
          input.completedAt,
        ],
      );
      const runId = run.rows[0]!.id;
      await pool.query(
        `INSERT INTO modelapse.run_execution_qualification_envelopes
          (
            run_id,
            selected_at,
            execution_region,
            account_tier,
            service_tier,
            service_assurance,
            caveats
          )
         VALUES (
           $1,
           $2,
           $3,
           'paid-standard',
           'default',
           'documented_default',
           '{}'::text[]
         )`,
        [runId, input.completedAt, input.region],
      );
      await pool.query(
        `INSERT INTO modelapse.evidence_records
          (run_id, level, execution_path, collector)
         VALUES ($1, 'E4', 'first_party_direct', 'comparability-integration')`,
        [runId],
      );
      return runId;
    };

    await createBenchmarkRun({
      modelIndex: 0,
      region: "US",
      completedAt: "2099-10-01T12:00:00Z",
    });
    await createBenchmarkRun({
      modelIndex: 1,
      region: "US",
      completedAt: "2099-10-01T12:00:10Z",
    });

    const matched = await archive.compareLatest({
      modelIds: models,
      testCaseId: benchmarkCase.rows[0]!.id,
      policyVersion: "comparability-v1",
    });
    expect(matched).toMatchObject({
      policy: { version: "comparability-v1" },
      comparabilitySet: {
        status: "matched",
        reasons: [],
      },
      rows: [
        {
          comparability: {
            status: "eligible",
            repeatCount: 1,
            requiredRepeatCount: 1,
          },
        },
        {
          comparability: {
            status: "eligible",
            repeatCount: 1,
            requiredRepeatCount: 1,
          },
        },
      ],
    });
    expect(matched?.comparabilitySet.key).toMatch(/^[0-9a-f]{64}$/);

    const evaluator = await pool.query<{ id: string }>(
      `SELECT id
         FROM modelapse.evaluators
        WHERE slug = 'exact-text'
          AND version = '1.0.0'
        LIMIT 1`,
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
         $4,
         $4,
         'completed',
         'comparability-canary',
         '2099-10-01T11:58:59Z',
         '2099-10-01T11:59:00Z',
         '2099-10-01T11:59:01Z'
       )
       RETURNING id`,
      [
        calibrationCase.rows[0]!.id,
        models[0],
        providers[0],
        "comparability-model-" + suffix + "-1",
      ],
    );
    const calibrationRunId = calibrationRun.rows[0]!.id;
    await pool.query(
      `INSERT INTO modelapse.run_execution_qualification_envelopes
        (
          run_id,
          selected_at,
          execution_region,
          account_tier,
          service_tier,
          service_assurance,
          caveats
        )
       VALUES (
         $1,
         '2099-10-01T11:58:58Z',
         'US',
         'paid-standard',
         'default',
         'documented_default',
         '{}'::text[]
       )`,
      [calibrationRunId],
    );
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
         '2099-10-01T11:59:00Z',
         '2099-10-01T11:59:00Z'
       )
       RETURNING id`,
      [calibrationRunId, evaluator.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO modelapse.metric_values
        (evaluation_id, metric_key, numeric_value)
       VALUES ($1, 'exact_match', 0)`,
      [evaluation.rows[0]!.id],
    );
    const calibrationPolicy = await pool.query<{ id: string }>(
      `SELECT id
         FROM modelapse.calibration_policies
        WHERE version = 'calibration-v1'
        LIMIT 1`,
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
         'anomaly',
         false,
         2,
         true,
         true,
         '2099-10-01T11:59:02Z'
       )`,
      [calibrationRunId, calibrationPolicy.rows[0]!.id],
    );

    const anomalyExcluded = await archive.compareLatest({
      modelIds: models,
      testCaseId: benchmarkCase.rows[0]!.id,
      policyVersion: "comparability-v1",
    });
    expect(anomalyExcluded?.comparabilitySet.status).toBe("mismatched");
    expect(anomalyExcluded?.comparabilitySet.reasons).toContain(
      "run_ineligible_under_policy",
    );
    expect(anomalyExcluded?.rows[0]?.comparability).toMatchObject({
      status: "ineligible",
      reasons: expect.arrayContaining(["repeated_calibration_anomaly"]),
      calibration: {
        runId: calibrationRunId,
        repeatedAnomaly: true,
        anomalyStreak: 2,
      },
    });

    await createBenchmarkRun({
      modelIndex: 1,
      region: "JP",
      completedAt: "2099-10-01T12:01:00Z",
    });

    const regionMismatch = await archive.compareLatest({
      modelIds: models,
      testCaseId: benchmarkCase.rows[0]!.id,
      policyVersion: "comparability-v1",
    });
    expect(regionMismatch?.comparabilitySet.status).toBe("mismatched");
    expect(regionMismatch?.comparabilitySet.reasons).toContain("region_mismatch");

    const custom = await policies.recordPolicy({
      version: "comparability-integration-" + suffix,
      minimumEvidenceLevel: "E4",
      requireSameExecutionPath: true,
      requireRegion: true,
      requireAccountTier: true,
      requireServiceTier: true,
      requireDocumentedServiceAssurance: true,
      rejectQualificationCaveats: true,
      requireRecentCalibration: false,
      rejectRepeatedCalibrationAnomaly: true,
      calibrationMaxAgeHours: 24,
      defaultMinRepeatCount: 1,
      unstableMinRepeatCount: 3,
      actor: "comparability-integration",
    });
    expect(custom.version).toBe("comparability-integration-" + suffix);

    await expect(
      pool.query(
        `UPDATE modelapse.comparability_policies
            SET note = 'rewritten'
          WHERE id = $1`,
        [custom.id],
      ),
    ).rejects.toThrow(/append-only/i);
  });
});

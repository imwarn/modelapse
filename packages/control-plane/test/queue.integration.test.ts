import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  IdempotencyConflictError,
  PgRunJobQueue,
  PgRunPlanner,
} from "../src/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

describe("PostgreSQL Run job queue", () => {
  const queue = PgRunJobQueue.connect(DATABASE_URL, { max: 2 });

  afterAll(async () => {
    await queue.close();
  });

  it("surfaces provider-policy and runner-access evidence without blocking runnable models", async () => {
    const verification = new Pool({ connectionString: DATABASE_URL });
    const planner = PgRunPlanner.connect(DATABASE_URL, { max: 2 });
    try {
      const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
      const source = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.source_records
          (source_type, url, title, content_sha256)
         VALUES (
           'provider_docs',
           'https://planner-test.example.test/' || $1,
           'Planner test source ' || $1,
           $2
         )
         RETURNING id`,
        [suffix, "e".repeat(64)],
      );
      const sourceId = source.rows[0]!.id;

      const provider = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.providers (slug, name)
         VALUES ('deepseek', 'DeepSeek')
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
      );
      const providerId = provider.rows[0]!.id;

      const endpoint = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.provider_endpoints
          (provider_id, path, base_url, hostname, source_id)
         VALUES (
           $1,
           'first_party_direct',
           $2,
           'api.deepseek.com',
           $3
         )
         RETURNING id`,
        [
          providerId,
          "https://api.deepseek.com/planner-test-" + suffix,
          sourceId,
        ],
      );

      const model = await verification.query<{ id: string }>(
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
          providerId,
          "planner-test-" + suffix,
          "Planner Test " + suffix,
          sourceId,
        ],
      );
      const modelId = model.rows[0]!.id;

      await verification.query(
        `INSERT INTO modelapse.model_execution_bindings
          (model_id, endpoint_id, api_model_id, source_id)
         VALUES ($1, $2, $3, $4)`,
        [modelId, endpoint.rows[0]!.id, "planner-test-" + suffix, sourceId],
      );

      await verification.query(
        `INSERT INTO modelapse.provider_testability_observations
          (
            provider_id,
            execution_path,
            subject_kind,
            access_state,
            registration_requirement,
            billing_requirement,
            region_policy,
            service_assurance,
            source_id,
            observed_at,
            actor
          )
         VALUES (
           $1,
           'first_party_direct',
           'provider_policy',
           'restricted',
           'restricted_signup',
           'paid_account',
           'restricted',
           'documented_variant',
           $2,
           '2099-09-01T00:00:00Z',
           'planner-test'
         )`,
        [providerId, sourceId],
      );

      await verification.query(
        `INSERT INTO modelapse.provider_testability_observations
          (
            provider_id,
            model_id,
            execution_path,
            subject_kind,
            access_state,
            account_tier,
            service_tier,
            service_assurance,
            source_id,
            observed_at,
            actor
          )
         VALUES (
           $1,
           $2,
           'first_party_direct',
           'runner_access',
           'available',
           'paid-standard',
           'default',
           'operator_uncertain',
           $3,
           '2099-09-01T00:01:00Z',
           'planner-test'
         )`,
        [providerId, modelId, sourceId],
      );

      const models = await planner.listModels();
      const runnable = models.find((item) => item.id === modelId);
      expect(runnable).toMatchObject({
        id: modelId,
        provider: "deepseek",
        testability: {
          providerPolicy: {
            scope: "provider",
            accessState: "restricted",
            registrationRequirement: "restricted_signup",
            billingRequirement: "paid_account",
            regionPolicy: "restricted",
            serviceAssurance: "documented_variant",
          },
          runnerAccess: {
            scope: "model",
            accessState: "available",
            accountTier: "paid-standard",
            serviceTier: "default",
            serviceAssurance: "operator_uncertain",
          },
        },
      });
    } finally {
      await planner.close();
      await verification.end();
    }
  });

  it("deduplicates submissions and enforces an active worker lease", async () => {
    const idempotencyKey = "integration-" + randomUUID();
    const payload = {
      provider: "openai" as const,
      testCaseId: randomUUID(),
      model: "gpt-test",
    };

    const first = await queue.enqueue({ payload, idempotencyKey });
    const second = await queue.enqueue({ payload, idempotencyKey });

    expect(second.id).toBe(first.id);
    expect(first.status).toBe("queued");

    await expect(
      queue.enqueue({
        payload: { ...payload, model: "different-model" },
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    const claimed = await queue.claimNext({
      workerId: "worker-a",
      leaseSeconds: 120,
    });
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.attempts).toBe(1);

    const noSecondClaim = await queue.claimNext({
      workerId: "worker-b",
      leaseSeconds: 120,
    });
    expect(noSecondClaim).toBeNull();

    await expect(
      queue.fail({
        jobId: first.id,
        workerId: "worker-b",
        error: "wrong worker",
      }),
    ).rejects.toThrow(/lease/);

    const failed = await queue.fail({
      jobId: first.id,
      workerId: "worker-a",
      error: "fixture failure",
    });
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toBe("fixture failure");
  });
});

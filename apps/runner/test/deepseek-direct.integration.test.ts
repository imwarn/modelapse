import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { PgCatalogAdmin, PgModelCatalogAdmin } from "@modelapse/catalog-admin";
import {
  PgExecutionFleet,
  PgRunJobQueue,
  PgRunPlanner,
  type ExecutionEnvironmentDescriptor,
} from "@modelapse/control-plane";
import { migrateDatabase } from "@modelapse/database";
import {
  EnvironmentCredentialResolver,
  NodeEvidenceTransport,
} from "@modelapse/evidence-transport";
import {
  PgArchiveRepository,
  PgCostLedger,
  PgEvaluationRepository,
  PgRunRepository,
} from "@modelapse/persistence";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processOneQueuedRunJob } from "../src/queue-worker.js";

const ADMIN_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

function databaseUrl(databaseName: string): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = "/" + databaseName;
  return url.toString();
}

describe("DeepSeek first-party direct queue path", () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
  const databaseName =
    "modelapse_deepseek_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const isolatedDatabaseUrl = databaseUrl(databaseName);
  let root = "";
  let repository: PgRunRepository | undefined;
  let evaluations: PgEvaluationRepository | undefined;
  let queue: PgRunJobQueue | undefined;
  let catalog: PgCatalogAdmin | undefined;
  let modelCatalog: PgModelCatalogAdmin | undefined;
  let planner: PgRunPlanner | undefined;
  let fleet: PgExecutionFleet | undefined;
  let selectedEnvironment: ExecutionEnvironmentDescriptor | undefined;
  let secondaryEnvironment: ExecutionEnvironmentDescriptor | undefined;
  let testCaseId = "";
  let modelId = "";
  let providerId = "";
  let pricingObservationId = "";

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    await migrateDatabase({
      connectionString: isolatedDatabaseUrl,
      migrationsDirectory: fileURLToPath(
        new URL("../../../packages/database/migrations/", import.meta.url),
      ),
      runnerBuild: "deepseek-integration-migrations",
    });

    root = await mkdtemp(join(tmpdir(), "modelapse-deepseek-"));
    const blobStore = new FileSystemContentAddressedBlobStore(root);
    repository = PgRunRepository.connect(isolatedDatabaseUrl, { max: 2 });
    evaluations = PgEvaluationRepository.connect(isolatedDatabaseUrl, { max: 2 });
    queue = PgRunJobQueue.connect(isolatedDatabaseUrl, { max: 2 });
    catalog = PgCatalogAdmin.connect(isolatedDatabaseUrl, blobStore);
    modelCatalog = PgModelCatalogAdmin.connect(isolatedDatabaseUrl);
    planner = PgRunPlanner.connect(isolatedDatabaseUrl, { max: 2 });
    fleet = PgExecutionFleet.connect(isolatedDatabaseUrl, { max: 2 });

    const bootstrapped = await catalog.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-bootstrap",
    });
    testCaseId = bootstrapped.testCaseId;

    const model = await modelCatalog.bootstrapDeepSeekFlash();
    modelId = model.modelId;

    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const context = await verification.query<{
        provider_id: string;
        canonical_source_id: string;
      }>(
        `SELECT provider_id, canonical_source_id
           FROM modelapse.models
          WHERE id = $1`,
        [modelId],
      );
      providerId = context.rows[0]!.provider_id;
      const pricing = await verification.query<{ id: string }>(
        `INSERT INTO modelapse.provider_testability_observations
          (
            provider_id,
            model_id,
            execution_path,
            subject_kind,
            access_state,
            pricing_currency,
            input_price_per_million,
            output_price_per_million,
            source_id,
            observed_at,
            actor
          )
         VALUES (
           $1,
           $2,
           'first_party_direct',
           'provider_policy',
           'available',
           'USD',
           2.500000,
           10.000000,
           $3,
           now(),
           'deepseek-cost-integration'
         )
         RETURNING id`,
        [providerId, modelId, context.rows[0]!.canonical_source_id],
      );
      pricingObservationId = pricing.rows[0]!.id;

      secondaryEnvironment = await fleet!.registerEnvironment({
        slug: "us-paid-secondary",
        region: "US",
        accountTier: "paid-standard",
        serviceAssurance: "documented_default",
        actor: "deepseek-fleet-integration",
      });
      await fleet!.declareCapability({
        environmentId: secondaryEnvironment.id,
        providerId,
        executionPath: "first_party_direct",
        enabled: true,
        selectionPriority: 20,
        actor: "deepseek-fleet-integration",
      });

      selectedEnvironment = await fleet!.registerEnvironment({
        slug: "us-paid-primary",
        region: "US",
        accountTier: "paid-standard",
        serviceAssurance: "documented_default",
        actor: "deepseek-fleet-integration",
      });
      await fleet!.declareCapability({
        environmentId: selectedEnvironment.id,
        providerId,
        executionPath: "first_party_direct",
        enabled: true,
        selectionPriority: 10,
        actor: "deepseek-fleet-integration",
      });
    } finally {
      await verification.end();
    }
  });

  afterAll(async () => {
    await queue?.close();
    await planner?.close();
    await fleet?.close();
    await evaluations?.close();
    await repository?.close();
    await catalog?.close();
    await modelCatalog?.close();
    await adminPool.query(
      `DROP DATABASE IF EXISTS "${databaseName}"`,
    );
    await adminPool.end();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("captures a redacted E4 Run and links it to the durable job", async () => {
    const secret = "deepseek-integration-secret";
    let observedAuthorization = "";
    const transport = new NodeEvidenceTransport({
      fetch: async (_input, init) => {
        observedAuthorization =
          new Headers(init?.headers).get("authorization") ?? "";
        return new Response(
          JSON.stringify({
            id: "resp_deepseek_test",
            object: "response",
            status: "completed",
            model: "deepseek-flash",
            output: [
              {
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: "modelapse",
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 9,
              output_tokens: 1,
              total_tokens: 10,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "deepseek-request-test",
            },
          },
        );
      },
    });

    const { privateKey } = generateKeyPairSync("ed25519");
    const plan = await planner!.plan({
      modelId,
      testCaseId,
      config: {
        reasoningEffort: "none",
        maxOutputTokens: 32,
      },
    });

    expect(plan.jobPayload).toMatchObject({
      provider: "deepseek",
      modelId,
      model: "deepseek-flash",
      testCaseId,
      fleet: {
        environmentId: selectedEnvironment!.id,
        environmentSlug: "us-paid-primary",
        region: "US",
        accountTier: "paid-standard",
        serviceAssurance: "documented_default",
      },
      cost: {
        pricingObservationId,
        currency: "USD",
        inputPricePerMillion: "2.500000",
        outputPricePerMillion: "10.000000",
        caveats: [],
      },
    });
    expect(plan.executionEnvironment?.environmentId).toBe(
      selectedEnvironment!.id,
    );

    const job = await queue!.enqueue({
      payload: plan.jobPayload,
      idempotencyKey: "deepseek-" + randomUUID(),
    });
    expect(job.targetExecutionEnvironmentId).toBe(selectedEnvironment!.id);

    const wrongWorkerClaim = await queue!.claimNext({
      workerId: "secondary-environment-worker",
      leaseSeconds: 180,
      executionEnvironmentId: secondaryEnvironment!.id,
    });
    expect(wrongWorkerClaim).toBeNull();

    const completed = await processOneQueuedRunJob({
      queue: queue!,
      repository: repository!,
      evaluations: evaluations!,
      blobStore: new FileSystemContentAddressedBlobStore(root),
      transport,
      credentials: new EnvironmentCredentialResolver({
        DEEPSEEK_API_KEY: secret,
      }),
      signer: {
        keyId: "deepseek-integration-key",
        privateKey,
      },
      runnerBuild: "deepseek-integration-build",
      executionEnvironment: selectedEnvironment!,
      workerId: "deepseek-integration-worker",
      leaseSeconds: 180,
    });

    expect(completed?.id).toBe(job.id);
    expect(completed?.status).toBe("succeeded");
    expect(observedAuthorization).toBe("Bearer " + secret);

    const run = await repository!.getRun(completed!.runId!);
    expect(run?.status).toBe("completed");
    expect(run?.executionPath).toBe("first_party_direct");
    expect(run?.modelId).toBe(modelId);
    expect(run?.requestedModel).toBe("deepseek-flash");
    expect(run?.returnedModel).toBe("deepseek-flash");
    expect(run?.responseBlob?.mimeType).toBe("application/json");
    expect(run?.evidence[0]).toMatchObject({
      level: "E4",
      executionPath: "first_party_direct",
      collector: "modelapse-runner/deepseek-direct",
    });

    const evaluation = await evaluations!.getForRun(run!.id);
    expect(evaluation).toHaveLength(1);
    expect(evaluation[0]).toMatchObject({
      evaluatorSlug: "exact-text",
      evaluatorVersion: "1.0.0",
      status: "completed",
      metrics: {
        exact_match: 1,
        expected_text: "modelapse",
        actual_text: "modelapse",
      },
    });

    const archive = PgArchiveRepository.connect(isolatedDatabaseUrl, { max: 1 });
    try {
      const archived = await archive.getRun(run!.id);
      expect(archived).toMatchObject({
        id: run!.id,
        model: {
          id: modelId,
          canonicalSlug: "deepseek-flash",
        },
        provider: { slug: "deepseek" },
        evidenceLevel: "E4",
        executionQualification: {
          executionEnvironment: {
            id: selectedEnvironment!.id,
            slug: "us-paid-primary",
          },
          executionRegion: "US",
          accountTier: "paid-standard",
          serviceTier: null,
          serviceAssurance: "documented_default",
        },
        cost: {
          pricingObservation: { id: pricingObservationId },
          pricing: {
            currency: "USD",
            inputPerMillion: "2.500000",
            outputPerMillion: "10.000000",
          },
          usage: {
            inputTokens: "9",
            outputTokens: "1",
            totalTokens: "10",
            requestCount: 1,
          },
          estimatedNativeCost: "0.0000325000",
          caveats: [],
        },
        evaluation: {
          status: "completed",
          evaluatorSlug: "exact-text",
          exactMatch: true,
        },
      });
    } finally {
      await archive.close();
    }

    const costLedger = PgCostLedger.connect(isolatedDatabaseUrl, { max: 1 });
    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const daily = await costLedger.listDailyCosts(7);
      expect(daily).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: expect.objectContaining({ id: providerId }),
            currency: "USD",
            estimatedRuns: 1,
            unknownCostRuns: 0,
            estimatedNativeCost: "0.0000325000",
          }),
        ]),
      );

      const policy = await costLedger.recordBudgetPolicy({
        providerId,
        currency: "USD",
        period: "day",
        budgetAmount: "1.0000000000",
        actor: "deepseek-cost-integration",
      });
      const budgets = await costLedger.listBudgetStatus();
      expect(budgets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            policyId: policy.id,
            provider: expect.objectContaining({ id: providerId }),
            currency: "USD",
            estimatedSpend: "0.0000325000",
            unknownCostRuns: 0,
          }),
        ]),
      );

      await expect(
        verification.query(
          `UPDATE modelapse.run_cost_envelopes
              SET pricing_currency = 'EUR'
            WHERE run_id = $1`,
          [run!.id],
        ),
      ).rejects.toThrow(/append-only/i);

      await expect(
        verification.query(
          `UPDATE modelapse.collection_budget_policies
              SET budget_amount = 2
            WHERE id = $1`,
          [policy.id],
        ),
      ).rejects.toThrow(/append-only/i);
    } finally {
      await verification.end();
      await costLedger.close();
    }

    const requestBytes = await new FileSystemContentAddressedBlobStore(root).get(
      run!.requestBlob!.sha256,
    );
    const requestEvidence = requestBytes.toString("utf8");
    expect(requestEvidence).not.toContain(secret);
    expect(requestEvidence).toContain("[REDACTED]");
  });
});

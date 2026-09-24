import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { PgCatalogAdmin, PgModelCatalogAdmin } from "@modelapse/catalog-admin";
import { PgRunJobQueue, PgRunPlanner } from "@modelapse/control-plane";
import { migrateDatabase } from "@modelapse/database";
import {
  EnvironmentCredentialResolver,
  NodeEvidenceTransport,
} from "@modelapse/evidence-transport";
import { PgEvaluationRepository, PgRunRepository } from "@modelapse/persistence";
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
  let testCaseId = "";
  let modelId = "";

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

    const bootstrapped = await catalog.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-bootstrap",
    });
    testCaseId = bootstrapped.testCaseId;

    const model = await modelCatalog.bootstrapDeepSeekFlash();
    modelId = model.modelId;
  });

  afterAll(async () => {
    await queue?.close();
    await planner?.close();
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
    });

    const job = await queue!.enqueue({
      payload: plan.jobPayload,
      idempotencyKey: "deepseek-" + randomUUID(),
    });

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

    const requestBytes = await new FileSystemContentAddressedBlobStore(root).get(
      run!.requestBlob!.sha256,
    );
    const requestEvidence = requestBytes.toString("utf8");
    expect(requestEvidence).not.toContain(secret);
    expect(requestEvidence).toContain("[REDACTED]");
  });
});

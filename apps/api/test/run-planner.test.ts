import { describe, expect, it } from "vitest";
import type {
  PlannedDirectRun,
  RunJob,
} from "@modelapse/control-plane";
import { createApp } from "../src/app.js";

const MODEL_ID = "00000000-0000-4000-8000-000000000010";
const TEST_CASE_ID = "00000000-0000-4000-8000-000000000011";
const JOB_ID = "00000000-0000-4000-8000-000000000012";

const plan: PlannedDirectRun = {
  model: {
    id: MODEL_ID,
    providerId: "00000000-0000-4000-8000-000000000013",
    provider: "deepseek",
    canonicalSlug: "deepseek-flash",
    marketingName: "DeepSeek Flash",
    status: "active",
    apiModelId: "deepseek-flash",
    snapshotId: null,
    endpointHostname: "api.deepseek.com",
  },
  test: {
    testCaseId: TEST_CASE_ID,
    familySlug: "modelapse-direct-smoke",
    familyName: "Modelapse First-Party Direct Smoke",
    variantSlug: "text-exact",
    variantName: "First-Party Direct Text",
    version: "1.0.0",
    caseSlug: "exact-modelapse",
    caseType: "icon",
    visibility: "public",
    artifactType: "text",
    evaluator: {
      slug: "exact-text",
      version: "1.0.0",
      kind: "deterministic",
    },
  },
  jobPayload: {
    provider: "deepseek",
    modelId: MODEL_ID,
    testCaseId: TEST_CASE_ID,
    model: "deepseek-flash",
    config: { maxOutputTokens: 64 },
  },
};

const queuedJob = {
  id: JOB_ID,
  kind: "deepseek_direct",
  payload: plan.jobPayload,
  status: "queued",
  idempotencyKey: "planner-1",
  attempts: 0,
  maxAttempts: 3,
  availableAt: "2026-09-24T00:00:00.000Z",
  claimedAt: null,
  leaseExpiresAt: null,
  workerId: null,
  runId: null,
  lastError: null,
  completedAt: null,
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
} as const satisfies RunJob;

function baseRuns() {
  return {
    ping: async () => undefined,
    getRun: async () => null,
  };
}

describe("selection-based Run Planner API", () => {
  it("lists selectable catalog objects and derives the internal job payload", async () => {
    let enqueued: unknown;
    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      planner: {
        ping: async () => undefined,
        listModels: async () => [plan.model],
        listTests: async () => [plan.test],
        plan: async () => plan,
      },
      jobs: {
        ping: async () => undefined,
        get: async () => queuedJob,
        enqueue: async (input) => {
          enqueued = input;
          return queuedJob;
        },
      },
    });

    const headers = {
      authorization: "Bearer control-secret",
    };

    const models = await app.request("/v1/control/catalog/models", { headers });
    expect(models.status).toBe(200);
    await expect(models.json()).resolves.toEqual({ models: [plan.model] });

    const tests = await app.request("/v1/control/catalog/tests", { headers });
    expect(tests.status).toBe(200);
    await expect(tests.json()).resolves.toEqual({ tests: [plan.test] });

    const response = await app.request("/v1/control/runs", {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "idempotency-key": "planner-1",
      },
      body: JSON.stringify({
        modelId: MODEL_ID,
        testCaseId: TEST_CASE_ID,
        config: { maxOutputTokens: 64 },
      }),
    });

    expect(response.status).toBe(202);
    expect(enqueued).toEqual({
      payload: plan.jobPayload,
      idempotencyKey: "planner-1",
    });

    const body = await response.json();
    expect(body).toMatchObject({
      selection: {
        model: {
          id: MODEL_ID,
          provider: "deepseek",
          apiModelId: "deepseek-flash",
        },
        test: {
          testCaseId: TEST_CASE_ID,
          familySlug: "modelapse-direct-smoke",
        },
      },
      job: {
        id: JOB_ID,
        kind: "deepseek_direct",
        status: "queued",
      },
    });
  });

  it("does not let the normal Run endpoint accept provider or model strings", async () => {
    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      planner: {
        ping: async () => undefined,
        listModels: async () => [],
        listTests: async () => [],
        plan: async () => plan,
      },
      jobs: {
        ping: async () => undefined,
        get: async () => queuedJob,
        enqueue: async () => queuedJob,
      },
    });

    const response = await app.request("/v1/control/runs", {
      method: "POST",
      headers: {
        authorization: "Bearer control-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelId: MODEL_ID,
        testCaseId: TEST_CASE_ID,
        provider: "deepseek",
        model: "deepseek-flash",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_run_selection",
    });
  });
});

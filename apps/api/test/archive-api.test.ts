import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const RUN_ID = "00000000-0000-4000-8000-000000000021";
const MODEL_ID = "00000000-0000-4000-8000-000000000022";
const TEST_CASE_ID = "00000000-0000-4000-8000-000000000023";

function baseRuns() {
  return {
    ping: async () => undefined,
    getRun: async () => null,
  };
}

const archiveRun = {
  id: RUN_ID,
  status: "completed",
  model: {
    id: MODEL_ID,
    canonicalSlug: "deepseek-flash",
    marketingName: "DeepSeek Flash",
  },
  provider: {
    id: "00000000-0000-4000-8000-000000000024",
    slug: "deepseek",
    name: "DeepSeek",
  },
  test: {
    testCaseId: TEST_CASE_ID,
    familySlug: "modelapse-direct-smoke",
    familyName: "Modelapse First-Party Direct Smoke",
    variantSlug: "text-exact",
    variantName: "First-Party Direct Text",
    version: "1.0.0",
    caseSlug: "exact-modelapse",
  },
  requestedModel: "deepseek-flash",
  returnedModel: "deepseek-flash",
  executionPath: "first_party_direct",
  evidenceLevel: "E4",
  evaluation: {
    id: "00000000-0000-4000-8000-000000000025",
    status: "completed",
    evaluatorSlug: "exact-text",
    evaluatorVersion: "1.0.0",
    exactMatch: true,
  },
  runnerBuild: "build-test",
  createdAt: "2026-09-24T08:00:00.000Z",
  completedAt: "2026-09-24T08:00:01.000Z",
  sealedAt: "2026-09-24T08:00:01.100Z",
} as const;

describe("Archive read API", () => {
  it("exposes public model, test and evaluated Run views without control auth", async () => {
    const app = createApp({
      runs: baseRuns(),
      archive: {
        ping: async () => undefined,
        listModels: async () => [
          {
            id: MODEL_ID,
            provider: {
              id: archiveRun.provider.id,
              slug: "deepseek",
              name: "DeepSeek",
            },
            canonicalSlug: "deepseek-flash",
            marketingName: "DeepSeek Flash",
            status: "active",
            runCount: 1,
            latestRunAt: archiveRun.completedAt,
          },
        ],
        listTests: async () => [
          {
            testCaseId: TEST_CASE_ID,
            familySlug: "modelapse-direct-smoke",
            familyName: "Modelapse First-Party Direct Smoke",
            variantSlug: "text-exact",
            variantName: "First-Party Direct Text",
            category: "smoke",
            artifactType: "text",
            version: "1.0.0",
            caseSlug: "exact-modelapse",
            evaluator: {
              slug: "exact-text",
              version: "1.0.0",
              kind: "deterministic",
            },
            runCount: 1,
          },
        ],
        listRuns: async () => [archiveRun],
        getRun: async (runId) => (runId === RUN_ID ? archiveRun : null),
      },
    });

    const models = await app.request("/v1/archive/models");
    expect(models.status).toBe(200);
    await expect(models.json()).resolves.toMatchObject({
      models: [{ id: MODEL_ID, runCount: 1 }],
    });

    const tests = await app.request("/v1/archive/tests");
    expect(tests.status).toBe(200);
    await expect(tests.json()).resolves.toMatchObject({
      tests: [
        {
          testCaseId: TEST_CASE_ID,
          evaluator: { slug: "exact-text" },
        },
      ],
    });

    const runs = await app.request(
      `/v1/archive/runs?modelId=${MODEL_ID}&testCaseId=${TEST_CASE_ID}&limit=10`,
    );
    expect(runs.status).toBe(200);
    await expect(runs.json()).resolves.toEqual({ runs: [archiveRun] });

    const run = await app.request("/v1/archive/runs/" + RUN_ID);
    expect(run.status).toBe(200);
    await expect(run.json()).resolves.toEqual({ run: archiveRun });
  });

  it("validates Archive filters", async () => {
    const app = createApp({
      runs: baseRuns(),
      archive: {
        ping: async () => undefined,
        listModels: async () => [],
        listTests: async () => [],
        listRuns: async () => [],
        getRun: async () => null,
      },
    });

    expect(
      (await app.request("/v1/archive/runs?modelId=nope")).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/archive/runs?limit=101")).status,
    ).toBe(400);
  });
});

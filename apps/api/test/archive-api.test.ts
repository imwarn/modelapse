import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const RUN_ID = "00000000-0000-4000-8000-000000000021";
const MODEL_ID = "00000000-0000-4000-8000-000000000022";
const TEST_CASE_ID = "00000000-0000-4000-8000-000000000023";
const PREVIOUS_RUN_ID = "00000000-0000-4000-8000-000000000037";
const SOURCE_ID = "00000000-0000-4000-8000-000000000033";
const BINDING_ID = "00000000-0000-4000-8000-000000000038";
const ALIAS_ID = "00000000-0000-4000-8000-000000000039";
const ALIAS_EVENT_ID = "00000000-0000-4000-8000-000000000040";
const TEST_VERSION_ID = "00000000-0000-4000-8000-000000000041";

const archiveSource = {
  id: SOURCE_ID,
  sourceType: "provider_docs",
  url: "https://api-docs.deepseek.com/guides/responses_api/",
  title: "DeepSeek Responses API guide",
  author: null,
  publishedAt: null,
  retrievedAt: "2026-09-01T00:00:00.000Z",
  contentSha256: null,
} as const;

const archiveCatalogChange = {
  id: `alias:${ALIAS_EVENT_ID}`,
  changeType: "alias_target_changed",
  occurredAt: "2026-09-02T00:00:00.000Z",
  provider: {
    id: "00000000-0000-4000-8000-000000000024",
    slug: "deepseek",
    name: "DeepSeek",
  },
  alias: {
    id: ALIAS_ID,
    value: "deepseek-flash",
  },
  changedFields: ["snapshot"],
  previous: {
    model: {
      id: MODEL_ID,
      canonicalSlug: "deepseek-flash",
      marketingName: "DeepSeek Flash",
    },
    snapshot: null,
    endpoint: null,
    apiModelId: null,
  },
  current: {
    model: {
      id: MODEL_ID,
      canonicalSlug: "deepseek-flash",
      marketingName: "DeepSeek Flash",
    },
    snapshot: {
      id: "00000000-0000-4000-8000-000000000034",
      providerSnapshotId: "deepseek-flash-202609",
    },
    endpoint: null,
    apiModelId: null,
  },
  previousRecordId: "00000000-0000-4000-8000-000000000042",
  currentRecordId: ALIAS_EVENT_ID,
  previousSource: archiveSource,
  currentSource: archiveSource,
} as const;


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
    evaluatorKind: "deterministic",
    definitionSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rawResultSha256:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    exactMatch: true,
  },
  runnerBuild: "build-test",
  createdAt: "2026-09-24T08:00:00.000Z",
  completedAt: "2026-09-24T08:00:01.000Z",
  sealedAt: "2026-09-24T08:00:01.100Z",
  config: {
    maxOutputTokens: 64,
  },
  requestBlob: {
    sha256:
      "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    sizeBytes: 123,
    mimeType: "application/json",
    visibility: "private",
  },
  responseBlob: {
    sha256:
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    sizeBytes: 456,
    mimeType: "application/json",
    visibility: "private",
  },
  responseHeadersSha256:
    "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  usage: {
    inputTokens: 4,
    outputTokens: 1,
    totalTokens: 5,
  },
  timing: {
    durationMs: 1000,
  },
  evidence: [
    {
      id: "00000000-0000-4000-8000-000000000026",
      level: "E4",
      executionPath: "first_party_direct",
      collector: "modelapse-smoke",
      sourceId: null,
      notes: null,
      createdAt: "2026-09-24T08:00:01.100Z",
      attestation: {
        id: "00000000-0000-4000-8000-000000000027",
        keyId: "prod-key",
        algorithm: "Ed25519",
        payloadSha256:
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        signature: "base64-signature",
        keyValidFrom: "2026-09-24T00:00:00.000Z",
        keyValidTo: null,
        createdAt: "2026-09-24T08:00:01.100Z",
      },
    },
  ],
  relations: [
    {
      direction: "outgoing",
      relationType: "repeat_of",
      relatedRunId: PREVIOUS_RUN_ID,
      createdAt: "2026-09-24T08:00:01.200Z",
    },
  ],
} as const;

const archiveRunHistory = {
  model: {
    id: MODEL_ID,
    provider: archiveRun.provider,
    canonicalSlug: "deepseek-flash",
    marketingName: "DeepSeek Flash",
    status: "active",
    runCount: 2,
    latestRunAt: archiveRun.completedAt,
  },
  test: {
    testCaseId: TEST_CASE_ID,
    familySlug: archiveRun.test.familySlug,
    familyName: archiveRun.test.familyName,
    variantSlug: archiveRun.test.variantSlug,
    variantName: archiveRun.test.variantName,
    category: "smoke",
    artifactType: "text",
    version: archiveRun.test.version,
    caseSlug: archiveRun.test.caseSlug,
    evaluator: {
      slug: "exact-text",
      version: "1.0.0",
      kind: "deterministic",
    },
    runCount: 2,
  },
  runs: [
    {
      ...archiveRun,
      id: PREVIOUS_RUN_ID,
      createdAt: "2026-09-23T08:00:00.000Z",
      completedAt: "2026-09-23T08:00:01.000Z",
      sealedAt: "2026-09-23T08:00:01.100Z",
      relations: [],
    },
    archiveRun,
  ],
  relations: [
    {
      fromRunId: RUN_ID,
      toRunId: PREVIOUS_RUN_ID,
      relationType: "repeat_of",
      createdAt: "2026-09-24T08:00:01.200Z",
    },
  ],
} as const;

const archiveModelDetail = {
  id: MODEL_ID,
  provider: archiveRun.provider,
  canonicalSlug: "deepseek-flash",
  marketingName: "DeepSeek Flash",
  status: "active",
  runCount: 1,
  latestRunAt: archiveRun.completedAt,
  family: {
    id: "00000000-0000-4000-8000-000000000031",
    slug: "deepseek",
    displayName: "DeepSeek",
  },
  track: {
    id: "00000000-0000-4000-8000-000000000032",
    slug: "flash",
    displayName: "Flash",
    trackType: "fast",
  },
  releasedAt: "2026-09-01T00:00:00.000Z",
  retiredAt: null,
  canonicalSourceId: SOURCE_ID,
  canonicalSource: archiveSource,
  snapshots: [
    {
      id: "00000000-0000-4000-8000-000000000034",
      providerSnapshotId: "deepseek-flash-202609",
      validFrom: "2026-09-01T00:00:00.000Z",
      validTo: null,
      sourceId: SOURCE_ID,
      source: archiveSource,
    },
  ],
  relations: [],
  aliasResolutions: [
    {
      id: ALIAS_EVENT_ID,
      alias: {
        id: ALIAS_ID,
        value: "deepseek-flash",
      },
      observedAt: "2026-09-01T00:00:00.000Z",
      sourceType: "provider_docs",
      confidence: 1,
      resolvedModelId: MODEL_ID,
      resolvedSnapshot: null,
      source: archiveSource,
    },
  ],
  executionBindings: [
    {
      id: BINDING_ID,
      apiModelId: "deepseek-flash",
      validFrom: "2026-09-01T00:00:00.000Z",
      validTo: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      endpoint: {
        id: archiveRun.provider.id,
        path: "first_party_direct",
        baseUrl: "https://api.deepseek.com",
        hostname: "api.deepseek.com",
        source: archiveSource,
      },
      snapshot: null,
      source: archiveSource,
    },
  ],
  identityTimeline: [
    {
      id: `alias-resolution:${ALIAS_EVENT_ID}`,
      kind: "alias_resolution",
      occurredAt: "2026-09-01T00:00:00.000Z",
      title: "Alias observed · deepseek-flash",
      description: "resolved to canonical model deepseek-flash",
      source: archiveSource,
      aliasId: ALIAS_ID,
      bindingId: null,
      snapshotId: null,
    },
  ],
  identityDrift: [archiveCatalogChange],
  testCoverage: [
    {
      testCaseId: TEST_CASE_ID,
      familySlug: archiveRun.test.familySlug,
      familyName: archiveRun.test.familyName,
      version: archiveRun.test.version,
      caseSlug: archiveRun.test.caseSlug,
      runCount: 1,
      latestRunAt: archiveRun.completedAt,
    },
  ],
  recentRuns: [archiveRun],
  timeline: [
    {
      id: `run:${RUN_ID}`,
      kind: "run",
      occurredAt: archiveRun.completedAt,
      title: "Run · exact-modelapse",
      description: "E4 · exact match",
      runId: RUN_ID,
      testCaseId: TEST_CASE_ID,
      snapshotId: null,
      relatedModelId: null,
    },
  ],
} as const;

const archiveTestDetail = {
  testCaseId: TEST_CASE_ID,
  familySlug: archiveRun.test.familySlug,
  familyName: archiveRun.test.familyName,
  variantSlug: archiveRun.test.variantSlug,
  variantName: archiveRun.test.variantName,
  category: "smoke",
  artifactType: "text",
  version: archiveRun.test.version,
  caseSlug: archiveRun.test.caseSlug,
  evaluator: {
    slug: "exact-text",
    version: "1.0.0",
    kind: "deterministic",
  },
  runCount: 1,
  origin: "modelapse",
  canonicalSourceId: SOURCE_ID,
  canonicalSource: archiveSource,
  versionSource: archiveSource,
  versionHistory: [
    {
      id: TEST_VERSION_ID,
      version: "1.0.0",
      status: "published",
      definitionSha256:
        "1111111111111111111111111111111111111111111111111111111111111111",
      license: "Apache-2.0",
      publishedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-08-31T00:00:00.000Z",
      source: archiveSource,
      evaluator: {
        slug: "exact-text",
        version: "1.0.0",
        kind: "deterministic",
      },
      publicCaseCount: 1,
      linkedTestCaseId: TEST_CASE_ID,
    },
  ],
  versionStatus: "published",
  definitionSha256:
    "1111111111111111111111111111111111111111111111111111111111111111",
  license: "Apache-2.0",
  publishedAt: "2026-09-01T00:00:00.000Z",
  versionCreatedAt: "2026-08-31T00:00:00.000Z",
  caseType: "public",
  caseStatus: "active",
  activeFrom: "2026-09-01T00:00:00.000Z",
  activeTo: null,
  promptSha256:
    "2222222222222222222222222222222222222222222222222222222222222222",
  fixtureManifestSha256: null,
  evaluatorDefinitionSha256: archiveRun.evaluation.definitionSha256,
  modelCoverage: [
    {
      modelId: MODEL_ID,
      canonicalSlug: "deepseek-flash",
      marketingName: "DeepSeek Flash",
      providerSlug: "deepseek",
      runCount: 1,
      latestRunAt: archiveRun.completedAt,
    },
  ],
  recentRuns: [archiveRun],
} as const;

const archiveComparison = {
  test: {
    testCaseId: TEST_CASE_ID,
    familySlug: archiveRun.test.familySlug,
    familyName: archiveRun.test.familyName,
    variantSlug: archiveRun.test.variantSlug,
    variantName: archiveRun.test.variantName,
    category: "smoke",
    artifactType: "text",
    version: archiveRun.test.version,
    caseSlug: archiveRun.test.caseSlug,
    evaluator: {
      slug: "exact-text",
      version: "1.0.0",
      kind: "deterministic",
    },
    runCount: 1,
  },
  rows: [
    {
      model: {
        id: MODEL_ID,
        provider: archiveRun.provider,
        canonicalSlug: "deepseek-flash",
        marketingName: "DeepSeek Flash",
        status: "active",
        runCount: 1,
        latestRunAt: archiveRun.completedAt,
      },
      latestRun: archiveRun,
    },
    {
      model: {
        id: "00000000-0000-4000-8000-000000000035",
        provider: {
          id: "00000000-0000-4000-8000-000000000036",
          slug: "openai",
          name: "OpenAI",
        },
        canonicalSlug: "gpt-test",
        marketingName: "GPT Test",
        status: "active",
        runCount: 0,
        latestRunAt: null,
      },
      latestRun: null,
    },
  ],
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
        listCatalogChanges: async () => [archiveCatalogChange],
        getRun: async (runId) => (runId === RUN_ID ? archiveRun : null),
        getModel: async (modelId) =>
          modelId === MODEL_ID ? archiveModelDetail : null,
        getTest: async (testCaseId) =>
          testCaseId === TEST_CASE_ID ? archiveTestDetail : null,
        compareLatest: async () => archiveComparison,
        getRunHistory: async () => archiveRunHistory,
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

    const changes = await app.request(
      `/v1/archive/changes?modelId=${MODEL_ID}&provider=deepseek&limit=10`,
    );
    expect(changes.status).toBe(200);
    await expect(changes.json()).resolves.toMatchObject({
      changes: [
        {
          changeType: "alias_target_changed",
          changedFields: ["snapshot"],
          current: {
            snapshot: { providerSnapshotId: "deepseek-flash-202609" },
          },
        },
      ],
    });

    const model = await app.request("/v1/archive/models/" + MODEL_ID);
    expect(model.status).toBe(200);
    await expect(model.json()).resolves.toMatchObject({
      model: {
        id: MODEL_ID,
        canonicalSource: { id: SOURCE_ID },
        aliasResolutions: [{ alias: { value: "deepseek-flash" } }],
        executionBindings: [{ apiModelId: "deepseek-flash" }],
        timeline: [{ kind: "run", runId: RUN_ID }],
      },
    });

    const test = await app.request("/v1/archive/tests/" + TEST_CASE_ID);
    expect(test.status).toBe(200);
    await expect(test.json()).resolves.toMatchObject({
      test: {
        testCaseId: TEST_CASE_ID,
        definitionSha256: archiveTestDetail.definitionSha256,
        canonicalSource: { id: SOURCE_ID },
        versionHistory: [{ version: "1.0.0", linkedTestCaseId: TEST_CASE_ID }],
      },
    });

    const secondModelId = archiveComparison.rows[1].model.id;
    const comparison = await app.request(
      `/v1/archive/compare?modelIds=${MODEL_ID},${secondModelId}&testCaseId=${TEST_CASE_ID}`,
    );
    expect(comparison.status).toBe(200);
    await expect(comparison.json()).resolves.toEqual({
      comparison: archiveComparison,
    });

    const history = await app.request(
      `/v1/archive/history?modelId=${MODEL_ID}&testCaseId=${TEST_CASE_ID}&limit=20`,
    );
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toEqual({
      history: archiveRunHistory,
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
        listCatalogChanges: async () => [],
        getRun: async () => null,
        getModel: async () => null,
        getTest: async () => null,
        compareLatest: async () => null,
        getRunHistory: async () => null,
      },
    });

    expect(
      (await app.request("/v1/archive/runs?modelId=nope")).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/archive/runs?limit=101")).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/archive/changes?modelId=nope")).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/archive/changes?provider=Bad.Provider")).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/archive/changes?limit=101")).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/archive/models/nope")).status,
    ).toBe(400);
    expect(
      (await app.request("/v1/archive/tests/nope")).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `/v1/archive/compare?modelIds=${MODEL_ID}&testCaseId=${TEST_CASE_ID}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `/v1/archive/history?modelId=nope&testCaseId=${TEST_CASE_ID}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `/v1/archive/history?modelId=${MODEL_ID}&testCaseId=${TEST_CASE_ID}&limit=101`,
        )
      ).status,
    ).toBe(400);

  });
});

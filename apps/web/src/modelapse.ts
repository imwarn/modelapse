import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RunnableModel {
  readonly id: string;
  readonly providerId: string;
  readonly provider: "openai" | "deepseek";
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly status: "preview" | "active";
  readonly apiModelId: string;
  readonly snapshotId: string | null;
  readonly endpointHostname: string;
}

export interface RunnableTest {
  readonly testCaseId: string;
  readonly familySlug: string;
  readonly familyName: string;
  readonly variantSlug: string;
  readonly variantName: string;
  readonly version: string;
  readonly caseSlug: string;
  readonly caseType: string;
  readonly visibility: "public" | "private";
  readonly artifactType: string;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  };
}

export interface ControlCatalog {
  readonly models: readonly RunnableModel[];
  readonly tests: readonly RunnableTest[];
}

export interface ArchiveModel {
  readonly id: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly status: string;
  readonly runCount: number;
  readonly latestRunAt: string | null;
}

export interface ArchiveTest {
  readonly testCaseId: string;
  readonly familySlug: string;
  readonly familyName: string;
  readonly variantSlug: string;
  readonly variantName: string;
  readonly category: string;
  readonly artifactType: string;
  readonly version: string;
  readonly caseSlug: string;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  } | null;
  readonly runCount: number;
}

export interface ArchiveSource {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface ArchiveModelAliasResolution {
  readonly id: string;
  readonly alias: {
    readonly id: string;
    readonly value: string;
  };
  readonly observedAt: string;
  readonly sourceType: string;
  readonly confidence: number;
  readonly resolvedModelId: string | null;
  readonly resolvedSnapshot: {
    readonly id: string;
    readonly providerSnapshotId: string;
  } | null;
  readonly source: ArchiveSource | null;
}

export interface ArchiveModelExecutionBinding {
  readonly id: string;
  readonly apiModelId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly createdAt: string;
  readonly endpoint: {
    readonly id: string;
    readonly path: string;
    readonly baseUrl: string;
    readonly hostname: string;
    readonly source: ArchiveSource | null;
  };
  readonly snapshot: {
    readonly id: string;
    readonly providerSnapshotId: string;
  } | null;
  readonly source: ArchiveSource;
}

export interface ArchiveIdentityTimelineEvent {
  readonly id: string;
  readonly kind:
    | "canonical_source"
    | "alias_resolution"
    | "binding_started"
    | "binding_ended"
    | "snapshot_started"
    | "snapshot_ended";
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly source: ArchiveSource | null;
  readonly aliasId: string | null;
  readonly bindingId: string | null;
  readonly snapshotId: string | null;
}

export interface ArchiveTestVersionHistory {
  readonly id: string;
  readonly version: string;
  readonly status: string;
  readonly definitionSha256: string;
  readonly license: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly source: ArchiveSource | null;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  } | null;
  readonly publicCaseCount: number;
  readonly linkedTestCaseId: string | null;
}

export interface ArchiveModelSnapshot {
  readonly id: string;
  readonly providerSnapshotId: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceId: string | null;
  readonly source: ArchiveSource | null;
}

export interface ArchiveModelRelation {
  readonly id: string;
  readonly direction: "outgoing" | "incoming";
  readonly relationType: string;
  readonly relatedModel: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly providerSlug: string;
  };
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceId: string | null;
  readonly source: ArchiveSource | null;
  readonly confidence: number;
}

export interface ArchiveTimelineEvent {
  readonly id: string;
  readonly kind:
    | "model_released"
    | "model_retired"
    | "snapshot_started"
    | "snapshot_ended"
    | "relation"
    | "run";
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly runId: string | null;
  readonly testCaseId: string | null;
  readonly snapshotId: string | null;
  readonly relatedModelId: string | null;
}

export interface ArchiveModelDetail extends ArchiveModel {
  readonly family: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
  } | null;
  readonly track: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
    readonly trackType: string | null;
  } | null;
  readonly releasedAt: string | null;
  readonly retiredAt: string | null;
  readonly canonicalSourceId: string | null;
  readonly canonicalSource: ArchiveSource | null;
  readonly snapshots: readonly ArchiveModelSnapshot[];
  readonly relations: readonly ArchiveModelRelation[];
  readonly aliasResolutions: readonly ArchiveModelAliasResolution[];
  readonly executionBindings: readonly ArchiveModelExecutionBinding[];
  readonly identityTimeline: readonly ArchiveIdentityTimelineEvent[];
  readonly testCoverage: readonly {
    readonly testCaseId: string;
    readonly familySlug: string;
    readonly familyName: string;
    readonly version: string;
    readonly caseSlug: string;
    readonly runCount: number;
    readonly latestRunAt: string | null;
  }[];
  readonly recentRuns: readonly ArchiveRun[];
  readonly timeline: readonly ArchiveTimelineEvent[];
}

export interface ArchiveTestDetail extends ArchiveTest {
  readonly origin: string;
  readonly canonicalSourceId: string | null;
  readonly canonicalSource: ArchiveSource | null;
  readonly versionSource: ArchiveSource | null;
  readonly versionHistory: readonly ArchiveTestVersionHistory[];
  readonly versionStatus: string;
  readonly definitionSha256: string;
  readonly license: string | null;
  readonly publishedAt: string | null;
  readonly versionCreatedAt: string;
  readonly caseType: string;
  readonly caseStatus: string;
  readonly activeFrom: string | null;
  readonly activeTo: string | null;
  readonly promptSha256: string;
  readonly fixtureManifestSha256: string | null;
  readonly evaluatorDefinitionSha256: string | null;
  readonly modelCoverage: readonly {
    readonly modelId: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly providerSlug: string;
    readonly runCount: number;
    readonly latestRunAt: string | null;
  }[];
  readonly recentRuns: readonly ArchiveRun[];
}

export interface ArchiveComparison {
  readonly test: ArchiveTest;
  readonly rows: readonly {
    readonly model: ArchiveModel;
    readonly latestRun: ArchiveRun | null;
  }[];
}

export interface ArchiveCatalog {
  readonly models: readonly ArchiveModel[];
  readonly tests: readonly ArchiveTest[];
}

export interface ArchiveRun {
  readonly id: string;
  readonly status: string;
  readonly model: {
    readonly id: string | null;
    readonly canonicalSlug: string | null;
    readonly marketingName: string | null;
  };
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly test: {
    readonly testCaseId: string;
    readonly familySlug: string;
    readonly familyName: string;
    readonly variantSlug: string;
    readonly variantName: string;
    readonly version: string;
    readonly caseSlug: string;
  };
  readonly requestedModel: string;
  readonly returnedModel: string | null;
  readonly executionPath: string;
  readonly evidenceLevel: string | null;
  readonly evaluation: {
    readonly id: string;
    readonly status: string;
    readonly evaluatorSlug: string;
    readonly evaluatorVersion: string;
    readonly evaluatorKind: string;
    readonly definitionSha256: string;
    readonly rawResultSha256: string | null;
    readonly exactMatch: boolean | null;
  } | null;
  readonly runnerBuild: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly sealedAt: string | null;
}

export interface ArchiveBlob {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly visibility: string;
}

export interface ArchiveRunEvidence {
  readonly id: string;
  readonly level: string;
  readonly executionPath: string;
  readonly collector: string;
  readonly sourceId: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly attestation: {
    readonly id: string;
    readonly keyId: string;
    readonly algorithm: string;
    readonly payloadSha256: string;
    readonly signature: string;
    readonly keyValidFrom: string;
    readonly keyValidTo: string | null;
    readonly createdAt: string;
  } | null;
}

export interface ArchiveRunRelationEdge {
  readonly fromRunId: string;
  readonly toRunId: string;
  readonly relationType: string;
  readonly createdAt: string;
}

export interface ArchiveRunRelation {
  readonly direction: "outgoing" | "incoming";
  readonly relationType: string;
  readonly relatedRunId: string;
  readonly createdAt: string;
}

export interface ArchiveRunDetail extends ArchiveRun {
  readonly configJson: string | null;
  readonly requestBlob: ArchiveBlob | null;
  readonly responseBlob: ArchiveBlob | null;
  readonly responseHeadersSha256: string | null;
  readonly usageJson: string | null;
  readonly timingJson: string | null;
  readonly evidence: readonly ArchiveRunEvidence[];
  readonly relations: readonly ArchiveRunRelation[];
}

interface ArchiveRunDetailWire extends ArchiveRun {
  readonly config: unknown;
  readonly requestBlob: ArchiveBlob | null;
  readonly responseBlob: ArchiveBlob | null;
  readonly responseHeadersSha256: string | null;
  readonly usage: unknown;
  readonly timing: unknown;
  readonly evidence: readonly ArchiveRunEvidence[];
  readonly relations: readonly ArchiveRunRelation[];
}

export interface ArchiveRunHistory {
  readonly model: ArchiveModel;
  readonly test: ArchiveTest;
  readonly runs: readonly ArchiveRun[];
  readonly relations: readonly ArchiveRunRelationEdge[];
}

export interface ArchiveTemporalComparison {
  readonly test: ArchiveTest;
  readonly rows: readonly {
    readonly model: ArchiveModel;
    readonly runs: readonly ArchiveRun[];
    readonly relations: readonly ArchiveRunRelationEdge[];
  }[];
}

export interface ControlJob {
  readonly id: string;
  readonly kind: string;
  readonly status: "queued" | "running" | "succeeded" | "failed";
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly runId: string | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface WorkbenchSnapshot {
  readonly build: string;
  readonly control: {
    readonly configured: boolean;
  };
  readonly archive: {
    readonly models: readonly ArchiveModel[];
    readonly tests: readonly ArchiveTest[];
    readonly runs: readonly ArchiveRun[];
  };
}

interface OperatorInput {
  readonly operatorToken: string;
}

interface SubmitRunInput extends OperatorInput {
  readonly modelId: string;
  readonly testCaseId: string;
}

interface ReadJobInput extends OperatorInput {
  readonly jobId: string;
}

interface ReadArchiveRunInput {
  readonly runId: string;
}

interface ReadArchiveModelInput {
  readonly modelId: string;
}

interface ReadArchiveTestInput {
  readonly testCaseId: string;
}

interface CompareArchiveInput {
  readonly modelIds: readonly string[];
  readonly testCaseId: string;
}

interface ReadArchiveHistoryInput {
  readonly modelId: string;
  readonly testCaseId: string;
  readonly limit?: number;
}


interface ApiOptions {
  readonly method?: "GET" | "POST";
  readonly control?: boolean;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiOrigin(): string {
  const raw =
    process.env.MODELAPSE_API_ORIGIN?.trim() ?? "http://127.0.0.1:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function controlToken(): string {
  const token = process.env.MODELAPSE_CONTROL_TOKEN?.trim();
  if (!token) {
    throw new Error("MODELAPSE_CONTROL_TOKEN is not configured for the web server");
  }
  return token;
}

function apiErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : null;
    if (message) return message;
  }
  return `Modelapse API request failed with HTTP ${status}`;
}

function serializeArchiveMetadata(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value, null, 2) ?? null;
}

function controlAuthDiagnostic(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const reason =
    payload.reason === "missing_authorization" ||
    payload.reason === "invalid_authorization"
      ? payload.reason
      : null;
  const build =
    typeof payload.build === "string" && payload.build
      ? payload.build.slice(0, 12)
      : "unknown";

  if (reason === "missing_authorization") {
    return `API build ${build} did not receive the Authorization header from the Web service. Check MODELAPSE_API_ORIGIN and any reverse proxy between Web and API.`;
  }

  if (reason === "invalid_authorization") {
    return `API build ${build} received the Authorization header but rejected it. The Web/API runtime MODELAPSE_CONTROL_TOKEN values differ, or the Web service is reaching an unexpected API instance.`;
  }

  return null;
}

async function requestJson<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers({
    accept: "application/json",
  });

  if (options.control) {
    headers.set("authorization", `Bearer ${controlToken()}`);
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.idempotencyKey) {
    headers.set("idempotency-key", options.idempotencyKey);
  }

  const response = await fetch(new URL(path, apiOrigin()), {
    method: options.method ?? "GET",
    headers,
    cache: "no-store",
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const diagnostic =
      options.control && response.status === 401
        ? controlAuthDiagnostic(payload)
        : null;
    const message =
      diagnostic ??
      (options.control && response.status === 401
        ? "Modelapse API rejected the Web control credential, but this API did not return auth diagnostics. Verify the Web is reaching the expected API deployment."
        : apiErrorMessage(payload, response.status));

    throw new ApiRequestError(response.status, message);
  }

  return payload as T;
}

function parseOperatorToken(value: unknown): string {
  if (!isRecord(value)) throw new Error("Operator request must be an object");

  const operatorToken = value.operatorToken;
  if (
    typeof operatorToken !== "string" ||
    !operatorToken ||
    operatorToken.length > 512
  ) {
    throw new Error("Operator token is required");
  }
  return operatorToken;
}

function parseOperatorInput(value: unknown): OperatorInput {
  return { operatorToken: parseOperatorToken(value) };
}

function parseSubmitRunInput(value: unknown): SubmitRunInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Run request must be an object");

  const modelId = value.modelId;
  const testCaseId = value.testCaseId;

  if (typeof modelId !== "string" || !UUID_RE.test(modelId)) {
    throw new Error("modelId must be a UUID");
  }
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }

  return { operatorToken, modelId, testCaseId };
}

function parseReadJobInput(value: unknown): ReadJobInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Job request must be an object");

  const jobId = value.jobId;
  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    throw new Error("jobId must be a UUID");
  }

  return { operatorToken, jobId };
}

function parseArchiveRunInput(value: unknown): ReadArchiveRunInput {
  if (!isRecord(value)) throw new Error("Archive Run request must be an object");

  const runId = value.runId;
  if (typeof runId !== "string" || !UUID_RE.test(runId)) {
    throw new Error("runId must be a UUID");
  }

  return { runId };
}

function parseArchiveModelInput(value: unknown): ReadArchiveModelInput {
  if (!isRecord(value)) throw new Error("Archive Model request must be an object");

  const modelId = value.modelId;
  if (typeof modelId !== "string" || !UUID_RE.test(modelId)) {
    throw new Error("modelId must be a UUID");
  }

  return { modelId };
}

function parseArchiveTestInput(value: unknown): ReadArchiveTestInput {
  if (!isRecord(value)) throw new Error("Archive Test request must be an object");

  const testCaseId = value.testCaseId;
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }

  return { testCaseId };
}

function parseArchiveHistoryInput(value: unknown): ReadArchiveHistoryInput {
  if (!isRecord(value)) throw new Error("Archive history request must be an object");

  const modelId = value.modelId;
  const testCaseId = value.testCaseId;
  const limit = value.limit;

  if (typeof modelId !== "string" || !UUID_RE.test(modelId)) {
    throw new Error("modelId must be a UUID");
  }
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }
  if (
    limit !== undefined &&
    (typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100)
  ) {
    throw new Error("limit must be an integer between 1 and 100");
  }

  return {
    modelId,
    testCaseId,
    ...(limit === undefined ? {} : { limit }),
  };
}

function parseArchiveComparisonInput(value: unknown): CompareArchiveInput {
  if (!isRecord(value)) throw new Error("Archive comparison request must be an object");

  const modelIds = value.modelIds;
  const testCaseId = value.testCaseId;

  if (
    !Array.isArray(modelIds) ||
    modelIds.length < 2 ||
    modelIds.length > 4 ||
    modelIds.some((modelId) => typeof modelId !== "string" || !UUID_RE.test(modelId)) ||
    new Set(modelIds).size !== modelIds.length
  ) {
    throw new Error("modelIds must contain between 2 and 4 unique UUIDs");
  }
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }

  return {
    modelIds: modelIds as string[],
    testCaseId,
  };
}

function requireOperator(candidate: string): void {
  const expected = process.env.MODELAPSE_WEB_OPERATOR_TOKEN;
  if (!expected) {
    throw new Error("Operator Run access is disabled on this web deployment");
  }

  const actualBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error("Invalid operator token");
  }
}

export const getWorkbenchSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkbenchSnapshot> => {
    const [archiveModels, archiveTests, archiveRuns] = await Promise.all([
      requestJson<{ models: readonly ArchiveModel[] }>("/v1/archive/models"),
      requestJson<{ tests: readonly ArchiveTest[] }>("/v1/archive/tests"),
      requestJson<{ runs: readonly ArchiveRun[] }>("/v1/archive/runs?limit=30"),
    ]);

    return {
      build: process.env.MODELAPSE_BUILD ?? "dev",
      control: {
        configured: Boolean(
          process.env.MODELAPSE_CONTROL_TOKEN &&
            process.env.MODELAPSE_WEB_OPERATOR_TOKEN,
        ),
      },
      archive: {
        models: archiveModels.models,
        tests: archiveTests.tests,
        runs: archiveRuns.runs,
      },
    };
  },
);

export const getArchiveRun = createServerFn({ method: "POST" })
  .validator(parseArchiveRunInput)
  .handler(async ({ data }): Promise<ArchiveRunDetail | null> => {
    try {
      const result = await requestJson<{ run: ArchiveRunDetailWire }>(
        `/v1/archive/runs/${data.runId}`,
      );
      const { config, usage, timing, ...run } = result.run;
      return {
        ...run,
        configJson: serializeArchiveMetadata(config),
        usageJson: serializeArchiveMetadata(usage),
        timingJson: serializeArchiveMetadata(timing),
      };
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getArchiveCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<ArchiveCatalog> => {
    const [models, tests] = await Promise.all([
      requestJson<{ models: readonly ArchiveModel[] }>("/v1/archive/models"),
      requestJson<{ tests: readonly ArchiveTest[] }>("/v1/archive/tests"),
    ]);
    return {
      models: models.models,
      tests: tests.tests,
    };
  },
);

export const getArchiveModel = createServerFn({ method: "POST" })
  .validator(parseArchiveModelInput)
  .handler(async ({ data }): Promise<ArchiveModelDetail | null> => {
    try {
      const result = await requestJson<{ model: ArchiveModelDetail }>(
        `/v1/archive/models/${data.modelId}`,
      );
      return result.model;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getArchiveTest = createServerFn({ method: "POST" })
  .validator(parseArchiveTestInput)
  .handler(async ({ data }): Promise<ArchiveTestDetail | null> => {
    try {
      const result = await requestJson<{ test: ArchiveTestDetail }>(
        `/v1/archive/tests/${data.testCaseId}`,
      );
      return result.test;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getArchiveRunHistory = createServerFn({ method: "POST" })
  .validator(parseArchiveHistoryInput)
  .handler(async ({ data }): Promise<ArchiveRunHistory | null> => {
    const params = new URLSearchParams({
      modelId: data.modelId,
      testCaseId: data.testCaseId,
      limit: String(data.limit ?? 50),
    });
    try {
      const result = await requestJson<{ history: ArchiveRunHistory }>(
        `/v1/archive/history?${params.toString()}`,
      );
      return result.history;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const compareArchiveHistory = createServerFn({ method: "POST" })
  .validator(parseArchiveComparisonInput)
  .handler(async ({ data }): Promise<ArchiveTemporalComparison | null> => {
    const histories = await Promise.all(
      data.modelIds.map(async (modelId) => {
        const params = new URLSearchParams({
          modelId,
          testCaseId: data.testCaseId,
          limit: "20",
        });
        try {
          const result = await requestJson<{ history: ArchiveRunHistory }>(
            `/v1/archive/history?${params.toString()}`,
          );
          return result.history;
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 404) {
            return null;
          }
          throw error;
        }
      }),
    );

    if (histories.some((history) => history === null)) {
      return null;
    }

    const complete = histories.filter(
      (history): history is ArchiveRunHistory => history !== null,
    );
    const first = complete[0];
    if (!first) return null;

    return {
      test: first.test,
      rows: complete.map((history) => ({
        model: history.model,
        runs: history.runs,
        relations: history.relations,
      })),
    };
  });

export const compareArchive = createServerFn({ method: "POST" })
  .validator(parseArchiveComparisonInput)
  .handler(async ({ data }): Promise<ArchiveComparison | null> => {
    const modelIds = data.modelIds.join(",");
    try {
      const result = await requestJson<{ comparison: ArchiveComparison }>(
        `/v1/archive/compare?modelIds=${encodeURIComponent(modelIds)}&testCaseId=${encodeURIComponent(data.testCaseId)}`,
      );
      return result.comparison;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getControlCatalog = createServerFn({ method: "POST" })
  .validator(parseOperatorInput)
  .handler(async ({ data }): Promise<ControlCatalog> => {
    requireOperator(data.operatorToken);

    const [modelResult, testResult] = await Promise.all([
      requestJson<{ models: readonly RunnableModel[] }>(
        "/v1/control/catalog/models",
        { control: true },
      ),
      requestJson<{ tests: readonly RunnableTest[] }>(
        "/v1/control/catalog/tests",
        { control: true },
      ),
    ]);

    return {
      models: modelResult.models,
      tests: testResult.tests,
    };
  });

export const submitRun = createServerFn({ method: "POST" })
  .validator(parseSubmitRunInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);

    return requestJson<{
      selection: {
        model: Pick<
          RunnableModel,
          "id" | "provider" | "marketingName" | "apiModelId"
        >;
        test: {
          testCaseId: string;
          familySlug: string;
          variantSlug: string;
          version: string;
          caseSlug: string;
          evaluator: RunnableTest["evaluator"];
        };
      };
      job: ControlJob;
    }>("/v1/control/runs", {
      method: "POST",
      control: true,
      body: {
        modelId: data.modelId,
        testCaseId: data.testCaseId,
      },
      idempotencyKey: `web-${randomUUID()}`,
    });
  });

export const readJob = createServerFn({ method: "POST" })
  .validator(parseReadJobInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);

    const result = await requestJson<{ job: ControlJob }>(
      `/v1/control/run-jobs/${data.jobId}`,
      { control: true },
    );

    let run: ArchiveRun | null = null;
    if (result.job.runId) {
      try {
        const archived = await requestJson<{ run: ArchiveRun }>(
          `/v1/archive/runs/${result.job.runId}`,
        );
        run = archived.run;
      } catch (error) {
        if (!(error instanceof ApiRequestError) || error.status !== 404) {
          throw error;
        }
      }
    }

    return {
      job: result.job,
      run,
    };
  });

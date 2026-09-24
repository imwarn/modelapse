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
    readonly exactMatch: boolean | null;
  } | null;
  readonly runnerBuild: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly sealedAt: string | null;
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
    throw new ApiRequestError(
      response.status,
      apiErrorMessage(payload, response.status),
    );
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

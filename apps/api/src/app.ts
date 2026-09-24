import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import {
  IdempotencyConflictError,
  parseDirectProviderRunRequest,
  parseRunSelectionRequest,
  type PgRunJobQueue,
  type PgRunPlanner,
  type RunJob,
} from "@modelapse/control-plane";
import type {
  PgArchiveRepository,
  RunRepository,
  RunView,
} from "@modelapse/persistence";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunApiRepository = Pick<RunRepository, "ping" | "getRun">;
type ControlQueue = Pick<PgRunJobQueue, "ping" | "enqueue" | "get">;
type ControlPlanner = Pick<
  PgRunPlanner,
  "ping" | "listModels" | "listTests" | "plan"
>;
type ArchiveRepository = Pick<
  PgArchiveRepository,
  "ping" | "listModels" | "listTests" | "listRuns" | "getRun"
>;

export interface AppDependencies {
  readonly runs: RunApiRepository;
  readonly jobs?: ControlQueue;
  readonly planner?: ControlPlanner;
  readonly archive?: ArchiveRepository;
  readonly controlToken?: string;
}

function publicBlob(blob: RunView["requestBlob"]) {
  if (!blob) return blob;
  return {
    sha256: blob.sha256,
    sizeBytes: blob.sizeBytes,
    mimeType: blob.mimeType,
  };
}

function publicRun(run: RunView) {
  return {
    ...run,
    requestBlob: publicBlob(run.requestBlob),
    responseBlob: publicBlob(run.responseBlob),
  };
}

function controlJob(job: RunJob) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runId: job.runId,
    lastError: job.lastError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

function authorized(header: string | undefined, token: string): boolean {
  const expected = Buffer.from("Bearer " + token);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type ControlAuthIssue = "missing_authorization" | "invalid_authorization";

function controlAuthIssue(
  header: string | undefined,
  token: string,
): ControlAuthIssue | null {
  if (!header) return "missing_authorization";
  return authorized(header, token) ? null : "invalid_authorization";
}

function controlAuthError(issue: ControlAuthIssue) {
  return {
    error: "unauthorized",
    reason: issue,
    build: process.env.MODELAPSE_BUILD ?? "dev",
  } as const;
}

function idempotencyKey(
  value: string | undefined,
): { value?: string; error?: "invalid_idempotency_key" } {
  if (
    value !== undefined &&
    (!value.trim() || value.length > 128)
  ) {
    return { error: "invalid_idempotency_key" };
  }
  return value ? { value } : {};
}

export function createApp(deps: AppDependencies) {
  const app = new Hono();
  const controlToken = deps.controlToken?.trim();

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/healthz", (c) =>
    c.json({
      ok: true,
      service: "modelapse-api",
      version: process.env.MODELAPSE_BUILD ?? "dev",
    }),
  );

  app.get("/readyz", async (c) => {
    try {
      await deps.runs.ping();
      if (deps.jobs) await deps.jobs.ping();
      if (deps.planner) await deps.planner.ping();
      if (deps.archive) await deps.archive.ping();
      return c.json({
        ready: true,
        service: "modelapse-api",
      });
    } catch {
      return c.json(
        {
          ready: false,
          service: "modelapse-api",
        },
        503,
      );
    }
  });

  app.get("/v1/archive/models", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }
    return c.json({ models: await deps.archive.listModels() });
  });

  app.get("/v1/archive/tests", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }
    return c.json({ tests: await deps.archive.listTests() });
  });

  app.get("/v1/archive/runs", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const modelId = c.req.query("modelId");
    const testCaseId = c.req.query("testCaseId");
    const rawLimit = c.req.query("limit");

    if (modelId && !UUID_RE.test(modelId)) {
      return c.json({ error: "invalid_model_id" }, 400);
    }
    if (testCaseId && !UUID_RE.test(testCaseId)) {
      return c.json({ error: "invalid_test_case_id" }, 400);
    }

    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      return c.json({ error: "invalid_limit" }, 400);
    }

    return c.json({
      runs: await deps.archive.listRuns({
        ...(modelId ? { modelId } : {}),
        ...(testCaseId ? { testCaseId } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    });
  });

  app.get("/v1/archive/runs/:runId", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const runId = c.req.param("runId");
    if (!UUID_RE.test(runId)) {
      return c.json({ error: "invalid_run_id" }, 400);
    }

    const run = await deps.archive.getRun(runId);
    if (!run) {
      return c.json({ error: "archive_run_not_found" }, 404);
    }

    return c.json({ run });
  });

  app.get("/v1/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    if (!UUID_RE.test(runId)) {
      return c.json({ error: "invalid_run_id" }, 400);
    }

    const run = await deps.runs.getRun(runId);
    if (!run) {
      return c.json({ error: "run_not_found" }, 404);
    }

    return c.json({ run: publicRun(run) });
  });

  app.get("/v1/control/catalog/models", async (c) => {
    if (!deps.planner || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    return c.json({ models: await deps.planner.listModels() });
  });

  app.get("/v1/control/catalog/tests", async (c) => {
    if (!deps.planner || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    return c.json({ tests: await deps.planner.listTests() });
  });

  app.post("/v1/control/runs", async (c) => {
    if (!deps.jobs || !deps.planner || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    let selection;
    try {
      selection = parseRunSelectionRequest(raw);
    } catch (error) {
      return c.json(
        {
          error: "invalid_run_selection",
          message:
            error instanceof Error ? error.message : "Invalid Run selection",
        },
        400,
      );
    }

    const key = idempotencyKey(c.req.header("idempotency-key"));
    if (key.error) return c.json({ error: key.error }, 400);

    try {
      const plan = await deps.planner.plan(selection);
      const job = await deps.jobs.enqueue({
        payload: plan.jobPayload,
        ...(key.value ? { idempotencyKey: key.value } : {}),
      });

      return c.json(
        {
          selection: {
            model: {
              id: plan.model.id,
              provider: plan.model.provider,
              marketingName: plan.model.marketingName,
              apiModelId: plan.model.apiModelId,
            },
            test: {
              testCaseId: plan.test.testCaseId,
              familySlug: plan.test.familySlug,
              variantSlug: plan.test.variantSlug,
              version: plan.test.version,
              caseSlug: plan.test.caseSlug,
              evaluator: plan.test.evaluator,
            },
          },
          job: controlJob(job),
        },
        202,
      );
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return c.json({ error: "idempotency_conflict" }, 409);
      }
      return c.json(
        {
          error: "run_not_plannable",
          message:
            error instanceof Error ? error.message : "Run cannot be planned",
        },
        400,
      );
    }
  });

  app.post("/v1/control/run-jobs", async (c) => {
    if (!deps.jobs || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    let payload;
    try {
      payload = parseDirectProviderRunRequest(raw);
    } catch (error) {
      return c.json(
        {
          error: "invalid_run_job",
          message: error instanceof Error ? error.message : "Invalid Run job",
        },
        400,
      );
    }

    const key = idempotencyKey(c.req.header("idempotency-key"));
    if (key.error) return c.json({ error: key.error }, 400);

    try {
      const job = await deps.jobs.enqueue({
        payload,
        ...(key.value ? { idempotencyKey: key.value } : {}),
      });
      return c.json({ job: controlJob(job) }, 202);
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return c.json({ error: "idempotency_conflict" }, 409);
      }
      throw error;
    }
  });

  app.get("/v1/control/run-jobs/:jobId", async (c) => {
    if (!deps.jobs || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    const jobId = c.req.param("jobId");
    if (!UUID_RE.test(jobId)) {
      return c.json({ error: "invalid_job_id" }, 400);
    }

    const job = await deps.jobs.get(jobId);
    if (!job) {
      return c.json({ error: "run_job_not_found" }, 404);
    }

    return c.json({ job: controlJob(job) });
  });

  return app;
}

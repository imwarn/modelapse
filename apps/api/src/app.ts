import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import {
  IdempotencyConflictError,
  parseDirectProviderRunRequest,
  type PgRunJobQueue,
  type RunJob,
} from "@modelapse/control-plane";
import type { RunRepository, RunView } from "@modelapse/persistence";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunApiRepository = Pick<RunRepository, "ping" | "getRun">;
type ControlQueue = Pick<PgRunJobQueue, "ping" | "enqueue" | "get">;

export interface AppDependencies {
  readonly runs: RunApiRepository;
  readonly jobs?: ControlQueue;
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

export function createApp(deps: AppDependencies) {
  const app = new Hono();

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

  app.post("/v1/control/run-jobs", async (c) => {
    if (!deps.jobs || !deps.controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    if (!authorized(c.req.header("authorization"), deps.controlToken)) {
      return c.json({ error: "unauthorized" }, 401);
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

    const idempotencyKey = c.req.header("idempotency-key");
    if (
      idempotencyKey !== undefined &&
      (!idempotencyKey.trim() || idempotencyKey.length > 128)
    ) {
      return c.json({ error: "invalid_idempotency_key" }, 400);
    }

    try {
      const job = await deps.jobs.enqueue({
        payload,
        ...(idempotencyKey ? { idempotencyKey } : {}),
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
    if (!deps.jobs || !deps.controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    if (!authorized(c.req.header("authorization"), deps.controlToken)) {
      return c.json({ error: "unauthorized" }, 401);
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

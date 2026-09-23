import { Hono } from "hono";
import type {
  CreatePlannedRunInput,
  RunRepository,
} from "@modelapse/persistence";

const EXECUTION_PATHS = new Set([
  "first_party_direct",
  "first_party_product",
  "routed_provider",
  "cloud_hosted",
  "community_claimed",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunApiRepository = Pick<
  RunRepository,
  "ping" | "createPlannedRun" | "getRun"
>;

export interface AppDependencies {
  readonly runs: RunApiRepository;
  readonly controlToken?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalUuid(
  value: unknown,
): { readonly ok: true; readonly value?: string } | { readonly ok: false } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value === "string" && UUID_RE.test(value)) {
    return { ok: true, value };
  }
  return { ok: false };
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

    return c.json({ run });
  });

  app.post("/v1/runs", async (c) => {
    if (!deps.controlToken) {
      return c.json({ error: "run_submission_disabled" }, 503);
    }
    if (c.req.header("authorization") !== "Bearer " + deps.controlToken) {
      return c.json({ error: "unauthorized" }, 401);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (!isRecord(raw)) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const testCaseId = requiredString(raw, "testCaseId");
    const providerId = requiredString(raw, "providerId");
    const requestedModel = requiredString(raw, "requestedModel");
    const runnerBuild = requiredString(raw, "runnerBuild");
    const executionPathValue = requiredString(raw, "executionPath");

    if (
      !testCaseId ||
      !UUID_RE.test(testCaseId) ||
      !providerId ||
      !UUID_RE.test(providerId) ||
      !requestedModel ||
      !runnerBuild ||
      !executionPathValue ||
      !EXECUTION_PATHS.has(executionPathValue)
    ) {
      return c.json({ error: "invalid_run_request" }, 400);
    }

    const modelId = optionalUuid(raw.modelId);
    const snapshotId = optionalUuid(raw.snapshotId);
    if (!modelId.ok || !snapshotId.ok) {
      return c.json({ error: "invalid_run_request" }, 400);
    }
    if (raw.config !== undefined && !isRecord(raw.config)) {
      return c.json({ error: "invalid_run_config" }, 400);
    }

    const input: CreatePlannedRunInput = {
      testCaseId,
      providerId,
      executionPath:
        executionPathValue as CreatePlannedRunInput["executionPath"],
      requestedModel,
      runnerBuild,
      ...(modelId.value ? { modelId: modelId.value } : {}),
      ...(snapshotId.value ? { snapshotId: snapshotId.value } : {}),
      ...(isRecord(raw.config)
        ? {
            config:
              raw.config as NonNullable<CreatePlannedRunInput["config"]>,
          }
        : {}),
    };

    const run = await deps.runs.createPlannedRun(input);
    return c.json({ run }, 201);
  });

  return app;
}

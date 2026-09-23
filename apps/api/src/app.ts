import { Hono } from "hono";
import type { RunRepository, RunView } from "@modelapse/persistence";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunApiRepository = Pick<RunRepository, "ping" | "getRun">;

export interface AppDependencies {
  readonly runs: RunApiRepository;
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

    return c.json({ run: publicRun(run) });
  });

  return app;
}

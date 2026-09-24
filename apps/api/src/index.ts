import { serve } from "@hono/node-server";
import {
  PgRunJobQueue,
  PgRunPlanner,
} from "@modelapse/control-plane";
import {
  PgArchiveRepository,
  PgRunRepository,
} from "@modelapse/persistence";
import { createApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const runs = PgRunRepository.connect(databaseUrl);
const jobs = PgRunJobQueue.connect(databaseUrl);
const planner = PgRunPlanner.connect(databaseUrl);
const archive = PgArchiveRepository.connect(databaseUrl);
const controlToken = process.env.MODELAPSE_CONTROL_TOKEN;
const port = Number(process.env.PORT ?? "3000");
const app = createApp({
  runs,
  jobs,
  planner,
  archive,
  ...(controlToken ? { controlToken } : {}),
});

const server = serve({
  fetch: app.fetch,
  port,
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(signal + ": shutting down modelapse-api");

  server.close((error) => {
    void Promise.all([
      runs.close(),
      jobs.close(),
      planner.close(),
      archive.close(),
    ]).finally(() => {
      if (error) {
        console.error(error);
        process.exit(1);
      }
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

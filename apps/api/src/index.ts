import { serve } from "@hono/node-server";
import { PgRunRepository } from "@modelapse/persistence";
import { Pool } from "pg";
import { createApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });
const runs = new PgRunRepository(pool);
const controlToken = process.env.MODELAPSE_CONTROL_TOKEN;
const port = Number(process.env.PORT ?? "3000");
const app = createApp({
  runs,
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
    void pool.end().finally(() => {
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

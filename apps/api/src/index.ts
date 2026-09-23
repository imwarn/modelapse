import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? "3000");
const app = createApp();

const server = serve({
  fetch: app.fetch,
  port,
});

function shutdown(signal: string): void {
  console.log(`${signal}: shutting down modelapse-api`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

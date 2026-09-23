import { Hono } from "hono";

export function createApp() {
  const app = new Hono();

  app.get("/healthz", (c) =>
    c.json({
      ok: true,
      service: "modelapse-api",
      version: process.env.MODELAPSE_BUILD ?? "dev",
    }),
  );

  app.get("/readyz", (c) =>
    c.json({
      ready: true,
      service: "modelapse-api",
    }),
  );

  return app;
}

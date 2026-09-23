import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { RunView } from "@modelapse/persistence";

const RUN_ID = "00000000-0000-4000-8000-000000000001";

const run = {
  id: RUN_ID,
  status: "completed",
} as RunView;

describe("Run API", () => {
  it("returns a run projection without exposing blob storage internals", async () => {
    const storedRun = {
      ...run,
      requestBlob: {
        sha256: "a".repeat(64),
        sizeBytes: 123,
        mimeType: "application/json",
        objectKey: "sha256/aa/aa/" + "a".repeat(64),
        visibility: "private",
      },
      responseBlob: {
        sha256: "b".repeat(64),
        sizeBytes: 456,
        mimeType: "application/json",
        objectKey: "sha256/bb/bb/" + "b".repeat(64),
        visibility: "private",
      },
    } as RunView;

    const app = createApp({
      runs: {
        ping: async () => undefined,
        getRun: async () => storedRun,
      },
    });

    const response = await app.request("/v1/runs/" + RUN_ID);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      run: {
        id: RUN_ID,
        status: "completed",
        requestBlob: {
          sha256: "a".repeat(64),
          sizeBytes: 123,
          mimeType: "application/json",
        },
        responseBlob: {
          sha256: "b".repeat(64),
          sizeBytes: 456,
          mimeType: "application/json",
        },
      },
    });
  });

  it("rejects malformed run ids before repository access", async () => {
    let called = false;
    const app = createApp({
      runs: {
        ping: async () => undefined,
        getRun: async () => {
          called = true;
          return null;
        },
      },
    });

    const response = await app.request("/v1/runs/not-a-uuid");
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  it("does not expose a direct run-creation endpoint", async () => {
    const app = createApp({
      runs: {
        ping: async () => undefined,
        getRun: async () => null,
      },
    });

    const response = await app.request("/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(404);
  });
});

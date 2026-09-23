import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { RunView } from "@modelapse/persistence";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const TEST_CASE_ID = "00000000-0000-4000-8000-000000000002";
const PROVIDER_ID = "00000000-0000-4000-8000-000000000003";

const run = {
  id: RUN_ID,
  status: "planned",
} as RunView;

describe("Run API", () => {
  it("returns a run projection without exposing blob bytes", async () => {
    const app = createApp({
      runs: {
        ping: async () => undefined,
        getRun: async () => run,
        createPlannedRun: async () => run,
      },
    });

    const response = await app.request("/v1/runs/" + RUN_ID);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ run });
  });

  it("keeps run creation disabled without a control token", async () => {
    const app = createApp({
      runs: {
        ping: async () => undefined,
        getRun: async () => null,
        createPlannedRun: async () => run,
      },
    });

    const response = await app.request("/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(503);
  });

  it("creates a planned run with an authorized control request", async () => {
    let requestedModel: string | undefined;
    const app = createApp({
      controlToken: "test-secret",
      runs: {
        ping: async () => undefined,
        getRun: async () => null,
        createPlannedRun: async (input) => {
          requestedModel = input.requestedModel;
          return run;
        },
      },
    });

    const response = await app.request("/v1/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        testCaseId: TEST_CASE_ID,
        providerId: PROVIDER_ID,
        executionPath: "first_party_direct",
        requestedModel: "gpt-test",
        runnerBuild: "test-build",
      }),
    });

    expect(response.status).toBe(201);
    expect(requestedModel).toBe("gpt-test");
  });
});

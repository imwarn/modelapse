import { describe, expect, it } from "vitest";
import type { RunJob } from "@modelapse/control-plane";
import { createApp } from "../src/app.js";

const TEST_CASE_ID = "00000000-0000-4000-8000-000000000001";
const JOB_ID = "00000000-0000-4000-8000-000000000002";

const queuedJob = {
  id: JOB_ID,
  kind: "openai_direct",
  payload: {
    provider: "openai",
    testCaseId: TEST_CASE_ID,
    model: "gpt-test",
  },
  status: "queued",
  idempotencyKey: "request-1",
  attempts: 0,
  maxAttempts: 3,
  availableAt: "2026-09-23T00:00:00.000Z",
  claimedAt: null,
  leaseExpiresAt: null,
  workerId: null,
  runId: null,
  lastError: null,
  completedAt: null,
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
} as const satisfies RunJob;

function baseRuns() {
  return {
    ping: async () => undefined,
    getRun: async () => null,
  };
}

describe("Run job control API", () => {
  it("is disabled unless a control token and queue are configured", async () => {
    const app = createApp({ runs: baseRuns() });
    const response = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(503);
  });

  it("requires bearer authentication and enqueues only the narrow job contract", async () => {
    let idempotencyKey: string | undefined;
    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      jobs: {
        ping: async () => undefined,
        get: async () => queuedJob,
        enqueue: async (input) => {
          idempotencyKey = input.idempotencyKey;
          return queuedJob;
        },
      },
    });

    const unauthorized = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
      }),
    });
    expect(unauthorized.status).toBe(401);

    const invalid = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer control-secret",
      },
      body: JSON.stringify({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        prompt: "caller override",
      }),
    });
    expect(invalid.status).toBe(400);

    const accepted = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer control-secret",
        "idempotency-key": "request-1",
      },
      body: JSON.stringify({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
      }),
    });

    expect(accepted.status).toBe(202);
    expect(idempotencyKey).toBe("request-1");
    await expect(accepted.json()).resolves.toEqual({
      job: {
        id: JOB_ID,
        kind: "openai_direct",
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        runId: null,
        lastError: null,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
        completedAt: null,
      },
    });
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  IdempotencyConflictError,
  PgRunJobQueue,
} from "../src/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

describe("PostgreSQL Run job queue", () => {
  const queue = PgRunJobQueue.connect(DATABASE_URL, { max: 2 });

  afterAll(async () => {
    await queue.close();
  });

  it("deduplicates submissions and enforces an active worker lease", async () => {
    const idempotencyKey = "integration-" + randomUUID();
    const payload = {
      provider: "openai" as const,
      testCaseId: randomUUID(),
      model: "gpt-test",
    };

    const first = await queue.enqueue({ payload, idempotencyKey });
    const second = await queue.enqueue({ payload, idempotencyKey });

    expect(second.id).toBe(first.id);
    expect(first.status).toBe("queued");

    await expect(
      queue.enqueue({
        payload: { ...payload, model: "different-model" },
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    const claimed = await queue.claimNext({
      workerId: "worker-a",
      leaseSeconds: 120,
    });
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.attempts).toBe(1);

    const noSecondClaim = await queue.claimNext({
      workerId: "worker-b",
      leaseSeconds: 120,
    });
    expect(noSecondClaim).toBeNull();

    await expect(
      queue.fail({
        jobId: first.id,
        workerId: "worker-b",
        error: "wrong worker",
      }),
    ).rejects.toThrow(/lease/);

    const failed = await queue.fail({
      jobId: first.id,
      workerId: "worker-a",
      error: "fixture failure",
    });
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toBe("fixture failure");
  });
});

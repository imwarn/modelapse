import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  IdempotencyConflictError,
  PgRunJobQueue,
} from "../src/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

describe("PostgreSQL Run job queue", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const queue = PgRunJobQueue.connect(DATABASE_URL, { max: 2 });

  afterAll(async () => {
    await queue.close();
    await pool.end();
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
      queue.succeed({
        jobId: first.id,
        workerId: "worker-b",
        runId: randomUUID(),
      }),
    ).rejects.toThrow(/lease/);

    const runId = randomUUID();
    await pool.query(
      `INSERT INTO modelapse.providers (id, slug, name)
       VALUES ($1, $2, 'Queue fixture')`,
      [runId, "queue-fixture-" + randomUUID().slice(0, 8)],
    ).catch(() => undefined);

    // succeed() requires a real Run FK. Verify terminal failure here and success
    // is covered by the runner queue integration where a real Run exists.
    const failed = await queue.fail({
      jobId: first.id,
      workerId: "worker-a",
      error: "fixture failure",
    });
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toBe("fixture failure");
  });
});

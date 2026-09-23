import { Pool } from "pg";
import {
  parseDirectOpenAIRunRequest,
  type DirectOpenAIRunRequest,
} from "./job.js";

export type RunJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface RunJob {
  readonly id: string;
  readonly kind: "openai_direct";
  readonly payload: DirectOpenAIRunRequest;
  readonly status: RunJobStatus;
  readonly idempotencyKey: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: string;
  readonly claimedAt: string | null;
  readonly leaseExpiresAt: string | null;
  readonly workerId: string | null;
  readonly runId: string | null;
  readonly lastError: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RunJobRow {
  id: string;
  kind: "openai_direct";
  payload: unknown;
  status: RunJobStatus;
  idempotency_key: string | null;
  attempts: number;
  max_attempts: number;
  available_at: Date;
  claimed_at: Date | null;
  lease_expires_at: Date | null;
  worker_id: string | null;
  run_id: string | null;
  last_error: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const SELECT_COLUMNS = `
  id,
  kind,
  payload,
  status,
  idempotency_key,
  attempts,
  max_attempts,
  available_at,
  claimed_at,
  lease_expires_at,
  worker_id,
  run_id,
  last_error,
  completed_at,
  created_at,
  updated_at
`;

function view(row: RunJobRow): RunJob {
  return {
    id: row.id,
    kind: row.kind,
    payload: parseDirectOpenAIRunRequest(row.payload),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at.toISOString(),
    claimedAt: row.claimed_at?.toISOString() ?? null,
    leaseExpiresAt: row.lease_expires_at?.toISOString() ?? null,
    workerId: row.worker_id,
    runId: row.run_id,
    lastError: row.last_error,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key is already associated with a different Run job");
    this.name = "IdempotencyConflictError";
  }
}

export class JobLeaseError extends Error {
  constructor(jobId: string) {
    super("Run job lease is not held by this worker: " + jobId);
    this.name = "JobLeaseError";
  }
}

export class PgRunJobQueue {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgRunJobQueue {
    return new PgRunJobQueue(
      new Pool({
        connectionString,
        max: options.max ?? 5,
      }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async enqueue(input: {
    readonly payload: DirectOpenAIRunRequest;
    readonly idempotencyKey?: string;
  }): Promise<RunJob> {
    const payload = parseDirectOpenAIRunRequest(input.payload);
    const idempotencyKey = input.idempotencyKey?.trim();
    if (idempotencyKey !== undefined) {
      if (!idempotencyKey || idempotencyKey.length > 128) {
        throw new Error("Idempotency key must contain 1-128 characters");
      }
    }

    const inserted = await this.pool.query<RunJobRow>(
      `INSERT INTO modelapse.run_jobs
        (kind, payload, idempotency_key)
       VALUES ('openai_direct', $1::jsonb, $2)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING ${SELECT_COLUMNS}`,
      [JSON.stringify(payload), idempotencyKey ?? null],
    );

    if (inserted.rows[0]) return view(inserted.rows[0]);

    if (!idempotencyKey) {
      throw new Error("Run job insert failed");
    }

    const existing = await this.pool.query<RunJobRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM modelapse.run_jobs
        WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("Idempotent Run job could not be reloaded");

    const existingPayload = parseDirectOpenAIRunRequest(row.payload);
    if (JSON.stringify(existingPayload) !== JSON.stringify(payload)) {
      throw new IdempotencyConflictError();
    }

    return view(row);
  }

  async get(jobId: string): Promise<RunJob | null> {
    const result = await this.pool.query<RunJobRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM modelapse.run_jobs
        WHERE id = $1`,
      [jobId],
    );
    return result.rows[0] ? view(result.rows[0]) : null;
  }

  async claimNext(input: {
    readonly workerId: string;
    readonly leaseSeconds: number;
  }): Promise<RunJob | null> {
    if (!input.workerId.trim()) throw new Error("workerId is required");
    if (
      !Number.isInteger(input.leaseSeconds) ||
      input.leaseSeconds < 30 ||
      input.leaseSeconds > 3600
    ) {
      throw new Error("leaseSeconds must be an integer between 30 and 3600");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE modelapse.run_jobs
            SET status = 'failed',
                worker_id = NULL,
                lease_expires_at = NULL,
                completed_at = now(),
                updated_at = now(),
                last_error = COALESCE(last_error, 'worker lease expired after maximum attempts')
          WHERE status = 'running'
            AND lease_expires_at <= now()
            AND attempts >= max_attempts`,
      );

      const result = await client.query<RunJobRow>(
        `WITH candidate AS (
           SELECT id AS candidate_id
             FROM modelapse.run_jobs
            WHERE attempts < max_attempts
              AND (
                (status = 'queued' AND available_at <= now())
                OR
                (status = 'running' AND lease_expires_at <= now())
              )
            ORDER BY available_at ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         UPDATE modelapse.run_jobs j
            SET status = 'running',
                attempts = j.attempts + 1,
                claimed_at = now(),
                lease_expires_at = now() + make_interval(secs => $2),
                worker_id = $1,
                last_error = CASE
                  WHEN j.status = 'running'
                    THEN COALESCE(j.last_error, 'previous worker lease expired')
                  ELSE j.last_error
                END,
                updated_at = now()
           FROM candidate
          WHERE j.id = candidate.candidate_id
          RETURNING ${SELECT_COLUMNS}`,
        [input.workerId, input.leaseSeconds],
      );

      await client.query("COMMIT");
      return result.rows[0] ? view(result.rows[0]) : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async succeed(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly runId: string;
  }): Promise<RunJob> {
    const result = await this.pool.query<RunJobRow>(
      `UPDATE modelapse.run_jobs
          SET status = 'succeeded',
              run_id = $3,
              worker_id = NULL,
              lease_expires_at = NULL,
              completed_at = now(),
              last_error = NULL,
              updated_at = now()
        WHERE id = $1
          AND status = 'running'
          AND worker_id = $2
          AND lease_expires_at > now()
        RETURNING ${SELECT_COLUMNS}`,
      [input.jobId, input.workerId, input.runId],
    );
    const row = result.rows[0];
    if (!row) throw new JobLeaseError(input.jobId);
    return view(row);
  }

  async fail(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly error: string;
    readonly runId?: string;
  }): Promise<RunJob> {
    const error = input.error.trim().slice(0, 2000) || "Run job failed";
    const result = await this.pool.query<RunJobRow>(
      `UPDATE modelapse.run_jobs
          SET status = 'failed',
              worker_id = NULL,
              lease_expires_at = NULL,
              completed_at = now(),
              run_id = COALESCE($4, run_id),
              last_error = $3,
              updated_at = now()
        WHERE id = $1
          AND status = 'running'
          AND worker_id = $2
          AND lease_expires_at > now()
        RETURNING ${SELECT_COLUMNS}`,
      [input.jobId, input.workerId, error, input.runId ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new JobLeaseError(input.jobId);
    return view(row);
  }
}

import { Pool } from "pg";
import {
  parseDirectProviderRunRequest,
  UUID_RE,
  type DirectProviderRunRequest,
} from "./job.js";

export type RunJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface RunJob {
  readonly id: string;
  readonly kind: "openai_direct" | "deepseek_direct";
  readonly payload: DirectProviderRunRequest;
  readonly status: RunJobStatus;
  readonly idempotencyKey: string | null;
  readonly targetExecutionEnvironmentId: string | null;
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
  kind: "openai_direct" | "deepseek_direct";
  payload: unknown;
  status: RunJobStatus;
  idempotency_key: string | null;
  target_execution_environment_id: string | null;
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
  target_execution_environment_id,
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
    payload: parseDirectProviderRunRequest(row.payload),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    targetExecutionEnvironmentId: row.target_execution_environment_id,
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

function idempotencyComparable(request: DirectProviderRunRequest): unknown {
  const { qualification, cost, fleet, ...rest } = request;
  const comparableQualification = qualification
    ? (({ selectedAt: _selectedAt, ...value }) => value)(qualification)
    : undefined;
  const comparableCost = cost
    ? (({ selectedAt: _selectedAt, ...value }) => value)(cost)
    : undefined;
  const comparableFleet = fleet
    ? (({ selectedAt: _selectedAt, ...value }) => value)(fleet)
    : undefined;

  return {
    ...rest,
    ...(comparableQualification
      ? { qualification: comparableQualification }
      : {}),
    ...(comparableCost ? { cost: comparableCost } : {}),
    ...(comparableFleet ? { fleet: comparableFleet } : {}),
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
    readonly payload: DirectProviderRunRequest;
    readonly idempotencyKey?: string;
  }): Promise<RunJob> {
    const payload = parseDirectProviderRunRequest(input.payload);
    const idempotencyKey = input.idempotencyKey?.trim();
    if (idempotencyKey !== undefined) {
      if (!idempotencyKey || idempotencyKey.length > 128) {
        throw new Error("Idempotency key must contain 1-128 characters");
      }
    }

    const inserted = await this.pool.query<RunJobRow>(
      `INSERT INTO modelapse.run_jobs
        (kind, payload, idempotency_key, target_execution_environment_id)
       VALUES ($3, $1::jsonb, $2, $4)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING ${SELECT_COLUMNS}`,
      [
        JSON.stringify(payload),
        idempotencyKey ?? null,
        payload.provider === "openai" ? "openai_direct" : "deepseek_direct",
        payload.fleet?.environmentId ?? null,
      ],
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

    const existingPayload = parseDirectProviderRunRequest(row.payload);
    if (
      JSON.stringify(idempotencyComparable(existingPayload)) !==
      JSON.stringify(idempotencyComparable(payload))
    ) {
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
    readonly executionEnvironmentId?: string;
  }): Promise<RunJob | null> {
    if (!input.workerId.trim()) throw new Error("workerId is required");
    if (
      input.executionEnvironmentId !== undefined &&
      !UUID_RE.test(input.executionEnvironmentId)
    ) {
      throw new Error("executionEnvironmentId must be a UUID");
    }
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
           SELECT job.id AS candidate_id
             FROM modelapse.run_jobs job
            WHERE job.attempts < job.max_attempts
              AND (
                (job.status = 'queued' AND job.available_at <= now())
                OR
                (job.status = 'running' AND job.lease_expires_at <= now())
              )
              AND (
                ($3::uuid IS NULL AND job.target_execution_environment_id IS NULL)
                OR
                (
                  $3::uuid IS NOT NULL
                  AND job.target_execution_environment_id = $3
                  AND EXISTS (
                    SELECT 1
                      FROM modelapse.execution_environment_current_state state
                     WHERE state.environment_id = $3
                       AND state.enabled
                  )
                  AND EXISTS (
                    SELECT 1
                      FROM modelapse.execution_environment_capabilities_current capability
                      JOIN modelapse.providers provider
                        ON provider.id = capability.provider_id
                     WHERE capability.environment_id = $3
                       AND capability.execution_path = 'first_party_direct'
                       AND capability.enabled
                       AND provider.slug = job.payload->>'provider'
                  )
                )
              )
            ORDER BY job.available_at ASC, job.created_at ASC
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
        [
          input.workerId,
          input.leaseSeconds,
          input.executionEnvironmentId ?? null,
        ],
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

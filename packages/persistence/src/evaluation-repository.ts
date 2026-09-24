import type { BlobDescriptor } from "@modelapse/blob-store";
import { Pool, type PoolClient } from "pg";

export interface EvaluationTarget {
  readonly runId: string;
  readonly evaluatorId: string;
  readonly evaluatorSlug: string;
  readonly evaluatorVersion: string;
  readonly evaluatorKind: string;
  readonly definitionSha256: string;
  readonly expected: string;
  readonly assertion: string;
}

export interface EvaluationView {
  readonly id: string;
  readonly runId: string;
  readonly evaluatorId: string;
  readonly evaluatorSlug: string;
  readonly evaluatorVersion: string;
  readonly evaluatorKind: string;
  readonly definitionSha256: string;
  readonly status: string;
  readonly rawResultSha256: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly metrics: Readonly<Record<string, number | string | unknown>>;
}

async function registerBlob(
  client: PoolClient,
  blob: BlobDescriptor,
): Promise<void> {
  await client.query(
    `INSERT INTO modelapse.blobs
      (sha256, size_bytes, mime_type, object_key, visibility)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sha256) DO NOTHING`,
    [
      blob.sha256,
      blob.sizeBytes,
      blob.mimeType,
      blob.objectKey,
      blob.visibility,
    ],
  );

  const existing = await client.query<{
    size_bytes: string;
    mime_type: string;
    object_key: string;
    visibility: string;
  }>(
    `SELECT size_bytes, mime_type, object_key, visibility
       FROM modelapse.blobs
      WHERE sha256 = $1`,
    [blob.sha256],
  );
  const row = existing.rows[0];
  if (
    !row ||
    Number(row.size_bytes) !== blob.sizeBytes ||
    row.mime_type !== blob.mimeType ||
    row.object_key !== blob.objectKey ||
    row.visibility !== blob.visibility
  ) {
    throw new Error("Evaluation result blob conflicts with catalog metadata");
  }
}

function evaluationView(row: {
  id: string;
  run_id: string;
  evaluator_id: string;
  evaluator_slug: string;
  evaluator_version: string;
  evaluator_kind: string;
  definition_sha256: string;
  status: string;
  raw_result_blob_sha256: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  metrics: Readonly<Record<string, unknown>> | null;
}): EvaluationView {
  return {
    id: row.id,
    runId: row.run_id,
    evaluatorId: row.evaluator_id,
    evaluatorSlug: row.evaluator_slug,
    evaluatorVersion: row.evaluator_version,
    evaluatorKind: row.evaluator_kind,
    definitionSha256: row.definition_sha256,
    status: row.status,
    rawResultSha256: row.raw_result_blob_sha256,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    metrics: row.metrics ?? {},
  };
}

const VIEW_SQL = `
  SELECT
    ev.id,
    ev.run_id,
    ev.evaluator_id,
    e.slug AS evaluator_slug,
    e.version AS evaluator_version,
    e.kind AS evaluator_kind,
    e.definition_sha256,
    ev.status,
    ev.raw_result_blob_sha256,
    ev.started_at,
    ev.completed_at,
    ev.created_at,
    COALESCE(
      jsonb_object_agg(
        mv.metric_key,
        COALESCE(
          to_jsonb(mv.numeric_value),
          to_jsonb(mv.text_value),
          mv.json_value
        )
      ) FILTER (WHERE mv.metric_key IS NOT NULL),
      '{}'::jsonb
    ) AS metrics
  FROM modelapse.evaluations ev
  JOIN modelapse.evaluators e ON e.id = ev.evaluator_id
  LEFT JOIN modelapse.metric_values mv ON mv.evaluation_id = ev.id
`;

export class PgEvaluationRepository {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgEvaluationRepository {
    return new PgEvaluationRepository(
      new Pool({
        connectionString,
        max: options.max ?? 3,
      }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async resolveForRun(runId: string): Promise<EvaluationTarget | null> {
    const result = await this.pool.query<{
      run_id: string;
      evaluator_id: string;
      evaluator_slug: string;
      evaluator_version: string;
      evaluator_kind: string;
      definition_sha256: string;
      expected: string | null;
      assertion: string | null;
    }>(
      `SELECT
         r.id AS run_id,
         e.id AS evaluator_id,
         e.slug AS evaluator_slug,
         e.version AS evaluator_version,
         e.kind AS evaluator_kind,
         e.definition_sha256,
         tc.metadata->>'expected' AS expected,
         tc.metadata->>'assertion' AS assertion
       FROM modelapse.runs r
       JOIN modelapse.test_cases tc ON tc.id = r.test_case_id
       JOIN modelapse.test_version_evaluators tve
         ON tve.test_version_id = tc.test_version_id
       JOIN modelapse.evaluators e ON e.id = tve.evaluator_id
       WHERE r.id = $1
         AND r.status = 'completed'
         AND r.sealed_at IS NOT NULL`,
      [runId],
    );

    const row = result.rows[0];
    if (!row) return null;
    if (!row.expected || !row.assertion) {
      throw new Error("Test Case evaluator metadata is incomplete");
    }

    return {
      runId: row.run_id,
      evaluatorId: row.evaluator_id,
      evaluatorSlug: row.evaluator_slug,
      evaluatorVersion: row.evaluator_version,
      evaluatorKind: row.evaluator_kind,
      definitionSha256: row.definition_sha256,
      expected: row.expected,
      assertion: row.assertion,
    };
  }

  async recordExactText(input: {
    readonly runId: string;
    readonly evaluatorId: string;
    readonly rawResultBlob: BlobDescriptor;
    readonly expected: string;
    readonly actual: string;
    readonly exactMatch: boolean;
    readonly startedAt: string;
    readonly completedAt: string;
  }): Promise<EvaluationView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await registerBlob(client, input.rawResultBlob);

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO modelapse.evaluations
          (
            run_id,
            evaluator_id,
            status,
            raw_result_blob_sha256,
            started_at,
            completed_at
          )
         VALUES ($1, $2, 'completed', $3, $4, $5)
         ON CONFLICT (run_id, evaluator_id) DO NOTHING
         RETURNING id`,
        [
          input.runId,
          input.evaluatorId,
          input.rawResultBlob.sha256,
          input.startedAt,
          input.completedAt,
        ],
      );

      let evaluationId = inserted.rows[0]?.id;
      if (!evaluationId) {
        const existing = await client.query<{
          id: string;
          status: string;
          raw_result_blob_sha256: string | null;
        }>(
          `SELECT id, status, raw_result_blob_sha256
             FROM modelapse.evaluations
            WHERE run_id = $1
              AND evaluator_id = $2`,
          [input.runId, input.evaluatorId],
        );
        const row = existing.rows[0];
        if (
          !row ||
          row.status !== "completed" ||
          row.raw_result_blob_sha256 !== input.rawResultBlob.sha256
        ) {
          throw new Error("Evaluation idempotency conflict");
        }
        evaluationId = row.id;
      }

      const metrics = [
        ["exact_match", input.exactMatch ? 1 : 0, null, null],
        ["expected_text", null, input.expected, null],
        ["actual_text", null, input.actual, null],
      ] as const;

      for (const [key, numeric, text, json] of metrics) {
        await client.query(
          `INSERT INTO modelapse.metric_values
            (evaluation_id, metric_key, numeric_value, text_value, json_value)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (evaluation_id, metric_key) DO NOTHING`,
          [
            evaluationId,
            key,
            numeric,
            text,
            json === null ? null : JSON.stringify(json),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const view = await this.getForRun(input.runId);
    const found = view.find((item) => item.evaluatorId === input.evaluatorId);
    if (!found) throw new Error("Recorded Evaluation could not be reloaded");
    return found;
  }

  async getForRun(runId: string): Promise<readonly EvaluationView[]> {
    const result = await this.pool.query(
      VIEW_SQL +
        `
       WHERE ev.run_id = $1
       GROUP BY
         ev.id,
         e.id
       ORDER BY ev.created_at ASC`,
      [runId],
    );

    return result.rows.map((row) => evaluationView(row));
  }
}

import type { BlobDescriptor } from "@modelapse/blob-store";
import type { RunStatus } from "@modelapse/domain";
import { Pool, type PoolClient } from "pg";
import type {
  CreatePlannedRunInput,
  DirectExecutionTarget,
  RunRepository,
  RunView,
  SealRunInput,
} from "./types.js";

function jsonValue(value: unknown): unknown {
  return value === undefined ? null : value;
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
  if (!row) {
    throw new Error("Blob registration failed for " + blob.sha256);
  }

  if (
    Number(row.size_bytes) !== blob.sizeBytes ||
    row.mime_type !== blob.mimeType ||
    row.object_key !== blob.objectKey ||
    row.visibility !== blob.visibility
  ) {
    throw new Error("Blob descriptor conflict for " + blob.sha256);
  }
}

export class PgRunRepository implements RunRepository {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgRunRepository {
    return new PgRunRepository(
      new Pool({
        connectionString,
        max: options.max ?? 10,
      }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async resolveDirectExecutionTarget(input: {
    readonly testCaseId: string;
    readonly providerSlug: string;
    readonly endpointHostname: string;
    readonly modelId?: string;
    readonly requestedModel?: string;
  }): Promise<DirectExecutionTarget> {
    if ((input.modelId === undefined) !== (input.requestedModel === undefined)) {
      throw new Error(
        "modelId and requestedModel must either both be supplied or both be omitted",
      );
    }

    const result = await this.pool.query<{
      test_case_id: string;
      provider_id: string;
      provider_slug: string;
      endpoint_base_url: string;
      endpoint_hostname: string;
      model_id: string | null;
      snapshot_id: string | null;
      prompt_sha256: string;
      prompt_size_bytes: string;
      prompt_mime_type: string;
      prompt_object_key: string;
      prompt_visibility: "public" | "private";
    }>(
      `SELECT
         tc.id AS test_case_id,
         p.id AS provider_id,
         p.slug AS provider_slug,
         pe.base_url AS endpoint_base_url,
         pe.hostname AS endpoint_hostname,
         m.id AS model_id,
         meb.snapshot_id,
         b.sha256 AS prompt_sha256,
         b.size_bytes AS prompt_size_bytes,
         b.mime_type AS prompt_mime_type,
         b.object_key AS prompt_object_key,
         b.visibility AS prompt_visibility
       FROM modelapse.test_cases tc
       JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
       JOIN modelapse.blobs b ON b.sha256 = tc.prompt_blob_sha256
       JOIN modelapse.providers p ON p.slug = $2
       JOIN modelapse.provider_endpoints pe
         ON pe.provider_id = p.id
        AND pe.path = 'first_party_direct'
        AND pe.hostname = $3
        AND pe.source_id IS NOT NULL
        AND (pe.valid_from IS NULL OR pe.valid_from <= now())
        AND (pe.valid_to IS NULL OR pe.valid_to > now())
       LEFT JOIN modelapse.models m
         ON m.id = $4::uuid
        AND m.provider_id = p.id
        AND m.status IN ('preview', 'active')
        AND m.canonical_source_id IS NOT NULL
       LEFT JOIN modelapse.model_execution_bindings meb
         ON meb.model_id = m.id
        AND meb.endpoint_id = pe.id
        AND meb.api_model_id = $5
        AND meb.source_id IS NOT NULL
        AND meb.valid_from <= now()
        AND (meb.valid_to IS NULL OR meb.valid_to > now())
       WHERE tc.id = $1
         AND tc.status = 'active'
         AND tv.status = 'published'
         AND (tc.active_from IS NULL OR tc.active_from <= now())
         AND (tc.active_to IS NULL OR tc.active_to > now())
         AND (
           $4::uuid IS NULL
           OR (m.id IS NOT NULL AND meb.id IS NOT NULL)
         )
       ORDER BY
         pe.valid_from DESC NULLS LAST,
         meb.valid_from DESC NULLS LAST
       LIMIT 1`,
      [
        input.testCaseId,
        input.providerSlug,
        input.endpointHostname,
        input.modelId ?? null,
        input.requestedModel ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(
        input.modelId
          ? "Selected canonical model, Test Case and sourced first-party binding are no longer runnable"
          : "No active published Test Case and verified first-party endpoint match the direct execution request",
      );
    }

    return {
      testCaseId: row.test_case_id,
      providerId: row.provider_id,
      providerSlug: row.provider_slug,
      endpointBaseUrl: row.endpoint_base_url,
      endpointHostname: row.endpoint_hostname,
      modelId: row.model_id,
      snapshotId: row.snapshot_id,
      promptBlob: {
        sha256: row.prompt_sha256,
        sizeBytes: Number(row.prompt_size_bytes),
        mimeType: row.prompt_mime_type,
        objectKey: row.prompt_object_key,
        visibility: row.prompt_visibility,
      },
    };
  }

  async createPlannedRun(input: CreatePlannedRunInput): Promise<RunView> {
    const client = await this.pool.connect();
    let runId: string | undefined;
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO modelapse.runs
          (
            test_case_id,
            model_id,
            snapshot_id,
            provider_id,
            execution_path,
            requested_model,
            status,
            runner_build
          )
         VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7)
         RETURNING id`,
        [
          input.testCaseId,
          input.modelId ?? null,
          input.snapshotId ?? null,
          input.providerId,
          input.executionPath,
          input.requestedModel,
          input.runnerBuild,
        ],
      );

      runId = inserted.rows[0]?.id;
      if (!runId) {
        throw new Error("Run insert did not return an id");
      }

      if (input.config) {
        await client.query(
          `INSERT INTO modelapse.run_configs
            (
              run_id,
              temperature,
              top_p,
              max_output_tokens,
              reasoning_mode,
              reasoning_effort,
              seed,
              service_tier,
              tool_config,
              provider_config
            )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            runId,
            input.config.temperature ?? null,
            input.config.topP ?? null,
            input.config.maxOutputTokens ?? null,
            input.config.reasoningMode ?? null,
            input.config.reasoningEffort ?? null,
            input.config.seed ?? null,
            input.config.serviceTier ?? null,
            jsonValue(input.config.tools),
            jsonValue(input.config.providerConfig),
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

    const run = await this.getRun(runId);
    if (!run) {
      throw new Error("Created run could not be reloaded");
    }
    return run;
  }

  async markStatus(runId: string, status: RunStatus): Promise<void> {
    const result = await this.pool.query(
      `UPDATE modelapse.runs
          SET status = $2,
              started_at = CASE
                WHEN $2::modelapse.run_status = 'executing'
                  THEN COALESCE(started_at, now())
                ELSE started_at
              END,
              completed_at = CASE
                WHEN $2::modelapse.run_status IN (
                  'completed',
                  'failed_request',
                  'blocked',
                  'timeout',
                  'invalid_output',
                  'artifact_failed'
                )
                  THEN COALESCE(completed_at, now())
                ELSE completed_at
              END
        WHERE id = $1
          AND sealed_at IS NULL`,
      [runId, status],
    );

    if (result.rowCount !== 1) {
      const found = await this.pool.query(
        "SELECT sealed_at FROM modelapse.runs WHERE id = $1",
        [runId],
      );
      if (!found.rows[0]) {
        throw new Error("Run not found: " + runId);
      }
      throw new Error("Cannot mutate sealed run: " + runId);
    }
  }

  async sealRun(input: SealRunInput): Promise<RunView> {
    const client = await this.pool.connect();
    let idempotent = false;
    try {
      await client.query("BEGIN");

      const locked = await client.query<{
        execution_path: string;
        sealed_at: Date | null;
        request_blob_sha256: string | null;
        response_blob_sha256: string | null;
      }>(
        `SELECT execution_path, sealed_at, request_blob_sha256, response_blob_sha256
           FROM modelapse.runs
          WHERE id = $1
          FOR UPDATE`,
        [input.runId],
      );
      const existingRun = locked.rows[0];
      if (!existingRun) {
        throw new Error("Run not found: " + input.runId);
      }

      if (existingRun.execution_path !== input.evidence.executionPath) {
        throw new Error("Evidence execution path does not match run execution path");
      }

      if (existingRun.sealed_at) {
        if (
          existingRun.request_blob_sha256 === input.requestBlob.sha256 &&
          existingRun.response_blob_sha256 === input.responseBlob.sha256
        ) {
          idempotent = true;
        } else {
          throw new Error("Sealed run payload conflict: " + input.runId);
        }
      }

      if (!idempotent) {
        await registerBlob(client, input.requestBlob);
        await registerBlob(client, input.responseBlob);
        await registerBlob(client, input.responseHeadersBlob);
        await registerBlob(client, input.attestationPayloadBlob);

        await client.query(
          `UPDATE modelapse.runs
              SET status = $2,
                  returned_model = $3,
                  request_blob_sha256 = $4,
                  response_blob_sha256 = $5,
                  started_at = $6,
                  completed_at = $7,
                  sealed_at = $8
            WHERE id = $1`,
          [
            input.runId,
            input.status,
            input.returnedModel ?? null,
            input.requestBlob.sha256,
            input.responseBlob.sha256,
            input.startedAt,
            input.completedAt,
            input.sealedAt,
          ],
        );

        if (input.providerMetadata) {
          await client.query(
            `INSERT INTO modelapse.provider_run_metadata
              (
                run_id,
                provider_request_id,
                provider_response_id,
                model_version_string,
                upstream_id,
                routed_provider_name,
                usage,
                timing,
                response_headers_blob_sha256,
                metadata
              )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              input.runId,
              input.providerMetadata.providerRequestId ?? null,
              input.providerMetadata.providerResponseId ?? null,
              input.providerMetadata.modelVersion ?? null,
              input.providerMetadata.upstreamId ?? null,
              input.providerMetadata.routedProviderName ?? null,
              jsonValue(input.providerMetadata.usage),
              jsonValue(input.providerMetadata.timing),
              input.responseHeadersBlob.sha256,
              input.providerMetadata.metadata ?? {},
            ],
          );
        } else {
          await client.query(
            `INSERT INTO modelapse.provider_run_metadata
              (run_id, response_headers_blob_sha256)
             VALUES ($1, $2)`,
            [input.runId, input.responseHeadersBlob.sha256],
          );
        }

        await client.query(
          `INSERT INTO modelapse.attestation_keys
            (id, algorithm, public_key_pem, valid_from)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [
            input.attestation.keyId,
            input.attestation.algorithm,
            input.attestation.publicKeyPem,
            input.attestation.validFrom,
          ],
        );

        const key = await client.query<{
          algorithm: string;
          public_key_pem: string;
        }>(
          `SELECT algorithm, public_key_pem
             FROM modelapse.attestation_keys
            WHERE id = $1`,
          [input.attestation.keyId],
        );
        if (
          key.rows[0]?.algorithm !== input.attestation.algorithm ||
          key.rows[0]?.public_key_pem !== input.attestation.publicKeyPem
        ) {
          throw new Error("Attestation key conflict: " + input.attestation.keyId);
        }

        const attestation = await client.query<{ id: string }>(
          `INSERT INTO modelapse.run_attestations
            (run_id, key_id, payload_blob_sha256, signature)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            input.runId,
            input.attestation.keyId,
            input.attestationPayloadBlob.sha256,
            input.attestation.signatureBase64,
          ],
        );
        const attestationId = attestation.rows[0]?.id;
        if (!attestationId) {
          throw new Error("Attestation insert did not return an id");
        }

        await client.query(
          `INSERT INTO modelapse.evidence_records
            (
              run_id,
              level,
              execution_path,
              collector,
              attestation_id,
              notes
            )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            input.runId,
            input.evidence.level,
            input.evidence.executionPath,
            input.evidence.collector,
            attestationId,
            input.evidence.notes ?? null,
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

    const run = await this.getRun(input.runId);
    if (!run) {
      throw new Error("Sealed run could not be reloaded");
    }
    return run;
  }

  async getRun(runId: string): Promise<RunView | null> {
    const result = await this.pool.query<{ view: RunView }>(
      `SELECT jsonb_build_object(
          'id', r.id,
          'testCaseId', r.test_case_id,
          'modelId', r.model_id,
          'snapshotId', r.snapshot_id,
          'providerId', r.provider_id,
          'executionPath', r.execution_path,
          'requestedModel', r.requested_model,
          'returnedModel', r.returned_model,
          'status', r.status,
          'runnerBuild', r.runner_build,
          'startedAt', r.started_at,
          'completedAt', r.completed_at,
          'sealedAt', r.sealed_at,
          'createdAt', r.created_at,
          'config', CASE WHEN rc.run_id IS NULL THEN NULL ELSE jsonb_strip_nulls(
            jsonb_build_object(
              'temperature', rc.temperature,
              'topP', rc.top_p,
              'maxOutputTokens', rc.max_output_tokens,
              'reasoningMode', rc.reasoning_mode,
              'reasoningEffort', rc.reasoning_effort,
              'seed', rc.seed,
              'serviceTier', rc.service_tier,
              'tools', rc.tool_config,
              'providerConfig', rc.provider_config
            )
          ) END,
          'providerMetadata', CASE WHEN prm.run_id IS NULL THEN NULL ELSE jsonb_strip_nulls(
            jsonb_build_object(
              'providerRequestId', prm.provider_request_id,
              'providerResponseId', prm.provider_response_id,
              'modelVersion', prm.model_version_string,
              'upstreamId', prm.upstream_id,
              'routedProviderName', prm.routed_provider_name,
              'usage', prm.usage,
              'timing', prm.timing,
              'responseHeadersSha256', prm.response_headers_blob_sha256,
              'metadata', prm.metadata
            )
          ) END,
          'requestBlob', CASE WHEN request_blob.sha256 IS NULL THEN NULL ELSE jsonb_build_object(
            'sha256', request_blob.sha256,
            'sizeBytes', request_blob.size_bytes,
            'mimeType', request_blob.mime_type,
            'objectKey', request_blob.object_key,
            'visibility', request_blob.visibility
          ) END,
          'responseBlob', CASE WHEN response_blob.sha256 IS NULL THEN NULL ELSE jsonb_build_object(
            'sha256', response_blob.sha256,
            'sizeBytes', response_blob.size_bytes,
            'mimeType', response_blob.mime_type,
            'objectKey', response_blob.object_key,
            'visibility', response_blob.visibility
          ) END,
          'evidence', COALESCE((
            SELECT jsonb_agg(
              jsonb_strip_nulls(jsonb_build_object(
                'id', e.id,
                'level', e.level,
                'executionPath', e.execution_path,
                'collector', e.collector,
                'sourceId', e.source_id,
                'attestationId', e.attestation_id,
                'notes', e.notes,
                'createdAt', e.created_at
              ))
              ORDER BY e.created_at ASC
            )
            FROM modelapse.evidence_records e
            WHERE e.run_id = r.id
          ), '[]'::jsonb),
          'attestations', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'keyId', a.key_id,
                'payloadSha256', a.payload_blob_sha256,
                'signature', a.signature,
                'createdAt', a.created_at
              )
              ORDER BY a.created_at ASC
            )
            FROM modelapse.run_attestations a
            WHERE a.run_id = r.id
          ), '[]'::jsonb)
        ) AS view
        FROM modelapse.runs r
        LEFT JOIN modelapse.run_configs rc ON rc.run_id = r.id
        LEFT JOIN modelapse.provider_run_metadata prm ON prm.run_id = r.id
        LEFT JOIN modelapse.blobs request_blob ON request_blob.sha256 = r.request_blob_sha256
        LEFT JOIN modelapse.blobs response_blob ON response_blob.sha256 = r.response_blob_sha256
       WHERE r.id = $1`,
      [runId],
    );

    return result.rows[0]?.view ?? null;
  }
}

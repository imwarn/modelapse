import { Pool } from "pg";

export interface ArchiveModelView {
  readonly id: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly status: string;
  readonly runCount: number;
  readonly latestRunAt: string | null;
}

export interface ArchiveTestView {
  readonly testCaseId: string;
  readonly familySlug: string;
  readonly familyName: string;
  readonly variantSlug: string;
  readonly variantName: string;
  readonly category: string;
  readonly artifactType: string;
  readonly version: string;
  readonly caseSlug: string;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  } | null;
  readonly runCount: number;
}

export interface ArchiveRunView {
  readonly id: string;
  readonly status: string;
  readonly model: {
    readonly id: string | null;
    readonly canonicalSlug: string | null;
    readonly marketingName: string | null;
  };
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly test: {
    readonly testCaseId: string;
    readonly familySlug: string;
    readonly familyName: string;
    readonly variantSlug: string;
    readonly variantName: string;
    readonly version: string;
    readonly caseSlug: string;
  };
  readonly requestedModel: string;
  readonly returnedModel: string | null;
  readonly executionPath: string;
  readonly evidenceLevel: string | null;
  readonly evaluation: {
    readonly id: string;
    readonly status: string;
    readonly evaluatorSlug: string;
    readonly evaluatorVersion: string;
    readonly evaluatorKind: string;
    readonly definitionSha256: string;
    readonly rawResultSha256: string | null;
    readonly exactMatch: boolean | null;
  } | null;
  readonly runnerBuild: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly sealedAt: string | null;
}

export interface ArchiveBlobView {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly visibility: string;
}

export interface ArchiveRunEvidenceView {
  readonly id: string;
  readonly level: string;
  readonly executionPath: string;
  readonly collector: string;
  readonly sourceId: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly attestation: {
    readonly id: string;
    readonly keyId: string;
    readonly algorithm: string;
    readonly payloadSha256: string;
    readonly signature: string;
    readonly keyValidFrom: string;
    readonly keyValidTo: string | null;
    readonly createdAt: string;
  } | null;
}

export interface ArchiveRunDetailView extends ArchiveRunView {
  readonly config: Readonly<Record<string, unknown>> | null;
  readonly requestBlob: ArchiveBlobView | null;
  readonly responseBlob: ArchiveBlobView | null;
  readonly responseHeadersSha256: string | null;
  readonly usage: Readonly<Record<string, unknown>> | null;
  readonly timing: Readonly<Record<string, unknown>> | null;
  readonly evidence: readonly ArchiveRunEvidenceView[];
}

interface ArchiveRunRow {
  id: string;
  status: string;
  model_id: string | null;
  canonical_slug: string | null;
  marketing_name: string | null;
  provider_id: string;
  provider_slug: string;
  provider_name: string;
  test_case_id: string;
  family_slug: string;
  family_name: string;
  variant_slug: string;
  variant_name: string;
  version: string;
  case_slug: string;
  requested_model: string;
  returned_model: string | null;
  execution_path: string;
  evidence_level: string | null;
  evaluation_id: string | null;
  evaluation_status: string | null;
  evaluator_slug: string | null;
  evaluator_version: string | null;
  evaluator_kind: string | null;
  evaluator_definition_sha256: string | null;
  evaluation_raw_result_sha256: string | null;
  exact_match: number | null;
  runner_build: string;
  created_at: Date;
  completed_at: Date | null;
  sealed_at: Date | null;
}

function runView(row: ArchiveRunRow): ArchiveRunView {
  return {
    id: row.id,
    status: row.status,
    model: {
      id: row.model_id,
      canonicalSlug: row.canonical_slug,
      marketingName: row.marketing_name,
    },
    provider: {
      id: row.provider_id,
      slug: row.provider_slug,
      name: row.provider_name,
    },
    test: {
      testCaseId: row.test_case_id,
      familySlug: row.family_slug,
      familyName: row.family_name,
      variantSlug: row.variant_slug,
      variantName: row.variant_name,
      version: row.version,
      caseSlug: row.case_slug,
    },
    requestedModel: row.requested_model,
    returnedModel: row.returned_model,
    executionPath: row.execution_path,
    evidenceLevel: row.evidence_level,
    evaluation:
      row.evaluation_id &&
      row.evaluation_status &&
      row.evaluator_slug &&
      row.evaluator_version &&
      row.evaluator_kind &&
      row.evaluator_definition_sha256
        ? {
            id: row.evaluation_id,
            status: row.evaluation_status,
            evaluatorSlug: row.evaluator_slug,
            evaluatorVersion: row.evaluator_version,
            evaluatorKind: row.evaluator_kind,
            definitionSha256: row.evaluator_definition_sha256,
            rawResultSha256: row.evaluation_raw_result_sha256,
            exactMatch:
              row.exact_match === null ? null : Number(row.exact_match) === 1,
          }
        : null,
    runnerBuild: row.runner_build,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    sealedAt: row.sealed_at?.toISOString() ?? null,
  };
}

const RUN_SELECT = `
  SELECT
    r.id,
    r.status,
    r.model_id,
    m.canonical_slug,
    m.marketing_name,
    p.id AS provider_id,
    p.slug AS provider_slug,
    p.name AS provider_name,
    tc.id AS test_case_id,
    tf.slug AS family_slug,
    tf.name AS family_name,
    tvar.slug AS variant_slug,
    tvar.name AS variant_name,
    tv.version,
    tc.slug AS case_slug,
    r.requested_model,
    r.returned_model,
    r.execution_path,
    res.level AS evidence_level,
    ev.id AS evaluation_id,
    ev.status AS evaluation_status,
    e.slug AS evaluator_slug,
    e.version AS evaluator_version,
    e.kind AS evaluator_kind,
    e.definition_sha256 AS evaluator_definition_sha256,
    ev.raw_result_blob_sha256 AS evaluation_raw_result_sha256,
    mv.numeric_value AS exact_match,
    r.runner_build,
    r.created_at,
    r.completed_at,
    r.sealed_at
  FROM modelapse.runs r
  JOIN modelapse.providers p ON p.id = r.provider_id
  LEFT JOIN modelapse.models m ON m.id = r.model_id
  JOIN modelapse.test_cases tc ON tc.id = r.test_case_id
  JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
  JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
  JOIN modelapse.test_families tf ON tf.id = tvar.family_id
  LEFT JOIN modelapse.run_evidence_summary res ON res.run_id = r.id
  LEFT JOIN modelapse.test_version_evaluators tve
    ON tve.test_version_id = tv.id
  LEFT JOIN modelapse.evaluators e ON e.id = tve.evaluator_id
  LEFT JOIN modelapse.evaluations ev
    ON ev.run_id = r.id
   AND ev.evaluator_id = e.id
  LEFT JOIN modelapse.metric_values mv
    ON mv.evaluation_id = ev.id
   AND mv.metric_key = 'exact_match'
`;

export class PgArchiveRepository {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgArchiveRepository {
    return new PgArchiveRepository(
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

  async listModels(): Promise<readonly ArchiveModelView[]> {
    const result = await this.pool.query<{
      id: string;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      canonical_slug: string;
      marketing_name: string;
      status: string;
      run_count: string;
      latest_run_at: Date | null;
    }>(
      `SELECT
         m.id,
         p.id AS provider_id,
         p.slug AS provider_slug,
         p.name AS provider_name,
         m.canonical_slug,
         m.marketing_name,
         m.status,
         COUNT(r.id)::text AS run_count,
         MAX(r.completed_at) AS latest_run_at
       FROM modelapse.models m
       JOIN modelapse.providers p ON p.id = m.provider_id
       LEFT JOIN modelapse.runs r
         ON r.model_id = m.id
        AND r.sealed_at IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM modelapse.test_cases rtc
          WHERE rtc.id = r.test_case_id
            AND rtc.visibility = 'public'
        )
       GROUP BY m.id, p.id
       ORDER BY p.slug, m.marketing_name`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      provider: {
        id: row.provider_id,
        slug: row.provider_slug,
        name: row.provider_name,
      },
      canonicalSlug: row.canonical_slug,
      marketingName: row.marketing_name,
      status: row.status,
      runCount: Number(row.run_count),
      latestRunAt: row.latest_run_at?.toISOString() ?? null,
    }));
  }

  async listTests(): Promise<readonly ArchiveTestView[]> {
    const result = await this.pool.query<{
      test_case_id: string;
      family_slug: string;
      family_name: string;
      variant_slug: string;
      variant_name: string;
      category: string;
      artifact_type: string;
      version: string;
      case_slug: string;
      evaluator_slug: string | null;
      evaluator_version: string | null;
      evaluator_kind: string | null;
      run_count: string;
    }>(
      `SELECT
         tc.id AS test_case_id,
         tf.slug AS family_slug,
         tf.name AS family_name,
         tvar.slug AS variant_slug,
         tvar.name AS variant_name,
         tvar.category,
         tvar.artifact_type,
         tv.version,
         tc.slug AS case_slug,
         e.slug AS evaluator_slug,
         e.version AS evaluator_version,
         e.kind AS evaluator_kind,
         COUNT(r.id)::text AS run_count
       FROM modelapse.test_cases tc
       JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
       JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
       JOIN modelapse.test_families tf ON tf.id = tvar.family_id
       LEFT JOIN modelapse.test_version_evaluators tve
         ON tve.test_version_id = tv.id
       LEFT JOIN modelapse.evaluators e ON e.id = tve.evaluator_id
       LEFT JOIN modelapse.runs r
         ON r.test_case_id = tc.id
        AND r.sealed_at IS NOT NULL
       WHERE tc.visibility = 'public'
       GROUP BY tc.id, tv.id, tvar.id, tf.id, e.id
       ORDER BY tf.slug, tvar.slug, tv.version, tc.slug`,
    );

    return result.rows.map((row) => ({
      testCaseId: row.test_case_id,
      familySlug: row.family_slug,
      familyName: row.family_name,
      variantSlug: row.variant_slug,
      variantName: row.variant_name,
      category: row.category,
      artifactType: row.artifact_type,
      version: row.version,
      caseSlug: row.case_slug,
      evaluator:
        row.evaluator_slug && row.evaluator_version && row.evaluator_kind
          ? {
              slug: row.evaluator_slug,
              version: row.evaluator_version,
              kind: row.evaluator_kind,
            }
          : null,
      runCount: Number(row.run_count),
    }));
  }

  async listRuns(input: {
    readonly modelId?: string;
    readonly testCaseId?: string;
    readonly limit?: number;
  } = {}): Promise<readonly ArchiveRunView[]> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Archive Run limit must be an integer between 1 and 100");
    }

    const result = await this.pool.query<ArchiveRunRow>(
      RUN_SELECT +
        `
       WHERE tc.visibility = 'public'
         AND r.sealed_at IS NOT NULL
         AND ($1::uuid IS NULL OR r.model_id = $1)
         AND ($2::uuid IS NULL OR r.test_case_id = $2)
       ORDER BY r.completed_at DESC NULLS LAST, r.created_at DESC
       LIMIT $3`,
      [input.modelId ?? null, input.testCaseId ?? null, limit],
    );

    return result.rows.map(runView);
  }

  async getRun(runId: string): Promise<ArchiveRunDetailView | null> {
    const summaryResult = await this.pool.query<ArchiveRunRow>(
      RUN_SELECT +
        `
       WHERE r.id = $1
         AND tc.visibility = 'public'
         AND r.sealed_at IS NOT NULL
       LIMIT 1`,
      [runId],
    );

    const summaryRow = summaryResult.rows[0];
    if (!summaryRow) return null;

    const detailResult = await this.pool.query<{
      config: Readonly<Record<string, unknown>> | null;
      request_sha256: string | null;
      request_size_bytes: string | null;
      request_mime_type: string | null;
      request_visibility: string | null;
      response_sha256: string | null;
      response_size_bytes: string | null;
      response_mime_type: string | null;
      response_visibility: string | null;
      response_headers_sha256: string | null;
      usage: Readonly<Record<string, unknown>> | null;
      timing: Readonly<Record<string, unknown>> | null;
      evidence: ArchiveRunEvidenceView[];
    }>(
      `SELECT
         CASE WHEN rc.run_id IS NULL THEN NULL ELSE jsonb_strip_nulls(
           jsonb_build_object(
             'temperature', rc.temperature,
             'topP', rc.top_p,
             'maxOutputTokens', rc.max_output_tokens,
             'reasoningMode', rc.reasoning_mode,
             'reasoningEffort', rc.reasoning_effort,
             'seed', rc.seed::text,
             'serviceTier', rc.service_tier
           )
         ) END AS config,
         request_blob.sha256 AS request_sha256,
         request_blob.size_bytes AS request_size_bytes,
         request_blob.mime_type AS request_mime_type,
         request_blob.visibility AS request_visibility,
         response_blob.sha256 AS response_sha256,
         response_blob.size_bytes AS response_size_bytes,
         response_blob.mime_type AS response_mime_type,
         response_blob.visibility AS response_visibility,
         prm.response_headers_blob_sha256 AS response_headers_sha256,
         prm.usage,
         prm.timing,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'id', er.id,
               'level', er.level,
               'executionPath', er.execution_path,
               'collector', er.collector,
               'sourceId', er.source_id,
               'notes', er.notes,
               'createdAt', er.created_at,
               'attestation', CASE
                 WHEN ra.id IS NULL THEN NULL
                 ELSE jsonb_build_object(
                   'id', ra.id,
                   'keyId', ra.key_id,
                   'algorithm', ak.algorithm,
                   'payloadSha256', ra.payload_blob_sha256,
                   'signature', ra.signature,
                   'keyValidFrom', ak.valid_from,
                   'keyValidTo', ak.valid_to,
                   'createdAt', ra.created_at
                 )
               END
             ))
             ORDER BY er.created_at ASC
           )
           FROM modelapse.evidence_records er
           LEFT JOIN modelapse.run_attestations ra
             ON ra.id = er.attestation_id
           LEFT JOIN modelapse.attestation_keys ak
             ON ak.id = ra.key_id
           WHERE er.run_id = r.id
         ), '[]'::jsonb) AS evidence
       FROM modelapse.runs r
       JOIN modelapse.test_cases tc ON tc.id = r.test_case_id
       LEFT JOIN modelapse.run_configs rc ON rc.run_id = r.id
       LEFT JOIN modelapse.provider_run_metadata prm ON prm.run_id = r.id
       LEFT JOIN modelapse.blobs request_blob
         ON request_blob.sha256 = r.request_blob_sha256
       LEFT JOIN modelapse.blobs response_blob
         ON response_blob.sha256 = r.response_blob_sha256
       WHERE r.id = $1
         AND tc.visibility = 'public'
         AND r.sealed_at IS NOT NULL
       LIMIT 1`,
      [runId],
    );

    const detail = detailResult.rows[0];
    if (!detail) return null;

    const blob = (
      sha256: string | null,
      sizeBytes: string | null,
      mimeType: string | null,
      visibility: string | null,
    ): ArchiveBlobView | null =>
      sha256 && sizeBytes && mimeType && visibility
        ? {
            sha256,
            sizeBytes: Number(sizeBytes),
            mimeType,
            visibility,
          }
        : null;

    return {
      ...runView(summaryRow),
      config: detail.config,
      requestBlob: blob(
        detail.request_sha256,
        detail.request_size_bytes,
        detail.request_mime_type,
        detail.request_visibility,
      ),
      responseBlob: blob(
        detail.response_sha256,
        detail.response_size_bytes,
        detail.response_mime_type,
        detail.response_visibility,
      ),
      responseHeadersSha256: detail.response_headers_sha256,
      usage: detail.usage,
      timing: detail.timing,
      evidence: detail.evidence,
    };
  }
}

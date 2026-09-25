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

export interface ArchiveRunRelationEdgeView {
  readonly fromRunId: string;
  readonly toRunId: string;
  readonly relationType: string;
  readonly createdAt: string;
}

export interface ArchiveRunRelationView {
  readonly direction: "outgoing" | "incoming";
  readonly relationType: string;
  readonly relatedRunId: string;
  readonly createdAt: string;
}

export interface ArchiveRunDetailView extends ArchiveRunView {
  readonly config: Readonly<Record<string, unknown>> | null;
  readonly requestBlob: ArchiveBlobView | null;
  readonly responseBlob: ArchiveBlobView | null;
  readonly responseHeadersSha256: string | null;
  readonly usage: Readonly<Record<string, unknown>> | null;
  readonly timing: Readonly<Record<string, unknown>> | null;
  readonly evidence: readonly ArchiveRunEvidenceView[];
  readonly relations: readonly ArchiveRunRelationView[];
}

export interface ArchiveSourceView {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface ArchiveModelAliasResolutionView {
  readonly id: string;
  readonly alias: {
    readonly id: string;
    readonly value: string;
  };
  readonly observedAt: string;
  readonly sourceType: string;
  readonly confidence: number;
  readonly resolvedModelId: string | null;
  readonly resolvedSnapshot: {
    readonly id: string;
    readonly providerSnapshotId: string;
  } | null;
  readonly source: ArchiveSourceView | null;
}

export interface ArchiveModelExecutionBindingView {
  readonly id: string;
  readonly apiModelId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly createdAt: string;
  readonly endpoint: {
    readonly id: string;
    readonly path: string;
    readonly baseUrl: string;
    readonly hostname: string;
    readonly source: ArchiveSourceView | null;
  };
  readonly snapshot: {
    readonly id: string;
    readonly providerSnapshotId: string;
  } | null;
  readonly source: ArchiveSourceView;
}

export interface ArchiveIdentityTimelineEventView {
  readonly id: string;
  readonly kind:
    | "canonical_source"
    | "alias_resolution"
    | "binding_started"
    | "binding_ended"
    | "snapshot_started"
    | "snapshot_ended";
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly source: ArchiveSourceView | null;
  readonly aliasId: string | null;
  readonly bindingId: string | null;
  readonly snapshotId: string | null;
}

export interface ArchiveTestVersionHistoryView {
  readonly id: string;
  readonly version: string;
  readonly status: string;
  readonly definitionSha256: string;
  readonly license: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly source: ArchiveSourceView | null;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  } | null;
  readonly publicCaseCount: number;
  readonly linkedTestCaseId: string | null;
}

export interface ArchiveModelSnapshotView {
  readonly id: string;
  readonly providerSnapshotId: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceId: string | null;
  readonly source: ArchiveSourceView | null;
}

export interface ArchiveModelRelationView {
  readonly id: string;
  readonly direction: "outgoing" | "incoming";
  readonly relationType: string;
  readonly relatedModel: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly providerSlug: string;
  };
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceId: string | null;
  readonly source: ArchiveSourceView | null;
  readonly confidence: number;
}

export interface ArchiveTestCoverageView {
  readonly testCaseId: string;
  readonly familySlug: string;
  readonly familyName: string;
  readonly version: string;
  readonly caseSlug: string;
  readonly runCount: number;
  readonly latestRunAt: string | null;
}

export interface ArchiveModelCoverageView {
  readonly modelId: string;
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly providerSlug: string;
  readonly runCount: number;
  readonly latestRunAt: string | null;
}

export interface ArchiveTimelineEventView {
  readonly id: string;
  readonly kind:
    | "model_released"
    | "model_retired"
    | "snapshot_started"
    | "snapshot_ended"
    | "relation"
    | "run";
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly runId: string | null;
  readonly testCaseId: string | null;
  readonly snapshotId: string | null;
  readonly relatedModelId: string | null;
}

export interface ArchiveModelDetailView extends ArchiveModelView {
  readonly family: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
  } | null;
  readonly track: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
    readonly trackType: string | null;
  } | null;
  readonly releasedAt: string | null;
  readonly retiredAt: string | null;
  readonly canonicalSourceId: string | null;
  readonly canonicalSource: ArchiveSourceView | null;
  readonly snapshots: readonly ArchiveModelSnapshotView[];
  readonly relations: readonly ArchiveModelRelationView[];
  readonly aliasResolutions: readonly ArchiveModelAliasResolutionView[];
  readonly executionBindings: readonly ArchiveModelExecutionBindingView[];
  readonly identityTimeline: readonly ArchiveIdentityTimelineEventView[];
  readonly testCoverage: readonly ArchiveTestCoverageView[];
  readonly recentRuns: readonly ArchiveRunView[];
  readonly timeline: readonly ArchiveTimelineEventView[];
}

export interface ArchiveTestDetailView extends ArchiveTestView {
  readonly origin: string;
  readonly canonicalSourceId: string | null;
  readonly canonicalSource: ArchiveSourceView | null;
  readonly versionSource: ArchiveSourceView | null;
  readonly versionHistory: readonly ArchiveTestVersionHistoryView[];
  readonly versionStatus: string;
  readonly definitionSha256: string;
  readonly license: string | null;
  readonly publishedAt: string | null;
  readonly versionCreatedAt: string;
  readonly caseType: string;
  readonly caseStatus: string;
  readonly activeFrom: string | null;
  readonly activeTo: string | null;
  readonly promptSha256: string;
  readonly fixtureManifestSha256: string | null;
  readonly evaluatorDefinitionSha256: string | null;
  readonly modelCoverage: readonly ArchiveModelCoverageView[];
  readonly recentRuns: readonly ArchiveRunView[];
}

export interface ArchiveComparisonView {
  readonly test: ArchiveTestView;
  readonly rows: readonly {
    readonly model: ArchiveModelView;
    readonly latestRun: ArchiveRunView | null;
  }[];
}

export interface ArchiveRunHistoryView {
  readonly model: ArchiveModelView;
  readonly test: ArchiveTestView;
  readonly runs: readonly ArchiveRunView[];
  readonly relations: readonly ArchiveRunRelationEdgeView[];
}


function archiveSourceView(row: {
  source_id: string | null;
  source_type: string | null;
  source_url: string | null;
  source_title: string | null;
  source_author: string | null;
  source_published_at: Date | null;
  source_retrieved_at: Date | null;
  source_content_sha256: string | null;
}): ArchiveSourceView | null {
  if (!row.source_id || !row.source_type || !row.source_retrieved_at) {
    return null;
  }
  return {
    id: row.source_id,
    sourceType: row.source_type,
    url: row.source_url,
    title: row.source_title,
    author: row.source_author,
    publishedAt: row.source_published_at?.toISOString() ?? null,
    retrievedAt: row.source_retrieved_at.toISOString(),
    contentSha256: row.source_content_sha256,
  };
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

  async getRunHistory(input: {
    readonly modelId: string;
    readonly testCaseId: string;
    readonly limit?: number;
  }): Promise<ArchiveRunHistoryView | null> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Archive history limit must be an integer between 1 and 100");
    }

    const [modelResult, testResult, newestRuns] = await Promise.all([
      this.pool.query<{
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
         WHERE m.id = $1
         GROUP BY m.id, p.id
         LIMIT 1`,
        [input.modelId],
      ),
      this.pool.query<{
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
           evaluator.slug AS evaluator_slug,
           evaluator.version AS evaluator_version,
           evaluator.kind AS evaluator_kind,
           (
             SELECT COUNT(*)::text
             FROM modelapse.runs r
             WHERE r.test_case_id = tc.id
               AND r.sealed_at IS NOT NULL
           ) AS run_count
         FROM modelapse.test_cases tc
         JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
         JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
         JOIN modelapse.test_families tf ON tf.id = tvar.family_id
         LEFT JOIN LATERAL (
           SELECT e.slug, e.version, e.kind
           FROM modelapse.test_version_evaluators tve
           JOIN modelapse.evaluators e ON e.id = tve.evaluator_id
           WHERE tve.test_version_id = tv.id
           ORDER BY e.slug, e.version
           LIMIT 1
         ) evaluator ON true
         WHERE tc.id = $1
           AND tc.visibility = 'public'
         LIMIT 1`,
        [input.testCaseId],
      ),
      this.listRuns({
        modelId: input.modelId,
        testCaseId: input.testCaseId,
        limit,
      }),
    ]);

    const modelRow = modelResult.rows[0];
    const testRow = testResult.rows[0];
    if (!modelRow || !testRow) return null;

    const model: ArchiveModelView = {
      id: modelRow.id,
      provider: {
        id: modelRow.provider_id,
        slug: modelRow.provider_slug,
        name: modelRow.provider_name,
      },
      canonicalSlug: modelRow.canonical_slug,
      marketingName: modelRow.marketing_name,
      status: modelRow.status,
      runCount: Number(modelRow.run_count),
      latestRunAt: modelRow.latest_run_at?.toISOString() ?? null,
    };

    const test: ArchiveTestView = {
      testCaseId: testRow.test_case_id,
      familySlug: testRow.family_slug,
      familyName: testRow.family_name,
      variantSlug: testRow.variant_slug,
      variantName: testRow.variant_name,
      category: testRow.category,
      artifactType: testRow.artifact_type,
      version: testRow.version,
      caseSlug: testRow.case_slug,
      evaluator:
        testRow.evaluator_slug &&
        testRow.evaluator_version &&
        testRow.evaluator_kind
          ? {
              slug: testRow.evaluator_slug,
              version: testRow.evaluator_version,
              kind: testRow.evaluator_kind,
            }
          : null,
      runCount: Number(testRow.run_count),
    };

    const runs = [...newestRuns].reverse();
    const runIds = runs.map((run) => run.id);

    let relations: ArchiveRunRelationEdgeView[] = [];
    if (runIds.length > 1) {
      const relationResult = await this.pool.query<{
        from_run_id: string;
        to_run_id: string;
        relation_type: string;
        created_at: Date;
      }>(
        `SELECT from_run_id, to_run_id, relation_type, created_at
           FROM modelapse.run_relations
          WHERE from_run_id = ANY($1::uuid[])
            AND to_run_id = ANY($1::uuid[])
          ORDER BY created_at ASC, from_run_id, to_run_id, relation_type`,
        [runIds],
      );

      relations = relationResult.rows.map((relation) => ({
        fromRunId: relation.from_run_id,
        toRunId: relation.to_run_id,
        relationType: relation.relation_type,
        createdAt: relation.created_at.toISOString(),
      }));
    }

    return {
      model,
      test,
      runs,
      relations,
    };
  }

  async getModel(modelId: string): Promise<ArchiveModelDetailView | null> {
    const modelResult = await this.pool.query<{
      id: string;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      canonical_slug: string;
      marketing_name: string;
      status: string;
      released_at: Date | null;
      retired_at: Date | null;
      canonical_source_id: string | null;
      source_id: string | null;
      source_type: string | null;
      source_url: string | null;
      source_title: string | null;
      source_author: string | null;
      source_published_at: Date | null;
      source_retrieved_at: Date | null;
      source_content_sha256: string | null;
      family_id: string | null;
      family_slug: string | null;
      family_name: string | null;
      track_id: string | null;
      track_slug: string | null;
      track_name: string | null;
      track_type: string | null;
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
         m.released_at,
         m.retired_at,
         m.canonical_source_id,
         canonical_source.id AS source_id,
         canonical_source.source_type,
         canonical_source.url AS source_url,
         canonical_source.title AS source_title,
         canonical_source.author AS source_author,
         canonical_source.published_at AS source_published_at,
         canonical_source.retrieved_at AS source_retrieved_at,
         canonical_source.content_sha256 AS source_content_sha256,
         mf.id AS family_id,
         mf.slug AS family_slug,
         mf.display_name AS family_name,
         mt.id AS track_id,
         mt.slug AS track_slug,
         mt.display_name AS track_name,
         mt.track_type,
         (
           SELECT COUNT(*)::text
           FROM modelapse.runs r
           JOIN modelapse.test_cases rtc ON rtc.id = r.test_case_id
           WHERE r.model_id = m.id
             AND r.sealed_at IS NOT NULL
             AND rtc.visibility = 'public'
         ) AS run_count,
         (
           SELECT MAX(r.completed_at)
           FROM modelapse.runs r
           JOIN modelapse.test_cases rtc ON rtc.id = r.test_case_id
           WHERE r.model_id = m.id
             AND r.sealed_at IS NOT NULL
             AND rtc.visibility = 'public'
         ) AS latest_run_at
       FROM modelapse.models m
       JOIN modelapse.providers p ON p.id = m.provider_id
       LEFT JOIN modelapse.source_records canonical_source
         ON canonical_source.id = m.canonical_source_id
       LEFT JOIN modelapse.model_families mf ON mf.id = m.family_id
       LEFT JOIN modelapse.model_tracks mt ON mt.id = m.track_id
       WHERE m.id = $1
       LIMIT 1`,
      [modelId],
    );

    const row = modelResult.rows[0];
    if (!row) return null;

    const [
      snapshotResult,
      relationResult,
      aliasResult,
      bindingResult,
      coverageResult,
      allRuns,
    ] = await Promise.all([
        this.pool.query<{
          id: string;
          provider_snapshot_id: string;
          valid_from: Date | null;
          valid_to: Date | null;
          source_id: string | null;
          source_type: string | null;
          source_url: string | null;
          source_title: string | null;
          source_author: string | null;
          source_published_at: Date | null;
          source_retrieved_at: Date | null;
          source_content_sha256: string | null;
        }>(
          `SELECT
             ms.id,
             ms.provider_snapshot_id,
             ms.valid_from,
             ms.valid_to,
             ms.source_id,
             source.source_type,
             source.url AS source_url,
             source.title AS source_title,
             source.author AS source_author,
             source.published_at AS source_published_at,
             source.retrieved_at AS source_retrieved_at,
             source.content_sha256 AS source_content_sha256
           FROM modelapse.model_snapshots ms
           LEFT JOIN modelapse.source_records source ON source.id = ms.source_id
           WHERE ms.model_id = $1
           ORDER BY ms.valid_from DESC NULLS LAST, ms.provider_snapshot_id`,
          [modelId],
        ),
        this.pool.query<{
          id: string;
          direction: "outgoing" | "incoming";
          relation_type: string;
          related_model_id: string;
          related_canonical_slug: string;
          related_marketing_name: string;
          related_provider_slug: string;
          valid_from: Date | null;
          valid_to: Date | null;
          source_id: string | null;
          source_type: string | null;
          source_url: string | null;
          source_title: string | null;
          source_author: string | null;
          source_published_at: Date | null;
          source_retrieved_at: Date | null;
          source_content_sha256: string | null;
          confidence: string;
        }>(
          `SELECT
             mr.id,
             CASE
               WHEN mr.from_model_id = $1 THEN 'outgoing'
               ELSE 'incoming'
             END AS direction,
             mr.relation_type,
             related.id AS related_model_id,
             related.canonical_slug AS related_canonical_slug,
             related.marketing_name AS related_marketing_name,
             rp.slug AS related_provider_slug,
             mr.valid_from,
             mr.valid_to,
             mr.source_id,
             source.source_type,
             source.url AS source_url,
             source.title AS source_title,
             source.author AS source_author,
             source.published_at AS source_published_at,
             source.retrieved_at AS source_retrieved_at,
             source.content_sha256 AS source_content_sha256,
             mr.confidence::text AS confidence
           FROM modelapse.model_relations mr
           JOIN modelapse.models related
             ON related.id = CASE
               WHEN mr.from_model_id = $1 THEN mr.to_model_id
               ELSE mr.from_model_id
             END
           JOIN modelapse.providers rp ON rp.id = related.provider_id
           LEFT JOIN modelapse.source_records source ON source.id = mr.source_id
           WHERE mr.from_model_id = $1 OR mr.to_model_id = $1
           ORDER BY mr.valid_from DESC NULLS LAST, mr.relation_type`,
          [modelId],
        ),
        this.pool.query<{
          id: string;
          alias_id: string;
          alias_value: string;
          observed_at: Date;
          source_type_observed: string;
          confidence: string;
          resolved_model_id: string | null;
          resolved_snapshot_id: string | null;
          provider_snapshot_id: string | null;
          source_id: string | null;
          source_type: string | null;
          source_url: string | null;
          source_title: string | null;
          source_author: string | null;
          source_published_at: Date | null;
          source_retrieved_at: Date | null;
          source_content_sha256: string | null;
        }>(
          `SELECT
             are.id,
             ma.id AS alias_id,
             ma.alias AS alias_value,
             are.observed_at,
             are.source_type AS source_type_observed,
             are.confidence::text AS confidence,
             are.resolved_model_id,
             are.resolved_snapshot_id,
             ms.provider_snapshot_id,
             source.id AS source_id,
             source.source_type,
             source.url AS source_url,
             source.title AS source_title,
             source.author AS source_author,
             source.published_at AS source_published_at,
             source.retrieved_at AS source_retrieved_at,
             source.content_sha256 AS source_content_sha256
           FROM modelapse.alias_resolution_events are
           JOIN modelapse.model_aliases ma ON ma.id = are.alias_id
           LEFT JOIN modelapse.model_snapshots ms ON ms.id = are.resolved_snapshot_id
           LEFT JOIN modelapse.source_records source ON source.id = are.source_id
           WHERE are.resolved_model_id = $1
              OR ms.model_id = $1
           ORDER BY are.observed_at DESC, are.id`,
          [modelId],
        ),
        this.pool.query<{
          id: string;
          api_model_id: string;
          valid_from: Date;
          valid_to: Date | null;
          created_at: Date;
          endpoint_id: string;
          endpoint_path: string;
          endpoint_base_url: string;
          endpoint_hostname: string;
          endpoint_source_id: string | null;
          endpoint_source_type: string | null;
          endpoint_source_url: string | null;
          endpoint_source_title: string | null;
          endpoint_source_author: string | null;
          endpoint_source_published_at: Date | null;
          endpoint_source_retrieved_at: Date | null;
          endpoint_source_content_sha256: string | null;
          snapshot_id: string | null;
          provider_snapshot_id: string | null;
          source_id: string;
          source_type: string;
          source_url: string | null;
          source_title: string | null;
          source_author: string | null;
          source_published_at: Date | null;
          source_retrieved_at: Date;
          source_content_sha256: string | null;
        }>(
          `SELECT
             meb.id,
             meb.api_model_id,
             meb.valid_from,
             meb.valid_to,
             meb.created_at,
             pe.id AS endpoint_id,
             pe.path AS endpoint_path,
             pe.base_url AS endpoint_base_url,
             pe.hostname AS endpoint_hostname,
             endpoint_source.id AS endpoint_source_id,
             endpoint_source.source_type AS endpoint_source_type,
             endpoint_source.url AS endpoint_source_url,
             endpoint_source.title AS endpoint_source_title,
             endpoint_source.author AS endpoint_source_author,
             endpoint_source.published_at AS endpoint_source_published_at,
             endpoint_source.retrieved_at AS endpoint_source_retrieved_at,
             endpoint_source.content_sha256 AS endpoint_source_content_sha256,
             ms.id AS snapshot_id,
             ms.provider_snapshot_id,
             source.id AS source_id,
             source.source_type,
             source.url AS source_url,
             source.title AS source_title,
             source.author AS source_author,
             source.published_at AS source_published_at,
             source.retrieved_at AS source_retrieved_at,
             source.content_sha256 AS source_content_sha256
           FROM modelapse.model_execution_bindings meb
           JOIN modelapse.provider_endpoints pe ON pe.id = meb.endpoint_id
           JOIN modelapse.source_records source ON source.id = meb.source_id
           LEFT JOIN modelapse.source_records endpoint_source ON endpoint_source.id = pe.source_id
           LEFT JOIN modelapse.model_snapshots ms ON ms.id = meb.snapshot_id
           WHERE meb.model_id = $1
           ORDER BY meb.valid_from DESC, meb.created_at DESC`,
          [modelId],
        ),
        this.pool.query<{
          test_case_id: string;
          family_slug: string;
          family_name: string;
          version: string;
          case_slug: string;
          run_count: string;
          latest_run_at: Date | null;
        }>(
          `SELECT
             tc.id AS test_case_id,
             tf.slug AS family_slug,
             tf.name AS family_name,
             tv.version,
             tc.slug AS case_slug,
             COUNT(r.id)::text AS run_count,
             MAX(r.completed_at) AS latest_run_at
           FROM modelapse.runs r
           JOIN modelapse.test_cases tc ON tc.id = r.test_case_id
           JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
           JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
           JOIN modelapse.test_families tf ON tf.id = tvar.family_id
           WHERE r.model_id = $1
             AND r.sealed_at IS NOT NULL
             AND tc.visibility = 'public'
           GROUP BY tc.id, tv.id, tf.id
           ORDER BY MAX(r.completed_at) DESC NULLS LAST, tf.slug, tc.slug`,
          [modelId],
        ),
        this.listRuns({ modelId, limit: 100 }),
      ]);

    const snapshots: ArchiveModelSnapshotView[] = snapshotResult.rows.map(
      (snapshot) => ({
        id: snapshot.id,
        providerSnapshotId: snapshot.provider_snapshot_id,
        validFrom: snapshot.valid_from?.toISOString() ?? null,
        validTo: snapshot.valid_to?.toISOString() ?? null,
        sourceId: snapshot.source_id,
        source: archiveSourceView(snapshot),
      }),
    );

    const relations: ArchiveModelRelationView[] = relationResult.rows.map(
      (relation) => ({
        id: relation.id,
        direction: relation.direction,
        relationType: relation.relation_type,
        relatedModel: {
          id: relation.related_model_id,
          canonicalSlug: relation.related_canonical_slug,
          marketingName: relation.related_marketing_name,
          providerSlug: relation.related_provider_slug,
        },
        validFrom: relation.valid_from?.toISOString() ?? null,
        validTo: relation.valid_to?.toISOString() ?? null,
        sourceId: relation.source_id,
        source: archiveSourceView(relation),
        confidence: Number(relation.confidence),
      }),
    );

    const canonicalSource = archiveSourceView(row);

    const aliasResolutions: ArchiveModelAliasResolutionView[] =
      aliasResult.rows.map((alias) => ({
        id: alias.id,
        alias: {
          id: alias.alias_id,
          value: alias.alias_value,
        },
        observedAt: alias.observed_at.toISOString(),
        sourceType: alias.source_type_observed,
        confidence: Number(alias.confidence),
        resolvedModelId: alias.resolved_model_id,
        resolvedSnapshot:
          alias.resolved_snapshot_id && alias.provider_snapshot_id
            ? {
                id: alias.resolved_snapshot_id,
                providerSnapshotId: alias.provider_snapshot_id,
              }
            : null,
        source: archiveSourceView(alias),
      }));

    const executionBindings: ArchiveModelExecutionBindingView[] =
      bindingResult.rows.map((binding) => {
        const endpointSource = archiveSourceView({
          source_id: binding.endpoint_source_id,
          source_type: binding.endpoint_source_type,
          source_url: binding.endpoint_source_url,
          source_title: binding.endpoint_source_title,
          source_author: binding.endpoint_source_author,
          source_published_at: binding.endpoint_source_published_at,
          source_retrieved_at: binding.endpoint_source_retrieved_at,
          source_content_sha256: binding.endpoint_source_content_sha256,
        });
        const bindingSource = archiveSourceView(binding);
        if (!bindingSource) {
          throw new Error(
            "Model execution binding is missing its required source record",
          );
        }
        return {
          id: binding.id,
          apiModelId: binding.api_model_id,
          validFrom: binding.valid_from.toISOString(),
          validTo: binding.valid_to?.toISOString() ?? null,
          createdAt: binding.created_at.toISOString(),
          endpoint: {
            id: binding.endpoint_id,
            path: binding.endpoint_path,
            baseUrl: binding.endpoint_base_url,
            hostname: binding.endpoint_hostname,
            source: endpointSource,
          },
          snapshot:
            binding.snapshot_id && binding.provider_snapshot_id
              ? {
                  id: binding.snapshot_id,
                  providerSnapshotId: binding.provider_snapshot_id,
                }
              : null,
          source: bindingSource,
        };
      });

    const identityTimeline: ArchiveIdentityTimelineEventView[] = [];

    if (canonicalSource) {
      identityTimeline.push({
        id: `source:${canonicalSource.id}:canonical`,
        kind: "canonical_source",
        occurredAt: canonicalSource.retrievedAt,
        title: "Canonical identity source recorded",
        description:
          canonicalSource.title ?? canonicalSource.url ?? canonicalSource.sourceType,
        source: canonicalSource,
        aliasId: null,
        bindingId: null,
        snapshotId: null,
      });
    }

    for (const alias of aliasResolutions) {
      identityTimeline.push({
        id: `alias-resolution:${alias.id}`,
        kind: "alias_resolution",
        occurredAt: alias.observedAt,
        title: `Alias observed · ${alias.alias.value}`,
        description: alias.resolvedSnapshot
          ? `resolved to snapshot ${alias.resolvedSnapshot.providerSnapshotId}`
          : `resolved to canonical model ${row.canonical_slug}`,
        source: alias.source,
        aliasId: alias.alias.id,
        bindingId: null,
        snapshotId: alias.resolvedSnapshot?.id ?? null,
      });
    }

    for (const binding of executionBindings) {
      identityTimeline.push({
        id: `binding:${binding.id}:start`,
        kind: "binding_started",
        occurredAt: binding.validFrom,
        title: "Execution binding became valid",
        description: `${binding.apiModelId} · ${binding.endpoint.hostname}`,
        source: binding.source,
        aliasId: null,
        bindingId: binding.id,
        snapshotId: binding.snapshot?.id ?? null,
      });
      if (binding.validTo) {
        identityTimeline.push({
          id: `binding:${binding.id}:end`,
          kind: "binding_ended",
          occurredAt: binding.validTo,
          title: "Execution binding validity ended",
          description: `${binding.apiModelId} · ${binding.endpoint.hostname}`,
          source: binding.source,
          aliasId: null,
          bindingId: binding.id,
          snapshotId: binding.snapshot?.id ?? null,
        });
      }
    }

    for (const snapshot of snapshots) {
      if (snapshot.validFrom) {
        identityTimeline.push({
          id: `identity-snapshot:${snapshot.id}:start`,
          kind: "snapshot_started",
          occurredAt: snapshot.validFrom,
          title: "Provider snapshot became valid",
          description: snapshot.providerSnapshotId,
          source: snapshot.source,
          aliasId: null,
          bindingId: null,
          snapshotId: snapshot.id,
        });
      }
      if (snapshot.validTo) {
        identityTimeline.push({
          id: `identity-snapshot:${snapshot.id}:end`,
          kind: "snapshot_ended",
          occurredAt: snapshot.validTo,
          title: "Provider snapshot validity ended",
          description: snapshot.providerSnapshotId,
          source: snapshot.source,
          aliasId: null,
          bindingId: null,
          snapshotId: snapshot.id,
        });
      }
    }

    identityTimeline.sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    );

    const timeline: ArchiveTimelineEventView[] = [];

    if (row.released_at) {
      timeline.push({
        id: `model:${row.id}:released`,
        kind: "model_released",
        occurredAt: row.released_at.toISOString(),
        title: "Model released",
        description: row.marketing_name,
        runId: null,
        testCaseId: null,
        snapshotId: null,
        relatedModelId: null,
      });
    }
    if (row.retired_at) {
      timeline.push({
        id: `model:${row.id}:retired`,
        kind: "model_retired",
        occurredAt: row.retired_at.toISOString(),
        title: "Model retired",
        description: row.marketing_name,
        runId: null,
        testCaseId: null,
        snapshotId: null,
        relatedModelId: null,
      });
    }

    for (const snapshot of snapshots) {
      if (snapshot.validFrom) {
        timeline.push({
          id: `snapshot:${snapshot.id}:start`,
          kind: "snapshot_started",
          occurredAt: snapshot.validFrom,
          title: "Snapshot observed",
          description: snapshot.providerSnapshotId,
          runId: null,
          testCaseId: null,
          snapshotId: snapshot.id,
          relatedModelId: null,
        });
      }
      if (snapshot.validTo) {
        timeline.push({
          id: `snapshot:${snapshot.id}:end`,
          kind: "snapshot_ended",
          occurredAt: snapshot.validTo,
          title: "Snapshot validity ended",
          description: snapshot.providerSnapshotId,
          runId: null,
          testCaseId: null,
          snapshotId: snapshot.id,
          relatedModelId: null,
        });
      }
    }

    for (const relation of relations) {
      if (!relation.validFrom) continue;
      timeline.push({
        id: `relation:${relation.id}`,
        kind: "relation",
        occurredAt: relation.validFrom,
        title: relation.relationType.replaceAll("_", " "),
        description: `${relation.direction} · ${relation.relatedModel.marketingName}`,
        runId: null,
        testCaseId: null,
        snapshotId: null,
        relatedModelId: relation.relatedModel.id,
      });
    }

    for (const run of allRuns) {
      timeline.push({
        id: `run:${run.id}`,
        kind: "run",
        occurredAt: run.completedAt ?? run.sealedAt ?? run.createdAt,
        title: `Run · ${run.test.caseSlug}`,
        description: `${run.evidenceLevel ?? "—"} · ${
          run.evaluation?.exactMatch === true
            ? "exact match"
            : run.evaluation?.exactMatch === false
              ? "mismatch"
              : run.evaluation?.status ?? "not evaluated"
        }`,
        runId: run.id,
        testCaseId: run.test.testCaseId,
        snapshotId: null,
        relatedModelId: null,
      });
    }

    timeline.sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    );

    return {
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
      family:
        row.family_id && row.family_slug && row.family_name
          ? {
              id: row.family_id,
              slug: row.family_slug,
              displayName: row.family_name,
            }
          : null,
      track:
        row.track_id && row.track_slug && row.track_name
          ? {
              id: row.track_id,
              slug: row.track_slug,
              displayName: row.track_name,
              trackType: row.track_type,
            }
          : null,
      releasedAt: row.released_at?.toISOString() ?? null,
      retiredAt: row.retired_at?.toISOString() ?? null,
      canonicalSourceId: row.canonical_source_id,
      canonicalSource,
      snapshots,
      relations,
      aliasResolutions,
      executionBindings,
      identityTimeline,
      testCoverage: coverageResult.rows.map((coverage) => ({
        testCaseId: coverage.test_case_id,
        familySlug: coverage.family_slug,
        familyName: coverage.family_name,
        version: coverage.version,
        caseSlug: coverage.case_slug,
        runCount: Number(coverage.run_count),
        latestRunAt: coverage.latest_run_at?.toISOString() ?? null,
      })),
      recentRuns: allRuns.slice(0, 20),
      timeline,
    };
  }

  async getTest(testCaseId: string): Promise<ArchiveTestDetailView | null> {
    const testResult = await this.pool.query<{
      test_case_id: string;
      family_slug: string;
      family_name: string;
      origin: string;
      canonical_source_id: string | null;
      family_source_id: string | null;
      family_source_type: string | null;
      family_source_url: string | null;
      family_source_title: string | null;
      family_source_author: string | null;
      family_source_published_at: Date | null;
      family_source_retrieved_at: Date | null;
      family_source_content_sha256: string | null;
      variant_id: string;
      variant_slug: string;
      variant_name: string;
      category: string;
      artifact_type: string;
      version: string;
      version_source_id: string | null;
      version_source_type: string | null;
      version_source_url: string | null;
      version_source_title: string | null;
      version_source_author: string | null;
      version_source_published_at: Date | null;
      version_source_retrieved_at: Date | null;
      version_source_content_sha256: string | null;
      version_status: string;
      definition_sha256: string;
      license: string | null;
      published_at: Date | null;
      version_created_at: Date;
      case_slug: string;
      case_type: string;
      case_status: string;
      active_from: Date | null;
      active_to: Date | null;
      prompt_blob_sha256: string;
      fixture_manifest_blob_sha256: string | null;
      evaluator_slug: string | null;
      evaluator_version: string | null;
      evaluator_kind: string | null;
      evaluator_definition_sha256: string | null;
      run_count: string;
    }>(
      `SELECT
         tc.id AS test_case_id,
         tf.slug AS family_slug,
         tf.name AS family_name,
         tf.origin,
         tf.canonical_source_id,
         family_source.id AS family_source_id,
         family_source.source_type AS family_source_type,
         family_source.url AS family_source_url,
         family_source.title AS family_source_title,
         family_source.author AS family_source_author,
         family_source.published_at AS family_source_published_at,
         family_source.retrieved_at AS family_source_retrieved_at,
         family_source.content_sha256 AS family_source_content_sha256,
         tvar.id AS variant_id,
         tvar.slug AS variant_slug,
         tvar.name AS variant_name,
         tvar.category,
         tvar.artifact_type,
         tv.version,
         version_source.id AS version_source_id,
         version_source.source_type AS version_source_type,
         version_source.url AS version_source_url,
         version_source.title AS version_source_title,
         version_source.author AS version_source_author,
         version_source.published_at AS version_source_published_at,
         version_source.retrieved_at AS version_source_retrieved_at,
         version_source.content_sha256 AS version_source_content_sha256,
         tv.status AS version_status,
         tv.definition_sha256,
         tv.license,
         tv.published_at,
         tv.created_at AS version_created_at,
         tc.slug AS case_slug,
         tc.case_type,
         tc.status AS case_status,
         tc.active_from,
         tc.active_to,
         tc.prompt_blob_sha256,
         tc.fixture_manifest_blob_sha256,
         evaluator.slug AS evaluator_slug,
         evaluator.version AS evaluator_version,
         evaluator.kind AS evaluator_kind,
         evaluator.definition_sha256 AS evaluator_definition_sha256,
         (
           SELECT COUNT(*)::text
           FROM modelapse.runs r
           WHERE r.test_case_id = tc.id
             AND r.sealed_at IS NOT NULL
         ) AS run_count
       FROM modelapse.test_cases tc
       JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
       JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
       JOIN modelapse.test_families tf ON tf.id = tvar.family_id
       LEFT JOIN modelapse.source_records family_source
         ON family_source.id = tf.canonical_source_id
       LEFT JOIN modelapse.source_records version_source
         ON version_source.id = tv.source_id
       LEFT JOIN LATERAL (
         SELECT e.slug, e.version, e.kind, e.definition_sha256
         FROM modelapse.test_version_evaluators tve
         JOIN modelapse.evaluators e ON e.id = tve.evaluator_id
         WHERE tve.test_version_id = tv.id
         ORDER BY e.slug, e.version
         LIMIT 1
       ) evaluator ON true
       WHERE tc.id = $1
         AND tc.visibility = 'public'
       LIMIT 1`,
      [testCaseId],
    );

    const row = testResult.rows[0];
    if (!row) return null;

    const [coverageResult, versionHistoryResult, recentRuns] = await Promise.all([
      this.pool.query<{
        model_id: string;
        canonical_slug: string;
        marketing_name: string;
        provider_slug: string;
        run_count: string;
        latest_run_at: Date | null;
      }>(
        `SELECT
           m.id AS model_id,
           m.canonical_slug,
           m.marketing_name,
           p.slug AS provider_slug,
           COUNT(r.id)::text AS run_count,
           MAX(r.completed_at) AS latest_run_at
         FROM modelapse.runs r
         JOIN modelapse.models m ON m.id = r.model_id
         JOIN modelapse.providers p ON p.id = m.provider_id
         WHERE r.test_case_id = $1
           AND r.sealed_at IS NOT NULL
         GROUP BY m.id, p.id
         ORDER BY MAX(r.completed_at) DESC NULLS LAST, p.slug, m.marketing_name`,
        [testCaseId],
      ),
      this.pool.query<{
        id: string;
        version: string;
        status: string;
        definition_sha256: string;
        license: string | null;
        published_at: Date | null;
        created_at: Date;
        source_id: string | null;
        source_type: string | null;
        source_url: string | null;
        source_title: string | null;
        source_author: string | null;
        source_published_at: Date | null;
        source_retrieved_at: Date | null;
        source_content_sha256: string | null;
        evaluator_slug: string | null;
        evaluator_version: string | null;
        evaluator_kind: string | null;
        public_case_count: string;
        linked_test_case_id: string | null;
      }>(
        `SELECT
           tv.id,
           tv.version,
           tv.status,
           tv.definition_sha256,
           tv.license,
           tv.published_at,
           tv.created_at,
           source.id AS source_id,
           source.source_type,
           source.url AS source_url,
           source.title AS source_title,
           source.author AS source_author,
           source.published_at AS source_published_at,
           source.retrieved_at AS source_retrieved_at,
           source.content_sha256 AS source_content_sha256,
           evaluator.slug AS evaluator_slug,
           evaluator.version AS evaluator_version,
           evaluator.kind AS evaluator_kind,
           (
             SELECT COUNT(*)::text
             FROM modelapse.test_cases public_case
             WHERE public_case.test_version_id = tv.id
               AND public_case.visibility = 'public'
           ) AS public_case_count,
           linked_case.id AS linked_test_case_id
         FROM modelapse.test_versions tv
         LEFT JOIN modelapse.source_records source ON source.id = tv.source_id
         LEFT JOIN LATERAL (
           SELECT e.slug, e.version, e.kind
           FROM modelapse.test_version_evaluators tve
           JOIN modelapse.evaluators e ON e.id = tve.evaluator_id
           WHERE tve.test_version_id = tv.id
           ORDER BY e.slug, e.version
           LIMIT 1
         ) evaluator ON true
         LEFT JOIN LATERAL (
           SELECT public_case.id
           FROM modelapse.test_cases public_case
           WHERE public_case.test_version_id = tv.id
             AND public_case.visibility = 'public'
             AND public_case.slug = $2
           ORDER BY public_case.id
           LIMIT 1
         ) linked_case ON true
         WHERE tv.variant_id = $1
           AND EXISTS (
             SELECT 1
             FROM modelapse.test_cases public_case
             WHERE public_case.test_version_id = tv.id
               AND public_case.visibility = 'public'
           )
         ORDER BY tv.published_at DESC NULLS LAST, tv.created_at DESC, tv.version DESC`,
        [row.variant_id, row.case_slug],
      ),
      this.listRuns({ testCaseId, limit: 50 }),
    ]);

    const canonicalSource = archiveSourceView({
      source_id: row.family_source_id,
      source_type: row.family_source_type,
      source_url: row.family_source_url,
      source_title: row.family_source_title,
      source_author: row.family_source_author,
      source_published_at: row.family_source_published_at,
      source_retrieved_at: row.family_source_retrieved_at,
      source_content_sha256: row.family_source_content_sha256,
    });

    const versionSource = archiveSourceView({
      source_id: row.version_source_id,
      source_type: row.version_source_type,
      source_url: row.version_source_url,
      source_title: row.version_source_title,
      source_author: row.version_source_author,
      source_published_at: row.version_source_published_at,
      source_retrieved_at: row.version_source_retrieved_at,
      source_content_sha256: row.version_source_content_sha256,
    });

    const versionHistory: ArchiveTestVersionHistoryView[] =
      versionHistoryResult.rows.map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        definitionSha256: version.definition_sha256,
        license: version.license,
        publishedAt: version.published_at?.toISOString() ?? null,
        createdAt: version.created_at.toISOString(),
        source: archiveSourceView(version),
        evaluator:
          version.evaluator_slug &&
          version.evaluator_version &&
          version.evaluator_kind
            ? {
                slug: version.evaluator_slug,
                version: version.evaluator_version,
                kind: version.evaluator_kind,
              }
            : null,
        publicCaseCount: Number(version.public_case_count),
        linkedTestCaseId: version.linked_test_case_id,
      }));

    return {
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
      origin: row.origin,
      canonicalSourceId: row.canonical_source_id,
      canonicalSource,
      versionSource,
      versionHistory,
      versionStatus: row.version_status,
      definitionSha256: row.definition_sha256,
      license: row.license,
      publishedAt: row.published_at?.toISOString() ?? null,
      versionCreatedAt: row.version_created_at.toISOString(),
      caseType: row.case_type,
      caseStatus: row.case_status,
      activeFrom: row.active_from?.toISOString() ?? null,
      activeTo: row.active_to?.toISOString() ?? null,
      promptSha256: row.prompt_blob_sha256,
      fixtureManifestSha256: row.fixture_manifest_blob_sha256,
      evaluatorDefinitionSha256: row.evaluator_definition_sha256,
      modelCoverage: coverageResult.rows.map((coverage) => ({
        modelId: coverage.model_id,
        canonicalSlug: coverage.canonical_slug,
        marketingName: coverage.marketing_name,
        providerSlug: coverage.provider_slug,
        runCount: Number(coverage.run_count),
        latestRunAt: coverage.latest_run_at?.toISOString() ?? null,
      })),
      recentRuns,
    };
  }

  async compareLatest(input: {
    readonly modelIds: readonly string[];
    readonly testCaseId: string;
  }): Promise<ArchiveComparisonView | null> {
    const modelIds = [...new Set(input.modelIds)];
    if (modelIds.length < 2 || modelIds.length > 4) {
      throw new Error("Archive comparison requires between 2 and 4 models");
    }

    const [models, tests] = await Promise.all([
      this.listModels(),
      this.listTests(),
    ]);
    const selectedModels = modelIds
      .map((modelId) => models.find((model) => model.id === modelId))
      .filter((model): model is ArchiveModelView => Boolean(model));
    const test = tests.find((candidate) => candidate.testCaseId === input.testCaseId);

    if (!test || selectedModels.length !== modelIds.length) {
      return null;
    }

    const latestRuns = await Promise.all(
      modelIds.map(async (modelId) => {
        const runs = await this.listRuns({
          modelId,
          testCaseId: input.testCaseId,
          limit: 1,
        });
        return runs[0] ?? null;
      }),
    );

    return {
      test,
      rows: selectedModels.map((model, index) => ({
        model,
        latestRun: latestRuns[index] ?? null,
      })),
    };
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

    const relationResult = await this.pool.query<{
      direction: "outgoing" | "incoming";
      relation_type: string;
      related_run_id: string;
      created_at: Date;
    }>(
      `SELECT
         CASE
           WHEN rr.from_run_id = $1 THEN 'outgoing'
           ELSE 'incoming'
         END AS direction,
         rr.relation_type,
         CASE
           WHEN rr.from_run_id = $1 THEN rr.to_run_id
           ELSE rr.from_run_id
         END AS related_run_id,
         rr.created_at
       FROM modelapse.run_relations rr
       JOIN modelapse.runs related
         ON related.id = CASE
           WHEN rr.from_run_id = $1 THEN rr.to_run_id
           ELSE rr.from_run_id
         END
       JOIN modelapse.test_cases related_tc ON related_tc.id = related.test_case_id
       WHERE (rr.from_run_id = $1 OR rr.to_run_id = $1)
         AND related.sealed_at IS NOT NULL
         AND related_tc.visibility = 'public'
       ORDER BY rr.created_at ASC, rr.relation_type`,
      [runId],
    );

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
      relations: relationResult.rows.map((relation) => ({
        direction: relation.direction,
        relationType: relation.relation_type,
        relatedRunId: relation.related_run_id,
        createdAt: relation.created_at.toISOString(),
      })),
    };
  }
}

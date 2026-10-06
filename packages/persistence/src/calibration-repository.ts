import { Pool } from "pg";

export type CalibrationStatus = "pass" | "anomaly" | "unknown";

export interface CalibrationPolicyView {
  readonly id: string;
  readonly version: string;
  readonly windowSize: number;
  readonly repeatedAnomalyThreshold: number;
  readonly maxAgeHours: number;
  readonly actor: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface CalibrationAssessmentView {
  readonly runId: string;
  readonly policy: {
    readonly id: string;
    readonly version: string;
  };
  readonly status: CalibrationStatus;
  readonly exactMatch: boolean | null;
  readonly anomalyStreak: number;
  readonly repeatedAnomaly: boolean;
  readonly repeatRecommended: boolean;
  readonly caveats: readonly string[];
  readonly assessedAt: string;
  readonly createdAt: string;
}

export interface CalibrationServiceHealthView
  extends CalibrationAssessmentView {
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly model: {
    readonly id: string | null;
    readonly canonicalSlug: string | null;
    readonly marketingName: string | null;
  };
  readonly test: {
    readonly testCaseId: string;
    readonly caseSlug: string;
  };
  readonly execution: {
    readonly path: string;
    readonly environmentId: string | null;
    readonly environmentSlug: string | null;
    readonly region: string | null;
    readonly accountTier: string | null;
    readonly serviceTier: string | null;
    readonly serviceAssurance: string | null;
  };
  readonly completedAt: string;
}

export interface RecordCalibrationPolicyInput {
  readonly version: string;
  readonly windowSize: number;
  readonly repeatedAnomalyThreshold: number;
  readonly maxAgeHours: number;
  readonly actor: string;
  readonly note?: string;
}

const VERSION_RE = /^[a-z0-9][a-z0-9._-]*$/;

function policyView(row: {
  id: string;
  version: string;
  window_size: number;
  repeated_anomaly_threshold: number;
  max_age_hours: number;
  actor: string;
  note: string | null;
  created_at: Date;
}): CalibrationPolicyView {
  return {
    id: row.id,
    version: row.version,
    windowSize: row.window_size,
    repeatedAnomalyThreshold: row.repeated_anomaly_threshold,
    maxAgeHours: row.max_age_hours,
    actor: row.actor,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

export class PgCalibrationRepository {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCalibrationRepository {
    return new PgCalibrationRepository(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async listPolicies(): Promise<readonly CalibrationPolicyView[]> {
    const result = await this.pool.query(
      `SELECT
         id,
         version,
         window_size,
         repeated_anomaly_threshold,
         max_age_hours,
         actor,
         note,
         created_at
       FROM modelapse.calibration_policies
       ORDER BY created_at DESC, version DESC, id DESC`,
    );
    return result.rows.map((row) => policyView(row));
  }

  async recordPolicy(
    input: RecordCalibrationPolicyInput,
  ): Promise<CalibrationPolicyView> {
    const version = input.version.trim();
    const actor = input.actor.trim();
    if (!VERSION_RE.test(version)) {
      throw new Error("version must be a lowercase policy identifier");
    }
    if (!actor) throw new Error("actor is required");
    if (
      !Number.isInteger(input.windowSize) ||
      input.windowSize < 1 ||
      input.windowSize > 20
    ) {
      throw new Error("windowSize must be an integer between 1 and 20");
    }
    if (
      !Number.isInteger(input.repeatedAnomalyThreshold) ||
      input.repeatedAnomalyThreshold < 1 ||
      input.repeatedAnomalyThreshold > input.windowSize
    ) {
      throw new Error(
        "repeatedAnomalyThreshold must be between 1 and windowSize",
      );
    }
    if (
      !Number.isInteger(input.maxAgeHours) ||
      input.maxAgeHours < 1 ||
      input.maxAgeHours > 720
    ) {
      throw new Error("maxAgeHours must be an integer between 1 and 720");
    }

    const inserted = await this.pool.query(
      `INSERT INTO modelapse.calibration_policies
        (
          version,
          window_size,
          repeated_anomaly_threshold,
          max_age_hours,
          actor,
          note
        )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         version,
         window_size,
         repeated_anomaly_threshold,
         max_age_hours,
         actor,
         note,
         created_at`,
      [
        version,
        input.windowSize,
        input.repeatedAnomalyThreshold,
        input.maxAgeHours,
        actor,
        input.note?.trim() || null,
      ],
    );
    return policyView(inserted.rows[0]!);
  }

  async recordForRun(
    runId: string,
  ): Promise<CalibrationAssessmentView | null> {
    const target = await this.pool.query<{
      run_id: string;
      provider_id: string;
      model_id: string | null;
      test_case_id: string;
      case_type: string;
      execution_path: string;
      completed_at: Date;
      execution_environment_id: string | null;
      execution_region: string | null;
      account_tier: string | null;
      service_tier: string | null;
      service_assurance: string | null;
      exact_match: number | null;
      policy_id: string;
      policy_version: string;
      window_size: number;
      repeated_anomaly_threshold: number;
    }>(
      `SELECT
         run.id AS run_id,
         run.provider_id,
         run.model_id,
         run.test_case_id,
         test_case.case_type,
         run.execution_path,
         run.completed_at,
         qualification.execution_environment_id,
         qualification.execution_region,
         qualification.account_tier,
         qualification.service_tier,
         qualification.service_assurance,
         exact_match.numeric_value AS exact_match,
         policy.id AS policy_id,
         policy.version AS policy_version,
         policy.window_size,
         policy.repeated_anomaly_threshold
       FROM modelapse.runs run
       JOIN modelapse.test_cases test_case ON test_case.id = run.test_case_id
       CROSS JOIN modelapse.calibration_policy_current policy
       LEFT JOIN modelapse.run_execution_qualification qualification
         ON qualification.run_id = run.id
       LEFT JOIN LATERAL (
         SELECT metric.numeric_value
           FROM modelapse.evaluations evaluation
           JOIN modelapse.evaluators evaluator
             ON evaluator.id = evaluation.evaluator_id
           JOIN modelapse.metric_values metric
             ON metric.evaluation_id = evaluation.id
            AND metric.metric_key = 'exact_match'
          WHERE evaluation.run_id = run.id
            AND evaluation.status = 'completed'
            AND evaluator.slug = 'exact-text'
          ORDER BY evaluation.created_at DESC
          LIMIT 1
       ) exact_match ON true
       WHERE run.id = $1
         AND run.status = 'completed'
         AND run.sealed_at IS NOT NULL
       LIMIT 1`,
      [runId],
    );

    const row = target.rows[0];
    if (!row) return null;
    if (row.case_type !== "calibration") return null;

    const existing = await this.getForRun(runId);
    if (existing) return existing;

    const previous = await this.pool.query<{ status: CalibrationStatus }>(
      `SELECT assessment.status
         FROM modelapse.calibration_run_assessments assessment
         JOIN modelapse.runs previous_run ON previous_run.id = assessment.run_id
         LEFT JOIN modelapse.run_execution_qualification previous_qualification
           ON previous_qualification.run_id = previous_run.id
        WHERE previous_run.provider_id = $1
          AND previous_run.model_id IS NOT DISTINCT FROM $2::uuid
          AND previous_run.test_case_id = $3
          AND previous_run.execution_path = $4::modelapse.execution_path
          AND previous_run.completed_at < $5
          AND previous_qualification.execution_environment_id
                IS NOT DISTINCT FROM $6::uuid
          AND previous_qualification.execution_region
                IS NOT DISTINCT FROM $7::text
          AND previous_qualification.account_tier
                IS NOT DISTINCT FROM $8::text
          AND previous_qualification.service_tier
                IS NOT DISTINCT FROM $9::text
          AND previous_qualification.service_assurance
                IS NOT DISTINCT FROM $10::text
        ORDER BY previous_run.completed_at DESC, previous_run.id DESC
        LIMIT $11`,
      [
        row.provider_id,
        row.model_id,
        row.test_case_id,
        row.execution_path,
        row.completed_at,
        row.execution_environment_id,
        row.execution_region,
        row.account_tier,
        row.service_tier,
        row.service_assurance,
        Math.max(0, row.window_size - 1),
      ],
    );

    const exactMatch =
      row.exact_match === null ? null : Number(row.exact_match) === 1;
    const status: CalibrationStatus =
      exactMatch === null ? "unknown" : exactMatch ? "pass" : "anomaly";

    let anomalyStreak = status === "anomaly" ? 1 : 0;
    if (status === "anomaly") {
      for (const prior of previous.rows) {
        if (prior.status !== "anomaly") break;
        anomalyStreak += 1;
      }
    }

    const caveats: string[] = [];
    if (row.execution_region === null) {
      caveats.push("execution_region_unknown");
    }
    if (row.service_assurance === "operator_uncertain") {
      caveats.push("service_assurance_operator_uncertain");
    } else if (
      row.service_assurance === null ||
      row.service_assurance === "unknown"
    ) {
      caveats.push("service_assurance_unknown");
    }
    if (exactMatch === null) {
      caveats.push("calibration_evaluation_missing");
    }

    const repeatedAnomaly =
      status === "anomaly" &&
      anomalyStreak >= row.repeated_anomaly_threshold;
    const repeatRecommended = status !== "pass";

    await this.pool.query(
      `INSERT INTO modelapse.calibration_run_assessments
        (
          run_id,
          policy_id,
          status,
          exact_match,
          anomaly_streak,
          repeated_anomaly,
          repeat_recommended,
          caveats,
          assessed_at
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], now())
       ON CONFLICT (run_id) DO NOTHING`,
      [
        runId,
        row.policy_id,
        status,
        exactMatch,
        anomalyStreak,
        repeatedAnomaly,
        repeatRecommended,
        caveats,
      ],
    );

    return this.getForRun(runId);
  }

  async getForRun(
    runId: string,
  ): Promise<CalibrationAssessmentView | null> {
    const result = await this.pool.query<{
      run_id: string;
      policy_id: string;
      policy_version: string;
      status: CalibrationStatus;
      exact_match: boolean | null;
      anomaly_streak: number;
      repeated_anomaly: boolean;
      repeat_recommended: boolean;
      caveats: string[];
      assessed_at: Date;
      created_at: Date;
    }>(
      `SELECT
         assessment.run_id,
         assessment.policy_id,
         policy.version AS policy_version,
         assessment.status,
         assessment.exact_match,
         assessment.anomaly_streak,
         assessment.repeated_anomaly,
         assessment.repeat_recommended,
         assessment.caveats,
         assessment.assessed_at,
         assessment.created_at
       FROM modelapse.calibration_run_assessments assessment
       JOIN modelapse.calibration_policies policy
         ON policy.id = assessment.policy_id
       WHERE assessment.run_id = $1
       LIMIT 1`,
      [runId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      runId: row.run_id,
      policy: { id: row.policy_id, version: row.policy_version },
      status: row.status,
      exactMatch: row.exact_match,
      anomalyStreak: row.anomaly_streak,
      repeatedAnomaly: row.repeated_anomaly,
      repeatRecommended: row.repeat_recommended,
      caveats: row.caveats,
      assessedAt: row.assessed_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  async listServiceHealth(input: {
    readonly providerId?: string;
    readonly modelId?: string;
    readonly limit?: number;
  } = {}): Promise<readonly CalibrationServiceHealthView[]> {
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("limit must be an integer between 1 and 200");
    }

    const result = await this.pool.query<{
      run_id: string;
      policy_id: string;
      policy_version: string;
      status: CalibrationStatus;
      exact_match: boolean | null;
      anomaly_streak: number;
      repeated_anomaly: boolean;
      repeat_recommended: boolean;
      caveats: string[];
      assessed_at: Date;
      created_at: Date;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      model_id: string | null;
      canonical_slug: string | null;
      marketing_name: string | null;
      test_case_id: string;
      case_slug: string;
      execution_path: string;
      execution_environment_id: string | null;
      execution_environment_slug: string | null;
      execution_region: string | null;
      account_tier: string | null;
      service_tier: string | null;
      service_assurance: string | null;
      completed_at: Date;
    }>(
      `SELECT
         health.run_id,
         health.policy_id,
         health.policy_version,
         health.status,
         health.exact_match,
         health.anomaly_streak,
         health.repeated_anomaly,
         health.repeat_recommended,
         health.caveats,
         health.assessed_at,
         assessment.created_at,
         provider.id AS provider_id,
         provider.slug AS provider_slug,
         provider.name AS provider_name,
         model.id AS model_id,
         model.canonical_slug,
         model.marketing_name,
         test_case.id AS test_case_id,
         test_case.slug AS case_slug,
         health.execution_path,
         health.execution_environment_id,
         health.execution_environment_slug,
         health.execution_region,
         health.account_tier,
         health.service_tier,
         health.service_assurance,
         health.completed_at
       FROM modelapse.calibration_service_health_current health
       JOIN modelapse.calibration_run_assessments assessment
         ON assessment.run_id = health.run_id
       JOIN modelapse.providers provider ON provider.id = health.provider_id
       LEFT JOIN modelapse.models model ON model.id = health.model_id
       JOIN modelapse.test_cases test_case ON test_case.id = health.test_case_id
       WHERE ($1::uuid IS NULL OR health.provider_id = $1)
         AND ($2::uuid IS NULL OR health.model_id = $2)
       ORDER BY health.completed_at DESC, health.run_id DESC
       LIMIT $3`,
      [input.providerId ?? null, input.modelId ?? null, limit],
    );

    return result.rows.map((row) => ({
      runId: row.run_id,
      policy: { id: row.policy_id, version: row.policy_version },
      status: row.status,
      exactMatch: row.exact_match,
      anomalyStreak: row.anomaly_streak,
      repeatedAnomaly: row.repeated_anomaly,
      repeatRecommended: row.repeat_recommended,
      caveats: row.caveats,
      assessedAt: row.assessed_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      provider: {
        id: row.provider_id,
        slug: row.provider_slug,
        name: row.provider_name,
      },
      model: {
        id: row.model_id,
        canonicalSlug: row.canonical_slug,
        marketingName: row.marketing_name,
      },
      test: {
        testCaseId: row.test_case_id,
        caseSlug: row.case_slug,
      },
      execution: {
        path: row.execution_path,
        environmentId: row.execution_environment_id,
        environmentSlug: row.execution_environment_slug,
        region: row.execution_region,
        accountTier: row.account_tier,
        serviceTier: row.service_tier,
        serviceAssurance: row.service_assurance,
      },
      completedAt: row.completed_at.toISOString(),
    }));
  }
}

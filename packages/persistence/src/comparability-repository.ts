import { Pool } from "pg";

export interface ComparabilityPolicyView {
  readonly id: string;
  readonly version: string;
  readonly minimumEvidenceLevel: "E0" | "E1" | "E2" | "E3" | "E4" | "E5";
  readonly requireSameExecutionPath: boolean;
  readonly requireRegion: boolean;
  readonly requireAccountTier: boolean;
  readonly requireServiceTier: boolean;
  readonly requireDocumentedServiceAssurance: boolean;
  readonly rejectQualificationCaveats: boolean;
  readonly requireRecentCalibration: boolean;
  readonly rejectRepeatedCalibrationAnomaly: boolean;
  readonly calibrationMaxAgeHours: number;
  readonly defaultMinRepeatCount: number;
  readonly unstableMinRepeatCount: number;
  readonly actor: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface RecordComparabilityPolicyInput
  extends Omit<
    ComparabilityPolicyView,
    "id" | "createdAt" | "note"
  > {
  readonly note?: string;
}

const VERSION_RE = /^[a-z0-9][a-z0-9._-]*$/;
const EVIDENCE_LEVELS = new Set(["E0", "E1", "E2", "E3", "E4", "E5"]);

function view(row: {
  id: string;
  version: string;
  minimum_evidence_level: ComparabilityPolicyView["minimumEvidenceLevel"];
  require_same_execution_path: boolean;
  require_region: boolean;
  require_account_tier: boolean;
  require_service_tier: boolean;
  require_documented_service_assurance: boolean;
  reject_qualification_caveats: boolean;
  require_recent_calibration: boolean;
  reject_repeated_calibration_anomaly: boolean;
  calibration_max_age_hours: number;
  default_min_repeat_count: number;
  unstable_min_repeat_count: number;
  actor: string;
  note: string | null;
  created_at: Date;
}): ComparabilityPolicyView {
  return {
    id: row.id,
    version: row.version,
    minimumEvidenceLevel: row.minimum_evidence_level,
    requireSameExecutionPath: row.require_same_execution_path,
    requireRegion: row.require_region,
    requireAccountTier: row.require_account_tier,
    requireServiceTier: row.require_service_tier,
    requireDocumentedServiceAssurance:
      row.require_documented_service_assurance,
    rejectQualificationCaveats: row.reject_qualification_caveats,
    requireRecentCalibration: row.require_recent_calibration,
    rejectRepeatedCalibrationAnomaly:
      row.reject_repeated_calibration_anomaly,
    calibrationMaxAgeHours: row.calibration_max_age_hours,
    defaultMinRepeatCount: row.default_min_repeat_count,
    unstableMinRepeatCount: row.unstable_min_repeat_count,
    actor: row.actor,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

const SELECT = `
  SELECT
    id,
    version,
    minimum_evidence_level,
    require_same_execution_path,
    require_region,
    require_account_tier,
    require_service_tier,
    require_documented_service_assurance,
    reject_qualification_caveats,
    require_recent_calibration,
    reject_repeated_calibration_anomaly,
    calibration_max_age_hours,
    default_min_repeat_count,
    unstable_min_repeat_count,
    actor,
    note,
    created_at
  FROM modelapse.comparability_policies
`;

export class PgComparabilityRepository {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgComparabilityRepository {
    return new PgComparabilityRepository(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async listPolicies(): Promise<readonly ComparabilityPolicyView[]> {
    const result = await this.pool.query(
      SELECT + " ORDER BY created_at DESC, version DESC, id DESC",
    );
    return result.rows.map((row) => view(row));
  }

  async getPolicy(
    version?: string,
  ): Promise<ComparabilityPolicyView | null> {
    const result = version
      ? await this.pool.query(
          SELECT + " WHERE version = $1 LIMIT 1",
          [version],
        )
      : await this.pool.query(
          SELECT + " ORDER BY created_at DESC, version DESC, id DESC LIMIT 1",
        );
    return result.rows[0] ? view(result.rows[0]) : null;
  }

  async recordPolicy(
    input: RecordComparabilityPolicyInput,
  ): Promise<ComparabilityPolicyView> {
    const version = input.version.trim();
    const actor = input.actor.trim();
    if (!VERSION_RE.test(version)) {
      throw new Error("version must be a lowercase policy identifier");
    }
    if (!EVIDENCE_LEVELS.has(input.minimumEvidenceLevel)) {
      throw new Error("minimumEvidenceLevel is invalid");
    }
    if (!actor) throw new Error("actor is required");

    for (const [label, value, max] of [
      ["calibrationMaxAgeHours", input.calibrationMaxAgeHours, 720],
      ["defaultMinRepeatCount", input.defaultMinRepeatCount, 20],
      ["unstableMinRepeatCount", input.unstableMinRepeatCount, 20],
    ] as const) {
      if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new Error(label + " must be an integer between 1 and " + max);
      }
    }

    const result = await this.pool.query(
      `INSERT INTO modelapse.comparability_policies
        (
          version,
          minimum_evidence_level,
          require_same_execution_path,
          require_region,
          require_account_tier,
          require_service_tier,
          require_documented_service_assurance,
          reject_qualification_caveats,
          require_recent_calibration,
          reject_repeated_calibration_anomaly,
          calibration_max_age_hours,
          default_min_repeat_count,
          unstable_min_repeat_count,
          actor,
          note
        )
       VALUES (
         $1,
         $2::modelapse.evidence_level,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12,
         $13,
         $14,
         $15
       )
       RETURNING
         id,
         version,
         minimum_evidence_level,
         require_same_execution_path,
         require_region,
         require_account_tier,
         require_service_tier,
         require_documented_service_assurance,
         reject_qualification_caveats,
         require_recent_calibration,
         reject_repeated_calibration_anomaly,
         calibration_max_age_hours,
         default_min_repeat_count,
         unstable_min_repeat_count,
         actor,
         note,
         created_at`,
      [
        version,
        input.minimumEvidenceLevel,
        input.requireSameExecutionPath,
        input.requireRegion,
        input.requireAccountTier,
        input.requireServiceTier,
        input.requireDocumentedServiceAssurance,
        input.rejectQualificationCaveats,
        input.requireRecentCalibration,
        input.rejectRepeatedCalibrationAnomaly,
        input.calibrationMaxAgeHours,
        input.defaultMinRepeatCount,
        input.unstableMinRepeatCount,
        actor,
        input.note?.trim() || null,
      ],
    );
    return view(result.rows[0]!);
  }
}

import { Pool } from "pg";
import {
  isRecord,
  parseDirectRunConfig,
  rejectUnknownKeys,
  UUID_RE,
  type DirectProviderRunRequest,
  type DirectProviderSlug,
  type DirectRunConfig,
} from "./job.js";

export interface RunnableModel {
  readonly id: string;
  readonly providerId: string;
  readonly provider: DirectProviderSlug;
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly status: "preview" | "active";
  readonly apiModelId: string;
  readonly snapshotId: string | null;
  readonly endpointHostname: string;
}

export interface RunnableTest {
  readonly testCaseId: string;
  readonly familySlug: string;
  readonly familyName: string;
  readonly variantSlug: string;
  readonly variantName: string;
  readonly version: string;
  readonly caseSlug: string;
  readonly caseType: string;
  readonly visibility: "public" | "private";
  readonly artifactType: string;
}

export interface RunSelectionRequest {
  readonly modelId: string;
  readonly testCaseId: string;
  readonly config?: DirectRunConfig;
}

export interface PlannedDirectRun {
  readonly model: RunnableModel;
  readonly test: RunnableTest;
  readonly jobPayload: DirectProviderRunRequest;
}

export function parseRunSelectionRequest(
  value: unknown,
): RunSelectionRequest {
  if (!isRecord(value)) {
    throw new Error("Run selection must be an object");
  }

  rejectUnknownKeys(value, ["modelId", "testCaseId", "config"], "Run selection");

  if (typeof value.modelId !== "string" || !UUID_RE.test(value.modelId)) {
    throw new Error("modelId must be a UUID");
  }
  if (typeof value.testCaseId !== "string" || !UUID_RE.test(value.testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }

  const config = parseDirectRunConfig(value.config);

  return {
    modelId: value.modelId,
    testCaseId: value.testCaseId,
    ...(config ? { config } : {}),
  };
}

export class PgRunPlanner {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgRunPlanner {
    return new PgRunPlanner(
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

  async listModels(): Promise<readonly RunnableModel[]> {
    const result = await this.pool.query<{
      id: string;
      provider_id: string;
      provider_slug: DirectProviderSlug;
      canonical_slug: string;
      marketing_name: string;
      status: "preview" | "active";
      api_model_id: string;
      snapshot_id: string | null;
      endpoint_hostname: string;
    }>(
      `SELECT DISTINCT ON (m.id)
         m.id,
         m.provider_id,
         p.slug AS provider_slug,
         m.canonical_slug,
         m.marketing_name,
         m.status,
         meb.api_model_id,
         meb.snapshot_id,
         pe.hostname AS endpoint_hostname
       FROM modelapse.models m
       JOIN modelapse.providers p ON p.id = m.provider_id
       JOIN modelapse.model_execution_bindings meb
         ON meb.model_id = m.id
        AND meb.source_id IS NOT NULL
        AND meb.valid_from <= now()
        AND (meb.valid_to IS NULL OR meb.valid_to > now())
       JOIN modelapse.provider_endpoints pe
         ON pe.id = meb.endpoint_id
        AND pe.provider_id = m.provider_id
        AND pe.path = 'first_party_direct'
        AND pe.source_id IS NOT NULL
        AND (pe.valid_from IS NULL OR pe.valid_from <= now())
        AND (pe.valid_to IS NULL OR pe.valid_to > now())
       WHERE m.status IN ('preview', 'active')
         AND m.canonical_source_id IS NOT NULL
         AND p.slug IN ('openai', 'deepseek')
       ORDER BY
         m.id,
         meb.valid_from DESC,
         pe.valid_from DESC NULLS LAST,
         meb.id DESC`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      provider: row.provider_slug,
      canonicalSlug: row.canonical_slug,
      marketingName: row.marketing_name,
      status: row.status,
      apiModelId: row.api_model_id,
      snapshotId: row.snapshot_id,
      endpointHostname: row.endpoint_hostname,
    }));
  }

  async listTests(): Promise<readonly RunnableTest[]> {
    const result = await this.pool.query<{
      test_case_id: string;
      family_slug: string;
      family_name: string;
      variant_slug: string;
      variant_name: string;
      version: string;
      case_slug: string;
      case_type: string;
      visibility: "public" | "private";
      artifact_type: string;
    }>(
      `SELECT
         tc.id AS test_case_id,
         tf.slug AS family_slug,
         tf.name AS family_name,
         tvar.slug AS variant_slug,
         tvar.name AS variant_name,
         tv.version,
         tc.slug AS case_slug,
         tc.case_type,
         tc.visibility,
         tvar.artifact_type
       FROM modelapse.test_cases tc
       JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
       JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
       JOIN modelapse.test_families tf ON tf.id = tvar.family_id
       JOIN modelapse.blobs b ON b.sha256 = tc.prompt_blob_sha256
       WHERE tc.status = 'active'
         AND tv.status = 'published'
         AND tvar.artifact_type = 'text'
         AND (tc.active_from IS NULL OR tc.active_from <= now())
         AND (tc.active_to IS NULL OR tc.active_to > now())
       ORDER BY tf.slug, tvar.slug, tv.version, tc.slug`,
    );

    return result.rows.map((row) => ({
      testCaseId: row.test_case_id,
      familySlug: row.family_slug,
      familyName: row.family_name,
      variantSlug: row.variant_slug,
      variantName: row.variant_name,
      version: row.version,
      caseSlug: row.case_slug,
      caseType: row.case_type,
      visibility: row.visibility,
      artifactType: row.artifact_type,
    }));
  }

  async plan(input: RunSelectionRequest): Promise<PlannedDirectRun> {
    const selection = parseRunSelectionRequest(input);

    const [models, tests] = await Promise.all([
      this.listModels(),
      this.listTests(),
    ]);

    const model = models.find((candidate) => candidate.id === selection.modelId);
    if (!model) {
      throw new Error(
        "Selected model is not runnable through a sourced first-party direct binding",
      );
    }

    const test = tests.find(
      (candidate) => candidate.testCaseId === selection.testCaseId,
    );
    if (!test) {
      throw new Error("Selected Test Case is not active and published");
    }

    if (model.provider === "deepseek" && selection.config?.serviceTier) {
      throw new Error("DeepSeek direct runs do not support serviceTier");
    }

    const jobPayload: DirectProviderRunRequest = {
      provider: model.provider,
      testCaseId: test.testCaseId,
      modelId: model.id,
      model: model.apiModelId,
      ...(selection.config ? { config: selection.config } : {}),
    };

    return { model, test, jobPayload };
  }
}

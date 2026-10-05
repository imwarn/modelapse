import { Pool } from "pg";
import {
  isRecord,
  parseDirectRunConfig,
  rejectUnknownKeys,
  UUID_RE,
  type DirectProviderRunRequest,
  type DirectProviderSlug,
  type DirectRunConfig,
  type DirectRunFleetPlan,
} from "./job.js";

export interface RunnableModelTestabilityObservation {
  readonly id: string;
  readonly scope: "provider" | "model";
  readonly accessState: "available" | "restricted" | "unavailable" | "unknown";
  readonly registrationRequirement:
    | "open_signup"
    | "restricted_signup"
    | "invite_only"
    | "enterprise_only"
    | "unknown";
  readonly billingRequirement:
    | "free"
    | "paid_account"
    | "prepaid_credit"
    | "subscription"
    | "enterprise_contract"
    | "unknown";
  readonly regionPolicy: "unrestricted" | "restricted" | "unknown";
  readonly accountTier: string | null;
  readonly serviceTier: string | null;
  readonly serviceAssurance:
    | "documented_default"
    | "documented_variant"
    | "operator_uncertain"
    | "unknown";
  readonly observedAt: string;
  readonly sourceId: string;
}

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
  readonly testability: {
    readonly providerPolicy: RunnableModelTestabilityObservation | null;
    readonly runnerAccess: RunnableModelTestabilityObservation | null;
  };
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
  readonly evaluator: {
    readonly slug: "exact-text";
    readonly version: "1.0.0";
    readonly kind: "deterministic";
  };
}

export interface RunSelectionRequest {
  readonly modelId: string;
  readonly testCaseId: string;
  readonly config?: DirectRunConfig;
}

export interface PlannedDirectRun {
  readonly model: RunnableModel;
  readonly test: RunnableTest;
  readonly executionEnvironment: DirectRunFleetPlan | null;
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
      policy_observation_id: string | null;
      policy_model_id: string | null;
      policy_access_state: RunnableModelTestabilityObservation["accessState"] | null;
      policy_registration_requirement: RunnableModelTestabilityObservation["registrationRequirement"] | null;
      policy_billing_requirement: RunnableModelTestabilityObservation["billingRequirement"] | null;
      policy_region_policy: RunnableModelTestabilityObservation["regionPolicy"] | null;
      policy_account_tier: string | null;
      policy_service_tier: string | null;
      policy_service_assurance: RunnableModelTestabilityObservation["serviceAssurance"] | null;
      policy_observed_at: Date | null;
      policy_source_id: string | null;
      runner_observation_id: string | null;
      runner_model_id: string | null;
      runner_access_state: RunnableModelTestabilityObservation["accessState"] | null;
      runner_registration_requirement: RunnableModelTestabilityObservation["registrationRequirement"] | null;
      runner_billing_requirement: RunnableModelTestabilityObservation["billingRequirement"] | null;
      runner_region_policy: RunnableModelTestabilityObservation["regionPolicy"] | null;
      runner_account_tier: string | null;
      runner_service_tier: string | null;
      runner_service_assurance: RunnableModelTestabilityObservation["serviceAssurance"] | null;
      runner_observed_at: Date | null;
      runner_source_id: string | null;
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
         pe.hostname AS endpoint_hostname,
         policy.id AS policy_observation_id,
         policy.model_id AS policy_model_id,
         policy.access_state AS policy_access_state,
         policy.registration_requirement AS policy_registration_requirement,
         policy.billing_requirement AS policy_billing_requirement,
         policy.region_policy AS policy_region_policy,
         policy.account_tier AS policy_account_tier,
         policy.service_tier AS policy_service_tier,
         policy.service_assurance AS policy_service_assurance,
         policy.observed_at AS policy_observed_at,
         policy.source_id AS policy_source_id,
         runner.id AS runner_observation_id,
         runner.model_id AS runner_model_id,
         runner.access_state AS runner_access_state,
         runner.registration_requirement AS runner_registration_requirement,
         runner.billing_requirement AS runner_billing_requirement,
         runner.region_policy AS runner_region_policy,
         runner.account_tier AS runner_account_tier,
         runner.service_tier AS runner_service_tier,
         runner.service_assurance AS runner_service_assurance,
         runner.observed_at AS runner_observed_at,
         runner.source_id AS runner_source_id
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
       LEFT JOIN LATERAL (
         SELECT observation.*
           FROM modelapse.provider_testability_current observation
          WHERE observation.provider_id = m.provider_id
            AND observation.execution_path = 'first_party_direct'
            AND observation.subject_kind = 'provider_policy'
            AND (observation.model_id = m.id OR observation.model_id IS NULL)
          ORDER BY (observation.model_id IS NOT NULL) DESC,
                   observation.observed_at DESC,
                   observation.id DESC
          LIMIT 1
       ) policy ON true
       LEFT JOIN LATERAL (
         SELECT observation.*
           FROM modelapse.provider_testability_current observation
          WHERE observation.provider_id = m.provider_id
            AND observation.execution_path = 'first_party_direct'
            AND observation.subject_kind = 'runner_access'
            AND (observation.model_id = m.id OR observation.model_id IS NULL)
          ORDER BY (observation.model_id IS NOT NULL) DESC,
                   observation.observed_at DESC,
                   observation.id DESC
          LIMIT 1
       ) runner ON true
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
      testability: {
        providerPolicy:
          row.policy_observation_id &&
          row.policy_access_state &&
          row.policy_registration_requirement &&
          row.policy_billing_requirement &&
          row.policy_region_policy &&
          row.policy_service_assurance &&
          row.policy_observed_at &&
          row.policy_source_id
            ? {
                id: row.policy_observation_id,
                scope: row.policy_model_id ? "model" : "provider",
                accessState: row.policy_access_state,
                registrationRequirement: row.policy_registration_requirement,
                billingRequirement: row.policy_billing_requirement,
                regionPolicy: row.policy_region_policy,
                accountTier: row.policy_account_tier,
                serviceTier: row.policy_service_tier,
                serviceAssurance: row.policy_service_assurance,
                observedAt: row.policy_observed_at.toISOString(),
                sourceId: row.policy_source_id,
              }
            : null,
        runnerAccess:
          row.runner_observation_id &&
          row.runner_access_state &&
          row.runner_registration_requirement &&
          row.runner_billing_requirement &&
          row.runner_region_policy &&
          row.runner_service_assurance &&
          row.runner_observed_at &&
          row.runner_source_id
            ? {
                id: row.runner_observation_id,
                scope: row.runner_model_id ? "model" : "provider",
                accessState: row.runner_access_state,
                registrationRequirement: row.runner_registration_requirement,
                billingRequirement: row.runner_billing_requirement,
                regionPolicy: row.runner_region_policy,
                accountTier: row.runner_account_tier,
                serviceTier: row.runner_service_tier,
                serviceAssurance: row.runner_service_assurance,
                observedAt: row.runner_observed_at.toISOString(),
                sourceId: row.runner_source_id,
              }
            : null,
      },
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
      evaluator_slug: "exact-text";
      evaluator_version: "1.0.0";
      evaluator_kind: "deterministic";
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
         tvar.artifact_type,
         e.slug AS evaluator_slug,
         e.version AS evaluator_version,
         e.kind AS evaluator_kind
       FROM modelapse.test_cases tc
       JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
       JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
       JOIN modelapse.test_families tf ON tf.id = tvar.family_id
       JOIN modelapse.blobs b ON b.sha256 = tc.prompt_blob_sha256
       JOIN modelapse.test_version_evaluators tve
         ON tve.test_version_id = tv.id
       JOIN modelapse.evaluators e
         ON e.id = tve.evaluator_id
        AND e.slug = 'exact-text'
        AND e.version = '1.0.0'
        AND e.kind = 'deterministic'
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
      evaluator: {
        slug: row.evaluator_slug,
        version: row.evaluator_version,
        kind: row.evaluator_kind,
      },
    }));
  }

  private qualificationFor(
    model: RunnableModel,
    requestedServiceTier: string | undefined,
    selectedAt: string,
    fleet: DirectRunFleetPlan | null,
  ): NonNullable<DirectProviderRunRequest["qualification"]> {
    const policy = model.testability.providerPolicy;
    const runner = model.testability.runnerAccess;
    const caveats: string[] = [];

    if (!policy) {
      caveats.push("provider_policy_evidence_missing");
    } else if (policy.accessState !== "available") {
      caveats.push("provider_access_" + policy.accessState);
    }

    if (!runner) {
      caveats.push("runner_access_evidence_missing");
    } else if (runner.accessState !== "available") {
      caveats.push("runner_access_" + runner.accessState);
    }

    if (!fleet) {
      caveats.push("execution_fleet_unconfigured");
    } else {
      caveats.push(...fleet.caveats);
      if (
        runner?.accountTier &&
        fleet.accountTier &&
        runner.accountTier !== fleet.accountTier
      ) {
        caveats.push("runner_access_account_tier_differs_from_environment");
      }
      if (
        runner?.serviceTier &&
        fleet.serviceTier &&
        runner.serviceTier !== fleet.serviceTier
      ) {
        caveats.push("runner_access_service_tier_differs_from_environment");
      }
    }

    const serviceAssurance =
      fleet?.serviceAssurance ?? runner?.serviceAssurance ?? "unknown";
    if (serviceAssurance === "operator_uncertain") {
      caveats.push("service_assurance_operator_uncertain");
    } else if (serviceAssurance === "unknown") {
      caveats.push("service_assurance_unknown");
    }

    return {
      selectedAt,
      ...(policy ? { providerPolicyObservationId: policy.id } : {}),
      ...(runner ? { runnerAccessObservationId: runner.id } : {}),
      ...(fleet?.accountTier
        ? { accountTier: fleet.accountTier }
        : runner?.accountTier
          ? { accountTier: runner.accountTier }
          : {}),
      ...(fleet?.serviceTier
        ? { serviceTier: fleet.serviceTier }
        : runner?.serviceTier
          ? { serviceTier: runner.serviceTier }
          : {}),
      ...(requestedServiceTier ? { requestedServiceTier } : {}),
      serviceAssurance,
      caveats,
    };
  }

  private async costFor(
    model: RunnableModel,
    targetServiceTier: string | undefined,
    selectedAt: string,
    targetAccountTier?: string,
  ): Promise<NonNullable<DirectProviderRunRequest["cost"]>> {
    const accountTier =
      targetAccountTier ??
      model.testability.runnerAccess?.accountTier ??
      undefined;
    const result = await this.pool.query<{
      id: string;
      pricing_currency: string;
      input_price_per_million: string | null;
      output_price_per_million: string | null;
      request_price: string | null;
      service_tier: string | null;
      account_tier: string | null;
    }>(
      `SELECT
         observation.id,
         observation.pricing_currency,
         observation.input_price_per_million::text,
         observation.output_price_per_million::text,
         observation.request_price::text,
         observation.service_tier,
         observation.account_tier
       FROM modelapse.provider_testability_observations observation
       WHERE observation.provider_id = $1
         AND observation.execution_path = 'first_party_direct'
         AND observation.pricing_currency IS NOT NULL
         AND observation.observed_at <= now()
         AND (observation.model_id = $2 OR observation.model_id IS NULL)
         AND (
           ($3::text IS NULL AND observation.service_tier IS NULL)
           OR ($3::text IS NOT NULL AND (
             observation.service_tier IS NULL OR observation.service_tier = $3
           ))
         )
         AND (
           ($4::text IS NULL AND observation.account_tier IS NULL)
           OR ($4::text IS NOT NULL AND (
             observation.account_tier IS NULL OR observation.account_tier = $4
           ))
         )
       ORDER BY
         (observation.model_id IS NOT NULL) DESC,
         (observation.service_tier IS NOT DISTINCT FROM $3::text) DESC,
         (observation.account_tier IS NOT DISTINCT FROM $4::text) DESC,
         observation.observed_at DESC,
         observation.id DESC
       LIMIT 1`,
      [
        model.providerId,
        model.id,
        targetServiceTier ?? null,
        accountTier ?? null,
      ],
    );

    const pricing = result.rows[0];
    if (!pricing) {
      return {
        selectedAt,
        caveats: ["pricing_evidence_missing"],
      };
    }

    const caveats: string[] = [];
    if (
      pricing.input_price_per_million === null &&
      pricing.output_price_per_million === null &&
      pricing.request_price === null
    ) {
      caveats.push("pricing_basis_empty");
    }
    if (targetServiceTier && pricing.service_tier === null) {
      caveats.push("pricing_service_tier_generic");
    }
    if (accountTier && pricing.account_tier === null) {
      caveats.push("pricing_account_tier_generic");
    }

    return {
      selectedAt,
      pricingObservationId: pricing.id,
      currency: pricing.pricing_currency,
      ...(pricing.input_price_per_million !== null
        ? { inputPricePerMillion: pricing.input_price_per_million }
        : {}),
      ...(pricing.output_price_per_million !== null
        ? { outputPricePerMillion: pricing.output_price_per_million }
        : {}),
      ...(pricing.request_price !== null
        ? { perRequest: pricing.request_price }
        : {}),
      caveats,
    };
  }

  private async fleetFor(
    model: RunnableModel,
    requestedServiceTier: string | undefined,
    selectedAt: string,
  ): Promise<DirectRunFleetPlan | null> {
    const enabled = await this.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM modelapse.execution_environments environment
         JOIN modelapse.execution_environment_current_state state
           ON state.environment_id = environment.id
          AND state.enabled`,
    );
    if ((enabled.rows[0]?.count ?? 0) === 0) return null;

    const preferredServiceTier =
      requestedServiceTier ??
      model.testability.runnerAccess?.serviceTier ??
      null;
    const preferredAccountTier =
      model.testability.runnerAccess?.accountTier ?? null;

    const result = await this.pool.query<{
      environment_id: string;
      environment_slug: string;
      region: string;
      account_tier: string | null;
      service_tier: string | null;
      service_assurance:
        | "documented_default"
        | "documented_variant"
        | "operator_uncertain"
        | "unknown";
      capability_event_id: string;
      selection_priority: number;
      policy_region_policy: "unrestricted" | "restricted" | "unknown" | null;
      policy_allowed_regions: string[] | null;
      policy_blocked_regions: string[] | null;
    }>(
      `SELECT
         environment.id AS environment_id,
         environment.slug AS environment_slug,
         environment.region,
         environment.account_tier,
         environment.service_tier,
         environment.service_assurance,
         capability.id AS capability_event_id,
         capability.selection_priority,
         policy.region_policy AS policy_region_policy,
         policy.allowed_regions AS policy_allowed_regions,
         policy.blocked_regions AS policy_blocked_regions
       FROM modelapse.execution_environments environment
       JOIN modelapse.execution_environment_current_state state
         ON state.environment_id = environment.id
        AND state.enabled
       JOIN modelapse.execution_environment_capabilities_current capability
         ON capability.environment_id = environment.id
        AND capability.provider_id = $1
        AND capability.execution_path = 'first_party_direct'
        AND capability.enabled
       LEFT JOIN modelapse.provider_testability_observations policy
         ON policy.id = $2
       WHERE (
           policy.id IS NULL
           OR cardinality(policy.allowed_regions) = 0
           OR environment.region = ANY(policy.allowed_regions)
         )
         AND (
           policy.id IS NULL
           OR NOT (environment.region = ANY(policy.blocked_regions))
         )
         AND (
           $3::text IS NULL
           OR environment.service_tier IS NULL
           OR environment.service_tier = $3
         )
       ORDER BY
         capability.selection_priority ASC,
         (environment.service_tier IS NOT DISTINCT FROM $3::text) DESC,
         (environment.account_tier IS NOT DISTINCT FROM $4::text) DESC,
         environment.slug ASC,
         environment.id ASC
       LIMIT 1`,
      [
        model.providerId,
        model.testability.providerPolicy?.id ?? null,
        preferredServiceTier,
        preferredAccountTier,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(
        "No enabled execution environment has a compatible first-party capability for the selected Provider",
      );
    }

    const caveats: string[] = [];
    if (
      row.policy_region_policy === "restricted" &&
      (row.policy_allowed_regions?.length ?? 0) === 0 &&
      (row.policy_blocked_regions?.length ?? 0) === 0
    ) {
      caveats.push("provider_region_policy_restricted_without_region_list");
    }
    if (requestedServiceTier && row.service_tier === null) {
      caveats.push("environment_service_tier_generic");
    }

    return {
      selectedAt,
      environmentId: row.environment_id,
      environmentSlug: row.environment_slug,
      region: row.region,
      ...(row.account_tier ? { accountTier: row.account_tier } : {}),
      ...(row.service_tier ? { serviceTier: row.service_tier } : {}),
      serviceAssurance: row.service_assurance,
      capabilityEventId: row.capability_event_id,
      caveats,
    };
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

    const selectedAt = new Date().toISOString();
    const fleet = await this.fleetFor(
      model,
      selection.config?.serviceTier,
      selectedAt,
    );
    const targetServiceTier =
      selection.config?.serviceTier ??
      fleet?.serviceTier ??
      model.testability.runnerAccess?.serviceTier ??
      undefined;
    const cost = await this.costFor(
      model,
      targetServiceTier,
      selectedAt,
      fleet?.accountTier,
    );

    const jobPayload: DirectProviderRunRequest = {
      provider: model.provider,
      testCaseId: test.testCaseId,
      modelId: model.id,
      model: model.apiModelId,
      ...(selection.config ? { config: selection.config } : {}),
      qualification: this.qualificationFor(
        model,
        selection.config?.serviceTier,
        selectedAt,
        fleet,
      ),
      cost,
      ...(fleet ? { fleet } : {}),
    };

    return {
      model,
      test,
      executionEnvironment: fleet,
      jobPayload,
    };
  }
}

import { Pool } from "pg";

export const providerExpansionCapabilityKeys = [
  "returned_model_metadata",
  "model_version_metadata",
  "provider_request_id",
  "provider_response_id",
  "service_tier_metadata",
  "token_usage",
  "catalog_model_list",
] as const;

export type ProviderExpansionCapabilityKey =
  (typeof providerExpansionCapabilityKeys)[number];

export type ProviderExpansionCapabilitySupport =
  | "supported"
  | "unsupported";

export type ProviderExpansionStatus =
  | "ready"
  | "limited"
  | "incomplete";

export type ProviderExpansionGateStatus =
  | "pass"
  | "limited"
  | "fail";

export interface ProviderExpansionPolicy {
  readonly id: string;
  readonly version: string;
  readonly requiredCapabilities: readonly ProviderExpansionCapabilityKey[];
  readonly requireIdentityProvenance: boolean;
  readonly requireCatalogCollection: boolean;
  readonly requireProviderPolicy: boolean;
  readonly requirePricingEvidence: boolean;
  readonly requireRunnerContext: boolean;
  readonly requireDirectRun: boolean;
  readonly requireCalibration: boolean;
  readonly actor: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface ProviderExpansionCapability {
  readonly capability: ProviderExpansionCapabilityKey;
  readonly supportState: ProviderExpansionCapabilitySupport | null;
  readonly eventId: string | null;
  readonly sourceId: string | null;
  readonly declaredAt: string | null;
  readonly actor: string | null;
  readonly note: string | null;
  readonly observed: boolean;
}

export interface ProviderExpansionGate {
  readonly key:
    | "identity_provenance"
    | "catalog_collection"
    | "access_region_evidence"
    | "pricing_evidence"
    | "runner_account_context"
    | "direct_execution_evidence"
    | "calibration_coverage"
    | "capability_contract";
  readonly status: ProviderExpansionGateStatus;
  readonly summary: string;
  readonly blockers: readonly string[];
  readonly caveats: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface ProviderExpansionProviderSummary {
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly policyVersion: string;
  readonly status: ProviderExpansionStatus;
  readonly blockerCount: number;
  readonly caveatCount: number;
  readonly activeModelCount: number;
  readonly latestDirectRunAt: string | null;
  readonly latestCalibrationAt: string | null;
}

export interface ProviderExpansionProvider
  extends ProviderExpansionProviderSummary {
  readonly generatedAt: string;
  readonly policy: ProviderExpansionPolicy;
  readonly blockers: readonly string[];
  readonly caveats: readonly string[];
  readonly gates: readonly ProviderExpansionGate[];
  readonly capabilities: readonly ProviderExpansionCapability[];
  readonly models: readonly {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly status: string;
    readonly canonicalSourceId: string | null;
    readonly sourcedDirectBindingId: string | null;
    readonly endpointSourceId: string | null;
    readonly bindingSourceId: string | null;
  }[];
  readonly fleet: readonly {
    readonly environmentId: string;
    readonly slug: string;
    readonly region: string;
    readonly accountTier: string | null;
    readonly serviceTier: string | null;
    readonly serviceAssurance: string;
    readonly capabilityEventId: string;
  }[];
  readonly latestCalibration: {
    readonly runId: string;
    readonly status: "pass" | "anomaly" | "unknown";
    readonly repeatedAnomaly: boolean;
    readonly completedAt: string;
  } | null;
}

export interface RecordProviderCapabilityInput {
  readonly providerId: string;
  readonly capability: ProviderExpansionCapabilityKey;
  readonly supportState: ProviderExpansionCapabilitySupport;
  readonly sourceId?: string;
  readonly declaredAt?: string;
  readonly actor: string;
  readonly note?: string;
}

export interface RecordProviderExpansionPolicyInput {
  readonly version: string;
  readonly requiredCapabilities: readonly ProviderExpansionCapabilityKey[];
  readonly requireIdentityProvenance: boolean;
  readonly requireCatalogCollection: boolean;
  readonly requireProviderPolicy: boolean;
  readonly requirePricingEvidence: boolean;
  readonly requireRunnerContext: boolean;
  readonly requireDirectRun: boolean;
  readonly requireCalibration: boolean;
  readonly actor: string;
  readonly note?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_RE = /^[a-z0-9][a-z0-9._-]*$/;
const CAPABILITY_KEYS = new Set<string>(providerExpansionCapabilityKeys);

function normalizeTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("declaredAt must be an ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(label + " is required");
  return normalized;
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function policyView(row: {
  id: string;
  version: string;
  required_capabilities: ProviderExpansionCapabilityKey[];
  require_identity_provenance: boolean;
  require_catalog_collection: boolean;
  require_provider_policy: boolean;
  require_pricing_evidence: boolean;
  require_runner_context: boolean;
  require_direct_run: boolean;
  require_calibration: boolean;
  actor: string;
  note: string | null;
  created_at: Date;
}): ProviderExpansionPolicy {
  return {
    id: row.id,
    version: row.version,
    requiredCapabilities: row.required_capabilities,
    requireIdentityProvenance: row.require_identity_provenance,
    requireCatalogCollection: row.require_catalog_collection,
    requireProviderPolicy: row.require_provider_policy,
    requirePricingEvidence: row.require_pricing_evidence,
    requireRunnerContext: row.require_runner_context,
    requireDirectRun: row.require_direct_run,
    requireCalibration: row.require_calibration,
    actor: row.actor,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

const POLICY_SELECT = `
  SELECT
    id,
    version,
    required_capabilities,
    require_identity_provenance,
    require_catalog_collection,
    require_provider_policy,
    require_pricing_evidence,
    require_runner_context,
    require_direct_run,
    require_calibration,
    actor,
    note,
    created_at
  FROM modelapse.provider_expansion_policies
`;

function gate(input: {
  key: ProviderExpansionGate["key"];
  complete: boolean;
  limited?: boolean;
  summary: string;
  blockers?: readonly string[];
  caveats?: readonly string[];
  evidenceIds?: readonly string[];
}): ProviderExpansionGate {
  return {
    key: input.key,
    status: !input.complete ? "fail" : input.limited ? "limited" : "pass",
    summary: input.summary,
    blockers: input.blockers ?? [],
    caveats: input.caveats ?? [],
    evidenceIds: [...new Set(input.evidenceIds ?? [])],
  };
}

export class PgProviderExpansion {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgProviderExpansion {
    return new PgProviderExpansion(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async listPolicies(): Promise<readonly ProviderExpansionPolicy[]> {
    const result = await this.pool.query(
      POLICY_SELECT + " ORDER BY created_at DESC, version DESC, id DESC",
    );
    return result.rows.map((row) => policyView(row));
  }

  async getPolicy(
    version?: string,
  ): Promise<ProviderExpansionPolicy | null> {
    const result = version
      ? await this.pool.query(
          POLICY_SELECT + " WHERE version = $1 LIMIT 1",
          [version],
        )
      : await this.pool.query(
          POLICY_SELECT +
            " ORDER BY created_at DESC, version DESC, id DESC LIMIT 1",
        );
    return result.rows[0] ? policyView(result.rows[0]) : null;
  }

  async recordPolicy(
    input: RecordProviderExpansionPolicyInput,
  ): Promise<ProviderExpansionPolicy> {
    const version = input.version.trim();
    if (!VERSION_RE.test(version)) {
      throw new Error("version must be a lowercase policy identifier");
    }
    const actor = requiredText(input.actor, "actor");
    const capabilities = [...new Set(input.requiredCapabilities)];
    if (
      capabilities.length === 0 ||
      capabilities.some((capability) => !CAPABILITY_KEYS.has(capability))
    ) {
      throw new Error("requiredCapabilities contains an invalid capability");
    }

    const result = await this.pool.query(
      `INSERT INTO modelapse.provider_expansion_policies
        (
          version,
          required_capabilities,
          require_identity_provenance,
          require_catalog_collection,
          require_provider_policy,
          require_pricing_evidence,
          require_runner_context,
          require_direct_run,
          require_calibration,
          actor,
          note
        )
       VALUES (
         $1,
         $2::text[],
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11
       )
       RETURNING
         id,
         version,
         required_capabilities,
         require_identity_provenance,
         require_catalog_collection,
         require_provider_policy,
         require_pricing_evidence,
         require_runner_context,
         require_direct_run,
         require_calibration,
         actor,
         note,
         created_at`,
      [
        version,
        capabilities,
        input.requireIdentityProvenance,
        input.requireCatalogCollection,
        input.requireProviderPolicy,
        input.requirePricingEvidence,
        input.requireRunnerContext,
        input.requireDirectRun,
        input.requireCalibration,
        actor,
        optionalText(input.note),
      ],
    );
    return policyView(result.rows[0]!);
  }

  async recordCapability(
    input: RecordProviderCapabilityInput,
  ): Promise<ProviderExpansionCapability> {
    if (!UUID_RE.test(input.providerId)) {
      throw new Error("providerId must be a UUID");
    }
    if (!CAPABILITY_KEYS.has(input.capability)) {
      throw new Error("capability is invalid");
    }
    if (
      input.supportState !== "supported" &&
      input.supportState !== "unsupported"
    ) {
      throw new Error("supportState is invalid");
    }
    if (input.sourceId && !UUID_RE.test(input.sourceId)) {
      throw new Error("sourceId must be a UUID");
    }
    const actor = requiredText(input.actor, "actor");
    const result = await this.pool.query<{
      id: string;
      capability: ProviderExpansionCapabilityKey;
      support_state: ProviderExpansionCapabilitySupport;
      source_id: string | null;
      declared_at: Date;
      actor: string;
      note: string | null;
    }>(
      `INSERT INTO modelapse.provider_capability_events
        (
          provider_id,
          capability,
          support_state,
          source_id,
          declared_at,
          actor,
          note
        )
       SELECT
         provider.id,
         $2,
         $3,
         $4::uuid,
         $5,
         $6,
         $7
       FROM modelapse.providers provider
       WHERE provider.id = $1
         AND (
           $4::uuid IS NULL OR EXISTS (
             SELECT 1
             FROM modelapse.source_records
             WHERE id = $4
           )
         )
       RETURNING
         id,
         capability,
         support_state,
         source_id,
         declared_at,
         actor,
         note`,
      [
        input.providerId,
        input.capability,
        input.supportState,
        input.sourceId ?? null,
        normalizeTimestamp(input.declaredAt),
        actor,
        optionalText(input.note),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("provider or source record not found");

    return {
      capability: row.capability,
      supportState: row.support_state,
      eventId: row.id,
      sourceId: row.source_id,
      declaredAt: row.declared_at.toISOString(),
      actor: row.actor,
      note: row.note,
      observed: false,
    };
  }

  async listProviders(
    policyVersion?: string,
  ): Promise<readonly ProviderExpansionProviderSummary[]> {
    const providerResult = await this.pool.query<{
      id: string;
    }>("SELECT id FROM modelapse.providers ORDER BY slug");
    const details = await Promise.all(
      providerResult.rows.map((row) =>
        this.getProvider(row.id, policyVersion),
      ),
    );
    return details
      .filter(
        (item): item is ProviderExpansionProvider => item !== null,
      )
      .map((item) => ({
        provider: item.provider,
        policyVersion: item.policyVersion,
        status: item.status,
        blockerCount: item.blockerCount,
        caveatCount: item.caveatCount,
        activeModelCount: item.activeModelCount,
        latestDirectRunAt: item.latestDirectRunAt,
        latestCalibrationAt: item.latestCalibrationAt,
      }));
  }

  async getProvider(
    providerId: string,
    policyVersion?: string,
  ): Promise<ProviderExpansionProvider | null> {
    if (!UUID_RE.test(providerId)) {
      throw new Error("providerId must be a UUID");
    }

    const policy = await this.getPolicy(policyVersion);
    if (!policy) return null;

    const [
      clock,
      providerResult,
      modelsResult,
      catalogResult,
      testabilityResult,
      fleetResult,
      runEvidenceResult,
      calibrationResult,
      capabilitiesResult,
    ] = await Promise.all([
      this.pool.query<{ generated_at: Date }>("SELECT now() AS generated_at"),
      this.pool.query<{ id: string; slug: string; name: string }>(
        `SELECT id, slug, name
           FROM modelapse.providers
          WHERE id = $1
          LIMIT 1`,
        [providerId],
      ),
      this.pool.query<{
        id: string;
        canonical_slug: string;
        marketing_name: string;
        status: string;
        canonical_source_id: string | null;
        binding_id: string | null;
        endpoint_source_id: string | null;
        binding_source_id: string | null;
      }>(
        `SELECT
           model.id,
           model.canonical_slug,
           model.marketing_name,
           model.status,
           model.canonical_source_id,
           binding.id AS binding_id,
           endpoint.source_id AS endpoint_source_id,
           binding.source_id AS binding_source_id
         FROM modelapse.models model
         LEFT JOIN LATERAL (
           SELECT current_binding.*
             FROM modelapse.model_execution_bindings current_binding
             JOIN modelapse.provider_endpoints current_endpoint
               ON current_endpoint.id = current_binding.endpoint_id
              AND current_endpoint.provider_id = model.provider_id
              AND current_endpoint.path = 'first_party_direct'
              AND (current_endpoint.valid_from IS NULL OR current_endpoint.valid_from <= now())
              AND (current_endpoint.valid_to IS NULL OR current_endpoint.valid_to > now())
            WHERE current_binding.model_id = model.id
              AND current_binding.valid_from <= now()
              AND (current_binding.valid_to IS NULL OR current_binding.valid_to > now())
            ORDER BY current_binding.valid_from DESC, current_binding.id DESC
            LIMIT 1
         ) binding ON true
         LEFT JOIN modelapse.provider_endpoints endpoint
           ON endpoint.id = binding.endpoint_id
        WHERE model.provider_id = $1
          AND model.status IN ('preview', 'active')
        ORDER BY model.canonical_slug`,
        [providerId],
      ),
      this.pool.query<{
        source_id: string;
        source_key: string;
        source_kind: "model_list" | "docs";
        parser: string;
        latest_run_id: string | null;
        latest_status: string | null;
        latest_source_record_id: string | null;
        latest_completed_at: Date | null;
      }>(
        `SELECT
           source.id AS source_id,
           source.source_key,
           source.source_kind,
           source.parser,
           latest.run_id AS latest_run_id,
           latest.status AS latest_status,
           latest.source_record_id AS latest_source_record_id,
           latest.completed_at AS latest_completed_at
         FROM modelapse.catalog_observer_sources source
         LEFT JOIN LATERAL (
           SELECT
             run.id AS run_id,
             run.status,
             snapshot.source_record_id,
             run.completed_at
           FROM modelapse.catalog_collection_runs run
           JOIN modelapse.catalog_source_snapshots snapshot
             ON snapshot.collection_run_id = run.id
          WHERE run.observer_source_id = source.id
            AND run.status IN ('succeeded', 'partial')
          ORDER BY run.completed_at DESC NULLS LAST, run.started_at DESC, run.id DESC
          LIMIT 1
         ) latest ON true
        WHERE source.provider_id = $1
          AND source.enabled
        ORDER BY source.source_key`,
        [providerId],
      ),
      this.pool.query<{
        id: string;
        model_id: string | null;
        subject_kind: "provider_policy" | "runner_access";
        access_state: string;
        region_policy: string;
        account_tier: string | null;
        service_tier: string | null;
        service_assurance: string;
        pricing_currency: string | null;
        input_price_per_million: string | null;
        output_price_per_million: string | null;
        request_price: string | null;
        source_id: string;
      }>(
        `SELECT
           observation.id,
           observation.model_id,
           observation.subject_kind,
           observation.access_state,
           observation.region_policy,
           observation.account_tier,
           observation.service_tier,
           observation.service_assurance,
           observation.pricing_currency,
           observation.input_price_per_million::text,
           observation.output_price_per_million::text,
           observation.request_price::text,
           observation.source_id
         FROM modelapse.provider_testability_current observation
        WHERE observation.provider_id = $1
          AND observation.execution_path = 'first_party_direct'
        ORDER BY observation.subject_kind, observation.model_id NULLS FIRST`,
        [providerId],
      ),
      this.pool.query<{
        environment_id: string;
        slug: string;
        region: string;
        account_tier: string | null;
        service_tier: string | null;
        service_assurance: string;
        capability_event_id: string;
      }>(
        `SELECT
           environment.id AS environment_id,
           environment.slug,
           environment.region,
           environment.account_tier,
           environment.service_tier,
           environment.service_assurance,
           capability.id AS capability_event_id
         FROM modelapse.execution_environment_capabilities_current capability
         JOIN modelapse.execution_environments environment
           ON environment.id = capability.environment_id
         JOIN modelapse.execution_environment_current_state state
           ON state.environment_id = environment.id
        WHERE capability.provider_id = $1
          AND capability.execution_path = 'first_party_direct'
          AND capability.enabled
          AND state.enabled
        ORDER BY capability.selection_priority, environment.slug`,
        [providerId],
      ),
      this.pool.query<{
        latest_completed_at: Date | null;
        run_ids: string[];
        returned_model_observed: boolean;
        model_version_observed: boolean;
        provider_request_id_observed: boolean;
        provider_response_id_observed: boolean;
        service_tier_observed: boolean;
        token_usage_observed: boolean;
      }>(
        `SELECT
           max(run.completed_at) AS latest_completed_at,
           COALESCE(array_agg(run.id ORDER BY run.completed_at DESC)
             FILTER (WHERE run.id IS NOT NULL), '{}'::uuid[]) AS run_ids,
           COALESCE(bool_or(run.returned_model IS NOT NULL), false)
             AS returned_model_observed,
           COALESCE(bool_or(metadata.model_version_string IS NOT NULL), false)
             AS model_version_observed,
           COALESCE(bool_or(metadata.provider_request_id IS NOT NULL), false)
             AS provider_request_id_observed,
           COALESCE(bool_or(metadata.provider_response_id IS NOT NULL), false)
             AS provider_response_id_observed,
           COALESCE(bool_or(
             qualification.returned_service_tier IS NOT NULL
             OR metadata.metadata ? 'serviceTier'
           ), false) AS service_tier_observed,
           COALESCE(bool_or(metadata.usage IS NOT NULL), false)
             AS token_usage_observed
         FROM modelapse.runs run
         JOIN modelapse.run_evidence_summary evidence
           ON evidence.run_id = run.id
          AND evidence.level IN ('E4', 'E5')
         LEFT JOIN modelapse.provider_run_metadata metadata
           ON metadata.run_id = run.id
         LEFT JOIN modelapse.run_execution_qualification qualification
           ON qualification.run_id = run.id
        WHERE run.provider_id = $1
          AND run.execution_path = 'first_party_direct'
          AND run.status = 'completed'
          AND run.sealed_at IS NOT NULL`,
        [providerId],
      ),
      this.pool.query<{
        run_id: string;
        status: "pass" | "anomaly" | "unknown";
        repeated_anomaly: boolean;
        completed_at: Date;
      }>(
        `SELECT
           assessment.run_id,
           assessment.status,
           assessment.repeated_anomaly,
           run.completed_at
         FROM modelapse.calibration_run_assessments assessment
         JOIN modelapse.runs run ON run.id = assessment.run_id
        WHERE run.provider_id = $1
          AND run.status = 'completed'
          AND run.sealed_at IS NOT NULL
        ORDER BY run.completed_at DESC, assessment.run_id DESC
        LIMIT 1`,
        [providerId],
      ),
      this.pool.query<{
        id: string;
        capability: ProviderExpansionCapabilityKey;
        support_state: ProviderExpansionCapabilitySupport;
        source_id: string | null;
        declared_at: Date;
        actor: string;
        note: string | null;
      }>(
        `SELECT
           id,
           capability,
           support_state,
           source_id,
           declared_at,
           actor,
           note
         FROM modelapse.provider_capability_current
        WHERE provider_id = $1
        ORDER BY capability`,
        [providerId],
      ),
    ]);

    const providerRow = providerResult.rows[0];
    if (!providerRow) return null;

    const models = modelsResult.rows.map((row) => ({
      id: row.id,
      canonicalSlug: row.canonical_slug,
      marketingName: row.marketing_name,
      status: row.status,
      canonicalSourceId: row.canonical_source_id,
      sourcedDirectBindingId: row.binding_id,
      endpointSourceId: row.endpoint_source_id,
      bindingSourceId: row.binding_source_id,
    }));

    const currentCapabilities = new Map(
      capabilitiesResult.rows.map((row) => [row.capability, row] as const),
    );
    const catalogModelListObserved = catalogResult.rows.some(
      (row) =>
        row.source_kind === "model_list" &&
        row.latest_source_record_id !== null,
    );
    const catalogAnyObserved = catalogResult.rows.some(
      (row) => row.latest_source_record_id !== null,
    );

    const runEvidence = runEvidenceResult.rows[0] ?? {
      latest_completed_at: null,
      run_ids: [],
      returned_model_observed: false,
      model_version_observed: false,
      provider_request_id_observed: false,
      provider_response_id_observed: false,
      service_tier_observed: false,
      token_usage_observed: false,
    };

    const observedByCapability: Record<
      ProviderExpansionCapabilityKey,
      boolean
    > = {
      returned_model_metadata: runEvidence.returned_model_observed,
      model_version_metadata: runEvidence.model_version_observed,
      provider_request_id: runEvidence.provider_request_id_observed,
      provider_response_id: runEvidence.provider_response_id_observed,
      service_tier_metadata: runEvidence.service_tier_observed,
      token_usage: runEvidence.token_usage_observed,
      catalog_model_list: catalogModelListObserved,
    };

    const capabilities: ProviderExpansionCapability[] =
      providerExpansionCapabilityKeys.map((capability) => {
        const row = currentCapabilities.get(capability);
        return {
          capability,
          supportState: row?.support_state ?? null,
          eventId: row?.id ?? null,
          sourceId: row?.source_id ?? null,
          declaredAt: row?.declared_at.toISOString() ?? null,
          actor: row?.actor ?? null,
          note: row?.note ?? null,
          observed: observedByCapability[capability],
        };
      });

    const activeModelIds = models.map((model) => model.id);
    const identityBlockers: string[] = [];
    const identityEvidence: string[] = [];
    if (models.length === 0) {
      identityBlockers.push("active_model_missing");
    }
    for (const model of models) {
      if (!model.canonicalSourceId) {
        identityBlockers.push(
          "canonical_source_missing:" + model.canonicalSlug,
        );
      } else {
        identityEvidence.push(model.canonicalSourceId);
      }
      if (!model.sourcedDirectBindingId || !model.bindingSourceId) {
        identityBlockers.push(
          "sourced_direct_binding_missing:" + model.canonicalSlug,
        );
      } else {
        identityEvidence.push(model.sourcedDirectBindingId, model.bindingSourceId);
      }
      if (!model.endpointSourceId) {
        identityBlockers.push(
          "endpoint_source_missing:" + model.canonicalSlug,
        );
      } else {
        identityEvidence.push(model.endpointSourceId);
      }
    }

    const modelListDeclaration =
      currentCapabilities.get("catalog_model_list");
    const catalogBlockers: string[] = [];
    const catalogCaveats: string[] = [];
    if (!catalogAnyObserved) {
      catalogBlockers.push("catalog_collection_evidence_missing");
    }
    if (!catalogModelListObserved) {
      if (modelListDeclaration?.support_state === "unsupported") {
        catalogCaveats.push("catalog_model_list_explicitly_unsupported");
      } else {
        catalogBlockers.push("model_list_collection_missing");
      }
    }

    const providerPolicies = testabilityResult.rows.filter(
      (row) => row.subject_kind === "provider_policy",
    );
    const providerWidePolicy = providerPolicies.find(
      (row) => row.model_id === null,
    );
    const policyCoveredModels = new Set(
      providerPolicies
        .filter((row) => row.model_id !== null)
        .map((row) => row.model_id as string),
    );
    const providerPolicyComplete =
      Boolean(providerWidePolicy) ||
      (activeModelIds.length > 0 &&
        activeModelIds.every((id) => policyCoveredModels.has(id)));
    const accessBlockers: string[] = [];
    const accessCaveats: string[] = [];
    if (!providerPolicyComplete) {
      accessBlockers.push("provider_policy_evidence_missing");
    }
    for (const observation of providerPolicies) {
      if (observation.region_policy === "unknown") {
        accessBlockers.push("region_policy_unknown:" + observation.id);
      }
      if (
        observation.access_state === "restricted" ||
        observation.access_state === "unavailable"
      ) {
        accessCaveats.push(
          "provider_access_" + observation.access_state + ":" + observation.id,
        );
      } else if (observation.access_state === "unknown") {
        accessBlockers.push("provider_access_unknown:" + observation.id);
      }
    }

    const pricedPolicies = providerPolicies.filter(
      (row) =>
        row.pricing_currency !== null &&
        (
          row.input_price_per_million !== null ||
          row.output_price_per_million !== null ||
          row.request_price !== null
        ),
    );
    const providerWidePricing = pricedPolicies.some(
      (row) => row.model_id === null,
    );
    const pricedModels = new Set(
      pricedPolicies
        .filter((row) => row.model_id !== null)
        .map((row) => row.model_id as string),
    );
    const pricingComplete =
      providerWidePricing ||
      (activeModelIds.length > 0 &&
        activeModelIds.every((id) => pricedModels.has(id)));
    const pricingBlockers = pricingComplete
      ? []
      : ["pricing_evidence_missing"];

    const runnerAccess = testabilityResult.rows.filter(
      (row) => row.subject_kind === "runner_access",
    );
    const runnableAccess = runnerAccess.filter(
      (row) =>
        row.access_state === "available" &&
        row.account_tier !== null &&
        (
          row.service_assurance === "documented_default" ||
          row.service_assurance === "documented_variant"
        ),
    );
    const fleet = fleetResult.rows.map((row) => ({
      environmentId: row.environment_id,
      slug: row.slug,
      region: row.region,
      accountTier: row.account_tier,
      serviceTier: row.service_tier,
      serviceAssurance: row.service_assurance,
      capabilityEventId: row.capability_event_id,
    }));
    const qualifiedFleet = fleet.filter(
      (environment) =>
        environment.region.trim().length > 0 &&
        environment.accountTier !== null &&
        (
          environment.serviceAssurance === "documented_default" ||
          environment.serviceAssurance === "documented_variant"
        ),
    );
    const runnerBlockers: string[] = [];
    const runnerCaveats: string[] = [];
    if (runnableAccess.length === 0) {
      runnerBlockers.push("runner_access_context_missing");
    }
    if (qualifiedFleet.length === 0) {
      runnerBlockers.push("execution_environment_context_missing");
    }
    if (
      runnerAccess.some(
        (row) =>
          row.service_assurance === "operator_uncertain" ||
          row.service_assurance === "unknown",
      )
    ) {
      runnerCaveats.push("runner_service_assurance_uncertain");
    }

    const directRunIds = runEvidence.run_ids ?? [];
    const directRunBlockers =
      directRunIds.length > 0 ? [] : ["verified_direct_run_missing"];

    const latestCalibrationRow = calibrationResult.rows[0];
    const latestCalibration = latestCalibrationRow
      ? {
          runId: latestCalibrationRow.run_id,
          status: latestCalibrationRow.status,
          repeatedAnomaly: latestCalibrationRow.repeated_anomaly,
          completedAt: latestCalibrationRow.completed_at.toISOString(),
        }
      : null;
    const calibrationBlockers = latestCalibration
      ? []
      : ["calibration_evidence_missing"];
    const calibrationCaveats: string[] = [];
    if (latestCalibration?.repeatedAnomaly) {
      calibrationCaveats.push("calibration_repeated_anomaly");
    } else if (latestCalibration?.status === "anomaly") {
      calibrationCaveats.push("calibration_anomaly_needs_replication");
    } else if (latestCalibration?.status === "unknown") {
      calibrationCaveats.push("calibration_status_unknown");
    }

    const capabilityBlockers: string[] = [];
    const capabilityCaveats: string[] = [];
    const capabilityEvidence: string[] = [];
    for (const capability of policy.requiredCapabilities) {
      const current = capabilities.find(
        (item) => item.capability === capability,
      )!;
      if (!current.eventId || !current.supportState) {
        capabilityBlockers.push(
          "capability_declaration_missing:" + capability,
        );
        continue;
      }
      capabilityEvidence.push(current.eventId);
      if (current.sourceId) capabilityEvidence.push(current.sourceId);
      if (current.supportState === "unsupported") {
        capabilityCaveats.push(
          "capability_explicitly_unsupported:" + capability,
        );
      } else if (!current.observed) {
        capabilityBlockers.push(
          "capability_supported_but_unobserved:" + capability,
        );
      }
    }

    const gates: ProviderExpansionGate[] = [
      gate({
        key: "identity_provenance",
        complete:
          !policy.requireIdentityProvenance || identityBlockers.length === 0,
        summary:
          models.length +
          " active/preview model(s); sourced canonical identity + first-party binding required",
        blockers: policy.requireIdentityProvenance ? identityBlockers : [],
        evidenceIds: identityEvidence,
      }),
      gate({
        key: "catalog_collection",
        complete:
          !policy.requireCatalogCollection || catalogBlockers.length === 0,
        limited:
          policy.requireCatalogCollection && catalogCaveats.length > 0,
        summary:
          catalogResult.rows.length +
          " enabled catalog source(s); current collection evidence required",
        blockers: policy.requireCatalogCollection ? catalogBlockers : [],
        caveats: catalogCaveats,
        evidenceIds: catalogResult.rows.flatMap((row) => [
          row.source_id,
          ...(row.latest_run_id ? [row.latest_run_id] : []),
          ...(row.latest_source_record_id
            ? [row.latest_source_record_id]
            : []),
        ]),
      }),
      gate({
        key: "access_region_evidence",
        complete:
          !policy.requireProviderPolicy || accessBlockers.length === 0,
        limited:
          policy.requireProviderPolicy && accessCaveats.length > 0,
        summary:
          providerPolicies.length +
          " current provider-policy observation(s)",
        blockers: policy.requireProviderPolicy ? accessBlockers : [],
        caveats: accessCaveats,
        evidenceIds: providerPolicies.flatMap((row) => [row.id, row.source_id]),
      }),
      gate({
        key: "pricing_evidence",
        complete:
          !policy.requirePricingEvidence || pricingBlockers.length === 0,
        summary:
          pricedPolicies.length + " current priced policy observation(s)",
        blockers: policy.requirePricingEvidence ? pricingBlockers : [],
        evidenceIds: pricedPolicies.flatMap((row) => [row.id, row.source_id]),
      }),
      gate({
        key: "runner_account_context",
        complete:
          !policy.requireRunnerContext || runnerBlockers.length === 0,
        limited:
          policy.requireRunnerContext && runnerCaveats.length > 0,
        summary:
          runnableAccess.length +
          " usable runner-access observation(s); " +
          qualifiedFleet.length +
          " qualified fleet environment(s)",
        blockers: policy.requireRunnerContext ? runnerBlockers : [],
        caveats: runnerCaveats,
        evidenceIds: [
          ...runnableAccess.flatMap((row) => [row.id, row.source_id]),
          ...qualifiedFleet.flatMap((environment) => [
            environment.environmentId,
            environment.capabilityEventId,
          ]),
        ],
      }),
      gate({
        key: "direct_execution_evidence",
        complete:
          !policy.requireDirectRun || directRunBlockers.length === 0,
        summary:
          directRunIds.length +
          " sealed first-party E4/E5 completed Run(s)",
        blockers: policy.requireDirectRun ? directRunBlockers : [],
        evidenceIds: directRunIds,
      }),
      gate({
        key: "calibration_coverage",
        complete:
          !policy.requireCalibration || calibrationBlockers.length === 0,
        limited:
          policy.requireCalibration && calibrationCaveats.length > 0,
        summary: latestCalibration
          ? "latest calibration " + latestCalibration.status
          : "no calibration assessment",
        blockers: policy.requireCalibration ? calibrationBlockers : [],
        caveats: calibrationCaveats,
        evidenceIds: latestCalibration ? [latestCalibration.runId] : [],
      }),
      gate({
        key: "capability_contract",
        complete: capabilityBlockers.length === 0,
        limited:
          capabilityBlockers.length === 0 && capabilityCaveats.length > 0,
        summary:
          policy.requiredCapabilities.length +
          " required runtime capability declaration(s)",
        blockers: capabilityBlockers,
        caveats: capabilityCaveats,
        evidenceIds: capabilityEvidence,
      }),
    ];

    const blockers = [...new Set(gates.flatMap((item) => item.blockers))];
    const caveats = [...new Set(gates.flatMap((item) => item.caveats))];
    const status: ProviderExpansionStatus =
      blockers.length > 0
        ? "incomplete"
        : gates.some((item) => item.status === "limited")
          ? "limited"
          : "ready";

    return {
      generatedAt: clock.rows[0]!.generated_at.toISOString(),
      provider: {
        id: providerRow.id,
        slug: providerRow.slug,
        name: providerRow.name,
      },
      policyVersion: policy.version,
      status,
      blockerCount: blockers.length,
      caveatCount: caveats.length,
      activeModelCount: models.length,
      latestDirectRunAt:
        runEvidence.latest_completed_at?.toISOString() ?? null,
      latestCalibrationAt: latestCalibration?.completedAt ?? null,
      policy,
      blockers,
      caveats,
      gates,
      capabilities,
      models,
      fleet,
      latestCalibration,
    };
  }
}

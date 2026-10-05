import { Pool } from "pg";

export type ProviderTestabilitySubjectKind =
  | "provider_policy"
  | "runner_access";

export type ProviderTestabilityAccessState =
  | "available"
  | "restricted"
  | "unavailable"
  | "unknown";

export type ProviderTestabilityRegistrationRequirement =
  | "open_signup"
  | "restricted_signup"
  | "invite_only"
  | "enterprise_only"
  | "unknown";

export type ProviderTestabilityBillingRequirement =
  | "free"
  | "paid_account"
  | "prepaid_credit"
  | "subscription"
  | "enterprise_contract"
  | "unknown";

export type ProviderTestabilityRegionPolicy =
  | "unrestricted"
  | "restricted"
  | "unknown";

export type ProviderTestabilityServiceAssurance =
  | "documented_default"
  | "documented_variant"
  | "operator_uncertain"
  | "unknown";

export type ProviderTestabilitySourceType =
  | "provider_docs"
  | "provider_pricing"
  | "provider_policy"
  | "operator_verification";

export interface ProviderTestabilitySource {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface ProviderTestabilityObservation {
  readonly id: string;
  readonly providerId: string;
  readonly model: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  } | null;
  readonly executionPath: string;
  readonly subjectKind: ProviderTestabilitySubjectKind;
  readonly accessState: ProviderTestabilityAccessState;
  readonly registrationRequirement: ProviderTestabilityRegistrationRequirement;
  readonly billingRequirement: ProviderTestabilityBillingRequirement;
  readonly regionPolicy: ProviderTestabilityRegionPolicy;
  readonly allowedRegions: readonly string[];
  readonly blockedRegions: readonly string[];
  readonly accountTier: string | null;
  readonly serviceTier: string | null;
  readonly serviceAssurance: ProviderTestabilityServiceAssurance;
  readonly pricing: {
    readonly currency: string;
    readonly inputPerMillion: string | null;
    readonly outputPerMillion: string | null;
    readonly perRequest: string | null;
  } | null;
  readonly source: ProviderTestabilitySource;
  readonly observedAt: string;
  readonly actor: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface ProviderTestabilityProviderSummary {
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly modelCount: number;
  readonly currentObservationCount: number;
  readonly providerPolicyCount: number;
  readonly runnerAccessCount: number;
  readonly restrictedOrUnavailableCount: number;
  readonly uncertainServiceCount: number;
  readonly latestObservedAt: string | null;
}

export interface ProviderTestabilityProvider {
  readonly generatedAt: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly models: readonly {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly status: string;
  }[];
  readonly summary: Omit<ProviderTestabilityProviderSummary, "provider">;
  readonly current: readonly ProviderTestabilityObservation[];
  readonly history: readonly ProviderTestabilityObservation[];
}

export interface RecordProviderTestabilityObservationInput {
  readonly providerId: string;
  readonly modelId?: string;
  readonly executionPath: "first_party_direct";
  readonly subjectKind: ProviderTestabilitySubjectKind;
  readonly accessState: ProviderTestabilityAccessState;
  readonly registrationRequirement?: ProviderTestabilityRegistrationRequirement;
  readonly billingRequirement?: ProviderTestabilityBillingRequirement;
  readonly regionPolicy?: ProviderTestabilityRegionPolicy;
  readonly allowedRegions?: readonly string[];
  readonly blockedRegions?: readonly string[];
  readonly accountTier?: string;
  readonly serviceTier?: string;
  readonly serviceAssurance?: ProviderTestabilityServiceAssurance;
  readonly pricing?: {
    readonly currency: string;
    readonly inputPerMillion?: number;
    readonly outputPerMillion?: number;
    readonly perRequest?: number;
  };
  readonly source: {
    readonly sourceType: ProviderTestabilitySourceType;
    readonly url?: string;
    readonly title: string;
    readonly retrievedAt?: string;
    readonly contentSha256?: string;
  };
  readonly observedAt?: string;
  readonly actor: string;
  readonly note?: string;
}

const SOURCE_TYPES = new Set<ProviderTestabilitySourceType>([
  "provider_docs",
  "provider_pricing",
  "provider_policy",
  "operator_verification",
]);

const SHA256_RE = /^[0-9a-f]{64}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function normalizedTimestamp(value: string | undefined, label: string): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(label + " must be an ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

function cleanRegions(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length !== values.length) {
    throw new Error("Region tags must be non-empty strings");
  }
  return [...new Set(normalized)];
}

function optionalText(value: string | undefined, label: string): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) throw new Error(label + " must be non-empty");
  return normalized;
}

function sourceType(value: string): ProviderTestabilitySourceType {
  if (SOURCE_TYPES.has(value as ProviderTestabilitySourceType)) {
    return value as ProviderTestabilitySourceType;
  }
  throw new Error("Unsupported provider testability source type");
}

type ObservationRow = {
  id: string;
  provider_id: string;
  model_id: string | null;
  canonical_slug: string | null;
  marketing_name: string | null;
  execution_path: string;
  subject_kind: ProviderTestabilitySubjectKind;
  access_state: ProviderTestabilityAccessState;
  registration_requirement: ProviderTestabilityRegistrationRequirement;
  billing_requirement: ProviderTestabilityBillingRequirement;
  region_policy: ProviderTestabilityRegionPolicy;
  allowed_regions: string[];
  blocked_regions: string[];
  account_tier: string | null;
  service_tier: string | null;
  service_assurance: ProviderTestabilityServiceAssurance;
  pricing_currency: string | null;
  input_price_per_million: string | null;
  output_price_per_million: string | null;
  request_price: string | null;
  source_id: string;
  source_type: string;
  source_url: string | null;
  source_title: string | null;
  source_retrieved_at: Date;
  source_content_sha256: string | null;
  observed_at: Date;
  actor: string;
  note: string | null;
  created_at: Date;
};

function observation(row: ObservationRow): ProviderTestabilityObservation {
  return {
    id: row.id,
    providerId: row.provider_id,
    model:
      row.model_id && row.canonical_slug && row.marketing_name
        ? {
            id: row.model_id,
            canonicalSlug: row.canonical_slug,
            marketingName: row.marketing_name,
          }
        : null,
    executionPath: row.execution_path,
    subjectKind: row.subject_kind,
    accessState: row.access_state,
    registrationRequirement: row.registration_requirement,
    billingRequirement: row.billing_requirement,
    regionPolicy: row.region_policy,
    allowedRegions: row.allowed_regions,
    blockedRegions: row.blocked_regions,
    accountTier: row.account_tier,
    serviceTier: row.service_tier,
    serviceAssurance: row.service_assurance,
    pricing: row.pricing_currency
      ? {
          currency: row.pricing_currency,
          inputPerMillion: row.input_price_per_million,
          outputPerMillion: row.output_price_per_million,
          perRequest: row.request_price,
        }
      : null,
    source: {
      id: row.source_id,
      sourceType: row.source_type,
      url: row.source_url,
      title: row.source_title,
      retrievedAt: row.source_retrieved_at.toISOString(),
      contentSha256: row.source_content_sha256,
    },
    observedAt: row.observed_at.toISOString(),
    actor: row.actor,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

const OBSERVATION_SELECT = `
  observation.id,
  observation.provider_id,
  observation.model_id,
  model.canonical_slug,
  model.marketing_name,
  observation.execution_path,
  observation.subject_kind,
  observation.access_state,
  observation.registration_requirement,
  observation.billing_requirement,
  observation.region_policy,
  observation.allowed_regions,
  observation.blocked_regions,
  observation.account_tier,
  observation.service_tier,
  observation.service_assurance,
  observation.pricing_currency,
  observation.input_price_per_million::text,
  observation.output_price_per_million::text,
  observation.request_price::text,
  source.id AS source_id,
  source.source_type,
  source.url AS source_url,
  source.title AS source_title,
  source.retrieved_at AS source_retrieved_at,
  source.content_sha256 AS source_content_sha256,
  observation.observed_at,
  observation.actor,
  observation.note,
  observation.created_at
`;

export class PgProviderTestability {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgProviderTestability {
    return new PgProviderTestability(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async listProviders(): Promise<readonly ProviderTestabilityProviderSummary[]> {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      model_count: string;
      observation_count: string;
      provider_policy_count: string;
      runner_access_count: string;
      restricted_count: string;
      uncertain_count: string;
      latest_observed_at: Date | null;
    }>(
      `SELECT
         provider.id,
         provider.slug,
         provider.name,
         count(DISTINCT model.id)::text AS model_count,
         count(DISTINCT current.id)::text AS observation_count,
         count(DISTINCT current.id) FILTER (
           WHERE current.subject_kind = 'provider_policy'
         )::text AS provider_policy_count,
         count(DISTINCT current.id) FILTER (
           WHERE current.subject_kind = 'runner_access'
         )::text AS runner_access_count,
         count(DISTINCT current.id) FILTER (
           WHERE current.access_state IN ('restricted', 'unavailable')
         )::text AS restricted_count,
         count(DISTINCT current.id) FILTER (
           WHERE current.service_assurance = 'operator_uncertain'
         )::text AS uncertain_count,
         max(current.observed_at) AS latest_observed_at
       FROM modelapse.providers provider
       LEFT JOIN modelapse.models model ON model.provider_id = provider.id
       LEFT JOIN modelapse.provider_testability_current current
         ON current.provider_id = provider.id
       GROUP BY provider.id, provider.slug, provider.name
       ORDER BY provider.slug`,
    );

    return result.rows.map((row) => ({
      provider: { id: row.id, slug: row.slug, name: row.name },
      modelCount: Number(row.model_count),
      currentObservationCount: Number(row.observation_count),
      providerPolicyCount: Number(row.provider_policy_count),
      runnerAccessCount: Number(row.runner_access_count),
      restrictedOrUnavailableCount: Number(row.restricted_count),
      uncertainServiceCount: Number(row.uncertain_count),
      latestObservedAt: row.latest_observed_at?.toISOString() ?? null,
    }));
  }

  async getProvider(providerId: string): Promise<ProviderTestabilityProvider | null> {
    const [clock, providerResult, modelsResult, currentResult, historyResult] =
      await Promise.all([
        this.pool.query<{ generated_at: Date }>("SELECT now() AS generated_at"),
        this.pool.query<{ id: string; slug: string; name: string }>(
          `SELECT id, slug, name FROM modelapse.providers WHERE id = $1`,
          [providerId],
        ),
        this.pool.query<{
          id: string;
          canonical_slug: string;
          marketing_name: string;
          status: string;
        }>(
          `SELECT id, canonical_slug, marketing_name, status
             FROM modelapse.models
            WHERE provider_id = $1
            ORDER BY canonical_slug`,
          [providerId],
        ),
        this.pool.query<ObservationRow>(
          `SELECT ${OBSERVATION_SELECT}
             FROM modelapse.provider_testability_current observation
             LEFT JOIN modelapse.models model ON model.id = observation.model_id
             JOIN modelapse.source_records source ON source.id = observation.source_id
            WHERE observation.provider_id = $1
            ORDER BY observation.subject_kind, model.canonical_slug NULLS FIRST,
                     observation.execution_path, observation.observed_at DESC, observation.id DESC`,
          [providerId],
        ),
        this.pool.query<ObservationRow>(
          `SELECT ${OBSERVATION_SELECT}
             FROM modelapse.provider_testability_observations observation
             LEFT JOIN modelapse.models model ON model.id = observation.model_id
             JOIN modelapse.source_records source ON source.id = observation.source_id
            WHERE observation.provider_id = $1
            ORDER BY observation.observed_at DESC, observation.id DESC
            LIMIT 200`,
          [providerId],
        ),
      ]);

    const provider = providerResult.rows[0];
    if (!provider) return null;

    const current = currentResult.rows.map(observation);
    return {
      generatedAt:
        clock.rows[0]?.generated_at.toISOString() ?? new Date().toISOString(),
      provider,
      models: modelsResult.rows.map((row) => ({
        id: row.id,
        canonicalSlug: row.canonical_slug,
        marketingName: row.marketing_name,
        status: row.status,
      })),
      summary: {
        modelCount: modelsResult.rows.length,
        currentObservationCount: current.length,
        providerPolicyCount: current.filter(
          (item) => item.subjectKind === "provider_policy",
        ).length,
        runnerAccessCount: current.filter(
          (item) => item.subjectKind === "runner_access",
        ).length,
        restrictedOrUnavailableCount: current.filter(
          (item) =>
            item.accessState === "restricted" ||
            item.accessState === "unavailable",
        ).length,
        uncertainServiceCount: current.filter(
          (item) => item.serviceAssurance === "operator_uncertain",
        ).length,
        latestObservedAt:
          current
            .map((item) => item.observedAt)
            .sort()
            .at(-1) ?? null,
      },
      current,
      history: historyResult.rows.map(observation),
    };
  }

  async recordObservation(
    input: RecordProviderTestabilityObservationInput,
  ): Promise<{ readonly observationId: string; readonly sourceRecordId: string }> {
    const actor = input.actor.trim();
    if (!actor) throw new Error("actor is required");

    const sourceTitle = input.source.title.trim();
    if (!sourceTitle) throw new Error("source.title is required");

    const normalizedSourceType = sourceType(input.source.sourceType);
    const sourceUrl = optionalText(input.source.url, "source.url");
    if (
      normalizedSourceType !== "operator_verification" &&
      (!sourceUrl || !sourceUrl.startsWith("https://"))
    ) {
      throw new Error("Provider source URL must use https://");
    }

    const contentSha256 = optionalText(
      input.source.contentSha256,
      "source.contentSha256",
    );
    if (contentSha256 && !SHA256_RE.test(contentSha256)) {
      throw new Error("source.contentSha256 must be a lowercase SHA-256");
    }

    const accountTier = optionalText(input.accountTier, "accountTier");
    const serviceTier = optionalText(input.serviceTier, "serviceTier");
    const allowedRegions = cleanRegions(input.allowedRegions);
    const blockedRegions = cleanRegions(input.blockedRegions);

    let pricingCurrency: string | null = null;
    if (input.pricing) {
      pricingCurrency = input.pricing.currency.trim().toUpperCase();
      if (!CURRENCY_RE.test(pricingCurrency)) {
        throw new Error("pricing.currency must be a three-letter currency code");
      }
      for (const [label, value] of Object.entries({
        inputPerMillion: input.pricing.inputPerMillion,
        outputPerMillion: input.pricing.outputPerMillion,
        perRequest: input.pricing.perRequest,
      })) {
        if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
          throw new Error("pricing." + label + " must be a non-negative number");
        }
      }
    }

    const observedAt = normalizedTimestamp(input.observedAt, "observedAt");
    const sourceRetrievedAt = normalizedTimestamp(
      input.source.retrievedAt,
      "source.retrievedAt",
    );

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const source = await client.query<{ id: string }>(
        `INSERT INTO modelapse.source_records
          (source_type, url, title, author, retrieved_at, content_sha256)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          normalizedSourceType,
          sourceUrl,
          sourceTitle,
          actor,
          sourceRetrievedAt,
          contentSha256,
        ],
      );
      const sourceRecordId = source.rows[0]?.id;
      if (!sourceRecordId) {
        throw new Error("Provider testability source insert did not return an id");
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO modelapse.provider_testability_observations
          (
            provider_id,
            model_id,
            execution_path,
            subject_kind,
            access_state,
            registration_requirement,
            billing_requirement,
            region_policy,
            allowed_regions,
            blocked_regions,
            account_tier,
            service_tier,
            service_assurance,
            pricing_currency,
            input_price_per_million,
            output_price_per_million,
            request_price,
            source_id,
            observed_at,
            actor,
            note
          )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19, $20, $21
         )
         RETURNING id`,
        [
          input.providerId,
          input.modelId ?? null,
          input.executionPath,
          input.subjectKind,
          input.accessState,
          input.registrationRequirement ?? "unknown",
          input.billingRequirement ?? "unknown",
          input.regionPolicy ?? "unknown",
          allowedRegions,
          blockedRegions,
          accountTier,
          serviceTier,
          input.serviceAssurance ?? "unknown",
          pricingCurrency,
          input.pricing?.inputPerMillion ?? null,
          input.pricing?.outputPerMillion ?? null,
          input.pricing?.perRequest ?? null,
          sourceRecordId,
          observedAt,
          actor,
          input.note?.trim() || null,
        ],
      );

      const observationId = inserted.rows[0]?.id;
      if (!observationId) {
        throw new Error("Provider testability observation insert did not return an id");
      }

      await client.query("COMMIT");
      return { observationId, sourceRecordId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

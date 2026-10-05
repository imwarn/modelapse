import type { RunConfig } from "@modelapse/domain";

export type DirectProviderSlug = "openai" | "deepseek";

export type DirectRunConfig = Pick<
  RunConfig,
  "temperature" | "topP" | "maxOutputTokens" | "reasoningEffort" | "serviceTier"
>;

export type ExecutionQualificationServiceAssurance =
  | "documented_default"
  | "documented_variant"
  | "operator_uncertain"
  | "unknown";

export interface DirectRunQualificationPlan {
  readonly selectedAt: string;
  readonly providerPolicyObservationId?: string;
  readonly runnerAccessObservationId?: string;
  readonly accountTier?: string;
  readonly serviceTier?: string;
  readonly requestedServiceTier?: string;
  readonly serviceAssurance: ExecutionQualificationServiceAssurance;
  readonly caveats: readonly string[];
}

export interface DirectRunCostPlan {
  readonly selectedAt: string;
  readonly pricingObservationId?: string;
  readonly currency?: string;
  readonly inputPricePerMillion?: string;
  readonly outputPricePerMillion?: string;
  readonly perRequest?: string;
  readonly caveats: readonly string[];
}

interface DirectProviderRunBase {
  readonly testCaseId: string;
  readonly modelId?: string;
  readonly model: string;
  readonly config?: DirectRunConfig;
  readonly qualification?: DirectRunQualificationPlan;
  readonly cost?: DirectRunCostPlan;
}

export interface DirectOpenAIRunRequest extends DirectProviderRunBase {
  readonly provider: "openai";
}

export interface DirectDeepSeekRunRequest extends DirectProviderRunBase {
  readonly provider: "deepseek";
}

export type DirectProviderRunRequest =
  | DirectOpenAIRunRequest
  | DirectDeepSeekRunRequest;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const set = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !set.has(key));
  if (unknown.length > 0) {
    throw new Error(label + " contains unsupported fields: " + unknown.join(", "));
  }
}

function optionalFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("config." + key + " must be a finite number");
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("config." + key + " must be a non-empty string");
  }
  return value;
}

export function parseDirectRunConfig(
  value: unknown,
): DirectRunConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("config must be an object");

  rejectUnknownKeys(
    value,
    [
      "temperature",
      "topP",
      "maxOutputTokens",
      "reasoningEffort",
      "serviceTier",
    ],
    "config",
  );

  const temperature = optionalFiniteNumber(value, "temperature");
  const topP = optionalFiniteNumber(value, "topP");
  const maxOutputTokens = optionalFiniteNumber(value, "maxOutputTokens");
  const reasoningEffort = optionalString(value, "reasoningEffort");
  const serviceTier = optionalString(value, "serviceTier");

  if (
    maxOutputTokens !== undefined &&
    (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0)
  ) {
    throw new Error("config.maxOutputTokens must be a positive integer");
  }
  if (topP !== undefined && (topP < 0 || topP > 1)) {
    throw new Error("config.topP must be between 0 and 1");
  }

  return {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(serviceTier !== undefined ? { serviceTier } : {}),
  };
}

function parseDirectRunQualification(
  value: unknown,
): DirectRunQualificationPlan | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("qualification must be an object");

  rejectUnknownKeys(
    value,
    [
      "selectedAt",
      "providerPolicyObservationId",
      "runnerAccessObservationId",
      "accountTier",
      "serviceTier",
      "requestedServiceTier",
      "serviceAssurance",
      "caveats",
    ],
    "qualification",
  );

  if (
    typeof value.selectedAt !== "string" ||
    !Number.isFinite(Date.parse(value.selectedAt))
  ) {
    throw new Error("qualification.selectedAt must be an ISO timestamp");
  }

  for (const key of [
    "providerPolicyObservationId",
    "runnerAccessObservationId",
  ] as const) {
    const observationId = value[key];
    if (
      observationId !== undefined &&
      (typeof observationId !== "string" || !UUID_RE.test(observationId))
    ) {
      throw new Error("qualification." + key + " must be a UUID");
    }
  }

  for (const key of [
    "accountTier",
    "serviceTier",
    "requestedServiceTier",
  ] as const) {
    const field = value[key];
    if (
      field !== undefined &&
      (typeof field !== "string" || field.trim().length === 0)
    ) {
      throw new Error("qualification." + key + " must be a non-empty string");
    }
  }

  if (
    value.serviceAssurance !== "documented_default" &&
    value.serviceAssurance !== "documented_variant" &&
    value.serviceAssurance !== "operator_uncertain" &&
    value.serviceAssurance !== "unknown"
  ) {
    throw new Error("qualification.serviceAssurance is invalid");
  }

  if (
    !Array.isArray(value.caveats) ||
    value.caveats.some(
      (caveat) => typeof caveat !== "string" || caveat.trim().length === 0,
    )
  ) {
    throw new Error("qualification.caveats must be a string array");
  }

  return {
    selectedAt: value.selectedAt,
    ...(typeof value.providerPolicyObservationId === "string"
      ? { providerPolicyObservationId: value.providerPolicyObservationId }
      : {}),
    ...(typeof value.runnerAccessObservationId === "string"
      ? { runnerAccessObservationId: value.runnerAccessObservationId }
      : {}),
    ...(typeof value.accountTier === "string"
      ? { accountTier: value.accountTier }
      : {}),
    ...(typeof value.serviceTier === "string"
      ? { serviceTier: value.serviceTier }
      : {}),
    ...(typeof value.requestedServiceTier === "string"
      ? { requestedServiceTier: value.requestedServiceTier }
      : {}),
    serviceAssurance: value.serviceAssurance,
    caveats: [...value.caveats],
  };
}

const NON_NEGATIVE_DECIMAL_RE = /^\\d+(?:\\.\\d+)?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function parseDirectRunCost(value: unknown): DirectRunCostPlan | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("cost must be an object");

  rejectUnknownKeys(
    value,
    [
      "selectedAt",
      "pricingObservationId",
      "currency",
      "inputPricePerMillion",
      "outputPricePerMillion",
      "perRequest",
      "caveats",
    ],
    "cost",
  );

  if (
    typeof value.selectedAt !== "string" ||
    !Number.isFinite(Date.parse(value.selectedAt))
  ) {
    throw new Error("cost.selectedAt must be an ISO timestamp");
  }

  if (
    value.pricingObservationId !== undefined &&
    (typeof value.pricingObservationId !== "string" ||
      !UUID_RE.test(value.pricingObservationId))
  ) {
    throw new Error("cost.pricingObservationId must be a UUID");
  }

  if (
    value.currency !== undefined &&
    (typeof value.currency !== "string" || !CURRENCY_RE.test(value.currency))
  ) {
    throw new Error("cost.currency must be a three-letter uppercase currency code");
  }

  for (const key of [
    "inputPricePerMillion",
    "outputPricePerMillion",
    "perRequest",
  ] as const) {
    const field = value[key];
    if (
      field !== undefined &&
      (typeof field !== "string" || !NON_NEGATIVE_DECIMAL_RE.test(field))
    ) {
      throw new Error("cost." + key + " must be a non-negative decimal string");
    }
  }

  if (
    !Array.isArray(value.caveats) ||
    value.caveats.some(
      (caveat) => typeof caveat !== "string" || caveat.trim().length === 0,
    )
  ) {
    throw new Error("cost.caveats must be a string array");
  }

  return {
    selectedAt: value.selectedAt,
    ...(typeof value.pricingObservationId === "string"
      ? { pricingObservationId: value.pricingObservationId }
      : {}),
    ...(typeof value.currency === "string" ? { currency: value.currency } : {}),
    ...(typeof value.inputPricePerMillion === "string"
      ? { inputPricePerMillion: value.inputPricePerMillion }
      : {}),
    ...(typeof value.outputPricePerMillion === "string"
      ? { outputPricePerMillion: value.outputPricePerMillion }
      : {}),
    ...(typeof value.perRequest === "string"
      ? { perRequest: value.perRequest }
      : {}),
    caveats: [...value.caveats],
  };
}

export function parseDirectProviderRunRequest(
  value: unknown,
): DirectProviderRunRequest {
  if (!isRecord(value)) throw new Error("job payload must be an object");

  rejectUnknownKeys(
    value,
    ["provider", "testCaseId", "modelId", "model", "config", "qualification", "cost"],
    "job",
  );

  if (value.provider !== "openai" && value.provider !== "deepseek") {
    throw new Error('provider must be "openai" or "deepseek"');
  }
  if (typeof value.testCaseId !== "string" || !UUID_RE.test(value.testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }
  if (
    value.modelId !== undefined &&
    (typeof value.modelId !== "string" || !UUID_RE.test(value.modelId))
  ) {
    throw new Error("modelId must be a UUID");
  }
  if (typeof value.model !== "string" || value.model.trim().length === 0) {
    throw new Error("model must be a non-empty string");
  }

  const config = parseDirectRunConfig(value.config);
  const qualification = parseDirectRunQualification(value.qualification);
  const cost = parseDirectRunCost(value.cost);

  return {
    provider: value.provider,
    testCaseId: value.testCaseId,
    ...(typeof value.modelId === "string" ? { modelId: value.modelId } : {}),
    model: value.model,
    ...(config ? { config } : {}),
    ...(qualification ? { qualification } : {}),
    ...(cost ? { cost } : {}),
  };
}

export function parseDirectOpenAIRunRequest(
  value: unknown,
): DirectOpenAIRunRequest {
  const request = parseDirectProviderRunRequest(value);
  if (request.provider !== "openai") {
    throw new Error('provider must be "openai"');
  }
  return request as DirectOpenAIRunRequest;
}

export function parseDirectDeepSeekRunRequest(
  value: unknown,
): DirectDeepSeekRunRequest {
  const request = parseDirectProviderRunRequest(value);
  if (request.provider !== "deepseek") {
    throw new Error('provider must be "deepseek"');
  }
  return request as DirectDeepSeekRunRequest;
}

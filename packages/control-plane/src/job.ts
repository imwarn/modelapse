import type { RunConfig } from "@modelapse/domain";

export type DirectProviderSlug = "openai" | "deepseek";

interface DirectProviderRunBase {
  readonly testCaseId: string;
  readonly model: string;
  readonly config?: Pick<
    RunConfig,
    | "temperature"
    | "topP"
    | "maxOutputTokens"
    | "reasoningEffort"
    | "serviceTier"
  >;
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(
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

function parseConfig(value: unknown): DirectProviderRunRequest["config"] {
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

export function parseDirectProviderRunRequest(
  value: unknown,
): DirectProviderRunRequest {
  if (!isRecord(value)) throw new Error("job payload must be an object");

  rejectUnknownKeys(value, ["provider", "testCaseId", "model", "config"], "job");

  if (value.provider !== "openai" && value.provider !== "deepseek") {
    throw new Error('provider must be "openai" or "deepseek"');
  }
  if (typeof value.testCaseId !== "string" || !UUID_RE.test(value.testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }
  if (typeof value.model !== "string" || value.model.trim().length === 0) {
    throw new Error("model must be a non-empty string");
  }

  const config = parseConfig(value.config);

  return {
    provider: value.provider,
    testCaseId: value.testCaseId,
    model: value.model,
    ...(config ? { config } : {}),
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

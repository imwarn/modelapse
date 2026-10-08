const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface ArchiveResearchCursor {
  readonly completedAt: string;
  readonly runId: string;
}

/**
 * Cursor is an untrusted, non-secret position in immutable completed Run order.
 * Reject arbitrary JSON shape, oversized input and invalid timestamps.
 */
export function decodeArchiveResearchCursor(
  cursor: string,
): ArchiveResearchCursor {
  if (cursor.length < 5 || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new Error("invalid_research_cursor");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid_research_cursor");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_research_cursor");
  }
  const fields = parsed as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 2 ||
    typeof fields.completedAt !== "string" ||
    !INSTANT_RE.test(fields.completedAt) ||
    !Number.isFinite(Date.parse(fields.completedAt)) ||
    new Date(fields.completedAt).toISOString() !== fields.completedAt ||
    typeof fields.runId !== "string" ||
    !UUID_RE.test(fields.runId)
  ) {
    throw new Error("invalid_research_cursor");
  }
  return { completedAt: fields.completedAt, runId: fields.runId };
}

export function encodeArchiveResearchCursor(
  input: ArchiveResearchCursor,
): string {
  if (
    !INSTANT_RE.test(input.completedAt) ||
    !Number.isFinite(Date.parse(input.completedAt)) ||
    new Date(input.completedAt).toISOString() !== input.completedAt ||
    !UUID_RE.test(input.runId)
  ) {
    throw new Error("invalid_research_cursor");
  }
  return Buffer.from(
    JSON.stringify({
      completedAt: input.completedAt,
      runId: input.runId,
    }),
  ).toString("base64url");
}

export type ArchiveResearchEvidence = "any" | "E4+" | "missing";
export type ArchiveResearchCost = "any" | "estimated" | "unknown";

export interface ArchiveResearchFilters {
  readonly providerSlug?: string;
  readonly modelId?: string;
  readonly testCaseId?: string;
  readonly evidence?: ArchiveResearchEvidence;
  readonly region?: string;
  readonly accountTier?: string;
  readonly serviceTier?: string;
  readonly cost?: ArchiveResearchCost;
  readonly cursor?: string;
  readonly limit?: number;
}

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const CONTEXT_RE = /^[A-Za-z0-9][A-Za-z0-9 _.:-]{0,63}$/;

export function validateArchiveResearchFilters(
  input: ArchiveResearchFilters,
): Required<Pick<ArchiveResearchFilters, "evidence" | "cost" | "limit">> &
  ArchiveResearchFilters {
  if (input.providerSlug && !SLUG_RE.test(input.providerSlug)) {
    throw new Error("invalid_provider");
  }
  if (input.modelId && !UUID_RE.test(input.modelId)) {
    throw new Error("invalid_model_id");
  }
  if (input.testCaseId && !UUID_RE.test(input.testCaseId)) {
    throw new Error("invalid_test_case_id");
  }
  for (const context of [input.region, input.accountTier, input.serviceTier]) {
    if (context !== undefined && !CONTEXT_RE.test(context)) {
      throw new Error("invalid_research_context");
    }
  }
  const evidence = input.evidence ?? "any";
  const cost = input.cost ?? "any";
  const limit = input.limit ?? 20;
  if (!["any", "E4+", "missing"].includes(evidence)) {
    throw new Error("invalid_research_evidence");
  }
  if (!["any", "estimated", "unknown"].includes(cost)) {
    throw new Error("invalid_research_cost");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("invalid_limit");
  }
  if (input.cursor !== undefined) decodeArchiveResearchCursor(input.cursor);
  return { ...input, evidence, cost, limit };
}

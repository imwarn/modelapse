import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import {
  IdempotencyConflictError,
  parseDirectProviderRunRequest,
  parseRunSelectionRequest,
  type PgExecutionFleet,
  type PgRunJobQueue,
  type PgRunPlanner,
  type RunJob,
} from "@modelapse/control-plane";
import { exportResearchCollection, validateArchiveResearchFilters } from "@modelapse/persistence";
import type {
  ArchiveResearchFilters,
  PgArchiveRepository,
  PgResearchCollections,
  PgCalibrationRepository,
  PgComparabilityRepository,
  PgCostLedger,
  RunRepository,
  RunView,
} from "@modelapse/persistence";
import type {
  CatalogDiscoveryStatus,
  CatalogDriftReviewStatus,
  CatalogPresenceReviewStatus,
  PgCatalogDiscovery,
  PgCatalogDriftReview,
  PgCatalogCoverage,
  PgCatalogIdentityCase,
  PgCatalogIntegrity,
  PgCatalogPresence,
  PgCatalogPresenceReview,
  PgCatalogRemoteIdCase,
  PgProviderExpansion,
  PgProviderTestability,
  RecordProviderExpansionPolicyInput,
  RecordProviderCapabilityInput,
  RecordProviderTestabilityObservationInput,
} from "@modelapse/catalog-admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function apiRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function apiStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }
  return value as string[];
}

type RunApiRepository = Pick<RunRepository, "ping" | "getRun">;
type ControlQueue = Pick<PgRunJobQueue, "ping" | "enqueue" | "get">;
type ControlFleet = Pick<
  PgExecutionFleet,
  | "ping"
  | "listEnvironments"
  | "registerEnvironment"
  | "setEnvironmentState"
  | "declareCapability"
>;
type ControlPlanner = Pick<
  PgRunPlanner,
  "ping" | "listModels" | "listTests" | "plan"
>;
type CatalogDiscoveryRepository = Pick<
  PgCatalogDiscovery,
  "listCandidates" | "listProviderModels" | "reconcileCandidate" | "promoteCandidate"
>;

type CatalogDriftReviewRepository = Pick<PgCatalogDriftReview, "list" | "decide">;
type CatalogIdentityCaseRepository = Pick<PgCatalogIdentityCase, "get">;
type CatalogIntegrityRepository = Pick<PgCatalogIntegrity, "getDashboard">;
type CatalogCoverageRepository = Pick<PgCatalogCoverage, "listProviders" | "getProvider">;
type CatalogPresenceRepository = Pick<PgCatalogPresence, "getProvider">;
type CatalogPresenceReviewRepository = Pick<PgCatalogPresenceReview, "list" | "decide">;
type CatalogRemoteIdCaseRepository = Pick<PgCatalogRemoteIdCase, "get">;
type ProviderTestabilityRepository = Pick<
  PgProviderTestability,
  "listProviders" | "getProvider" | "recordObservation"
>;
type ProviderExpansionRepository = Pick<
  PgProviderExpansion,
  | "ping"
  | "listProviders"
  | "getProvider"
  | "listPolicies"
  | "recordPolicy"
  | "recordCapability"
>;
type CostLedgerRepository = Pick<
  PgCostLedger,
  "ping" | "listDailyCosts" | "listBudgetStatus" | "recordBudgetPolicy"
>;
type CalibrationRepository = Pick<
  PgCalibrationRepository,
  "ping" | "listPolicies" | "recordPolicy" | "listServiceHealth"
>;
type ComparabilityRepository = Pick<
  PgComparabilityRepository,
  "ping" | "listPolicies" | "recordPolicy"
>;

type ResearchCollectionsRepository = Pick<
  PgResearchCollections,
  "ping" | "list" | "get" | "create"
>;
type ArchiveRepository = Pick<
  PgArchiveRepository,
  | "ping"
  | "listModels"
  | "listTests"
  | "listRuns"
  | "researchRuns"
  | "researchFacets"
  | "assessResearchRuns"
  | "listCatalogChanges"
  | "getRun"
  | "getModel"
  | "getTest"
  | "compareLatest"
  | "getRunHistory"
>;

export interface AppDependencies {
  readonly runs: RunApiRepository;
  readonly jobs?: ControlQueue;
  readonly fleet?: ControlFleet;
  readonly planner?: ControlPlanner;
  readonly archive?: ArchiveRepository;
  readonly researchCollections?: ResearchCollectionsRepository;
  readonly catalogDiscovery?: CatalogDiscoveryRepository;
  readonly catalogDriftReview?: CatalogDriftReviewRepository;
  readonly catalogIdentityCase?: CatalogIdentityCaseRepository;
  readonly catalogIntegrity?: CatalogIntegrityRepository;
  readonly catalogCoverage?: CatalogCoverageRepository;
  readonly catalogPresence?: CatalogPresenceRepository;
  readonly catalogPresenceReview?: CatalogPresenceReviewRepository;
  readonly catalogRemoteIdCase?: CatalogRemoteIdCaseRepository;
  readonly providerTestability?: ProviderTestabilityRepository;
  readonly providerExpansion?: ProviderExpansionRepository;
  readonly costLedger?: CostLedgerRepository;
  readonly calibration?: CalibrationRepository;
  readonly comparability?: ComparabilityRepository;
  readonly controlToken?: string;
}

function publicBlob(blob: RunView["requestBlob"]) {
  if (!blob) return blob;
  return {
    sha256: blob.sha256,
    sizeBytes: blob.sizeBytes,
    mimeType: blob.mimeType,
  };
}

function publicRun(run: RunView) {
  return {
    ...run,
    requestBlob: publicBlob(run.requestBlob),
    responseBlob: publicBlob(run.responseBlob),
  };
}

function controlJob(job: RunJob) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    targetExecutionEnvironmentId: job.targetExecutionEnvironmentId,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runId: job.runId,
    lastError: job.lastError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

function authorized(header: string | undefined, token: string): boolean {
  const expected = Buffer.from("Bearer " + token);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type ControlAuthIssue = "missing_authorization" | "invalid_authorization";

function controlAuthIssue(
  header: string | undefined,
  token: string,
): ControlAuthIssue | null {
  if (!header) return "missing_authorization";
  return authorized(header, token) ? null : "invalid_authorization";
}

function controlAuthError(issue: ControlAuthIssue) {
  return {
    error: "unauthorized",
    reason: issue,
    build: process.env.MODELAPSE_BUILD ?? "dev",
  } as const;
}

function idempotencyKey(
  value: string | undefined,
): { value?: string; error?: "invalid_idempotency_key" } {
  if (
    value !== undefined &&
    (!value.trim() || value.length > 128)
  ) {
    return { error: "invalid_idempotency_key" };
  }
  return value ? { value } : {};
}

export function createApp(deps: AppDependencies) {
  const app = new Hono();
  const controlToken = deps.controlToken?.trim();

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/healthz", (c) =>
    c.json({
      ok: true,
      service: "modelapse-api",
      version: process.env.MODELAPSE_BUILD ?? "dev",
    }),
  );

  app.get("/readyz", async (c) => {
    try {
      await deps.runs.ping();
      if (deps.jobs) await deps.jobs.ping();
      if (deps.fleet) await deps.fleet.ping();
      if (deps.planner) await deps.planner.ping();
      if (deps.archive) await deps.archive.ping();
      if (deps.costLedger) await deps.costLedger.ping();
      if (deps.calibration) await deps.calibration.ping();
      if (deps.comparability) await deps.comparability.ping();
      if (deps.providerExpansion) await deps.providerExpansion.ping();
      return c.json({
        ready: true,
        service: "modelapse-api",
      });
    } catch {
      return c.json(
        {
          ready: false,
          service: "modelapse-api",
        },
        503,
      );
    }
  });

  app.get("/v1/archive/models", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }
    return c.json({ models: await deps.archive.listModels() });
  });

  app.get("/v1/archive/tests", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }
    return c.json({ tests: await deps.archive.listTests() });
  });

  app.get("/v1/archive/research", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }
    const query = c.req.query();
    const limitRaw = query.limit;
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    const input: ArchiveResearchFilters = {
      ...(query.provider !== undefined ? { providerSlug: query.provider } : {}),
      ...(query.modelId !== undefined ? { modelId: query.modelId } : {}),
      ...(query.testCaseId !== undefined ? { testCaseId: query.testCaseId } : {}),
      ...(query.evidence !== undefined
        ? { evidence: query.evidence as NonNullable<ArchiveResearchFilters["evidence"]> }
        : {}),
      ...(query.region !== undefined ? { region: query.region } : {}),
      ...(query.accountTier !== undefined
        ? { accountTier: query.accountTier }
        : {}),
      ...(query.serviceTier !== undefined
        ? { serviceTier: query.serviceTier }
        : {}),
      ...(query.cost !== undefined
        ? { cost: query.cost as NonNullable<ArchiveResearchFilters["cost"]> }
        : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };
    try {
      const validated = validateArchiveResearchFilters(input);
      return c.json({ research: await deps.archive.researchRuns(validated) });
    } catch (error) {
      if (
        error instanceof Error &&
        /^invalid_/.test(error.message)
      ) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  app.get("/v1/archive/research/collections", async (c) => {
    if (!deps.researchCollections) {
      return c.json({ error: "research_collections_unavailable" }, 503);
    }
    const rawLimit = c.req.query("limit");
    const limit = rawLimit === undefined ? 30 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return c.json({ error: "invalid_limit" }, 400);
    }
    return c.json({ collections: await deps.researchCollections.list(limit) });
  });

  app.get("/v1/archive/research/collections/:collectionId", async (c) => {
    if (!deps.researchCollections) {
      return c.json({ error: "research_collections_unavailable" }, 503);
    }
    const id = c.req.param("collectionId");
    if (!UUID_RE.test(id)) {
      return c.json({ error: "invalid_research_collection_id" }, 400);
    }
    const collection = await deps.researchCollections.get(id);
    return collection
      ? c.json({ collection })
      : c.json({ error: "research_collection_not_found" }, 404);
  });

  app.get("/v1/archive/research/collections/:collectionId/export", async (c) => {
    if (!deps.researchCollections) {
      return c.json({ error: "research_collections_unavailable" }, 503);
    }
    const id = c.req.param("collectionId");
    if (!UUID_RE.test(id)) {
      return c.json({ error: "invalid_research_collection_id" }, 400);
    }
    const format = c.req.query("format") ?? "json";
    if (format !== "csv" && format !== "json") {
      return c.json({ error: "invalid_research_export_format" }, 400);
    }
    const collection = await deps.researchCollections.get(id);
    if (!collection) return c.json({ error: "research_collection_not_found" }, 404);
    const exported = exportResearchCollection(collection, format);
    c.header("Content-Type", exported.mediaType);
    c.header("Content-Disposition", `attachment; filename="${exported.filename}"`);
    c.header("Cache-Control", "public, max-age=300");
    return c.body(exported.body);
  });

  app.post("/v1/control/research/collections", async (c) => {
    if (!deps.researchCollections || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const body = apiRecord(raw);
    const filters = apiRecord(body?.filters);
    const title = body?.title;
    const actor = body?.actor;
    const description = body?.description;
    if (
      typeof title !== "string" ||
      typeof actor !== "string" ||
      (description !== undefined && typeof description !== "string") ||
      !filters ||
      Object.keys(filters).some((key) => ![
        "providerSlug", "modelId", "testCaseId", "evidence", "region",
        "accountTier", "serviceTier", "cost"
      ].includes(key)) ||
      Object.values(filters).some((value) => typeof value !== "string")
    ) {
      return c.json({ error: "invalid_research_collection_request" }, 400);
    }
    try {
      const validatedFilters = validateArchiveResearchFilters(
        filters as ArchiveResearchFilters,
      );
      const collection = await deps.researchCollections.create({
        title,
        actor,
        ...(typeof description === "string" ? { description } : {}),
        filters: validatedFilters,
      });
      return c.json({ collection }, 201);
    } catch (error) {
      if (error instanceof Error && (
        error.message.startsWith("invalid_") ||
        error.message.startsWith("research_collection_")
      )) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  app.get("/v1/archive/research/facets", async (c) => {
    if (!deps.archive) return c.json({ error: "archive_unavailable" }, 503);
    const query = c.req.query();
    const filters: ArchiveResearchFilters = {
      ...(query.provider !== undefined ? { providerSlug: query.provider } : {}),
      ...(query.modelId !== undefined ? { modelId: query.modelId } : {}),
      ...(query.testCaseId !== undefined ? { testCaseId: query.testCaseId } : {}),
      ...(query.evidence !== undefined
        ? { evidence: query.evidence as NonNullable<ArchiveResearchFilters["evidence"]> }
        : {}),
      ...(query.region !== undefined ? { region: query.region } : {}),
      ...(query.accountTier !== undefined ? { accountTier: query.accountTier } : {}),
      ...(query.serviceTier !== undefined ? { serviceTier: query.serviceTier } : {}),
      ...(query.cost !== undefined
        ? { cost: query.cost as NonNullable<ArchiveResearchFilters["cost"]> }
        : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    };
    try {
      const validated = validateArchiveResearchFilters(filters);
      if (validated.cursor !== undefined) {
        return c.json({ error: "invalid_research_facet_cursor" }, 400);
      }
      return c.json({ facets: await deps.archive.researchFacets(validated) });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("invalid_")) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  app.get("/v1/archive/research/collections/:collectionId/assessment", async (c) => {
    if (!deps.researchCollections || !deps.archive) {
      return c.json({ error: "research_collections_unavailable" }, 503);
    }
    const id = c.req.param("collectionId");
    if (!UUID_RE.test(id)) {
      return c.json({ error: "invalid_research_collection_id" }, 400);
    }
    const policyVersion = c.req.query("policyVersion");
    if (policyVersion !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(policyVersion)) {
      return c.json({ error: "invalid_policy_version" }, 400);
    }
    const collection = await deps.researchCollections.get(id);
    if (!collection) return c.json({ error: "research_collection_not_found" }, 404);
    const assessment = await deps.archive.assessResearchRuns(
      collection.runIds,
      policyVersion,
    );
    if (!assessment) return c.json({ error: "comparability_policy_not_found" }, 404);
    return c.json({
      collectionId: collection.id,
      manifestSha256: collection.contentSha256,
      assessment,
    });
  });

  app.get("/v1/archive/changes", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const modelId = c.req.query("modelId");
    const provider = c.req.query("provider");
    const rawLimit = c.req.query("limit");

    if (modelId && !UUID_RE.test(modelId)) {
      return c.json({ error: "invalid_model_id" }, 400);
    }
    if (provider && !PROVIDER_SLUG_RE.test(provider)) {
      return c.json({ error: "invalid_provider" }, 400);
    }

    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      return c.json({ error: "invalid_limit" }, 400);
    }

    return c.json({
      changes: await deps.archive.listCatalogChanges({
        ...(modelId ? { modelId } : {}),
        ...(provider ? { providerSlug: provider } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    });
  });

  app.get("/v1/archive/models/:modelId", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const modelId = c.req.param("modelId");
    if (!UUID_RE.test(modelId)) {
      return c.json({ error: "invalid_model_id" }, 400);
    }

    const model = await deps.archive.getModel(modelId);
    if (!model) {
      return c.json({ error: "archive_model_not_found" }, 404);
    }

    return c.json({ model });
  });

  app.get("/v1/archive/tests/:testCaseId", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const testCaseId = c.req.param("testCaseId");
    if (!UUID_RE.test(testCaseId)) {
      return c.json({ error: "invalid_test_case_id" }, 400);
    }

    const test = await deps.archive.getTest(testCaseId);
    if (!test) {
      return c.json({ error: "archive_test_not_found" }, 404);
    }

    return c.json({ test });
  });

  app.get("/v1/archive/history", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const modelId = c.req.query("modelId");
    const testCaseId = c.req.query("testCaseId");
    const rawLimit = c.req.query("limit");

    if (!modelId || !UUID_RE.test(modelId)) {
      return c.json({ error: "invalid_model_id" }, 400);
    }
    if (!testCaseId || !UUID_RE.test(testCaseId)) {
      return c.json({ error: "invalid_test_case_id" }, 400);
    }

    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      return c.json({ error: "invalid_limit" }, 400);
    }

    const history = await deps.archive.getRunHistory({
      modelId,
      testCaseId,
      ...(limit !== undefined ? { limit } : {}),
    });
    if (!history) {
      return c.json({ error: "archive_history_not_found" }, 404);
    }

    return c.json({ history });
  });

  app.get("/v1/archive/compare", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const rawModelIds = c.req.query("modelIds");
    const testCaseId = c.req.query("testCaseId");
    const policyVersion = c.req.query("policyVersion");
    const modelIds = rawModelIds
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (
      !modelIds ||
      modelIds.length < 2 ||
      modelIds.length > 4 ||
      new Set(modelIds).size !== modelIds.length ||
      modelIds.some((modelId) => !UUID_RE.test(modelId))
    ) {
      return c.json({ error: "invalid_model_ids" }, 400);
    }
    if (!testCaseId || !UUID_RE.test(testCaseId)) {
      return c.json({ error: "invalid_test_case_id" }, 400);
    }
    if (
      policyVersion &&
      !/^[a-z0-9][a-z0-9._-]*$/.test(policyVersion)
    ) {
      return c.json({ error: "invalid_policy_version" }, 400);
    }

    const comparison = await deps.archive.compareLatest({
      modelIds,
      testCaseId,
      ...(policyVersion ? { policyVersion } : {}),
    });
    if (!comparison) {
      return c.json({ error: "archive_comparison_not_found" }, 404);
    }

    return c.json({ comparison });
  });

  app.get("/v1/archive/calibration/health", async (c) => {
    if (!deps.calibration) {
      return c.json({ error: "calibration_unavailable" }, 503);
    }
    const providerId = c.req.query("providerId");
    const modelId = c.req.query("modelId");
    const rawLimit = c.req.query("limit");
    if (providerId && !UUID_RE.test(providerId)) {
      return c.json({ error: "invalid_provider_id" }, 400);
    }
    if (modelId && !UUID_RE.test(modelId)) {
      return c.json({ error: "invalid_model_id" }, 400);
    }
    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 200)
    ) {
      return c.json({ error: "invalid_limit" }, 400);
    }
    return c.json({
      health: await deps.calibration.listServiceHealth({
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    });
  });

  app.get("/v1/archive/calibration/policies", async (c) => {
    if (!deps.calibration) {
      return c.json({ error: "calibration_unavailable" }, 503);
    }
    return c.json({ policies: await deps.calibration.listPolicies() });
  });

  app.get("/v1/archive/comparability/policies", async (c) => {
    if (!deps.comparability) {
      return c.json({ error: "comparability_unavailable" }, 503);
    }
    return c.json({ policies: await deps.comparability.listPolicies() });
  });

  app.get("/v1/archive/runs", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const modelId = c.req.query("modelId");
    const testCaseId = c.req.query("testCaseId");
    const rawLimit = c.req.query("limit");

    if (modelId && !UUID_RE.test(modelId)) {
      return c.json({ error: "invalid_model_id" }, 400);
    }
    if (testCaseId && !UUID_RE.test(testCaseId)) {
      return c.json({ error: "invalid_test_case_id" }, 400);
    }

    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 100)
    ) {
      return c.json({ error: "invalid_limit" }, 400);
    }

    return c.json({
      runs: await deps.archive.listRuns({
        ...(modelId ? { modelId } : {}),
        ...(testCaseId ? { testCaseId } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    });
  });

  app.get("/v1/archive/runs/:runId", async (c) => {
    if (!deps.archive) {
      return c.json({ error: "archive_unavailable" }, 503);
    }

    const runId = c.req.param("runId");
    if (!UUID_RE.test(runId)) {
      return c.json({ error: "invalid_run_id" }, 400);
    }

    const run = await deps.archive.getRun(runId);
    if (!run) {
      return c.json({ error: "archive_run_not_found" }, 404);
    }

    return c.json({ run });
  });

  app.get("/v1/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    if (!UUID_RE.test(runId)) {
      return c.json({ error: "invalid_run_id" }, 400);
    }

    const run = await deps.runs.getRun(runId);
    if (!run) {
      return c.json({ error: "run_not_found" }, 404);
    }

    return c.json({ run: publicRun(run) });
  });

  app.get("/v1/control/catalog/presence/:providerId", async (c) => {
    if (!deps.catalogPresence || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const providerId = c.req.param("providerId");
    if (!UUID_RE.test(providerId)) {
      return c.json({ error: "invalid_provider_id" }, 400);
    }
    const rawLimit = c.req.query("runLimit");
    const runLimit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      runLimit !== undefined &&
      (!Number.isInteger(runLimit) || runLimit < 2 || runLimit > 100)
    ) {
      return c.json({ error: "invalid_run_limit" }, 400);
    }

    const history = await deps.catalogPresence.getProvider(providerId, {
      ...(runLimit !== undefined ? { runLimit } : {}),
    });
    if (!history) {
      return c.json({ error: "catalog_presence_provider_not_found" }, 404);
    }
    return c.json({ history });
  });

  app.get("/v1/control/catalog/presence-reviews", async (c) => {
    if (!deps.catalogPresenceReview || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const status = c.req.query("status") as CatalogPresenceReviewStatus | undefined;
    const rawLimit = c.req.query("limit");
    if (status && !["open", "acknowledged", "resolved"].includes(status)) {
      return c.json({ error: "invalid_presence_review_status" }, 400);
    }
    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 200)
    ) {
      return c.json({ error: "invalid_limit" }, 400);
    }
    return c.json({
      items: await deps.catalogPresenceReview.list({
        ...(status ? { status } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    });
  });

  app.post("/v1/control/catalog/presence-reviews/decide", async (c) => {
    if (!deps.catalogPresenceReview || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return c.json({ error: "invalid_presence_review" }, 400);
    }
    const body = raw as Record<string, unknown>;
    const providerId = body.providerId;
    const eventId = body.eventId;
    const action = body.action;
    const actor = body.actor;
    const note = body.note;

    if (
      typeof providerId !== "string" ||
      !UUID_RE.test(providerId) ||
      typeof eventId !== "string" ||
      !eventId.trim() ||
      (action !== "acknowledge" && action !== "resolve" && action !== "reopen") ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_presence_review" }, 400);
    }

    try {
      return c.json(
        await deps.catalogPresenceReview.decide({
          providerId,
          eventId,
          action,
          actor,
          ...(typeof note === "string" ? { note } : {}),
        }),
      );
    } catch (error) {
      return c.json(
        {
          error: "presence_review_rejected",
          message:
            error instanceof Error
              ? error.message
              : "Catalog presence review rejected",
        },
        409,
      );
    }
  });

  app.get("/v1/control/provider-expansion", async (c) => {
    if (!deps.providerExpansion || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);
    const policyVersion = c.req.query("policyVersion");
    if (
      policyVersion &&
      !/^[a-z0-9][a-z0-9._-]*$/.test(policyVersion)
    ) {
      return c.json({ error: "invalid_policy_version" }, 400);
    }
    return c.json({
      providers: await deps.providerExpansion.listProviders(policyVersion),
    });
  });

  app.get("/v1/control/provider-expansion/policies", async (c) => {
    if (!deps.providerExpansion || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);
    return c.json({ policies: await deps.providerExpansion.listPolicies() });
  });

  app.get("/v1/control/provider-expansion/:providerId", async (c) => {
    if (!deps.providerExpansion || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const providerId = c.req.param("providerId");
    const policyVersion = c.req.query("policyVersion");
    if (!UUID_RE.test(providerId)) {
      return c.json({ error: "invalid_provider_id" }, 400);
    }
    if (
      policyVersion &&
      !/^[a-z0-9][a-z0-9._-]*$/.test(policyVersion)
    ) {
      return c.json({ error: "invalid_policy_version" }, 400);
    }

    const provider = await deps.providerExpansion.getProvider(
      providerId,
      policyVersion,
    );
    if (!provider) {
      return c.json({ error: "provider_expansion_provider_not_found" }, 404);
    }
    return c.json({ provider });
  });

  app.post("/v1/control/provider-expansion/capabilities", async (c) => {
    if (!deps.providerExpansion || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const body = apiRecord(raw);
    const providerId = body?.providerId;
    const capability = body?.capability;
    const supportState = body?.supportState;
    const sourceId = body?.sourceId;
    const declaredAt = body?.declaredAt;
    const actor = body?.actor;
    const note = body?.note;
    const capabilityKeys = [
      "returned_model_metadata",
      "model_version_metadata",
      "provider_request_id",
      "provider_response_id",
      "service_tier_metadata",
      "token_usage",
      "catalog_model_list",
    ];

    if (
      typeof providerId !== "string" ||
      !UUID_RE.test(providerId) ||
      typeof capability !== "string" ||
      !capabilityKeys.includes(capability) ||
      (supportState !== "supported" && supportState !== "unsupported") ||
      (sourceId !== undefined &&
        (typeof sourceId !== "string" || !UUID_RE.test(sourceId))) ||
      (declaredAt !== undefined &&
        (typeof declaredAt !== "string" ||
          !Number.isFinite(Date.parse(declaredAt)))) ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_provider_capability" }, 400);
    }

    try {
      const input = {
        providerId,
        capability: capability as RecordProviderCapabilityInput["capability"],
        supportState,
        ...(typeof sourceId === "string" ? { sourceId } : {}),
        ...(typeof declaredAt === "string" ? { declaredAt } : {}),
        actor,
        ...(typeof note === "string" ? { note } : {}),
      } satisfies RecordProviderCapabilityInput;
      return c.json(
        { capability: await deps.providerExpansion.recordCapability(input) },
        201,
      );
    } catch (error) {
      return c.json(
        {
          error: "provider_capability_rejected",
          message:
            error instanceof Error
              ? error.message
              : "Provider capability declaration rejected",
        },
        409,
      );
    }
  });

  app.post("/v1/control/provider-expansion/policies", async (c) => {
    if (!deps.providerExpansion || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const body = apiRecord(raw);
    const requiredCapabilities = apiStringArray(body?.requiredCapabilities);
    const version = body?.version;
    const actor = body?.actor;
    const note = body?.note;
    const booleanKeys = [
      "requireIdentityProvenance",
      "requireCatalogCollection",
      "requireProviderPolicy",
      "requirePricingEvidence",
      "requireRunnerContext",
      "requireDirectRun",
      "requireCalibration",
    ] as const;

    if (
      typeof version !== "string" ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(version) ||
      !requiredCapabilities ||
      requiredCapabilities.length === 0 ||
      booleanKeys.some((key) => typeof body?.[key] !== "boolean") ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_provider_expansion_policy" }, 400);
    }

    try {
      const input = {
        version,
        requiredCapabilities:
          requiredCapabilities as RecordProviderExpansionPolicyInput["requiredCapabilities"],
        requireIdentityProvenance: body!.requireIdentityProvenance as boolean,
        requireCatalogCollection: body!.requireCatalogCollection as boolean,
        requireProviderPolicy: body!.requireProviderPolicy as boolean,
        requirePricingEvidence: body!.requirePricingEvidence as boolean,
        requireRunnerContext: body!.requireRunnerContext as boolean,
        requireDirectRun: body!.requireDirectRun as boolean,
        requireCalibration: body!.requireCalibration as boolean,
        actor,
        ...(typeof note === "string" ? { note } : {}),
      } satisfies RecordProviderExpansionPolicyInput;
      return c.json(
        { policy: await deps.providerExpansion.recordPolicy(input) },
        201,
      );
    } catch (error) {
      return c.json(
        {
          error: "provider_expansion_policy_rejected",
          message:
            error instanceof Error
              ? error.message
              : "Provider expansion policy rejected",
        },
        400,
      );
    }
  });

  app.get("/v1/control/provider-testability", async (c) => {
    if (!deps.providerTestability || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    return c.json({
      providers: await deps.providerTestability.listProviders(),
    });
  });

  app.get("/v1/control/provider-testability/:providerId", async (c) => {
    if (!deps.providerTestability || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const providerId = c.req.param("providerId");
    if (!UUID_RE.test(providerId)) {
      return c.json({ error: "invalid_provider_id" }, 400);
    }

    const provider = await deps.providerTestability.getProvider(providerId);
    if (!provider) {
      return c.json({ error: "provider_testability_provider_not_found" }, 404);
    }
    return c.json({ provider });
  });

  app.post("/v1/control/provider-testability/observations", async (c) => {
    if (!deps.providerTestability || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const body = apiRecord(raw);
    const source = apiRecord(body?.source);
    const pricing = apiRecord(body?.pricing);
    const allowedRegions = apiStringArray(body?.allowedRegions);
    const blockedRegions = apiStringArray(body?.blockedRegions);

    const providerId = body?.providerId;
    const modelId = body?.modelId;
    const executionPath = body?.executionPath;
    const subjectKind = body?.subjectKind;
    const accessState = body?.accessState;
    const actor = body?.actor;

    if (
      !body ||
      typeof providerId !== "string" ||
      !UUID_RE.test(providerId) ||
      (modelId !== undefined &&
        (typeof modelId !== "string" || !UUID_RE.test(modelId))) ||
      executionPath !== "first_party_direct" ||
      (subjectKind !== "provider_policy" && subjectKind !== "runner_access") ||
      !["available", "restricted", "unavailable", "unknown"].includes(
        String(accessState),
      ) ||
      typeof actor !== "string" ||
      !actor.trim() ||
      !source ||
      typeof source.sourceType !== "string" ||
      typeof source.title !== "string" ||
      !source.title.trim() ||
      (body.allowedRegions !== undefined && allowedRegions === undefined) ||
      (body.blockedRegions !== undefined && blockedRegions === undefined)
    ) {
      return c.json({ error: "invalid_provider_testability_observation" }, 400);
    }

    const optionalStrings = [
      body.registrationRequirement,
      body.billingRequirement,
      body.regionPolicy,
      body.accountTier,
      body.serviceTier,
      body.serviceAssurance,
      body.observedAt,
      body.note,
      source.url,
      source.retrievedAt,
      source.contentSha256,
    ];
    if (
      optionalStrings.some(
        (value) => value !== undefined && typeof value !== "string",
      )
    ) {
      return c.json({ error: "invalid_provider_testability_observation" }, 400);
    }

    if (
      pricing &&
      (
        typeof pricing.currency !== "string" ||
        ["inputPerMillion", "outputPerMillion", "perRequest"].some((key) => {
          const value = pricing[key];
          return value !== undefined && typeof value !== "number";
        })
      )
    ) {
      return c.json({ error: "invalid_provider_testability_observation" }, 400);
    }

    try {
      const input = {
        providerId,
        ...(typeof modelId === "string" ? { modelId } : {}),
        executionPath,
        subjectKind,
        accessState: accessState as RecordProviderTestabilityObservationInput["accessState"],
        ...(typeof body.registrationRequirement === "string"
          ? { registrationRequirement: body.registrationRequirement as NonNullable<RecordProviderTestabilityObservationInput["registrationRequirement"]> }
          : {}),
        ...(typeof body.billingRequirement === "string"
          ? { billingRequirement: body.billingRequirement as NonNullable<RecordProviderTestabilityObservationInput["billingRequirement"]> }
          : {}),
        ...(typeof body.regionPolicy === "string"
          ? { regionPolicy: body.regionPolicy as NonNullable<RecordProviderTestabilityObservationInput["regionPolicy"]> }
          : {}),
        ...(allowedRegions ? { allowedRegions } : {}),
        ...(blockedRegions ? { blockedRegions } : {}),
        ...(typeof body.accountTier === "string" ? { accountTier: body.accountTier } : {}),
        ...(typeof body.serviceTier === "string" ? { serviceTier: body.serviceTier } : {}),
        ...(typeof body.serviceAssurance === "string"
          ? { serviceAssurance: body.serviceAssurance as NonNullable<RecordProviderTestabilityObservationInput["serviceAssurance"]> }
          : {}),
        ...(pricing
          ? {
              pricing: {
                currency: pricing.currency as string,
                ...(typeof pricing.inputPerMillion === "number"
                  ? { inputPerMillion: pricing.inputPerMillion }
                  : {}),
                ...(typeof pricing.outputPerMillion === "number"
                  ? { outputPerMillion: pricing.outputPerMillion }
                  : {}),
                ...(typeof pricing.perRequest === "number"
                  ? { perRequest: pricing.perRequest }
                  : {}),
              },
            }
          : {}),
        source: {
          sourceType: source.sourceType as RecordProviderTestabilityObservationInput["source"]["sourceType"],
          ...(typeof source.url === "string" ? { url: source.url } : {}),
          title: source.title as string,
          ...(typeof source.retrievedAt === "string"
            ? { retrievedAt: source.retrievedAt }
            : {}),
          ...(typeof source.contentSha256 === "string"
            ? { contentSha256: source.contentSha256 }
            : {}),
        },
        ...(typeof body.observedAt === "string" ? { observedAt: body.observedAt } : {}),
        actor,
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      } satisfies RecordProviderTestabilityObservationInput;

      return c.json(await deps.providerTestability.recordObservation(input), 201);
    } catch (error) {
      return c.json(
        {
          error: "provider_testability_observation_rejected",
          message:
            error instanceof Error
              ? error.message
              : "Provider testability observation rejected",
        },
        409,
      );
    }
  });

  app.get("/v1/control/catalog/remote-cases/:providerId", async (c) => {
    if (!deps.catalogRemoteIdCase || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const providerId = c.req.param("providerId");
    const remoteModelId = c.req.query("remoteModelId");
    if (!UUID_RE.test(providerId)) {
      return c.json({ error: "invalid_provider_id" }, 400);
    }
    if (!remoteModelId || !remoteModelId.trim() || remoteModelId.length > 512) {
      return c.json({ error: "invalid_remote_model_id" }, 400);
    }

    const remoteCase = await deps.catalogRemoteIdCase.get(providerId, remoteModelId);
    if (!remoteCase) {
      return c.json({ error: "catalog_remote_id_case_not_found" }, 404);
    }
    return c.json({ remoteCase });
  });

  app.get("/v1/control/catalog/coverage", async (c) => {
    if (!deps.catalogCoverage || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    return c.json({ providers: await deps.catalogCoverage.listProviders() });
  });

  app.get("/v1/control/catalog/coverage/:providerId", async (c) => {
    if (!deps.catalogCoverage || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const providerId = c.req.param("providerId");
    if (!UUID_RE.test(providerId)) {
      return c.json({ error: "invalid_provider_id" }, 400);
    }
    const coverage = await deps.catalogCoverage.getProvider(providerId);
    if (!coverage) {
      return c.json({ error: "catalog_coverage_provider_not_found" }, 404);
    }
    return c.json({ coverage });
  });

  app.get("/v1/control/catalog/integrity", async (c) => {
    if (!deps.catalogIntegrity || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    return c.json({ dashboard: await deps.catalogIntegrity.getDashboard() });
  });

  app.get("/v1/control/catalog/identity-cases/:modelId", async (c) => {
    if (!deps.catalogIdentityCase || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const modelId = c.req.param("modelId");
    if (!UUID_RE.test(modelId)) {
      return c.json({ error: "invalid_model_id" }, 400);
    }

    const identityCase = await deps.catalogIdentityCase.get(modelId);
    if (!identityCase) {
      return c.json({ error: "catalog_identity_case_not_found" }, 404);
    }
    return c.json({ identityCase });
  });

  app.get("/v1/control/catalog/drift-reviews", async (c) => {
    if (!deps.catalogDriftReview || !controlToken) return c.json({ error: "control_plane_disabled" }, 503);
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);
    const status = c.req.query("status") as CatalogDriftReviewStatus | undefined;
    if (status && !["open", "acknowledged", "resolved"].includes(status)) {
      return c.json({ error: "invalid_drift_review_status" }, 400);
    }
    return c.json({ items: await deps.catalogDriftReview.list({ ...(status ? { status } : {}) }) });
  });

  app.post("/v1/control/catalog/drift-reviews/decide", async (c) => {
    if (!deps.catalogDriftReview || !controlToken) return c.json({ error: "control_plane_disabled" }, 503);
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "invalid_json" }, 400); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return c.json({ error: "invalid_drift_review" }, 400);
    const body = raw as Record<string, unknown>;
    const eventId = body.eventId;
    const action = body.action;
    const actor = body.actor;
    const note = body.note;
    if (
      typeof eventId !== "string" || !eventId.trim() ||
      (action !== "acknowledge" && action !== "resolve" && action !== "reopen") ||
      typeof actor !== "string" || !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) return c.json({ error: "invalid_drift_review" }, 400);
    try {
      return c.json(await deps.catalogDriftReview.decide({
        eventId, action, actor, ...(typeof note === "string" ? { note } : {}),
      }));
    } catch (error) {
      return c.json({ error: "drift_review_rejected", message: error instanceof Error ? error.message : "Drift review rejected" }, 409);
    }
  });

  app.get("/v1/control/catalog/discoveries", async (c) => {
    if (!deps.catalogDiscovery || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const provider = c.req.query("provider");
    const status = c.req.query("status") as CatalogDiscoveryStatus | undefined;
    const rawLimit = c.req.query("limit");
    if (provider && !PROVIDER_SLUG_RE.test(provider)) {
      return c.json({ error: "invalid_provider" }, 400);
    }
    if (
      status &&
      !["discovered", "matched", "ignored", "promotion_ready"].includes(status)
    ) {
      return c.json({ error: "invalid_discovery_status" }, 400);
    }
    const limit = rawLimit === undefined ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 200)
    ) {
      return c.json({ error: "invalid_limit" }, 400);
    }

    return c.json({
      candidates: await deps.catalogDiscovery.listCandidates({
        ...(provider ? { providerSlug: provider } : {}),
        ...(status ? { status } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    });
  });

  app.get("/v1/control/catalog/providers/:providerId/models", async (c) => {
    if (!deps.catalogDiscovery || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const providerId = c.req.param("providerId");
    if (!UUID_RE.test(providerId)) {
      return c.json({ error: "invalid_provider_id" }, 400);
    }
    return c.json({
      models: await deps.catalogDiscovery.listProviderModels(providerId),
    });
  });

  app.post("/v1/control/catalog/discoveries/:candidateId/reconcile", async (c) => {
    if (!deps.catalogDiscovery || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const candidateId = c.req.param("candidateId");
    if (!UUID_RE.test(candidateId)) {
      return c.json({ error: "invalid_candidate_id" }, 400);
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return c.json({ error: "invalid_reconciliation" }, 400);
    }
    const body = raw as Record<string, unknown>;
    const action = body.action;
    const actor = body.actor;
    const resolvedModelId = body.resolvedModelId;
    const note = body.note;
    if (
      typeof action !== "string" ||
      !["match_existing", "ignore", "mark_promotion_ready", "reopen"].includes(action) ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (resolvedModelId !== undefined &&
        (typeof resolvedModelId !== "string" || !UUID_RE.test(resolvedModelId))) ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_reconciliation" }, 400);
    }

    try {
      const result = await deps.catalogDiscovery.reconcileCandidate({
        candidateId,
        action: action as "match_existing" | "ignore" | "mark_promotion_ready" | "reopen",
        actor,
        ...(typeof resolvedModelId === "string" ? { resolvedModelId } : {}),
        ...(typeof note === "string" ? { note } : {}),
      });
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: "reconciliation_rejected",
          message: error instanceof Error ? error.message : "Reconciliation rejected",
        },
        409,
      );
    }
  });

  app.post("/v1/control/catalog/discoveries/:candidateId/promote", async (c) => {
    if (!deps.catalogDiscovery || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const candidateId = c.req.param("candidateId");
    if (!UUID_RE.test(candidateId)) {
      return c.json({ error: "invalid_candidate_id" }, 400);
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return c.json({ error: "invalid_promotion" }, 400);
    }
    const body = raw as Record<string, unknown>;
    const canonicalSlug = body.canonicalSlug;
    const marketingName = body.marketingName;
    const status = body.status;
    const actor = body.actor;
    const note = body.note;
    if (
      typeof canonicalSlug !== "string" ||
      !PROVIDER_SLUG_RE.test(canonicalSlug) ||
      typeof marketingName !== "string" ||
      !marketingName.trim() ||
      (status !== undefined && status !== "preview" && status !== "active") ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_promotion" }, 400);
    }

    try {
      const result = await deps.catalogDiscovery.promoteCandidate({
        candidateId,
        canonicalSlug,
        marketingName,
        ...(status === "preview" || status === "active" ? { status } : {}),
        actor,
        ...(typeof note === "string" ? { note } : {}),
      });
      return c.json(result, 201);
    } catch (error) {
      return c.json(
        {
          error: "promotion_rejected",
          message: error instanceof Error ? error.message : "Promotion rejected",
        },
        409,
      );
    }
  });

  app.get("/v1/control/execution-fleet", async (c) => {
    if (!deps.fleet || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);
    return c.json({ environments: await deps.fleet.listEnvironments() });
  });

  app.post("/v1/control/execution-fleet/environments", async (c) => {
    if (!deps.fleet || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const body = apiRecord(raw);
    if (!body) return c.json({ error: "invalid_execution_environment" }, 400);

    const slug = body.slug;
    const region = body.region;
    const accountTier = body.accountTier;
    const serviceTier = body.serviceTier;
    const serviceAssurance = body.serviceAssurance;
    const enabled = body.enabled;
    const actor = body.actor;
    const note = body.note;

    if (
      typeof slug !== "string" ||
      !PROVIDER_SLUG_RE.test(slug) ||
      typeof region !== "string" ||
      !region.trim() ||
      (accountTier !== undefined &&
        (typeof accountTier !== "string" || !accountTier.trim())) ||
      (serviceTier !== undefined &&
        (typeof serviceTier !== "string" || !serviceTier.trim())) ||
      (serviceAssurance !== "documented_default" &&
        serviceAssurance !== "documented_variant" &&
        serviceAssurance !== "operator_uncertain" &&
        serviceAssurance !== "unknown") ||
      (enabled !== undefined && typeof enabled !== "boolean") ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_execution_environment" }, 400);
    }

    try {
      const environment = await deps.fleet.registerEnvironment({
        slug,
        region,
        ...(typeof accountTier === "string" ? { accountTier } : {}),
        ...(typeof serviceTier === "string" ? { serviceTier } : {}),
        serviceAssurance,
        ...(typeof enabled === "boolean" ? { enabled } : {}),
        actor,
        ...(typeof note === "string" ? { note } : {}),
      });
      return c.json({ environment }, 201);
    } catch (error) {
      return c.json(
        {
          error: "execution_environment_rejected",
          message:
            error instanceof Error
              ? error.message
              : "Execution environment rejected",
        },
        409,
      );
    }
  });

  app.post(
    "/v1/control/execution-fleet/environments/:environmentId/state",
    async (c) => {
      if (!deps.fleet || !controlToken) {
        return c.json({ error: "control_plane_disabled" }, 503);
      }
      const authIssue = controlAuthIssue(
        c.req.header("authorization"),
        controlToken,
      );
      if (authIssue) return c.json(controlAuthError(authIssue), 401);

      const environmentId = c.req.param("environmentId");
      if (!UUID_RE.test(environmentId)) {
        return c.json({ error: "invalid_environment_id" }, 400);
      }
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
      const body = apiRecord(raw);
      const enabled = body?.enabled;
      const actor = body?.actor;
      const note = body?.note;
      const effectiveAt = body?.effectiveAt;
      if (
        typeof enabled !== "boolean" ||
        typeof actor !== "string" ||
        !actor.trim() ||
        (note !== undefined && typeof note !== "string") ||
        (effectiveAt !== undefined &&
          (typeof effectiveAt !== "string" ||
            !Number.isFinite(Date.parse(effectiveAt))))
      ) {
        return c.json({ error: "invalid_environment_state" }, 400);
      }

      try {
        const state = await deps.fleet.setEnvironmentState({
          environmentId,
          enabled,
          actor,
          ...(typeof note === "string" ? { note } : {}),
          ...(typeof effectiveAt === "string" ? { effectiveAt } : {}),
        });
        return c.json({ state }, 201);
      } catch (error) {
        return c.json(
          {
            error: "environment_state_rejected",
            message:
              error instanceof Error ? error.message : "State change rejected",
          },
          409,
        );
      }
    },
  );

  app.post(
    "/v1/control/execution-fleet/environments/:environmentId/capabilities",
    async (c) => {
      if (!deps.fleet || !controlToken) {
        return c.json({ error: "control_plane_disabled" }, 503);
      }
      const authIssue = controlAuthIssue(
        c.req.header("authorization"),
        controlToken,
      );
      if (authIssue) return c.json(controlAuthError(authIssue), 401);

      const environmentId = c.req.param("environmentId");
      if (!UUID_RE.test(environmentId)) {
        return c.json({ error: "invalid_environment_id" }, 400);
      }
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
      const body = apiRecord(raw);
      const providerId = body?.providerId;
      const executionPath = body?.executionPath;
      const enabled = body?.enabled;
      const selectionPriority = body?.selectionPriority;
      const actor = body?.actor;
      const note = body?.note;
      const effectiveAt = body?.effectiveAt;

      if (
        typeof providerId !== "string" ||
        !UUID_RE.test(providerId) ||
        executionPath !== "first_party_direct" ||
        typeof enabled !== "boolean" ||
        (selectionPriority !== undefined &&
          (typeof selectionPriority !== "number" ||
            !Number.isInteger(selectionPriority) ||
            selectionPriority < 0 ||
            selectionPriority > 100000)) ||
        typeof actor !== "string" ||
        !actor.trim() ||
        (note !== undefined && typeof note !== "string") ||
        (effectiveAt !== undefined &&
          (typeof effectiveAt !== "string" ||
            !Number.isFinite(Date.parse(effectiveAt))))
      ) {
        return c.json({ error: "invalid_environment_capability" }, 400);
      }

      try {
        const capability = await deps.fleet.declareCapability({
          environmentId,
          providerId,
          executionPath,
          enabled,
          ...(typeof selectionPriority === "number"
            ? { selectionPriority }
            : {}),
          actor,
          ...(typeof note === "string" ? { note } : {}),
          ...(typeof effectiveAt === "string" ? { effectiveAt } : {}),
        });
        return c.json({ capability }, 201);
      } catch (error) {
        return c.json(
          {
            error: "environment_capability_rejected",
            message:
              error instanceof Error
                ? error.message
                : "Capability declaration rejected",
          },
          409,
        );
      }
    },
  );

  app.get("/v1/control/cost-ledger/daily", async (c) => {
    if (!deps.costLedger || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    const rawDays = c.req.query("days");
    const days = rawDays === undefined ? 30 : Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      return c.json({ error: "invalid_days" }, 400);
    }
    return c.json({ daily: await deps.costLedger.listDailyCosts(days) });
  });

  app.get("/v1/control/cost-ledger/budgets", async (c) => {
    if (!deps.costLedger || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);
    return c.json({ budgets: await deps.costLedger.listBudgetStatus() });
  });

  app.post("/v1/control/cost-ledger/budgets", async (c) => {
    if (!deps.costLedger || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const body = apiRecord(raw);
    if (!body) return c.json({ error: "invalid_budget_policy" }, 400);

    const providerId = body.providerId;
    const currency = body.currency;
    const period = body.period;
    const budgetAmount = body.budgetAmount;
    const effectiveFrom = body.effectiveFrom;
    const actor = body.actor;
    const note = body.note;

    if (
      (providerId !== undefined &&
        (typeof providerId !== "string" || !UUID_RE.test(providerId))) ||
      typeof currency !== "string" ||
      !/^[A-Za-z]{3}$/.test(currency) ||
      (period !== "day" && period !== "month") ||
      typeof budgetAmount !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(budgetAmount) ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (effectiveFrom !== undefined &&
        (typeof effectiveFrom !== "string" ||
          !Number.isFinite(Date.parse(effectiveFrom)))) ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_budget_policy" }, 400);
    }

    try {
      const policy = await deps.costLedger.recordBudgetPolicy({
        ...(typeof providerId === "string" ? { providerId } : {}),
        currency,
        period,
        budgetAmount,
        ...(typeof effectiveFrom === "string" ? { effectiveFrom } : {}),
        actor,
        ...(typeof note === "string" ? { note } : {}),
      });
      return c.json({ policy }, 201);
    } catch (error) {
      return c.json(
        {
          error: "budget_policy_rejected",
          message:
            error instanceof Error ? error.message : "Budget policy rejected",
        },
        400,
      );
    }
  });

  app.post("/v1/control/calibration/policies", async (c) => {
    if (!deps.calibration || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const body = apiRecord(raw);
    const version = body?.version;
    const windowSize = body?.windowSize;
    const repeatedAnomalyThreshold = body?.repeatedAnomalyThreshold;
    const maxAgeHours = body?.maxAgeHours;
    const actor = body?.actor;
    const note = body?.note;
    if (
      typeof version !== "string" ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(version) ||
      typeof windowSize !== "number" ||
      !Number.isInteger(windowSize) ||
      typeof repeatedAnomalyThreshold !== "number" ||
      !Number.isInteger(repeatedAnomalyThreshold) ||
      typeof maxAgeHours !== "number" ||
      !Number.isInteger(maxAgeHours) ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_calibration_policy" }, 400);
    }
    try {
      const policy = await deps.calibration.recordPolicy({
        version,
        windowSize,
        repeatedAnomalyThreshold,
        maxAgeHours,
        actor,
        ...(typeof note === "string" ? { note } : {}),
      });
      return c.json({ policy }, 201);
    } catch (error) {
      return c.json(
        {
          error: "calibration_policy_rejected",
          message:
            error instanceof Error ? error.message : "Calibration policy rejected",
        },
        400,
      );
    }
  });

  app.post("/v1/control/comparability/policies", async (c) => {
    if (!deps.comparability || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(c.req.header("authorization"), controlToken);
    if (authIssue) return c.json(controlAuthError(authIssue), 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const body = apiRecord(raw);
    if (!body) return c.json({ error: "invalid_comparability_policy" }, 400);

    const version = body.version;
    const minimumEvidenceLevel = body.minimumEvidenceLevel;
    const actor = body.actor;
    const note = body.note;
    const booleans = [
      "requireSameExecutionPath",
      "requireRegion",
      "requireAccountTier",
      "requireServiceTier",
      "requireDocumentedServiceAssurance",
      "rejectQualificationCaveats",
      "requireRecentCalibration",
      "rejectRepeatedCalibrationAnomaly",
    ] as const;
    const integers = [
      "calibrationMaxAgeHours",
      "defaultMinRepeatCount",
      "unstableMinRepeatCount",
    ] as const;

    if (
      typeof version !== "string" ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(version) ||
      typeof minimumEvidenceLevel !== "string" ||
      !["E0", "E1", "E2", "E3", "E4", "E5"].includes(minimumEvidenceLevel) ||
      booleans.some((key) => typeof body[key] !== "boolean") ||
      integers.some(
        (key) => typeof body[key] !== "number" || !Number.isInteger(body[key]),
      ) ||
      typeof actor !== "string" ||
      !actor.trim() ||
      (note !== undefined && typeof note !== "string")
    ) {
      return c.json({ error: "invalid_comparability_policy" }, 400);
    }

    try {
      const policy = await deps.comparability.recordPolicy({
        version,
        minimumEvidenceLevel: minimumEvidenceLevel as
          | "E0"
          | "E1"
          | "E2"
          | "E3"
          | "E4"
          | "E5",
        requireSameExecutionPath: body.requireSameExecutionPath as boolean,
        requireRegion: body.requireRegion as boolean,
        requireAccountTier: body.requireAccountTier as boolean,
        requireServiceTier: body.requireServiceTier as boolean,
        requireDocumentedServiceAssurance:
          body.requireDocumentedServiceAssurance as boolean,
        rejectQualificationCaveats:
          body.rejectQualificationCaveats as boolean,
        requireRecentCalibration: body.requireRecentCalibration as boolean,
        rejectRepeatedCalibrationAnomaly:
          body.rejectRepeatedCalibrationAnomaly as boolean,
        calibrationMaxAgeHours: body.calibrationMaxAgeHours as number,
        defaultMinRepeatCount: body.defaultMinRepeatCount as number,
        unstableMinRepeatCount: body.unstableMinRepeatCount as number,
        actor,
        ...(typeof note === "string" ? { note } : {}),
      });
      return c.json({ policy }, 201);
    } catch (error) {
      return c.json(
        {
          error: "comparability_policy_rejected",
          message:
            error instanceof Error ? error.message : "Comparability policy rejected",
        },
        400,
      );
    }
  });

  app.get("/v1/control/catalog/models", async (c) => {
    if (!deps.planner || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    return c.json({ models: await deps.planner.listModels() });
  });

  app.get("/v1/control/catalog/tests", async (c) => {
    if (!deps.planner || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    return c.json({ tests: await deps.planner.listTests() });
  });

  app.post("/v1/control/runs", async (c) => {
    if (!deps.jobs || !deps.planner || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    let selection;
    try {
      selection = parseRunSelectionRequest(raw);
    } catch (error) {
      return c.json(
        {
          error: "invalid_run_selection",
          message:
            error instanceof Error ? error.message : "Invalid Run selection",
        },
        400,
      );
    }

    const key = idempotencyKey(c.req.header("idempotency-key"));
    if (key.error) return c.json({ error: key.error }, 400);

    try {
      const plan = await deps.planner.plan(selection);
      const job = await deps.jobs.enqueue({
        payload: plan.jobPayload,
        ...(key.value ? { idempotencyKey: key.value } : {}),
      });

      return c.json(
        {
          selection: {
            executionEnvironment: plan.executionEnvironment,
            model: {
              id: plan.model.id,
              provider: plan.model.provider,
              marketingName: plan.model.marketingName,
              apiModelId: plan.model.apiModelId,
            },
            test: {
              testCaseId: plan.test.testCaseId,
              familySlug: plan.test.familySlug,
              variantSlug: plan.test.variantSlug,
              version: plan.test.version,
              caseSlug: plan.test.caseSlug,
              evaluator: plan.test.evaluator,
            },
          },
          job: controlJob(job),
        },
        202,
      );
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return c.json({ error: "idempotency_conflict" }, 409);
      }
      return c.json(
        {
          error: "run_not_plannable",
          message:
            error instanceof Error ? error.message : "Run cannot be planned",
        },
        400,
      );
    }
  });

  app.post("/v1/control/run-jobs", async (c) => {
    if (!deps.jobs || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    if (
      apiRecord(raw)?.qualification !== undefined ||
      apiRecord(raw)?.cost !== undefined ||
      apiRecord(raw)?.fleet !== undefined
    ) {
      return c.json(
        {
          error: "invalid_run_job",
          message:
            "qualification, cost, and fleet target are planner-owned; use /v1/control/runs to freeze execution context, pricing evidence, and worker selection",
        },
        400,
      );
    }

    let payload;
    try {
      payload = parseDirectProviderRunRequest(raw);
    } catch (error) {
      return c.json(
        {
          error: "invalid_run_job",
          message: error instanceof Error ? error.message : "Invalid Run job",
        },
        400,
      );
    }

    const key = idempotencyKey(c.req.header("idempotency-key"));
    if (key.error) return c.json({ error: key.error }, 400);

    try {
      const job = await deps.jobs.enqueue({
        payload,
        ...(key.value ? { idempotencyKey: key.value } : {}),
      });
      return c.json({ job: controlJob(job) }, 202);
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        return c.json({ error: "idempotency_conflict" }, 409);
      }
      throw error;
    }
  });

  app.get("/v1/control/run-jobs/:jobId", async (c) => {
    if (!deps.jobs || !controlToken) {
      return c.json({ error: "control_plane_disabled" }, 503);
    }
    const authIssue = controlAuthIssue(
      c.req.header("authorization"),
      controlToken,
    );
    if (authIssue) {
      return c.json(controlAuthError(authIssue), 401);
    }

    const jobId = c.req.param("jobId");
    if (!UUID_RE.test(jobId)) {
      return c.json({ error: "invalid_job_id" }, 400);
    }

    const job = await deps.jobs.get(jobId);
    if (!job) {
      return c.json({ error: "run_job_not_found" }, 404);
    }

    return c.json({ job: controlJob(job) });
  });

  return app;
}

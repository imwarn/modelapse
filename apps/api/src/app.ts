import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import {
  IdempotencyConflictError,
  parseDirectProviderRunRequest,
  parseRunSelectionRequest,
  type PgRunJobQueue,
  type PgRunPlanner,
  type RunJob,
} from "@modelapse/control-plane";
import type {
  PgArchiveRepository,
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
} from "@modelapse/catalog-admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type RunApiRepository = Pick<RunRepository, "ping" | "getRun">;
type ControlQueue = Pick<PgRunJobQueue, "ping" | "enqueue" | "get">;
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

type ArchiveRepository = Pick<
  PgArchiveRepository,
  | "ping"
  | "listModels"
  | "listTests"
  | "listRuns"
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
  readonly planner?: ControlPlanner;
  readonly archive?: ArchiveRepository;
  readonly catalogDiscovery?: CatalogDiscoveryRepository;
  readonly catalogDriftReview?: CatalogDriftReviewRepository;
  readonly catalogIdentityCase?: CatalogIdentityCaseRepository;
  readonly catalogIntegrity?: CatalogIntegrityRepository;
  readonly catalogCoverage?: CatalogCoverageRepository;
  readonly catalogPresence?: CatalogPresenceRepository;
  readonly catalogPresenceReview?: CatalogPresenceReviewRepository;
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
      if (deps.planner) await deps.planner.ping();
      if (deps.archive) await deps.archive.ping();
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

    const comparison = await deps.archive.compareLatest({
      modelIds,
      testCaseId,
    });
    if (!comparison) {
      return c.json({ error: "archive_comparison_not_found" }, 404);
    }

    return c.json({ comparison });
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

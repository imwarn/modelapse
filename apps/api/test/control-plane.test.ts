import { describe, expect, it } from "vitest";
import type { RunJob } from "@modelapse/control-plane";
import { createApp } from "../src/app.js";

const TEST_CASE_ID = "00000000-0000-4000-8000-000000000001";
const JOB_ID = "00000000-0000-4000-8000-000000000002";

const queuedJob = {
  id: JOB_ID,
  kind: "openai_direct",
  payload: {
    provider: "openai",
    testCaseId: TEST_CASE_ID,
    model: "gpt-test",
  },
  status: "queued",
  idempotencyKey: "request-1",
  attempts: 0,
  maxAttempts: 3,
  availableAt: "2026-09-23T00:00:00.000Z",
  claimedAt: null,
  leaseExpiresAt: null,
  workerId: null,
  runId: null,
  lastError: null,
  completedAt: null,
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
} as const satisfies RunJob;

function baseRuns() {
  return {
    ping: async () => undefined,
    getRun: async () => null,
  };
}

describe("Run job control API", () => {
  it("is disabled unless a control token and queue are configured", async () => {
    const app = createApp({ runs: baseRuns() });
    const response = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(503);
  });

  it("requires bearer authentication and enqueues only the narrow job contract", async () => {
    let idempotencyKey: string | undefined;
    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      jobs: {
        ping: async () => undefined,
        get: async () => queuedJob,
        enqueue: async (input) => {
          idempotencyKey = input.idempotencyKey;
          return queuedJob;
        },
      },
    });

    const unauthorized = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
      }),
    });
    expect(unauthorized.status).toBe(401);

    const invalid = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer control-secret",
      },
      body: JSON.stringify({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        prompt: "caller override",
      }),
    });
    expect(invalid.status).toBe(400);

    const accepted = await app.request("/v1/control/run-jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer control-secret",
        "idempotency-key": "request-1",
      },
      body: JSON.stringify({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
      }),
    });

    expect(accepted.status).toBe(202);
    expect(idempotencyKey).toBe("request-1");
    await expect(accepted.json()).resolves.toEqual({
      job: {
        id: JOB_ID,
        kind: "openai_direct",
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        runId: null,
        lastError: null,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
        completedAt: null,
      },
    });
  });
});


describe("Catalog Discovery control API", () => {
  const candidateId = "00000000-0000-4000-8000-000000000003";

  function candidate() {
    return {
      id: candidateId,
      provider: { id: "p", slug: "deepseek", name: "DeepSeek" },
      remoteModelId: "deepseek-next",
      firstSeenAt: "2026-10-01T00:00:00.000Z",
      lastSeenAt: "2026-10-02T00:00:00.000Z",
      latestProviderSnapshotId: null,
      observationCount: 2,
      status: "discovered" as const,
      resolvedModel: null,
      resolvedAt: null,
      promotionPolicy: {
        version: "provider-catalog-v1" as const,
        eligible: false,
        blockers: ["candidate_not_promotion_ready"],
        evidence: {
          sourceRecordId: "s",
          sourceType: "provider_catalog",
          sourceUrl: "https://api.deepseek.com/models",
          sourceTitle: "DeepSeek Models API",
          contentSha256: "a".repeat(64),
          sourceRetrievedAt: "2026-10-02T00:00:00.000Z",
          observationCount: 2,
        },
      },
      lastSource: {
        id: "s",
        sourceType: "provider_catalog",
        url: "https://api.deepseek.com/models",
        title: "DeepSeek Models API",
        retrievedAt: "2026-10-02T00:00:00.000Z",
        contentSha256: "a".repeat(64),
      },
      promotion: null,
      latestDecision: null,
    };
  }

  it("keeps discovery reads and writes behind control authentication", async () => {
    let reconciled = false;
    let promoted = false;
    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      catalogDiscovery: {
        listCandidates: async () => [candidate()],
        listProviderModels: async () => [],
        reconcileCandidate: async () => {
          reconciled = true;
          return { eventId: "event", status: "promotion_ready" };
        },
        promoteCandidate: async () => {
          promoted = true;
          return {
            candidateId,
            modelId: "00000000-0000-4000-8000-000000000004",
            promotionEventId: "promotion",
            reconciliationEventId: "reconciliation",
          };
        },
      },
    });

    const unauthorized = await app.request("/v1/control/catalog/discoveries");
    expect(unauthorized.status).toBe(401);

    const listed = await app.request(
      "/v1/control/catalog/discoveries?status=discovered",
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      candidates: [{ remoteModelId: "deepseek-next" }],
    });

    const reconciledResponse = await app.request(
      `/v1/control/catalog/discoveries/${candidateId}/reconcile`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer control-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "mark_promotion_ready",
          actor: "web-operator",
        }),
      },
    );
    expect(reconciledResponse.status).toBe(200);
    expect(reconciled).toBe(true);

    const promotedResponse = await app.request(
      `/v1/control/catalog/discoveries/${candidateId}/promote`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer control-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          canonicalSlug: "deepseek-next",
          marketingName: "DeepSeek Next",
          status: "active",
          actor: "web-operator",
        }),
      },
    );
    expect(promotedResponse.status).toBe(201);
    expect(promoted).toBe(true);
  });
});


describe("Catalog identity drift review control API", () => {
  it("keeps drift triage behind control authentication", async () => {
    let decided = false;
    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      catalogDriftReview: {
        list: async () => [],
        decide: async ({ eventId }) => {
          decided = true;
          return { eventId, eventAuditId: "audit", status: "acknowledged" as const };
        },
      },
    });

    expect((await app.request("/v1/control/catalog/drift-reviews")).status).toBe(401);
    const listed = await app.request("/v1/control/catalog/drift-reviews?status=open", {
      headers: { authorization: "Bearer control-secret" },
    });
    expect(listed.status).toBe(200);

    const response = await app.request("/v1/control/catalog/drift-reviews/decide", {
      method: "POST",
      headers: { authorization: "Bearer control-secret", "content-type": "application/json" },
      body: JSON.stringify({ eventId: "binding:00000000-0000-4000-8000-000000000099", action: "acknowledge", actor: "web-operator" }),
    });
    expect(response.status).toBe(200);
    expect(decided).toBe(true);
  });
});


describe("Catalog Identity Case control API", () => {
  const modelId = "00000000-0000-4000-8000-000000000120";

  it("keeps cross-workflow identity history behind control authentication", async () => {
    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      catalogIdentityCase: {
        get: async (requestedModelId) =>
          requestedModelId === modelId
            ? {
                model: {
                  id: modelId,
                  provider: {
                    id: "00000000-0000-4000-8000-000000000121",
                    slug: "deepseek",
                    name: "DeepSeek",
                  },
                  canonicalSlug: "deepseek-case",
                  marketingName: "DeepSeek Case",
                  status: "active",
                },
                candidates: [],
                drift: [],
                timeline: [],
              }
            : null,
      },
    });

    expect(
      (await app.request("/v1/control/catalog/identity-cases/" + modelId)).status,
    ).toBe(401);

    const invalid = await app.request(
      "/v1/control/catalog/identity-cases/not-a-uuid",
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(invalid.status).toBe(400);

    const found = await app.request(
      "/v1/control/catalog/identity-cases/" + modelId,
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toMatchObject({
      identityCase: {
        model: { id: modelId, canonicalSlug: "deepseek-case" },
        candidates: [],
        drift: [],
        timeline: [],
      },
    });
  });
});


describe("Catalog Integrity control API", () => {
  it("keeps the read-only attention projection behind control authentication", async () => {
    const dashboard = {
      generatedAt: "2026-10-04T00:00:00.000Z",
      summary: {
        total: 1,
        counts: {
          collection_failed: 1,
          collection_partial: 0,
          collection_stale: 0,
          discovery_unresolved: 0,
          promotion_ready: 0,
          promotion_blocked: 0,
          drift_open: 0,
          drift_acknowledged: 0,
          provenance_incomplete: 0,
        },
      },
      observerSources: [],
      discovery: [],
      drift: [],
      provenance: [],
    };

    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      catalogIntegrity: {
        getDashboard: async () => dashboard,
      },
    });

    const unauthorized = await app.request("/v1/control/catalog/integrity");
    expect(unauthorized.status).toBe(401);

    const response = await app.request("/v1/control/catalog/integrity", {
      headers: { authorization: "Bearer control-secret" },
    });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toEqual({ dashboard });
    expect(JSON.stringify(payload)).not.toContain("response_body");
    expect(JSON.stringify(payload)).not.toContain("responseBody");
  });
});


describe("Catalog Coverage control API", () => {
  const providerId = "00000000-0000-4000-8000-000000000140";

  it("keeps provider coverage behind control authentication and validates provider IDs", async () => {
    const summary = {
      provider: { id: providerId, slug: "fixture", name: "Fixture" },
      generatedAt: "2026-10-05T00:00:00.000Z",
      latestEvidenceAt: "2026-10-05T00:00:00.000Z",
      summary: {
        modelListSources: 1,
        sourcesWithEvidence: 1,
        sourceItemCount: 2,
        uniqueProjectedRemoteIds: 2,
        canonicalObserved: 1,
        candidateDiscovered: 1,
        candidatePromotionReady: 0,
        candidateIgnored: 0,
        candidateMatched: 0,
        unprojectedSourceItems: 0,
        currentBindingsNotObserved: 0,
      },
    };
    const coverage = {
      generatedAt: summary.generatedAt,
      provider: summary.provider,
      summary: summary.summary,
      sources: [],
      remoteItems: [],
      currentBindingsNotObserved: [],
    };

    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      catalogCoverage: {
        listProviders: async () => [summary],
        getProvider: async (requestedProviderId) =>
          requestedProviderId === providerId ? coverage : null,
      },
    });

    expect((await app.request("/v1/control/catalog/coverage")).status).toBe(401);

    const listed = await app.request("/v1/control/catalog/coverage", {
      headers: { authorization: "Bearer control-secret" },
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({ providers: [summary] });

    const invalid = await app.request("/v1/control/catalog/coverage/not-a-uuid", {
      headers: { authorization: "Bearer control-secret" },
    });
    expect(invalid.status).toBe(400);

    const found = await app.request("/v1/control/catalog/coverage/" + providerId, {
      headers: { authorization: "Bearer control-secret" },
    });
    expect(found.status).toBe(200);
    const payload = await found.json();
    expect(payload).toEqual({ coverage });
    expect(JSON.stringify(payload)).not.toContain("response_body");
    expect(JSON.stringify(payload)).not.toContain("responseBody");
    expect(JSON.stringify(payload)).not.toContain("error_message");
  });
});


describe("Catalog Presence control API", () => {
  const providerId = "00000000-0000-4000-8000-000000000150";

  it("protects presence history and validates provider and run limit", async () => {
    const history = {
      generatedAt: "2026-10-05T01:00:00.000Z",
      provider: { id: providerId, slug: "fixture", name: "Fixture" },
      summary: {
        modelListSources: 1,
        evidenceRuns: 2,
        completeProjectionRuns: 2,
        incompleteProjectionRuns: 0,
        appearanceEvents: 2,
        absenceEvents: 1,
        reappearanceEvents: 0,
        latestCompleteAt: "2026-10-05T01:00:00.000Z",
      },
      sources: [],
      runs: [],
      events: [],
    };

    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      catalogPresence: {
        getProvider: async (requestedProviderId) =>
          requestedProviderId === providerId ? history : null,
      },
    });

    expect(
      (await app.request("/v1/control/catalog/presence/" + providerId)).status,
    ).toBe(401);

    const invalidProvider = await app.request(
      "/v1/control/catalog/presence/not-a-uuid",
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(invalidProvider.status).toBe(400);

    const invalidLimit = await app.request(
      "/v1/control/catalog/presence/" + providerId + "?runLimit=1",
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(invalidLimit.status).toBe(400);

    const found = await app.request(
      "/v1/control/catalog/presence/" + providerId + "?runLimit=20",
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(found.status).toBe(200);
    const payload = await found.json();
    expect(payload).toEqual({ history });
    expect(JSON.stringify(payload)).not.toContain("response_body");
    expect(JSON.stringify(payload)).not.toContain("responseBody");
  });
});


describe("Catalog Presence Review control API", () => {
  const providerId = "00000000-0000-4000-8000-000000000160";
  const eventId = "presence-event-fixture";

  it("protects review reads and accepts explicit review decisions", async () => {
    const item = {
      eventId,
      occurredAt: "2026-10-05T02:00:00.000Z",
      interpretation: "not_observed_in_complete_model_list_evidence" as const,
      provider: { id: providerId, slug: "fixture", name: "Fixture" },
      observerSource: {
        id: "00000000-0000-4000-8000-000000000161",
        sourceKey: "models-api",
        title: "Fixture Models",
        url: "https://fixture.example.test/models",
      },
      runId: "00000000-0000-4000-8000-000000000162",
      previousCompleteRunId: "00000000-0000-4000-8000-000000000163",
      remoteModelId: "fixture-model",
      currentContext: { canonicalModel: null, candidate: null },
      review: {
        status: "open" as const,
        acknowledgedAt: null,
        resolvedAt: null,
        latestDecision: null,
      },
    };

    const app = createApp({
      runs: baseRuns(),
      controlToken: "control-secret",
      catalogPresenceReview: {
        list: async () => [item],
        decide: async ({ eventId: requestedEventId, action }) => ({
          eventId: requestedEventId,
          eventAuditId: "00000000-0000-4000-8000-000000000164",
          status:
            action === "acknowledge"
              ? "acknowledged"
              : action === "resolve"
                ? "resolved"
                : "open",
        }),
      },
    });

    expect((await app.request("/v1/control/catalog/presence-reviews")).status).toBe(401);

    const invalidStatus = await app.request(
      "/v1/control/catalog/presence-reviews?status=unsupported",
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(invalidStatus.status).toBe(400);

    const listed = await app.request(
      "/v1/control/catalog/presence-reviews?status=open&limit=20",
      { headers: { authorization: "Bearer control-secret" } },
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({ items: [item] });

    const decided = await app.request(
      "/v1/control/catalog/presence-reviews/decide",
      {
        method: "POST",
        headers: {
          authorization: "Bearer control-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          providerId,
          eventId,
          action: "acknowledge",
          actor: "test",
          note: "checked first-party evidence",
        }),
      },
    );
    expect(decided.status).toBe(200);
    await expect(decided.json()).resolves.toEqual({
      eventId,
      eventAuditId: "00000000-0000-4000-8000-000000000164",
      status: "acknowledged",
    });
  });
});

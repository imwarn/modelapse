import { describe, expect, it } from "vitest";
import { archiveContextTransitions } from "../src/archive-context-transitions.js";
import type { ArchiveRunView } from "../src/archive-repository.js";

function run(id: string, options: {
  region?: string | null;
  account?: string | null;
  policyId?: string | null;
  caveats?: string[];
} = {}): ArchiveRunView {
  return {
    id,
    status: "completed",
    model: {
      id: "model-1",
      canonicalSlug: "model-test",
      marketingName: "Model Test",
    },
    provider: {
      id: "provider-1",
      slug: "fixture",
      name: "Fixture Provider",
    },
    test: {
      testCaseId: "test-case-1",
      familySlug: "context-fixture",
      familyName: "Context Fixture",
      variantSlug: "benchmark",
      variantName: "Benchmark",
      version: "1.0.0",
      caseSlug: "same-test",
    },
    requestedModel: "model-test",
    returnedModel: "model-test",
    evidenceLevel: "E4",
    executionPath: "first_party_direct",
    executionQualification: {
      selectedAt: "2026-10-08T00:00:00.000Z",
      executionEnvironment: {
        id: "fleet-primary",
        slug: "us-paid",
        capabilityEventId: "capability-v1",
      },
      executionRegion: options.region === undefined ? "US" : options.region,
      accountTier: options.account === undefined ? "paid" : options.account,
      serviceTier: "default",
      requestedServiceTier: "default",
      returnedServiceTier: "default",
      serviceAssurance: "documented_default",
      providerPolicyObservation: options.policyId === null
        ? null
        : {
            id: options.policyId ?? "policy-v1",
            sourceId: "source",
            accessState: "available",
          },
      runnerAccessObservation: {
        id: "runner-v1",
        sourceId: "source",
        accessState: "available",
      },
      caveats: options.caveats ?? [],
      contextKey: "frozen",
    },
    cost: {
      selectedAt: "2026-10-08T00:00:00.000Z",
      pricingObservation: null,
      pricing: null,
      usage: null,
      estimatedNativeCost: null,
      caveats: ["native_cost_unavailable"],
    },
    evaluation: null,
    runnerBuild: "context-fixture",
    createdAt: "2026-10-08T00:00:00.000Z",
    completedAt: "2026-10-08T00:00:01.000Z",
    sealedAt: "2026-10-08T00:00:02.000Z",
  };
}

describe("public Archive longitudinal context transitions", () => {
  it("differentiates identical snapshots from evidence refreshes and execution changes", () => {
    const transitions = archiveContextTransitions([
      run("a"),
      run("b"),
      run("c", { policyId: "policy-v2" }),
      run("d", { policyId: "policy-v2", region: "JP" }),
    ]);
    expect(transitions.map((entry) => entry.status)).toEqual([
      "baseline",
      "unchanged",
      "evidence_changed",
      "changed",
    ]);
    expect(transitions[2]?.changes).toEqual([
      {
        field: "provider_policy_observation",
        previous: "policy-v1",
        current: "policy-v2",
        kind: "evidence",
      },
    ]);
    expect(transitions[3]?.changes).toEqual([
      {
        field: "region",
        previous: "US",
        current: "JP",
        kind: "execution",
      },
    ]);
    expect(transitions[3]?.previousRunId).toBe("c");
  });

  it("preserves unknown provenance and displays historical caveats", () => {
    const [baseline, unknown] = archiveContextTransitions([
      run("a"),
      run("b", {
        region: null,
        account: null,
        policyId: null,
        caveats: ["execution_region_unknown"],
      }),
    ]);
    expect(baseline?.status).toBe("baseline");
    expect(unknown?.status).toBe("unknown");
    expect(unknown?.changes).toEqual([]);
    expect(unknown?.unknownFields).toEqual(
      expect.arrayContaining(["region", "account_tier", "provider_policy_observation"]),
    );
    expect(unknown?.caveats).toEqual(
      expect.arrayContaining(["execution_region_unknown", "native_cost_unavailable"]),
    );
  });

  it("does not invent transitions or infer model degradation from a single Run", () => {
    const transitions = archiveContextTransitions([run("only")]);
    expect(transitions).toMatchObject([{
      runId: "only",
      previousRunId: null,
      status: "baseline",
      changes: [],
    }]);
    expect(archiveContextTransitions([])).toEqual([]);
  });
});

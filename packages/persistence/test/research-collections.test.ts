import { describe, expect, it } from "vitest";
import {
  researchCollectionDigest,
  type ResearchCollectionDetail,
} from "../src/research-collections.js";
import { exportResearchCollection } from "../src/research-export.js";
import type { ArchiveRunView } from "../src/archive-repository.js";

const runId = "00000000-0000-4000-8000-000000000401";
const collectionId = "00000000-0000-4000-8000-000000000402";
const mockRun: ArchiveRunView = {
  id: runId,
  status: "completed",
  provider: { id: "00000000-0000-4000-8000-000000000405", slug: "=HYPERLINK(\"evil\")", name: "Fixture" },
  model: { id: null, canonicalSlug: "test", marketingName: "Test" },
  test: {
    testCaseId: "00000000-0000-4000-8000-000000000403",
    familySlug: "smoke", variantSlug: "text", version: "1.0.0",
    caseSlug: "exact",
  },
  requestedModel: "test",
  returnedModel: "test",
  runnerBuild: "research-export-test",
  createdAt: "2026-10-08T00:00:00.000Z",
  sealedAt: "2026-10-08T00:00:03.000Z",
  completedAt: "2026-10-08T00:00:01.000Z",
  evidenceLevel: "E4",
  evaluation: {
    id: "00000000-0000-4000-8000-000000000406",
    status: "completed", exactMatch: true,
    evaluatorSlug: "exact-text", evaluatorVersion: "1.0.0",
    evaluatorKind: "deterministic", definitionSha256: "a".repeat(64),
    rawResultSha256: null,
  },
  executionPath: "first_party_direct",
  executionQualification: {
    selectedAt: "2026-10-08T00:00:00.000Z",
    executionEnvironment: null,
    requestedServiceTier: "default",
    contextKey: null,
    executionRegion: "US", accountTier: "paid", serviceTier: "default",
    returnedServiceTier: "default", serviceAssurance: "documented_default",
    providerPolicyObservation: {
      id: "00000000-0000-4000-8000-000000000407",
      sourceId: "source-policy", accessState: "available",
    },
    runnerAccessObservation: {
      id: "00000000-0000-4000-8000-000000000408",
      sourceId: "source-runner", accessState: "available",
    },
    caveats: ["operator_uncertain"],
  },
  cost: {
    selectedAt: "2026-10-08T00:00:00.000Z",
    pricingObservation: {
      id: "00000000-0000-4000-8000-000000000409",
      sourceId: "source-price",
    },
    pricing: {
      currency: "USD",
      inputPerMillion: "1.0", outputPerMillion: "2.0", perRequest: null,
    },
    usage: null,
    estimatedNativeCost: "0.001",
    caveats: ["pricing_tier_generic"],
  },
};

function collection(): ResearchCollectionDetail {
  const filters = { providerSlug: "deepseek", evidence: "E4+" as const };
  return {
    id: collectionId,
    title: "Fixture snapshot",
    description: "A bounded historical Run set",
    createdAt: "2026-10-08T00:10:00.000Z",
    createdBy: "test",
    selectionLimit: 50,
    filters,
    runIds: [runId],
    contentSha256: researchCollectionDigest(filters, [runId]),
    runs: [mockRun],
  };
}

describe("research snapshot manifest and exports", () => {
  it("identifies exact filters and ordered Run memberships without clock dependence", () => {
    const a = researchCollectionDigest({ providerSlug: "deepseek", evidence: "E4+" }, [runId]);
    const b = researchCollectionDigest({ evidence: "E4+", providerSlug: "deepseek" }, [runId]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(
      researchCollectionDigest({ providerSlug: "openai", evidence: "E4+" }, [runId]),
    ).not.toBe(a);
    expect(
      researchCollectionDigest({ providerSlug: "deepseek", evidence: "E4+" }, [
        "00000000-0000-4000-8000-000000000404", runId,
      ]),
    ).not.toBe(a);
  });

  it("exports source IDs, unknown-safe caveats and a verifiable manifest", () => {
    const json = exportResearchCollection(collection(), "json");
    expect(json.mediaType).toContain("application/json");
    const output = JSON.parse(json.body) as {
      manifest: { contentSha256: string; runIds: string[] };
      rows: { providerPolicySourceId: string; pricingSourceId: string; qualificationCaveats: string[] }[];
      interpretation: { rankingsProvided: boolean };
    };
    expect(output.manifest.runIds).toEqual([runId]);
    expect(output.manifest.contentSha256).toBe(collection().contentSha256);
    expect(output.rows[0]).toMatchObject({
      providerPolicySourceId: "source-policy",
      pricingSourceId: "source-price",
      qualificationCaveats: ["operator_uncertain"],
    });
    expect(output.interpretation.rankingsProvided).toBe(false);
  });

  it("produces CSV with one record and defangs spreadsheet formula injection", () => {
    const csv = exportResearchCollection(collection(), "csv");
    expect(csv.mediaType).toContain("text/csv");
    expect(csv.body.split("\r\n")).toHaveLength(3);
    expect(csv.body).toContain("\"'=HYPERLINK");
    expect(csv.body).toContain("pricing_tier_generic");
    expect(csv.body).toContain("source-price");
  });

  it("rejects unknown export formats", () => {
    expect(() =>
      exportResearchCollection(collection(), "html" as "json"),
    ).toThrow("invalid_research_export_format");
  });
});

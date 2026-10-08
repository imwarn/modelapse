import type { ArchiveRunView } from "./archive-repository.js";
import type { ResearchCollectionDetail } from "./research-collections.js";

export type ResearchExportFormat = "json" | "csv";

interface ResearchExportRow {
  runId: string;
  runUrl: string;
  modelId: string | null;
  provider: string;
  model: string;
  testCaseId: string;
  test: string;
  completedAt: string | null;
  evidenceLevel: string | null;
  evaluationStatus: string | null;
  exactMatch: boolean | null;
  executionPath: string;
  region: string | null;
  accountTier: string | null;
  effectiveServiceTier: string | null;
  serviceAssurance: string | null;
  providerPolicySourceId: string | null;
  runnerAccessSourceId: string | null;
  pricingSourceId: string | null;
  currency: string | null;
  estimatedNativeCost: string | null;
  qualificationCaveats: readonly string[];
  costCaveats: readonly string[];
}

export function researchExportRow(run: ArchiveRunView): ResearchExportRow {
  return {
    runId: run.id,
    runUrl: "/runs/" + run.id,
    modelId: run.model.id,
    provider: run.provider.slug,
    model: run.model.canonicalSlug ?? run.requestedModel,
    testCaseId: run.test.testCaseId,
    test: [
      run.test.familySlug, run.test.variantSlug,
      run.test.version, run.test.caseSlug,
    ].join("/"),
    completedAt: run.completedAt,
    evidenceLevel: run.evidenceLevel,
    evaluationStatus: run.evaluation?.status ?? null,
    exactMatch: run.evaluation?.exactMatch ?? null,
    executionPath: run.executionPath,
    region: run.executionQualification?.executionRegion ?? null,
    accountTier: run.executionQualification?.accountTier ?? null,
    effectiveServiceTier:
      run.executionQualification?.returnedServiceTier ??
      run.executionQualification?.serviceTier ?? null,
    serviceAssurance: run.executionQualification?.serviceAssurance ?? null,
    providerPolicySourceId:
      run.executionQualification?.providerPolicyObservation?.sourceId ?? null,
    runnerAccessSourceId:
      run.executionQualification?.runnerAccessObservation?.sourceId ?? null,
    pricingSourceId: run.cost?.pricingObservation?.sourceId ?? null,
    currency: run.cost?.pricing?.currency ?? null,
    estimatedNativeCost: run.cost?.estimatedNativeCost ?? null,
    qualificationCaveats: run.executionQualification?.caveats ??
      ["qualification_missing"],
    costCaveats: run.cost?.caveats ?? ["cost_evidence_missing"],
  };
}

const csvKeys = [
  "runId", "runUrl", "modelId", "provider", "model", "testCaseId", "test",
  "completedAt", "evidenceLevel", "evaluationStatus", "exactMatch",
  "executionPath", "region", "accountTier", "effectiveServiceTier",
  "serviceAssurance", "providerPolicySourceId", "runnerAccessSourceId",
  "pricingSourceId", "currency", "estimatedNativeCost",
  "qualificationCaveats", "costCaveats",
] as const satisfies readonly (keyof ResearchExportRow)[];

function csvCell(value: unknown): string {
  const plain = Array.isArray(value)
    ? value.join(";")
    : value === null || value === undefined ? "" : String(value);
  // Spreadsheet applications can evaluate cells starting with these characters.
  // Neutralize potential formula injection without losing the original evidence text.
  const safe = /^[\s]*[=+@\-]/.test(plain) ? "'" + plain : plain;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function exportResearchCollection(
  collection: ResearchCollectionDetail,
  format: ResearchExportFormat,
): { readonly body: string; readonly mediaType: string; readonly filename: string } {
  const filename = "modelapse-research-" + collection.id + "." + format;
  const rows = collection.runs.map(researchExportRow);
  if (format === "json") {
    return {
      filename,
      mediaType: "application/json; charset=utf-8",
      body: JSON.stringify({
        schemaVersion: 1,
        manifest: {
          id: collection.id,
          title: collection.title,
          description: collection.description,
          createdAt: collection.createdAt,
          filters: collection.filters,
          runIds: collection.runIds,
          contentSha256: collection.contentSha256,
          selectionLimit: collection.selectionLimit,
          scope: "sealed_public_non_calibration",
        },
        interpretation: {
          resultOrder: "captured_completed_at_desc_run_id_desc",
          matchedComparability: "not_evaluated",
          calibrationEligibility: "not_evaluated",
          unknownCostIsFree: false,
          rankingsProvided: false,
        },
        rows,
      }, null, 2) + "\n",
    };
  }
  if (format !== "csv") throw new Error("invalid_research_export_format");
  const csv = [
    csvKeys.map(csvCell).join(","),
    ...rows.map((row) =>
      csvKeys.map((key) => csvCell(row[key])).join(","),
    ),
  ].join("\r\n") + "\r\n";
  return {
    filename,
    mediaType: "text/csv; charset=utf-8",
    body: csv,
  };
}

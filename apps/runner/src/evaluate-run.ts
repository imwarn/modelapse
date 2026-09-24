import type { BlobStore } from "@modelapse/blob-store";
import {
  EXACT_TEXT_EVALUATOR,
  evaluateExactText,
} from "@modelapse/evaluation";
import type { NormalizedProviderResponse } from "@modelapse/provider-adapter";
import type {
  EvaluationView,
  PgEvaluationRepository,
} from "@modelapse/persistence";

type EvaluationStore = Pick<
  PgEvaluationRepository,
  "resolveForRun" | "recordExactText"
>;

export async function evaluateCompletedRun(input: {
  readonly runId: string;
  readonly normalized?: NormalizedProviderResponse;
  readonly blobStore: BlobStore;
  readonly evaluations: EvaluationStore;
}): Promise<EvaluationView | null> {
  if (!input.normalized) return null;

  const target = await input.evaluations.resolveForRun(input.runId);
  if (!target) return null;

  if (
    target.evaluatorSlug !== EXACT_TEXT_EVALUATOR.slug ||
    target.evaluatorVersion !== EXACT_TEXT_EVALUATOR.version ||
    target.evaluatorKind !== EXACT_TEXT_EVALUATOR.kind ||
    target.definitionSha256 !== EXACT_TEXT_EVALUATOR.definitionSha256 ||
    target.assertion !== "exact-text"
  ) {
    throw new Error(
      "Runner does not support the Test Version evaluator binding",
    );
  }

  const startedAt = new Date().toISOString();
  const result = evaluateExactText({
    expected: target.expected,
    response: input.normalized,
  });
  const completedAt = new Date().toISOString();

  const rawResultBlob = await input.blobStore.put({
    bytes: JSON.stringify({
      schemaVersion: "1",
      runId: input.runId,
      evaluator: {
        slug: target.evaluatorSlug,
        version: target.evaluatorVersion,
        definitionSha256: target.definitionSha256,
      },
      expected: result.expected,
      actual: result.actual,
      exactMatch: result.exactMatch,
    }),
    mimeType: "application/json",
    visibility: "private",
  });

  return input.evaluations.recordExactText({
    runId: input.runId,
    evaluatorId: target.evaluatorId,
    rawResultBlob,
    expected: result.expected,
    actual: result.actual,
    exactMatch: result.exactMatch,
    startedAt,
    completedAt,
  });
}

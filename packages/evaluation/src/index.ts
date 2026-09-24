import type { NormalizedProviderResponse } from "@modelapse/provider-adapter";

export const EXACT_TEXT_EVALUATOR = {
  slug: "exact-text",
  version: "1.0.0",
  kind: "deterministic" as const,
  definitionSha256:
    "513621b96e389527409b735499aaa3f5c2d0d6bd438ffc752d3060fba066c7b5",
};

export interface ExactTextEvaluation {
  readonly expected: string;
  readonly actual: string;
  readonly exactMatch: boolean;
}

export function normalizedText(
  response: NormalizedProviderResponse,
): string {
  if (response.content.some((part) => part.type !== "text")) {
    throw new Error("exact-text evaluator only supports normalized text output");
  }

  return response.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

export function evaluateExactText(input: {
  readonly expected: string;
  readonly response: NormalizedProviderResponse;
}): ExactTextEvaluation {
  const actual = normalizedText(input.response);
  return {
    expected: input.expected,
    actual,
    exactMatch: actual === input.expected,
  };
}

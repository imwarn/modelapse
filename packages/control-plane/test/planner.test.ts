import { describe, expect, it } from "vitest";
import { parseRunSelectionRequest } from "../src/index.js";

const MODEL_ID = "00000000-0000-4000-8000-000000000010";
const TEST_CASE_ID = "00000000-0000-4000-8000-000000000011";

describe("Run Planner selection contract", () => {
  it("accepts only modelId, testCaseId and limited config", () => {
    expect(
      parseRunSelectionRequest({
        modelId: MODEL_ID,
        testCaseId: TEST_CASE_ID,
        config: {
          maxOutputTokens: 64,
          reasoningEffort: "none",
        },
      }),
    ).toEqual({
      modelId: MODEL_ID,
      testCaseId: TEST_CASE_ID,
      config: {
        maxOutputTokens: 64,
        reasoningEffort: "none",
      },
    });
  });

  it("rejects provider, model strings and endpoint overrides", () => {
    for (const extra of [
      { provider: "deepseek" },
      { model: "deepseek-flash" },
      { endpoint: "https://example.test" },
      { prompt: "override" },
    ]) {
      expect(() =>
        parseRunSelectionRequest({
          modelId: MODEL_ID,
          testCaseId: TEST_CASE_ID,
          ...extra,
        }),
      ).toThrow(/unsupported fields/);
    }
  });
});

import { describe, expect, it } from "vitest";
import { parseDirectOpenAIRunRequest } from "../src/index.js";

const TEST_CASE_ID = "00000000-0000-4000-8000-000000000001";

describe("direct OpenAI Run job", () => {
  it("accepts the narrow control-plane contract", () => {
    expect(
      parseDirectOpenAIRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        config: { maxOutputTokens: 100 },
      }),
    ).toMatchObject({
      provider: "openai",
      testCaseId: TEST_CASE_ID,
      model: "gpt-test",
    });
  });

  it("rejects prompt and endpoint injection", () => {
    expect(() =>
      parseDirectOpenAIRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        prompt: "override",
      }),
    ).toThrow(/unsupported fields/);

    expect(() =>
      parseDirectOpenAIRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        endpoint: "https://example.test",
      }),
    ).toThrow(/unsupported fields/);
  });
});

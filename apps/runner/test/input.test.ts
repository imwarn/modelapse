import { describe, expect, it } from "vitest";
import { parseDirectOpenAIRunRequest } from "../src/direct-openai.js";

const TEST_CASE_ID = "00000000-0000-4000-8000-000000000001";

describe("parseDirectOpenAIRunRequest", () => {
  it("accepts the narrow OpenAI direct job contract", () => {
    expect(
      parseDirectOpenAIRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        config: {
          maxOutputTokens: 1200,
          reasoningEffort: "medium",
        },
      }),
    ).toEqual({
      provider: "openai",
      testCaseId: TEST_CASE_ID,
      model: "gpt-test",
      config: {
        maxOutputTokens: 1200,
        reasoningEffort: "medium",
      },
    });
  });

  it("rejects caller-controlled prompt endpoint and evidence fields", () => {
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
        config: { evidenceLevel: "E4" },
      }),
    ).toThrow(/unsupported fields/);
  });

  it("rejects non-OpenAI providers", () => {
    expect(() =>
      parseDirectOpenAIRunRequest({
        provider: "anthropic",
        testCaseId: TEST_CASE_ID,
        model: "claude-test",
      }),
    ).toThrow(/provider/);
  });
});

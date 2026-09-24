import { describe, expect, it } from "vitest";
import {
  parseDirectDeepSeekRunRequest,
  parseDirectOpenAIRunRequest,
  parseDirectProviderRunRequest,
} from "../src/index.js";

const TEST_CASE_ID = "00000000-0000-4000-8000-000000000001";

describe("direct provider Run job", () => {
  it("accepts OpenAI and DeepSeek through the shared contract", () => {
    expect(
      parseDirectProviderRunRequest({
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

    expect(
      parseDirectDeepSeekRunRequest({
        provider: "deepseek",
        testCaseId: TEST_CASE_ID,
        model: "deepseek-flash",
        config: { reasoningEffort: "none" },
      }),
    ).toMatchObject({
      provider: "deepseek",
      testCaseId: TEST_CASE_ID,
      model: "deepseek-flash",
    });
  });

  it("keeps provider-specific parsers strict", () => {
    expect(() =>
      parseDirectOpenAIRunRequest({
        provider: "deepseek",
        testCaseId: TEST_CASE_ID,
        model: "deepseek-flash",
      }),
    ).toThrow(/openai/);

    expect(() =>
      parseDirectDeepSeekRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
      }),
    ).toThrow(/deepseek/);
  });

  it("rejects prompt and endpoint injection", () => {
    expect(() =>
      parseDirectProviderRunRequest({
        provider: "deepseek",
        testCaseId: TEST_CASE_ID,
        model: "deepseek-flash",
        prompt: "override",
      }),
    ).toThrow(/unsupported fields/);

    expect(() =>
      parseDirectProviderRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        endpoint: "https://example.test",
      }),
    ).toThrow(/unsupported fields/);
  });
});

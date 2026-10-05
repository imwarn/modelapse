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

  it("preserves the planner-owned qualification envelope", () => {
    const providerPolicyObservationId =
      "00000000-0000-4000-8000-000000000021";
    const runnerAccessObservationId =
      "00000000-0000-4000-8000-000000000022";

    expect(
      parseDirectProviderRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        qualification: {
          selectedAt: "2026-10-05T00:00:00.000Z",
          providerPolicyObservationId,
          runnerAccessObservationId,
          accountTier: "paid",
          serviceTier: "default",
          requestedServiceTier: "priority",
          serviceAssurance: "documented_default",
          caveats: ["provider_access_restricted"],
        },
      }),
    ).toMatchObject({
      qualification: {
        providerPolicyObservationId,
        runnerAccessObservationId,
        accountTier: "paid",
        serviceTier: "default",
        requestedServiceTier: "priority",
        serviceAssurance: "documented_default",
        caveats: ["provider_access_restricted"],
      },
    });
  });

  it("preserves the planner-owned cost envelope", () => {
    const pricingObservationId =
      "00000000-0000-4000-8000-000000000023";

    expect(
      parseDirectProviderRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        cost: {
          selectedAt: "2026-10-05T00:00:00.000Z",
          pricingObservationId,
          currency: "USD",
          inputPricePerMillion: "1.250000",
          outputPricePerMillion: "5.000000",
          perRequest: "0.010000",
          caveats: ["pricing_service_tier_generic"],
        },
      }),
    ).toMatchObject({
      cost: {
        pricingObservationId,
        currency: "USD",
        inputPricePerMillion: "1.250000",
        outputPricePerMillion: "5.000000",
        perRequest: "0.010000",
        caveats: ["pricing_service_tier_generic"],
      },
    });

    expect(() =>
      parseDirectProviderRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        cost: {
          selectedAt: "2026-10-05T00:00:00.000Z",
          currency: "USD",
          inputPricePerMillion: "not-a-price",
          caveats: [],
        },
      }),
    ).toThrow(/decimal string/);
  });

  it("preserves the planner-owned fleet target", () => {
    const environmentId =
      "00000000-0000-4000-8000-000000000024";
    const capabilityEventId =
      "00000000-0000-4000-8000-000000000025";

    expect(
      parseDirectProviderRunRequest({
        provider: "openai",
        testCaseId: TEST_CASE_ID,
        model: "gpt-test",
        fleet: {
          selectedAt: "2026-10-06T00:00:00.000Z",
          environmentId,
          environmentSlug: "us-paid",
          region: "US",
          accountTier: "paid-standard",
          serviceTier: "default",
          serviceAssurance: "documented_default",
          capabilityEventId,
          caveats: [],
        },
      }),
    ).toMatchObject({
      fleet: {
        environmentId,
        environmentSlug: "us-paid",
        region: "US",
        accountTier: "paid-standard",
        serviceTier: "default",
        serviceAssurance: "documented_default",
        capabilityEventId,
      },
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

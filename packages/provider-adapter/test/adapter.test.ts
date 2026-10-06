import { describe, expect, it } from "vitest";
import { assertPreparedRequestAllowed } from "../src/index.js";

const descriptor = {
  id: "openai-direct",
  providerSlug: "openai",
  executionPath: "first_party_direct" as const,
  allowedHosts: ["api.openai.com"],
  capabilities: {
    returned_model_metadata: "supported",
    model_version_metadata: "unsupported",
    provider_request_id: "supported",
    provider_response_id: "supported",
    service_tier_metadata: "supported",
    token_usage: "supported",
  },
};

describe("provider endpoint policy", () => {
  it("allows an exact official host", () => {
    expect(() =>
      assertPreparedRequestAllowed(descriptor, {
        url: "https://api.openai.com/v1/responses",
        method: "POST",
        headers: {},
        capture: { responseHeaderAllowlist: ["x-request-id"] },
      }),
    ).not.toThrow();
  });

  it("rejects a routed or lookalike host", () => {
    expect(() =>
      assertPreparedRequestAllowed(descriptor, {
        url: "https://api.openai.com.evil.example/v1/responses",
        method: "POST",
        headers: {},
        capture: { responseHeaderAllowlist: [] },
      }),
    ).toThrow(/disallowed host/);
  });
});

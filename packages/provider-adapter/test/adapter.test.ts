import { describe, expect, it } from "vitest";
import { assertPreparedRequestAllowed } from "../src/index.js";

const descriptor = {
  id: "openai-direct",
  providerSlug: "openai",
  executionPath: "first_party_direct" as const,
  allowedHosts: ["api.openai.com"],
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

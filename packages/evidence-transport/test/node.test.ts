import { describe, expect, it } from "vitest";
import {
  EnvironmentCredentialResolver,
  NodeEvidenceTransport,
} from "../src/index.js";

describe("NodeEvidenceTransport", () => {
  it("injects but redacts bearer credentials", async () => {
    let seenAuthorization = "";
    const transport = new NodeEvidenceTransport({
      fetch: async (_url, init) => {
        const headers = new Headers(init?.headers);
        seenAuthorization = headers.get("authorization") ?? "";
        return new Response('{"ok":true}', {
          status: 200,
          headers: { "x-request-id": "req_test", "set-cookie": "secret=1" },
        });
      },
    });

    const capture = await transport.execute({
      descriptor: {
        id: "test",
        providerSlug: "example",
        executionPath: "first_party_direct",
        allowedHosts: ["api.example.com"],
      },
      request: {
        url: "https://api.example.com/v1/test",
        method: "POST",
        headers: { "content-type": "application/json" },
        auth: { kind: "bearer", credentialName: "TEST_KEY" },
        body: "{}",
        capture: { responseHeaderAllowlist: ["x-request-id"] },
      },
      credentials: new EnvironmentCredentialResolver({ TEST_KEY: "top-secret" }),
    });

    expect(seenAuthorization).toBe("Bearer top-secret");
    expect(capture.requestHeaders.authorization).toBe("[REDACTED]");
    expect(capture.responseHeaders["x-request-id"]).toBe("req_test");
    expect(capture.responseHeaders["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(capture)).not.toContain("top-secret");
  });
});

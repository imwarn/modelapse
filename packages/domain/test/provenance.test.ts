import { describe, expect, it } from "vitest";
import { evidenceRank, isEvidenceCompatible } from "../src/index.js";

describe("provenance rules", () => {
  it("keeps community claims below verified runner levels", () => {
    expect(isEvidenceCompatible("community_claimed", "E2")).toBe(true);
    expect(isEvidenceCompatible("community_claimed", "E3")).toBe(false);
  });

  it("reserves E4 for controlled first-party direct runs", () => {
    expect(isEvidenceCompatible("first_party_direct", "E4")).toBe(true);
    expect(isEvidenceCompatible("routed_provider", "E4")).toBe(false);
  });

  it("orders evidence monotonically", () => {
    expect(evidenceRank("E5")).toBeGreaterThan(evidenceRank("E0"));
  });
});

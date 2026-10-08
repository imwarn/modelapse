import { describe, expect, it } from "vitest";
import {
  decodeArchiveResearchCursor,
  encodeArchiveResearchCursor,
  validateArchiveResearchFilters,
} from "../src/archive-research.js";

const runId = "00000000-0000-4000-8000-000000000123";
const completedAt = "2026-10-08T00:00:01.000Z";

describe("Archive Research cursor and filter contract", () => {
  it("encodes and decodes a stable two-component keyset cursor", () => {
    const cursor = encodeArchiveResearchCursor({ runId, completedAt });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeArchiveResearchCursor(cursor)).toEqual({ runId, completedAt });
    expect(
      validateArchiveResearchFilters({
        providerSlug: "deepseek",
        modelId: runId,
        evidence: "E4+",
        cost: "unknown",
        region: "US",
        accountTier: "paid-standard",
        serviceTier: "default",
        cursor,
        limit: 5,
      }),
    ).toMatchObject({
      evidence: "E4+",
      cost: "unknown",
      limit: 5,
    });
  });

  it("rejects malformed, oversized, noncanonical and untrusted cursors", () => {
    for (const candidate of [
      "",
      "not_base64!",
      "a".repeat(257),
      Buffer.from("{}").toString("base64url"),
      Buffer.from(JSON.stringify({
        runId,
        completedAt: "2026-10-08T00:00:01Z",
      })).toString("base64url"),
      Buffer.from(JSON.stringify({
        runId,
        completedAt,
        injection: "anything",
      })).toString("base64url"),
      Buffer.from(JSON.stringify({
        runId: "not-a-uuid",
        completedAt,
      })).toString("base64url"),
    ]) {
      expect(() => decodeArchiveResearchCursor(candidate)).toThrow(
        "invalid_research_cursor",
      );
    }
  });

  it("bounds page size and validates all exposed evidence/context filters", () => {
    expect(validateArchiveResearchFilters({})).toMatchObject({
      evidence: "any",
      cost: "any",
      limit: 20,
    });
    for (const input of [
      { limit: 0 },
      { limit: 51 },
      { limit: 1.5 },
      { evidence: "E6" as "E4+" },
      { cost: "free" as "any" },
      { region: "' OR true --" },
      { accountTier: "x".repeat(65) },
      { providerSlug: "../deepseek" },
      { modelId: "wrong" },
    ]) {
      expect(() => validateArchiveResearchFilters(input)).toThrow(/invalid_/);
    }
  });
});

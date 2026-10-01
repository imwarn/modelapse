import { describe, expect, it } from "vitest";
import { parseOpenAICompatibleModelList } from "../src/catalog-observer.js";

describe("catalog observer model-list parser", () => {
  it("normalizes and deduplicates OpenAI-compatible model lists", () => {
    expect(
      parseOpenAICompatibleModelList({
        object: "list",
        data: [
          { id: " model-b ", version: "2026-10-01" },
          { id: "model-a", provider_snapshot_id: "snap-a" },
          { id: "model-b", version: "2026-10-02" },
          { nope: true },
        ],
      }),
    ).toEqual([
      { id: "model-a", providerSnapshotId: "snap-a" },
      { id: "model-b", providerSnapshotId: "2026-10-02" },
    ]);
  });

  it("rejects payloads without a data array", () => {
    expect(() => parseOpenAICompatibleModelList({ models: [] })).toThrow(
      /data array/,
    );
  });
});

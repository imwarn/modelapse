import { describe, expect, it } from "vitest";
import {
  getCatalogSourceAdapter,
  parseOpenAICompatibleModelList,
} from "../src/catalog-adapter.js";

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


  it("uses the adapter contract for request headers and snapshot-only sources", () => {
    const models = getCatalogSourceAdapter("openai_models");
    expect(
      models.requestHeaders({
        sourceKind: "model_list",
        credential: "secret",
        collectorBuild: "build-123",
      }),
    ).toMatchObject({
      accept: "application/json",
      authorization: "Bearer secret",
    });

    const docs = getCatalogSourceAdapter("snapshot_only");
    expect(
      docs.parseModelList("<html>first-party docs</html>"),
    ).toBeNull();
  });

  it("rejects payloads without a data array", () => {
    expect(() => parseOpenAICompatibleModelList({ models: [] })).toThrow(
      /data array/,
    );
  });
});

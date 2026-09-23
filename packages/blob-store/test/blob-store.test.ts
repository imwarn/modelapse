import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileSystemContentAddressedBlobStore,
  contentAddressedObjectKey,
} from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FileSystemContentAddressedBlobStore", () => {
  it("stores identical bytes at the same SHA-256 object key", async () => {
    const root = await mkdtemp(join(tmpdir(), "modelapse-blobs-"));
    roots.push(root);
    const store = new FileSystemContentAddressedBlobStore(root);

    const first = await store.put({
      bytes: "hello modelapse",
      mimeType: "text/plain",
    });
    const second = await store.put({
      bytes: "hello modelapse",
      mimeType: "text/plain",
    });

    expect(second.sha256).toBe(first.sha256);
    expect(second.objectKey).toBe(first.objectKey);
    expect(first.objectKey).toBe(contentAddressedObjectKey(first.sha256));
    expect(await store.get(first.sha256)).toEqual(Buffer.from("hello modelapse"));
    expect(await store.exists(first.sha256)).toBe(true);
  });

  it("separates different byte content", async () => {
    const root = await mkdtemp(join(tmpdir(), "modelapse-blobs-"));
    roots.push(root);
    const store = new FileSystemContentAddressedBlobStore(root);

    const a = await store.put({ bytes: "a", mimeType: "text/plain" });
    const b = await store.put({ bytes: "b", mimeType: "text/plain" });

    expect(a.sha256).not.toBe(b.sha256);
    expect(a.objectKey).not.toBe(b.objectKey);
  });
});

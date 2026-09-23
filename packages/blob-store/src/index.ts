import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type BlobVisibility = "public" | "private";

export interface PutBlobInput {
  readonly bytes: Uint8Array | string;
  readonly mimeType: string;
  readonly visibility?: BlobVisibility;
}

export interface BlobDescriptor {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly visibility: BlobVisibility;
}

export interface BlobStore {
  put(input: PutBlobInput): Promise<BlobDescriptor>;
  get(sha256: string): Promise<Buffer>;
  exists(sha256: string): Promise<boolean>;
}

const SHA256_RE = /^[0-9a-f]{64}$/;

export function normalizeSha256(value: string): string {
  const normalized = value.startsWith("sha256:")
    ? value.slice("sha256:".length)
    : value;
  const lower = normalized.toLowerCase();
  if (!SHA256_RE.test(lower)) {
    throw new Error("Invalid SHA-256 digest: " + value);
  }
  return lower;
}

export function contentAddressedObjectKey(sha256: string): string {
  const digest = normalizeSha256(sha256);
  return "sha256/" + digest.slice(0, 2) + "/" + digest.slice(2, 4) + "/" + digest;
}

function toBuffer(value: Uint8Array | string): Buffer {
  return typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
}

export class FileSystemContentAddressedBlobStore implements BlobStore {
  constructor(private readonly rootDir: string) {}

  async put(input: PutBlobInput): Promise<BlobDescriptor> {
    const bytes = toBuffer(input.bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectKey = contentAddressedObjectKey(sha256);
    const target = join(this.rootDir, ...objectKey.split("/"));
    const targetDir = dirname(target);

    await mkdir(targetDir, { recursive: true });

    const temp = target + ".tmp-" + process.pid + "-" + randomUUID();
    await writeFile(temp, bytes, { flag: "wx" });
    try {
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }

    const stored = await stat(target);
    if (stored.size !== bytes.byteLength) {
      throw new Error("Stored blob size mismatch for " + sha256);
    }

    return {
      sha256,
      sizeBytes: bytes.byteLength,
      mimeType: input.mimeType,
      objectKey,
      visibility: input.visibility ?? "private",
    };
  }

  async get(sha256: string): Promise<Buffer> {
    const objectKey = contentAddressedObjectKey(sha256);
    return readFile(join(this.rootDir, ...objectKey.split("/")));
  }

  async exists(sha256: string): Promise<boolean> {
    const objectKey = contentAddressedObjectKey(sha256);
    try {
      await stat(join(this.rootDir, ...objectKey.split("/")));
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return false;
      }
      throw error;
    }
  }
}

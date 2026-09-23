import { readFile } from "node:fs/promises";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import {
  EnvironmentCredentialResolver,
  NodeEvidenceTransport,
} from "@modelapse/evidence-transport";
import { PgRunRepository } from "@modelapse/persistence";
import {
  parseDirectOpenAIRunRequest,
  runDirectOpenAI,
} from "./direct-openai.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

async function privateKeyPem(): Promise<string> {
  const file = process.env.MODELAPSE_ATTESTATION_PRIVATE_KEY_FILE;
  if (file) return readFile(file, "utf8");

  const inline = process.env.MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM;
  if (inline) return inline.replace(/\\n/g, "\n");

  throw new Error(
    "Set MODELAPSE_ATTESTATION_PRIVATE_KEY_FILE or MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM",
  );
}

async function stdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const value = Buffer.concat(chunks).toString("utf8").trim();
  if (!value) throw new Error("Expected one JSON job payload on stdin");
  return value;
}

function timeoutMs(): number {
  const raw = process.env.MODELAPSE_PROVIDER_TIMEOUT_MS;
  if (!raw) return 120_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("MODELAPSE_PROVIDER_TIMEOUT_MS must be a positive integer");
  }
  return value;
}

const databaseUrl = requiredEnv("DATABASE_URL");
const blobRoot = requiredEnv("MODELAPSE_BLOB_ROOT");
const runnerBuild = requiredEnv("MODELAPSE_BUILD");
const keyId = requiredEnv("MODELAPSE_ATTESTATION_KEY_ID");

const repository = PgRunRepository.connect(databaseUrl, { max: 2 });

try {
  const request = parseDirectOpenAIRunRequest(JSON.parse(await stdinText()));
  const credentials = new EnvironmentCredentialResolver();

  const result = await runDirectOpenAI(request, {
    repository,
    blobStore: new FileSystemContentAddressedBlobStore(blobRoot),
    transport: new NodeEvidenceTransport({ timeoutMs: timeoutMs() }),
    credentials,
    signer: {
      keyId,
      privateKey: await privateKeyPem(),
    },
    runnerBuild,
    collector:
      process.env.MODELAPSE_EVIDENCE_COLLECTOR ??
      "modelapse-runner/openai-direct",
  });

  process.stdout.write(
    JSON.stringify(
      {
        runId: result.run.id,
        status: result.run.status,
        executionPath: result.run.executionPath,
        requestedModel: result.run.requestedModel,
        returnedModel: result.run.returnedModel,
        requestSha256: result.sealed.requestSha256,
        responseSha256: result.sealed.responseSha256,
        sealedAt: result.run.sealedAt,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await repository.close();
}

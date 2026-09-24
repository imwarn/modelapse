import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import {
  parseDirectProviderRunRequest,
  PgRunJobQueue,
} from "@modelapse/control-plane";
import {
  EnvironmentCredentialResolver,
  NodeEvidenceTransport,
} from "@modelapse/evidence-transport";
import { PgRunRepository } from "@modelapse/persistence";
import { runDirectDeepSeek } from "./direct-deepseek.js";
import { runDirectOpenAI } from "./direct-openai.js";
import { processOneQueuedRunJob } from "./queue-worker.js";

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

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(name + " must be a positive integer");
  }
  return value;
}

function summary(result: Awaited<ReturnType<typeof runDirectOpenAI>>) {
  return {
    runId: result.run.id,
    status: result.run.status,
    executionPath: result.run.executionPath,
    requestedModel: result.run.requestedModel,
    returnedModel: result.run.returnedModel,
    requestSha256: result.sealed.requestSha256,
    responseSha256: result.sealed.responseSha256,
    sealedAt: result.run.sealedAt,
  };
}

const databaseUrl = requiredEnv("DATABASE_URL");
const blobRoot = requiredEnv("MODELAPSE_BLOB_ROOT");
const runnerBuild = requiredEnv("MODELAPSE_BUILD");
const keyId = requiredEnv("MODELAPSE_ATTESTATION_KEY_ID");
const providerTimeoutMs = positiveIntegerEnv(
  "MODELAPSE_PROVIDER_TIMEOUT_MS",
  120_000,
);
const privateKey = await privateKeyPem();
const repository = PgRunRepository.connect(databaseUrl, { max: 2 });
const blobStore = new FileSystemContentAddressedBlobStore(blobRoot);
const credentials = new EnvironmentCredentialResolver();
const transport = new NodeEvidenceTransport({ timeoutMs: providerTimeoutMs });
const collector = process.env.MODELAPSE_EVIDENCE_COLLECTOR;

async function runStdinMode(): Promise<void> {
  const request = parseDirectProviderRunRequest(JSON.parse(await stdinText()));
  const deps = {
    repository,
    blobStore,
    transport,
    credentials,
    signer: { keyId, privateKey },
    runnerBuild,
    ...(collector ? { collector } : {}),
  };

  const result =
    request.provider === "openai"
      ? await runDirectOpenAI(request, deps)
      : await runDirectDeepSeek(request, deps);

  process.stdout.write(JSON.stringify(summary(result), null, 2) + "\n");
}

async function runQueueMode(): Promise<void> {
  const queue = PgRunJobQueue.connect(databaseUrl, { max: 2 });
  const workerId =
    process.env.MODELAPSE_WORKER_ID ??
    hostname() + "-" + process.pid + "-" + randomUUID().slice(0, 8);
  const leaseSeconds = positiveIntegerEnv("MODELAPSE_JOB_LEASE_SECONDS", 300);
  const pollMs = positiveIntegerEnv("MODELAPSE_JOB_POLL_MS", 1000);
  const minimumLeaseSeconds = Math.ceil(providerTimeoutMs / 1000) + 30;

  if (leaseSeconds < minimumLeaseSeconds) {
    await queue.close();
    throw new Error(
      "MODELAPSE_JOB_LEASE_SECONDS must be at least provider timeout + 30 seconds",
    );
  }

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  try {
    while (!stopping) {
      const job = await processOneQueuedRunJob({
        queue,
        repository,
        blobStore,
        transport,
        credentials,
        signer: { keyId, privateKey },
        runnerBuild,
        workerId,
        leaseSeconds,
        ...(collector ? { collector } : {}),
      });

      if (job) {
        const line = JSON.stringify({
          jobId: job.id,
          status: job.status,
          runId: job.runId,
          attempts: job.attempts,
        });
        if (job.status === "failed") {
          process.stderr.write(line + "\n");
        } else {
          process.stdout.write(line + "\n");
        }
        continue;
      }

      await sleep(pollMs);
    }
  } finally {
    await queue.close();
  }
}

try {
  const mode = process.env.MODELAPSE_RUNNER_MODE ?? "stdin";
  if (mode === "stdin") {
    await runStdinMode();
  } else if (mode === "queue") {
    await runQueueMode();
  } else {
    throw new Error('MODELAPSE_RUNNER_MODE must be "stdin" or "queue"');
  }
} finally {
  await repository.close();
}

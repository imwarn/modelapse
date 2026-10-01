import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { PgCatalogAdmin } from "./catalog.js";
import {
  PgCatalogDiscovery,
  type CatalogDiscoveryStatus,
  type CatalogReconciliationAction,
} from "./catalog-discovery.js";
import { PgCatalogObserver } from "./catalog-observer.js";
import { PgModelCatalogAdmin } from "./model-catalog.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

const command = process.argv[2];
if (
  command !== "bootstrap-openai-smoke" &&
  command !== "bootstrap-deepseek-smoke" &&
  command !== "bootstrap-deepseek-flash-model" &&
  command !== "observe-first-party-identity" &&
  command !== "collect-first-party-catalog" &&
  command !== "list-catalog-discoveries" &&
  command !== "reconcile-catalog-candidate"
) {
  throw new Error(
    "Usage: catalog-admin bootstrap-openai-smoke|bootstrap-deepseek-smoke|bootstrap-deepseek-flash-model|observe-first-party-identity|collect-first-party-catalog|list-catalog-discoveries|reconcile-catalog-candidate",
  );
}

if (command === "list-catalog-discoveries") {
  const discovery = PgCatalogDiscovery.connect(requiredEnv("DATABASE_URL"));
  try {
    const providerSlug =
      process.env.MODELAPSE_PROVIDER_SLUG?.trim() || undefined;
    const status =
      process.env.MODELAPSE_CATALOG_DISCOVERY_STATUS?.trim() as
        | CatalogDiscoveryStatus
        | undefined;
    const result = await discovery.listCandidates({
      ...(providerSlug ? { providerSlug } : {}),
      ...(status ? { status } : {}),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await discovery.close();
  }
} else if (command === "reconcile-catalog-candidate") {
  const discovery = PgCatalogDiscovery.connect(requiredEnv("DATABASE_URL"));
  try {
    const resolvedModelId =
      process.env.MODELAPSE_RESOLVED_MODEL_ID?.trim() || undefined;
    const note =
      process.env.MODELAPSE_RECONCILIATION_NOTE?.trim() || undefined;
    const result = await discovery.reconcileCandidate({
      candidateId: requiredEnv("MODELAPSE_CATALOG_CANDIDATE_ID"),
      action: requiredEnv("MODELAPSE_RECONCILIATION_ACTION") as CatalogReconciliationAction,
      actor: requiredEnv("MODELAPSE_RECONCILIATION_ACTOR"),
      ...(resolvedModelId ? { resolvedModelId } : {}),
      ...(note ? { note } : {}),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await discovery.close();
  }
} else if (command === "collect-first-party-catalog") {
  const observer = PgCatalogObserver.connect(requiredEnv("DATABASE_URL"));
  try {
    const providerSlug =
      process.env.MODELAPSE_PROVIDER_SLUG?.trim() || undefined;
    const sourceKey =
      process.env.MODELAPSE_CATALOG_SOURCE_KEY?.trim() || undefined;
    const result = await observer.collectDue({
      collectorBuild:
        process.env.MODELAPSE_BUILD?.trim() || "catalog-admin",
      force: process.env.MODELAPSE_COLLECT_FORCE === "true",
      ...(providerSlug ? { providerSlug } : {}),
      ...(sourceKey ? { sourceKey } : {}),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await observer.close();
  }
} else if (command === "observe-first-party-identity") {
  const models = PgModelCatalogAdmin.connect(requiredEnv("DATABASE_URL"));
  try {
    const providerSnapshotId =
      process.env.MODELAPSE_PROVIDER_SNAPSHOT_ID?.trim() || undefined;
    const contentSha256 =
      process.env.MODELAPSE_SOURCE_CONTENT_SHA256?.trim() || undefined;
    const observedAt = process.env.MODELAPSE_OBSERVED_AT?.trim() || undefined;

    const result = await models.observeFirstPartyIdentity({
      providerSlug: requiredEnv("MODELAPSE_PROVIDER_SLUG"),
      canonicalSlug: requiredEnv("MODELAPSE_CANONICAL_MODEL_SLUG"),
      apiModelId: requiredEnv("MODELAPSE_API_MODEL_ID"),
      sourceUrl: requiredEnv("MODELAPSE_SOURCE_URL"),
      sourceTitle: requiredEnv("MODELAPSE_SOURCE_TITLE"),
      ...(providerSnapshotId ? { providerSnapshotId } : {}),
      ...(contentSha256 ? { contentSha256 } : {}),
      ...(observedAt ? { observedAt } : {}),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await models.close();
  }
} else if (command === "bootstrap-deepseek-flash-model") {
  const models = PgModelCatalogAdmin.connect(requiredEnv("DATABASE_URL"));
  try {
    const result = await models.bootstrapDeepSeekFlash();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await models.close();
  }
} else {
  const admin = PgCatalogAdmin.connect(
    requiredEnv("DATABASE_URL"),
    new FileSystemContentAddressedBlobStore(
      requiredEnv("MODELAPSE_BLOB_ROOT"),
    ),
  );

  try {
    const input = { runnerBuild: requiredEnv("MODELAPSE_BUILD") };
    const result =
      command === "bootstrap-openai-smoke"
        ? await admin.bootstrapOpenAISmoke(input)
        : await admin.bootstrapDeepSeekSmoke(input);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await admin.close();
  }
}

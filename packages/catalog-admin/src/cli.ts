import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { PgCatalogAdmin } from "./catalog.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

const command = process.argv[2];
if (
  command !== "bootstrap-openai-smoke" &&
  command !== "bootstrap-deepseek-smoke"
) {
  throw new Error(
    "Usage: catalog-admin bootstrap-openai-smoke|bootstrap-deepseek-smoke",
  );
}

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

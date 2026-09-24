import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { PgCatalogAdmin } from "./catalog.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

const command = process.argv[2];
if (command !== "bootstrap-openai-smoke") {
  throw new Error(
    'Usage: catalog-admin bootstrap-openai-smoke',
  );
}

const admin = PgCatalogAdmin.connect(
  requiredEnv("DATABASE_URL"),
  new FileSystemContentAddressedBlobStore(
    requiredEnv("MODELAPSE_BLOB_ROOT"),
  ),
);

try {
  const result = await admin.bootstrapOpenAISmoke({
    runnerBuild: requiredEnv("MODELAPSE_BUILD"),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} finally {
  await admin.close();
}

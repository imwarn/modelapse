import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { PgCatalogAdmin } from "./catalog.js";
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
  command !== "bootstrap-deepseek-flash-model"
) {
  throw new Error(
    "Usage: catalog-admin bootstrap-openai-smoke|bootstrap-deepseek-smoke|bootstrap-deepseek-flash-model",
  );
}

if (command === "bootstrap-deepseek-flash-model") {
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

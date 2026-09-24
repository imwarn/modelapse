import { fileURLToPath } from "node:url";
import { migrateDatabase } from "./migrate.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

const migrationsDirectory =
  process.env.MODELAPSE_MIGRATIONS_DIR ??
  fileURLToPath(new URL("../../migrations/", import.meta.url));

const result = await migrateDatabase({
  connectionString: requiredEnv("DATABASE_URL"),
  migrationsDirectory,
  runnerBuild: process.env.MODELAPSE_BUILD ?? "dev",
});

process.stdout.write(
  JSON.stringify({
    applied: result.migrations
      .filter((migration) => migration.applied)
      .map((migration) => migration.name),
    skipped: result.migrations
      .filter((migration) => !migration.applied)
      .map((migration) => migration.name),
  }) + "\n",
);

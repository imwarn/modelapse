import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

export interface AppliedMigration {
  readonly name: string;
  readonly sha256: string;
  readonly applied: boolean;
}

export interface MigrationRunResult {
  readonly migrations: readonly AppliedMigration[];
}

const OUTER_TRANSACTION =
  /^\s*BEGIN;\s*([\s\S]*?)\s*COMMIT;\s*$/i;

export function extractMigrationBody(sql: string): string {
  const match = OUTER_TRANSACTION.exec(sql);
  if (!match?.[1]) {
    throw new Error(
      "Migration files must be wrapped by exactly one outer BEGIN; ... COMMIT;",
    );
  }
  return match[1].trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function migrationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d{4}_.+\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function migrateDatabase(input: {
  readonly connectionString: string;
  readonly migrationsDirectory: string;
  readonly runnerBuild: string;
}): Promise<MigrationRunResult> {
  const client = new Client({ connectionString: input.connectionString });
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('modelapse:migrations'))");

    await client.query(`
      CREATE SCHEMA IF NOT EXISTS modelapse;

      CREATE TABLE IF NOT EXISTS modelapse.schema_migrations (
        name text PRIMARY KEY,
        sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        runner_build text NOT NULL
      );
    `);

    const results: AppliedMigration[] = [];

    for (const name of await migrationFiles(input.migrationsDirectory)) {
      const raw = await readFile(join(input.migrationsDirectory, name), "utf8");
      const digest = sha256(raw);

      const existing = await client.query<{ sha256: string }>(
        `SELECT sha256
           FROM modelapse.schema_migrations
          WHERE name = $1`,
        [name],
      );

      if (existing.rows[0]) {
        if (existing.rows[0].sha256 !== digest) {
          throw new Error(
            "Applied migration checksum mismatch for " +
              name +
              ": historical migrations are immutable",
          );
        }

        results.push({ name, sha256: digest, applied: false });
        continue;
      }

      const body = extractMigrationBody(raw);

      await client.query("BEGIN");
      try {
        await client.query(body);
        await client.query(
          `INSERT INTO modelapse.schema_migrations
             (name, sha256, runner_build)
           VALUES ($1, $2, $3)`,
          [name, digest, input.runnerBuild],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      results.push({ name, sha256: digest, applied: true });
    }

    return { migrations: results };
  } finally {
    try {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('modelapse:migrations'))",
      );
    } catch {
      // Closing the PostgreSQL session releases the advisory lock as well.
    }
    await client.end();
  }
}

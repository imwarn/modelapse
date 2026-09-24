import { describe, expect, it } from "vitest";
import { extractMigrationBody } from "../src/migrate.js";

describe("migration envelope", () => {
  it("extracts the body from the required outer transaction", () => {
    expect(
      extractMigrationBody(\`
        BEGIN;

        CREATE TABLE example (id integer);

        COMMIT;
      \`),
    ).toContain("CREATE TABLE example");
  });

  it("rejects unwrapped migrations", () => {
    expect(() =>
      extractMigrationBody("CREATE TABLE example (id integer);"),
    ).toThrow(/wrapped/);
  });
});

import { canonicalJson, sha256 } from "./canonical.js";
import { TestPackSchema, type TestPack, type TestPackCase } from "./schema.js";

export interface CompiledTestPack {
  readonly pack: TestPack;
  readonly definitionHash: string;
  readonly publicCases: readonly TestPackCase[];
  readonly privateCases: readonly TestPackCase[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function defineTestPack(input: unknown): TestPack {
  return deepFreeze(TestPackSchema.parse(input));
}

export function compileTestPack(input: unknown): CompiledTestPack {
  const pack = defineTestPack(input);
  const definitionHash = sha256(canonicalJson(pack));
  const publicCases = pack.spec.cases.filter((c) => c.visibility === "public");
  const privateCases = pack.spec.cases.filter((c) => c.visibility === "private");

  return deepFreeze({
    pack,
    definitionHash,
    publicCases,
    privateCases,
  });
}

export function toPublicTestPack(pack: TestPack): TestPack {
  return deepFreeze({
    ...pack,
    spec: {
      ...pack.spec,
      cases: pack.spec.cases.filter((c) => c.visibility === "public"),
    },
  });
}

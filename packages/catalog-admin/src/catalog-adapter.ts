export type CatalogObserverSourceKind = "model_list" | "docs";
export type CatalogObserverParser = "openai_models" | "snapshot_only";

export interface ObservedRemoteModel {
  readonly id: string;
  readonly providerSnapshotId: string | null;
}

export interface CatalogSourceAdapter {
  readonly parser: CatalogObserverParser;
  requestHeaders(input: {
    readonly sourceKind: CatalogObserverSourceKind;
    readonly credential: string | undefined;
    readonly collectorBuild: string;
  }): Readonly<Record<string, string>>;
  parseModelList(body: string): readonly ObservedRemoteModel[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalSnapshotId(value: Record<string, unknown>): string | null {
  for (const key of [
    "provider_snapshot_id",
    "providerSnapshotId",
    "snapshot",
    "version",
    "model_version",
  ]) {
    const raw = value[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

export function parseOpenAICompatibleModelList(
  input: unknown,
): readonly ObservedRemoteModel[] {
  if (!isRecord(input) || !Array.isArray(input.data)) {
    throw new Error("Model-list payload must contain a data array");
  }

  const models = new Map<string, ObservedRemoteModel>();
  for (const item of input.data) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
      continue;
    }
    const id = item.id.trim();
    models.set(id, {
      id,
      providerSnapshotId: optionalSnapshotId(item),
    });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function defaultHeaders(input: {
  readonly sourceKind: CatalogObserverSourceKind;
  readonly credential: string | undefined;
  readonly collectorBuild: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    accept:
      input.sourceKind === "model_list"
        ? "application/json"
        : "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
    "user-agent":
      "modelapse-catalog-observer/" + input.collectorBuild.slice(0, 64),
  };
  if (input.credential) {
    headers.authorization = "Bearer " + input.credential;
  }
  return headers;
}

const OPENAI_MODELS_ADAPTER: CatalogSourceAdapter = {
  parser: "openai_models",
  requestHeaders: defaultHeaders,
  parseModelList(body) {
    return parseOpenAICompatibleModelList(JSON.parse(body));
  },
};

const SNAPSHOT_ONLY_ADAPTER: CatalogSourceAdapter = {
  parser: "snapshot_only",
  requestHeaders: defaultHeaders,
  parseModelList() {
    return null;
  },
};

const ADAPTERS: Readonly<Record<CatalogObserverParser, CatalogSourceAdapter>> = {
  openai_models: OPENAI_MODELS_ADAPTER,
  snapshot_only: SNAPSHOT_ONLY_ADAPTER,
};

export function getCatalogSourceAdapter(
  parser: CatalogObserverParser,
): CatalogSourceAdapter {
  const adapter = ADAPTERS[parser];
  if (!adapter) {
    throw new Error("Unsupported catalog source parser: " + parser);
  }
  return adapter;
}

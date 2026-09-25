import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  getArchiveCatalog,
  getArchiveCatalogChanges,
  type ArchiveCatalogChange,
  type ArchiveCatalogIdentityState,
} from "../modelapse";

export const Route = createFileRoute("/changes")({
  loader: async () => {
    const [changes, catalog] = await Promise.all([
      getArchiveCatalogChanges(),
      getArchiveCatalog(),
    ]);
    return { changes, catalog };
  },
  component: CatalogChangesPage,
});

function formatTimestamp(value: string): string {
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function safeSourceHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function stateLabel(state: ArchiveCatalogIdentityState): string {
  const pieces = [
    state.model?.marketingName ?? state.model?.canonicalSlug ?? null,
    state.apiModelId,
    state.snapshot?.providerSnapshotId ?? null,
    state.endpoint?.hostname ?? null,
  ].filter((value): value is string => Boolean(value));
  return pieces.length ? pieces.join(" · ") : "—";
}

function changeSubject(change: ArchiveCatalogChange): string {
  if (change.alias) return `alias ${change.alias.value}`;
  return (
    change.current.model?.canonicalSlug ??
    change.previous.model?.canonicalSlug ??
    "execution binding"
  );
}

function CatalogChangesPage() {
  const { changes, catalog } = Route.useLoaderData();
  const [provider, setProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [kind, setKind] = useState("");

  const providers = useMemo(
    () =>
      [...new Map(
        catalog.models.map((model) => [model.provider.slug, model.provider]),
      ).values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    [catalog.models],
  );

  const filtered = useMemo(
    () =>
      changes.filter((change) => {
        if (provider && change.provider.slug !== provider) return false;
        if (
          modelId &&
          change.previous.model?.id !== modelId &&
          change.current.model?.id !== modelId
        ) {
          return false;
        }
        if (kind && change.changeType !== kind) return false;
        return true;
      }),
    [changes, provider, modelId, kind],
  );

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span>
            <strong>Modelapse</strong>
            <small>AI Model Test & Evolution Archive</small>
          </span>
        </a>
        <nav className="header-nav">
          <a className="header-link" href="/#archive">Archive</a>
          <a className="header-link" href="/compare">Compare</a>
          <a className="header-link" href="/changes">Changes</a>
        </nav>
      </header>

      <section className="entity-hero change-feed-hero">
        <div className="run-breadcrumb">
          <a href="/#archive">Archive</a>
          <span>/</span>
          <span>Catalog changes</span>
        </div>
        <div className="run-title-row">
          <div>
            <p className="eyebrow">CATALOG CHANGE DETECTION</p>
            <h1>Identity drift</h1>
            <p className="run-subtitle">
              Derived transitions between chronological, source-backed catalog facts.
            </p>
          </div>
          <div className="run-verdict">
            <span className="badge">{changes.length} recent change(s)</span>
          </div>
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FILTERS</p>
            <h2>Inspect the change feed</h2>
          </div>
          <p className="section-note">
            Drift is derived from immutable alias observations and closed execution-binding
            intervals. It is not a new canonical identity claim.
          </p>
        </div>

        <div className="drift-filters">
          <label>
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="">All providers</option>
              {providers.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Model</span>
            <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
              <option value="">All models</option>
              {catalog.models
                .filter((model) => !provider || model.provider.slug === provider)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.marketingName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Change type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="">All change types</option>
              <option value="alias_target_changed">Alias target</option>
              <option value="execution_binding_changed">Execution binding</option>
            </select>
          </label>
        </div>

        <div className="drift-feed">
          {filtered.map((change) => {
            const sourceHref = safeSourceHref(change.currentSource.url);
            const model =
              change.current.model ??
              change.previous.model;
            return (
              <article className="drift-event" key={change.id}>
                <div className="drift-event-meta">
                  <span className="badge">{change.changeType.replaceAll("_", " ")}</span>
                  <strong>{changeSubject(change)}</strong>
                  <small>{formatTimestamp(change.occurredAt)}</small>
                  <small>{change.provider.name}</small>
                  <div className="drift-fields">
                    {change.changedFields.map((field) => (
                      <span className="badge" key={field}>{field.replaceAll("_", " ")}</span>
                    ))}
                  </div>
                </div>

                <div className="drift-state drift-state-before">
                  <span>Before</span>
                  <strong>{stateLabel(change.previous)}</strong>
                  {change.previous.model ? (
                    <a className="text-link" href={`/models/${change.previous.model.id}`}>
                      {change.previous.model.canonicalSlug} →
                    </a>
                  ) : null}
                </div>

                <div className="drift-arrow" aria-hidden="true">→</div>

                <div className="drift-state drift-state-after">
                  <span>After</span>
                  <strong>{stateLabel(change.current)}</strong>
                  {model ? (
                    <a className="text-link" href={`/models/${model.id}`}>
                      {model.canonicalSlug} →
                    </a>
                  ) : null}
                </div>

                <div className="drift-source">
                  <span>Current source</span>
                  <strong>
                    {change.currentSource.title ??
                      change.currentSource.url ??
                      change.currentSource.sourceType}
                  </strong>
                  <small>
                    retrieved {formatTimestamp(change.currentSource.retrievedAt)}
                  </small>
                  {sourceHref ? (
                    <a
                      className="text-link"
                      href={sourceHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source ↗
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}

          {filtered.length === 0 ? (
            <div className="empty-state">
              No source-backed identity drift matches these filters.
            </div>
          ) : null}
        </div>
      </section>

      <footer>
        <span>Modelapse</span>
        <span>identity drift = derived change, not rewritten history</span>
      </footer>
    </main>
  );
}

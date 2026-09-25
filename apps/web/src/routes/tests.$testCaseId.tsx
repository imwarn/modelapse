import { createFileRoute } from "@tanstack/react-router";
import { getArchiveTest, type ArchiveRun } from "../modelapse";

export const Route = createFileRoute("/tests/$testCaseId")({
  loader: ({ params }) =>
    getArchiveTest({
      data: {
        testCaseId: params.testCaseId,
      },
    }),
  component: ArchiveTestPage,
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function shortHash(value: string | null): string {
  if (!value) return "—";
  if (value.length <= 30) return value;
  return `${value.slice(0, 16)}…${value.slice(-10)}`;
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

function evaluationLabel(run: ArchiveRun): string {
  if (!run.evaluation) return "not evaluated";
  if (run.evaluation.exactMatch === true) return "exact match";
  if (run.evaluation.exactMatch === false) return "mismatch";
  return run.evaluation.status;
}

function evaluationClass(run: ArchiveRun): string {
  if (run.evaluation?.exactMatch === true) return "badge badge-pass";
  if (run.evaluation?.exactMatch === false) return "badge badge-fail";
  return "badge";
}

function ArchiveTestPage() {
  const test = Route.useLoaderData();

  if (!test) {
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
        </header>
        <section className="run-not-found">
          <p className="eyebrow">TEST ARCHIVE</p>
          <h1>Test not found</h1>
          <p>This Test Case is not part of the public Archive.</p>
          <a className="text-link" href="/#archive">← Back to Archive</a>
        </section>
      </main>
    );
  }

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
        </nav>
      </header>

      <section className="entity-hero">
        <div className="run-breadcrumb">
          <a href="/#archive">Archive</a>
          <span>/</span>
          <span>Tests</span>
          <span>/</span>
          <span>{test.caseSlug}</span>
        </div>

        <div className="run-title-row">
          <div>
            <p className="eyebrow">TEST ARCHIVE</p>
            <h1>{test.familyName}</h1>
            <p className="run-subtitle">
              {test.caseSlug} · {test.variantName} · v{test.version}
            </p>
          </div>
          <div className="run-verdict">
            <span className="badge badge-pass">{test.versionStatus}</span>
            <span className="badge">{test.category}</span>
            <span className="badge">{test.artifactType}</span>
          </div>
        </div>

        <dl className="entity-stats">
          <div>
            <dt>Origin</dt>
            <dd>{test.origin}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{formatTimestamp(test.publishedAt)}</dd>
          </div>
          <div>
            <dt>Public sealed Runs</dt>
            <dd>{test.runCount}</dd>
          </div>
          <div>
            <dt>Evaluator</dt>
            <dd>
              {test.evaluator
                ? `${test.evaluator.slug}@${test.evaluator.version}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DEFINITION</p>
            <h2>Immutable Test identity</h2>
          </div>
          <p className="section-note">
            Definition and prompt hashes identify the archived Test without
            exposing private blob object locations.
          </p>
        </div>

        <dl className="definition-grid">
          <div>
            <dt>Definition SHA-256</dt>
            <dd title={test.definitionSha256}>{shortHash(test.definitionSha256)}</dd>
          </div>
          <div>
            <dt>Prompt SHA-256</dt>
            <dd title={test.promptSha256}>{shortHash(test.promptSha256)}</dd>
          </div>
          <div>
            <dt>Fixture manifest</dt>
            <dd title={test.fixtureManifestSha256 ?? undefined}>
              {shortHash(test.fixtureManifestSha256)}
            </dd>
          </div>
          <div>
            <dt>Evaluator definition</dt>
            <dd title={test.evaluatorDefinitionSha256 ?? undefined}>
              {shortHash(test.evaluatorDefinitionSha256)}
            </dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>{test.license ?? "—"}</dd>
          </div>
          <div>
            <dt>Case type / status</dt>
            <dd>{test.caseType} · {test.caseStatus}</dd>
          </div>
          <div>
            <dt>Active window</dt>
            <dd>{formatTimestamp(test.activeFrom)} → {formatTimestamp(test.activeTo)}</dd>
          </div>
          <div>
            <dt>Canonical source record</dt>
            <dd>{test.canonicalSourceId ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="section entity-section test-provenance-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SOURCE PROVENANCE</p>
            <h2>Definition lineage</h2>
          </div>
          <p className="section-note">
            Public source summaries expose citation metadata only; source-record metadata
            and private blob locations remain outside the Archive contract.
          </p>
        </div>

        <div className="provenance-summary">
          <article className="provenance-card provenance-card-primary">
            <span>Test family source</span>
            <strong>{test.canonicalSource?.title ?? test.canonicalSource?.sourceType ?? "—"}</strong>
            <small>
              retrieved {formatTimestamp(test.canonicalSource?.retrievedAt ?? null)}
            </small>
            <small>SHA-256 {shortHash(test.canonicalSource?.contentSha256 ?? null)}</small>
            {safeSourceHref(test.canonicalSource?.url ?? null) ? (
              <a
                className="text-link"
                href={safeSourceHref(test.canonicalSource?.url ?? null) ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                Open family source ↗
              </a>
            ) : null}
          </article>

          <article className="provenance-card">
            <span>Current version source</span>
            <strong>{test.versionSource?.title ?? test.versionSource?.sourceType ?? "—"}</strong>
            <small>v{test.version} · {test.versionStatus}</small>
            {safeSourceHref(test.versionSource?.url ?? null) ? (
              <a
                className="text-link"
                href={safeSourceHref(test.versionSource?.url ?? null) ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                Open version source ↗
              </a>
            ) : null}
          </article>

          <article className="provenance-card">
            <span>Public version records</span>
            <strong>{test.versionHistory.length}</strong>
            <small>{test.variantName} · {test.variantSlug}</small>
          </article>
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TEST VERSION HISTORY</p>
            <h2>Immutable definitions over time</h2>
          </div>
          <p className="section-note">
            Only versions with at least one public Test Case appear here. Matching case slugs
            link across versions when that public case exists.
          </p>
        </div>

        <div className="version-history">
          {test.versionHistory.map((version) => {
            const sourceHref = safeSourceHref(version.source?.url ?? null);
            const current = version.version === test.version;
            return (
              <article
                className={current ? "version-history-row version-history-current" : "version-history-row"}
                key={version.id}
              >
                <div className="version-history-id">
                  <span className={current ? "badge badge-pass" : "badge"}>
                    {current ? "current" : version.status}
                  </span>
                  <strong>v{version.version}</strong>
                  <small>{formatTimestamp(version.publishedAt ?? version.createdAt)}</small>
                </div>
                <div className="version-history-definition">
                  <span>Definition SHA-256</span>
                  <strong title={version.definitionSha256}>{shortHash(version.definitionSha256)}</strong>
                  <small>{version.publicCaseCount} public case(s) · {version.license ?? "no license"}</small>
                </div>
                <div className="version-history-definition">
                  <span>Evaluator</span>
                  <strong>
                    {version.evaluator
                      ? `${version.evaluator.slug}@${version.evaluator.version}`
                      : "—"}
                  </strong>
                  <small>{version.evaluator?.kind ?? "no evaluator binding"}</small>
                </div>
                <div className="version-history-source">
                  <span>Source</span>
                  <strong>{version.source?.title ?? version.source?.sourceType ?? "—"}</strong>
                  <div className="version-history-actions">
                    {version.linkedTestCaseId && version.linkedTestCaseId !== test.testCaseId ? (
                      <a className="text-link" href={`/tests/${version.linkedTestCaseId}`}>
                        Same case in v{version.version} →
                      </a>
                    ) : null}
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
                </div>
              </article>
            );
          })}
          {test.versionHistory.length === 0 ? (
            <div className="empty-state">No public Test version history is archived yet.</div>
          ) : null}
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MODEL COVERAGE</p>
            <h2>Who has a verified Run</h2>
          </div>
          <a className="text-link" href="/compare">Compare models →</a>
        </div>

        <div className="coverage-grid">
          {test.modelCoverage.map((coverage) => (
            <article className="coverage-card" key={coverage.modelId}>
              <span>{coverage.providerSlug}</span>
              <strong>
                <a className="archive-entity-link" href={`/models/${coverage.modelId}`}>
                  {coverage.marketingName}
                </a>
              </strong>
              <small>{coverage.canonicalSlug}</small>
              <dl>
                <div>
                  <dt>Runs</dt>
                  <dd>{coverage.runCount}</dd>
                </div>
                <div>
                  <dt>Latest</dt>
                  <dd>{formatTimestamp(coverage.latestRunAt)}</dd>
                </div>
              </dl>
              <div className="coverage-actions">
                <a className="text-link" href={`/models/${coverage.modelId}`}>
                  Model detail →
                </a>
                <a
                  className="text-link"
                  href={`/history/${coverage.modelId}/${test.testCaseId}`}
                >
                  Run history →
                </a>
              </div>
            </article>
          ))}
          {test.modelCoverage.length === 0 ? (
            <div className="empty-state">No model has a sealed public Run for this Test yet.</div>
          ) : null}
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RUN HISTORY</p>
            <h2>Recent sealed evidence</h2>
          </div>
        </div>

        <div className="compact-run-list">
          {test.recentRuns.map((run) => (
            <a className="compact-run-row" href={`/runs/${run.id}`} key={run.id}>
              <span>
                <strong>{run.id.slice(0, 8)}</strong>
                <small>{formatTimestamp(run.completedAt)}</small>
              </span>
              <span>
                <strong>{run.model.marketingName ?? run.requestedModel}</strong>
                <small>{run.provider.slug}</small>
              </span>
              <span>
                <b className="badge">{run.evidenceLevel ?? "—"}</b>
                <small>{run.executionPath}</small>
              </span>
              <span>
                <b className={evaluationClass(run)}>{evaluationLabel(run)}</b>
                <small>{run.returnedModel ?? run.requestedModel}</small>
              </span>
            </a>
          ))}
          {test.recentRuns.length === 0 ? (
            <div className="empty-state">No sealed public Runs yet.</div>
          ) : null}
        </div>
      </section>

      <footer>
        <span>Modelapse · {test.familySlug}/{test.caseSlug}</span>
        <a className="text-link" href="/#archive">Back to Archive ↑</a>
      </footer>
    </main>
  );
}

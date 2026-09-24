import { createFileRoute } from "@tanstack/react-router";
import {
  getArchiveModel,
  type ArchiveRun,
  type ArchiveTimelineEvent,
} from "../modelapse";

export const Route = createFileRoute("/models/$modelId")({
  loader: ({ params }) =>
    getArchiveModel({
      data: {
        modelId: params.modelId,
      },
    }),
  component: ArchiveModelPage,
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", "Z");
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

function timelineHref(event: ArchiveTimelineEvent): string | null {
  if (event.runId) return `/runs/${event.runId}`;
  if (event.relatedModelId) return `/models/${event.relatedModelId}`;
  if (event.testCaseId) return `/tests/${event.testCaseId}`;
  return null;
}

function ArchiveModelPage() {
  const model = Route.useLoaderData();

  if (!model) {
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
          <p className="eyebrow">MODEL ARCHIVE</p>
          <h1>Model not found</h1>
          <p>The requested canonical model is not present in the Archive catalog.</p>
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
          <span>Models</span>
          <span>/</span>
          <span>{model.canonicalSlug}</span>
        </div>

        <div className="run-title-row">
          <div>
            <p className="eyebrow">MODEL ARCHIVE</p>
            <h1>{model.marketingName}</h1>
            <p className="run-subtitle">
              {model.provider.name} · {model.canonicalSlug}
            </p>
          </div>
          <div className="run-verdict">
            <span className="badge badge-pass">{model.status}</span>
            {model.track ? <span className="badge">{model.track.displayName}</span> : null}
            <span className="badge">{model.runCount} sealed run(s)</span>
          </div>
        </div>

        <dl className="entity-stats">
          <div>
            <dt>Released</dt>
            <dd>{formatTimestamp(model.releasedAt)}</dd>
          </div>
          <div>
            <dt>Latest public Run</dt>
            <dd>{formatTimestamp(model.latestRunAt)}</dd>
          </div>
          <div>
            <dt>Family</dt>
            <dd>{model.family?.displayName ?? "—"}</dd>
          </div>
          <div>
            <dt>Track</dt>
            <dd>{model.track?.trackType ?? model.track?.displayName ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EVOLUTION TIMELINE</p>
            <h2>Catalog changes + verified Runs</h2>
          </div>
          <p className="section-note">
            Timeline events are descriptive Archive facts. Run evaluations remain
            derived views and are not converted into a model ranking.
          </p>
        </div>

        <div className="timeline">
          {model.timeline.map((event) => {
            const href = timelineHref(event);
            return (
              <article className="timeline-event" key={event.id}>
                <div className="timeline-marker" aria-hidden="true" />
                <div className="timeline-time">{formatTimestamp(event.occurredAt)}</div>
                <div className="timeline-body">
                  <span className="badge">{event.kind.replaceAll("_", " ")}</span>
                  <strong>{event.title}</strong>
                  <small>{event.description}</small>
                  {href ? (
                    <a className="text-link" href={href}>
                      Inspect record →
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
          {model.timeline.length === 0 ? (
            <div className="empty-state">No dated evolution events are archived yet.</div>
          ) : null}
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TEST COVERAGE</p>
            <h2>Public Test history</h2>
          </div>
          <a className="text-link" href="/compare">Open comparison →</a>
        </div>

        <div className="coverage-grid">
          {model.testCoverage.map((coverage) => (
            <article className="coverage-card" key={coverage.testCaseId}>
              <span>{coverage.familyName}</span>
              <strong>
                <a className="archive-entity-link" href={`/tests/${coverage.testCaseId}`}>
                  {coverage.caseSlug}
                </a>
              </strong>
              <small>v{coverage.version}</small>
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
                <a className="text-link" href={`/tests/${coverage.testCaseId}`}>
                  Test detail →
                </a>
                <a
                  className="text-link"
                  href={`/history/${model.id}/${coverage.testCaseId}`}
                >
                  Run history →
                </a>
              </div>
            </article>
          ))}
          {model.testCoverage.length === 0 ? (
            <div className="empty-state">No sealed public Test Runs for this model yet.</div>
          ) : null}
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LINEAGE</p>
            <h2>Snapshots and relations</h2>
          </div>
        </div>

        <div className="lineage-grid">
          <div className="lineage-panel">
            <h3>Provider snapshots</h3>
            {model.snapshots.map((snapshot) => (
              <div className="lineage-record" key={snapshot.id}>
                <strong>{snapshot.providerSnapshotId}</strong>
                <small>
                  {formatTimestamp(snapshot.validFrom)} → {formatTimestamp(snapshot.validTo)}
                </small>
                <small>source {snapshot.sourceId ?? "—"}</small>
              </div>
            ))}
            {model.snapshots.length === 0 ? <p>No snapshots archived.</p> : null}
          </div>

          <div className="lineage-panel">
            <h3>Model relations</h3>
            {model.relations.map((relation) => (
              <div className="lineage-record" key={relation.id}>
                <span className="badge">{relation.relationType.replaceAll("_", " ")}</span>
                <a href={`/models/${relation.relatedModel.id}`}>
                  {relation.relatedModel.marketingName}
                </a>
                <small>
                  {relation.direction} · confidence {relation.confidence}
                </small>
              </div>
            ))}
            {model.relations.length === 0 ? <p>No model relations archived.</p> : null}
          </div>
        </div>

        <div className="relation-map">
          <div className="relation-map-head">
            <span className="eyebrow">DIRECT RELATION GRAPH</span>
            <small>Stored edge direction is preserved exactly as archived.</small>
          </div>
          {model.relations.map((relation) => {
            const currentNode = (
              <div className="relation-node relation-node-current">
                <strong>{model.marketingName}</strong>
                <small>{model.canonicalSlug}</small>
              </div>
            );
            const relatedNode = (
              <a
                className="relation-node"
                href={`/models/${relation.relatedModel.id}`}
              >
                <strong>{relation.relatedModel.marketingName}</strong>
                <small>
                  {relation.relatedModel.providerSlug} · {relation.relatedModel.canonicalSlug}
                </small>
              </a>
            );

            return (
              <div className="relation-map-row" key={`graph:${relation.id}`}>
                {relation.direction === "incoming" ? relatedNode : currentNode}
                <div className="relation-edge">
                  <span className="relation-line" aria-hidden="true">→</span>
                  <span className="badge">{relation.relationType.replaceAll("_", " ")}</span>
                  <small>confidence {relation.confidence}</small>
                </div>
                {relation.direction === "incoming" ? currentNode : relatedNode}
              </div>
            );
          })}
          {model.relations.length === 0 ? (
            <div className="empty-state">No direct model relation edges are archived.</div>
          ) : null}
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RECENT RUNS</p>
            <h2>Latest sealed evidence</h2>
          </div>
        </div>

        <div className="compact-run-list">
          {model.recentRuns.map((run) => (
            <a className="compact-run-row" href={`/runs/${run.id}`} key={run.id}>
              <span>
                <strong>{run.id.slice(0, 8)}</strong>
                <small>{formatTimestamp(run.completedAt)}</small>
              </span>
              <span>
                <strong>{run.test.caseSlug}</strong>
                <small>{run.test.familyName} · v{run.test.version}</small>
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
          {model.recentRuns.length === 0 ? (
            <div className="empty-state">No sealed public Runs yet.</div>
          ) : null}
        </div>
      </section>

      <footer>
        <span>Modelapse · {model.canonicalSlug}</span>
        <a className="text-link" href="/#archive">Back to Archive ↑</a>
      </footer>
    </main>
  );
}

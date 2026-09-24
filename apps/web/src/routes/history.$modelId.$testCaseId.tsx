import { createFileRoute } from "@tanstack/react-router";
import { getArchiveRunHistory, type ArchiveRun } from "../modelapse";

export const Route = createFileRoute("/history/$modelId/$testCaseId")({
  loader: ({ params }) =>
    getArchiveRunHistory({
      data: {
        modelId: params.modelId,
        testCaseId: params.testCaseId,
        limit: 100,
      },
    }),
  component: ArchiveRunHistoryPage,
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

function ArchiveRunHistoryPage() {
  const history = Route.useLoaderData();

  if (!history) {
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
          <p className="eyebrow">RUN HISTORY</p>
          <h1>History not found</h1>
          <p>The requested model × Test Case pair is not present in the public Archive.</p>
          <a className="text-link" href="/#archive">← Back to Archive</a>
        </section>
      </main>
    );
  }

  const firstRun = history.runs[0] ?? null;
  const latestRun = history.runs[history.runs.length - 1] ?? null;

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

      <section className="entity-hero history-hero">
        <div className="run-breadcrumb">
          <a href="/#archive">Archive</a>
          <span>/</span>
          <a href={`/models/${history.model.id}`}>{history.model.canonicalSlug}</a>
          <span>/</span>
          <a href={`/tests/${history.test.testCaseId}`}>{history.test.caseSlug}</a>
          <span>/</span>
          <span>History</span>
        </div>

        <div className="run-title-row">
          <div>
            <p className="eyebrow">REPEAT-RUN HISTORY</p>
            <h1>{history.model.marketingName}</h1>
            <p className="run-subtitle">
              {history.test.familyName} · {history.test.caseSlug} · v{history.test.version}
            </p>
          </div>
          <div className="run-verdict">
            <span className="badge">{history.runs.length} sealed run(s)</span>
            <span className="badge">{history.relations.length} explicit relation(s)</span>
          </div>
        </div>

        <dl className="entity-stats">
          <div>
            <dt>First captured</dt>
            <dd>{formatTimestamp(firstRun?.completedAt ?? firstRun?.sealedAt ?? null)}</dd>
          </div>
          <div>
            <dt>Latest captured</dt>
            <dd>{formatTimestamp(latestRun?.completedAt ?? latestRun?.sealedAt ?? null)}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{history.model.provider.name}</dd>
          </div>
          <div>
            <dt>Evaluator</dt>
            <dd>
              {history.test.evaluator
                ? `${history.test.evaluator.slug}@${history.test.evaluator.version}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TEMPORAL RECORD</p>
            <h2>Same model × same Test</h2>
          </div>
          <p className="section-note">
            Runs are ordered by capture time. Changes are shown as records; no causal
            explanation or quality trend is inferred.
          </p>
        </div>

        <div className="history-rail">
          {history.runs.map((run, index) => (
            <article className="history-run" key={run.id}>
              <div className="history-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="history-run-time">
                <strong>{formatTimestamp(run.completedAt ?? run.sealedAt)}</strong>
                <small>{run.runnerBuild}</small>
              </div>
              <div className="history-run-result">
                <span className={evaluationClass(run)}>{evaluationLabel(run)}</span>
                <span className="badge">evidence {run.evidenceLevel ?? "—"}</span>
              </div>
              <div className="history-run-model">
                <strong>{run.returnedModel ?? run.requestedModel}</strong>
                <small>{run.executionPath}</small>
              </div>
              <a className="text-link" href={`/runs/${run.id}`}>
                Run {run.id.slice(0, 8)} →
              </a>
            </article>
          ))}
          {history.runs.length === 0 ? (
            <div className="empty-state">No sealed public Runs exist for this pair yet.</div>
          ) : null}
        </div>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RUN LINEAGE</p>
            <h2>Explicit repeat / retry / reproduction links</h2>
          </div>
          <span className="badge">{history.relations.length} edge(s)</span>
        </div>

        <div className="run-relation-list">
          {history.relations.map((relation) => (
            <article
              className="run-relation-row"
              key={`${relation.fromRunId}:${relation.toRunId}:${relation.relationType}`}
            >
              <a href={`/runs/${relation.fromRunId}`}>
                {relation.fromRunId.slice(0, 8)}
              </a>
              <span className="relation-arrow">→</span>
              <span className="badge">{relation.relationType.replaceAll("_", " ")}</span>
              <span className="relation-arrow">→</span>
              <a href={`/runs/${relation.toRunId}`}>
                {relation.toRunId.slice(0, 8)}
              </a>
              <small>{formatTimestamp(relation.createdAt)}</small>
            </article>
          ))}
          {history.relations.length === 0 ? (
            <div className="empty-state">
              No explicit Run relations are archived. Repeated Runs can still appear above
              because they share the same canonical model and exact Test Case.
            </div>
          ) : null}
        </div>
      </section>

      <footer>
        <span>Modelapse · temporal Archive</span>
        <a className="text-link" href={`/models/${history.model.id}`}>
          Back to Model ↑
        </a>
      </footer>
    </main>
  );
}

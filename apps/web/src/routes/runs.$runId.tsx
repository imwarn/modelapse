import { createFileRoute } from "@tanstack/react-router";
import {
  getArchiveRun,
  type ArchiveBlob,
  type ArchiveRunDetail,
} from "../modelapse";

export const Route = createFileRoute("/runs/$runId")({
  loader: ({ params }) =>
    getArchiveRun({
      data: {
        runId: params.runId,
      },
    }),
  component: ArchiveRunPage,
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function shortHash(value: string | null): string {
  if (!value) return "—";
  if (value.length <= 28) return value;
  return `${value.slice(0, 16)}…${value.slice(-10)}`;
}

function evaluationLabel(run: ArchiveRunDetail): string {
  if (!run.evaluation) return "not evaluated";
  if (run.evaluation.exactMatch === true) return "exact match";
  if (run.evaluation.exactMatch === false) return "mismatch";
  return run.evaluation.status;
}

function evaluationClass(run: ArchiveRunDetail): string {
  if (run.evaluation?.exactMatch === true) return "badge badge-pass";
  if (run.evaluation?.exactMatch === false) return "badge badge-fail";
  return "badge";
}

function jsonBlock(value: string | null): string {
  return value ?? "—";
}

function BlobProof({
  label,
  blob,
}: Readonly<{
  label: string;
  blob: ArchiveBlob | null;
}>) {
  return (
    <div className="proof-card">
      <span>{label}</span>
      <strong title={blob?.sha256}>{shortHash(blob?.sha256 ?? null)}</strong>
      <small>
        {blob
          ? `${blob.mimeType} · ${blob.sizeBytes} bytes · ${blob.visibility} bytes`
          : "not captured"}
      </small>
    </div>
  );
}

function ArchiveRunPage() {
  const run = Route.useLoaderData();

  if (!run) {
    return (
      <main>
        <header className="site-header">
          <a className="brand" href="/" aria-label="Modelapse home">
            <span className="brand-mark">M</span>
            <span>
              <strong>Modelapse</strong>
              <small>AI Model Test & Evolution Archive</small>
            </span>
          </a>
        </header>
        <section className="run-not-found">
          <p className="eyebrow">PUBLIC ARCHIVE</p>
          <h1>Run not found</h1>
          <p>
            This Run is not a sealed public Archive record, or the identifier is
            no longer available.
          </p>
          <a className="text-link" href="/#archive">
            ← Back to Archive
          </a>
        </section>
      </main>
    );
  }

  const primaryEvidence =
    run.evidence.find((evidence) => evidence.level === run.evidenceLevel) ??
    run.evidence[0] ??
    null;
  const attestation = primaryEvidence?.attestation ?? null;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Modelapse home">
          <span className="brand-mark">M</span>
          <span>
            <strong>Modelapse</strong>
            <small>AI Model Test & Evolution Archive</small>
          </span>
        </a>
        <a className="header-link" href="/#archive">
          Archive
        </a>
      </header>

      <section className="run-detail-hero">
        <div className="run-breadcrumb">
          <a href="/#archive">Archive</a>
          <span>/</span>
          <span>Run {run.id.slice(0, 8)}</span>
        </div>

        <div className="run-title-row">
          <div>
            <p className="eyebrow">SEALED RUN</p>
            <h1>{run.model.marketingName ?? run.requestedModel}</h1>
            <p className="run-subtitle">
              {run.test.familyName} · {run.test.caseSlug} · v{run.test.version}
            </p>
          </div>
          <div className="run-verdict">
            <span className={evaluationClass(run)}>{evaluationLabel(run)}</span>
            <span className="badge">evidence {run.evidenceLevel ?? "—"}</span>
            <span className="badge">{run.executionPath}</span>
          </div>
        </div>

        <dl className="run-identity">
          <div>
            <dt>Run ID</dt>
            <dd>{run.id}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{run.status}</dd>
          </div>
          <div>
            <dt>Sealed</dt>
            <dd>{formatTimestamp(run.sealedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="section run-detail-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PROOF CHAIN</p>
            <h2>Hashes before claims</h2>
          </div>
          <p className="section-note">
            Payload bytes remain private. Public hashes make the archived
            evidence addressable without publishing provider traffic.
          </p>
        </div>

        <div className="proof-grid">
          <BlobProof label="Request capture" blob={run.requestBlob} />
          <BlobProof label="Response capture" blob={run.responseBlob} />
          <div className="proof-card">
            <span>Attestation payload</span>
            <strong title={attestation?.payloadSha256}>
              {shortHash(attestation?.payloadSha256 ?? null)}
            </strong>
            <small>
              {attestation
                ? `${attestation.algorithm} · key ${attestation.keyId}`
                : "no attestation"}
            </small>
          </div>
          <div className="proof-card">
            <span>Evaluation result</span>
            <strong title={run.evaluation?.rawResultSha256 ?? undefined}>
              {shortHash(run.evaluation?.rawResultSha256 ?? null)}
            </strong>
            <small>
              {run.evaluation
                ? `${run.evaluation.evaluatorSlug}@${run.evaluation.evaluatorVersion}`
                : "not evaluated"}
            </small>
          </div>
        </div>
      </section>

      <section className="section run-detail-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXECUTION</p>
            <h2>What actually ran</h2>
          </div>
        </div>

        <div className="detail-grid">
          <dl className="detail-panel">
            <div>
              <dt>Provider</dt>
              <dd>{run.provider.name}</dd>
            </div>
            <div>
              <dt>Requested model</dt>
              <dd>{run.requestedModel}</dd>
            </div>
            <div>
              <dt>Returned model</dt>
              <dd>{run.returnedModel ?? "—"}</dd>
            </div>
            <div>
              <dt>Canonical model</dt>
              <dd>{run.model.canonicalSlug ?? "unbound"}</dd>
            </div>
            <div>
              <dt>Execution path</dt>
              <dd>{run.executionPath}</dd>
            </div>
            <div>
              <dt>Runner build</dt>
              <dd>{run.runnerBuild}</dd>
            </div>
          </dl>

          <dl className="detail-panel">
            <div>
              <dt>Created</dt>
              <dd>{formatTimestamp(run.createdAt)}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{formatTimestamp(run.completedAt)}</dd>
            </div>
            <div>
              <dt>Sealed</dt>
              <dd>{formatTimestamp(run.sealedAt)}</dd>
            </div>
            <div>
              <dt>Response headers SHA-256</dt>
              <dd title={run.responseHeadersSha256 ?? undefined}>
                {shortHash(run.responseHeadersSha256)}
              </dd>
            </div>
            <div>
              <dt>Test Case ID</dt>
              <dd>{run.test.testCaseId}</dd>
            </div>
            <div>
              <dt>Variant</dt>
              <dd>{run.test.variantName}</dd>
            </div>
          </dl>
        </div>

        <div className="json-grid">
          <div className="json-panel">
            <span>Run configuration</span>
            <pre>{jsonBlock(run.configJson)}</pre>
          </div>
          <div className="json-panel">
            <span>Provider usage</span>
            <pre>{jsonBlock(run.usageJson)}</pre>
          </div>
          <div className="json-panel">
            <span>Timing</span>
            <pre>{jsonBlock(run.timingJson)}</pre>
          </div>
        </div>
      </section>

      <section className="section run-detail-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EVIDENCE</p>
            <h2>Attested provenance</h2>
          </div>
          <span className="badge">{run.evidence.length} record(s)</span>
        </div>

        <div className="evidence-stack">
          {run.evidence.map((evidence) => (
            <article className="evidence-card" key={evidence.id}>
              <div className="evidence-card-head">
                <div>
                  <span className="badge badge-pass">{evidence.level}</span>
                  <strong>{evidence.collector}</strong>
                </div>
                <small>{formatTimestamp(evidence.createdAt)}</small>
              </div>

              <dl>
                <div>
                  <dt>Execution path</dt>
                  <dd>{evidence.executionPath}</dd>
                </div>
                <div>
                  <dt>Evidence ID</dt>
                  <dd>{evidence.id}</dd>
                </div>
                <div>
                  <dt>Source record</dt>
                  <dd>{evidence.sourceId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{evidence.notes ?? "—"}</dd>
                </div>
              </dl>

              {evidence.attestation ? (
                <details className="attestation-details">
                  <summary>Attestation details</summary>
                  <dl>
                    <div>
                      <dt>Attestation ID</dt>
                      <dd>{evidence.attestation.id}</dd>
                    </div>
                    <div>
                      <dt>Key</dt>
                      <dd>
                        {evidence.attestation.keyId} ·{" "}
                        {evidence.attestation.algorithm}
                      </dd>
                    </div>
                    <div>
                      <dt>Key valid from</dt>
                      <dd>{formatTimestamp(evidence.attestation.keyValidFrom)}</dd>
                    </div>
                    <div>
                      <dt>Payload SHA-256</dt>
                      <dd>{evidence.attestation.payloadSha256}</dd>
                    </div>
                    <div className="detail-wide">
                      <dt>Signature</dt>
                      <dd>{evidence.attestation.signature}</dd>
                    </div>
                  </dl>
                </details>
              ) : null}
            </article>
          ))}

          {run.evidence.length === 0 ? (
            <div className="empty-state">No evidence record is attached.</div>
          ) : null}
        </div>
      </section>

      <section className="section run-detail-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EVALUATION</p>
            <h2>Derived view</h2>
          </div>
          <span className={evaluationClass(run)}>{evaluationLabel(run)}</span>
        </div>

        {run.evaluation ? (
          <dl className="evaluation-panel">
            <div>
              <dt>Evaluation ID</dt>
              <dd>{run.evaluation.id}</dd>
            </div>
            <div>
              <dt>Evaluator</dt>
              <dd>
                {run.evaluation.evaluatorSlug}@
                {run.evaluation.evaluatorVersion}
              </dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{run.evaluation.evaluatorKind}</dd>
            </div>
            <div>
              <dt>Definition SHA-256</dt>
              <dd>{run.evaluation.definitionSha256}</dd>
            </div>
            <div>
              <dt>Raw result SHA-256</dt>
              <dd>{run.evaluation.rawResultSha256 ?? "—"}</dd>
            </div>
            <div>
              <dt>Exact match</dt>
              <dd>
                {run.evaluation.exactMatch === null
                  ? "—"
                  : run.evaluation.exactMatch
                    ? "true"
                    : "false"}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="empty-state">No Evaluation has been recorded.</div>
        )}
      </section>

      <footer>
        <span>Modelapse · Run {run.id}</span>
        <a className="text-link" href="/#archive">
          Back to Archive ↑
        </a>
      </footer>
    </main>
  );
}

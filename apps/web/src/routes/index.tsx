import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  getWorkbenchSnapshot,
  readJob,
  submitRun,
  type ArchiveRun,
  type ControlJob,
} from "../modelapse";

export const Route = createFileRoute("/")({
  loader: () => getWorkbenchSnapshot(),
  component: ModelapseHome,
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const [date, rest = ""] = value.split("T");
  return `${date} ${rest.slice(0, 8)}Z`;
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

function ModelapseHome() {
  const snapshot = Route.useLoaderData();
  const [modelId, setModelId] = useState(snapshot.control.models[0]?.id ?? "");
  const [testCaseId, setTestCaseId] = useState(
    snapshot.control.tests[0]?.testCaseId ?? "",
  );
  const [operatorToken, setOperatorToken] = useState("");
  const [job, setJob] = useState<ControlJob | null>(null);
  const [activeRun, setActiveRun] = useState<ArchiveRun | null>(null);
  const [runs, setRuns] = useState<readonly ArchiveRun[]>(
    snapshot.archive.runs,
  );
  const [archiveModel, setArchiveModel] = useState("");
  const [archiveTest, setArchiveTest] = useState("");
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const filteredRuns = useMemo(
    () =>
      runs.filter(
        (run) =>
          (!archiveModel || run.model.id === archiveModel) &&
          (!archiveTest || run.test.testCaseId === archiveTest),
      ),
    [runs, archiveModel, archiveTest],
  );

  async function pollJob(jobId: string): Promise<void> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const result = await readJob({
        data: {
          operatorToken,
          jobId,
        },
      });

      setJob(result.job);
      if (result.run) {
        setActiveRun(result.run);
        setRuns((current) => [
          result.run!,
          ...current.filter((candidate) => candidate.id !== result.run!.id),
        ]);
      }

      if (result.job.status === "succeeded" || result.job.status === "failed") {
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }

    throw new Error(
      "The Run is still active after the live polling window. Refresh the page to inspect the Archive.",
    );
  }

  async function handleRun(): Promise<void> {
    if (!modelId || !testCaseId || !operatorToken) return;

    setBusy(true);
    setRunError(null);
    setJob(null);
    setActiveRun(null);

    try {
      const accepted = await submitRun({
        data: {
          operatorToken,
          modelId,
          testCaseId,
        },
      });
      setJob(accepted.job);
      await pollJob(accepted.job.id);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Run request failed");
    } finally {
      setBusy(false);
    }
  }

  const selectedModel = snapshot.control.models.find(
    (model) => model.id === modelId,
  );
  const selectedTest = snapshot.control.tests.find(
    (test) => test.testCaseId === testCaseId,
  );

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
        <div className="build-chip">
          <span className="status-dot" />
          build {snapshot.build.slice(0, 12)}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">VERIFIED MODEL EVOLUTION</p>
          <h1>
            Runs are facts.
            <br />
            Scores are views.
          </h1>
          <p className="hero-copy">
            Select a canonical model and a published Test Case. Modelapse derives
            the first-party execution path, captures evidence, seals the Run, and
            evaluates it without rewriting history.
          </p>
        </div>
        <div className="hero-stats" aria-label="Archive summary">
          <div>
            <strong>{snapshot.archive.models.length}</strong>
            <span>catalog models</span>
          </div>
          <div>
            <strong>{snapshot.archive.tests.length}</strong>
            <span>public tests</span>
          </div>
          <div>
            <strong>{snapshot.archive.runs.length}</strong>
            <span>recent runs</span>
          </div>
        </div>
      </section>

      <section className="section control-section" id="run">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONTROL PLANE</p>
            <h2>Run a verified test</h2>
          </div>
          <span
            className={
              snapshot.control.available
                ? "badge badge-pass"
                : "badge badge-fail"
            }
          >
            {snapshot.control.available ? "catalog ready" : "control unavailable"}
          </span>
        </div>

        {snapshot.control.error ? (
          <div className="notice notice-error">{snapshot.control.error}</div>
        ) : null}

        <div className="control-grid">
          <label>
            <span>01 / Model</span>
            <select
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              disabled={!snapshot.control.available || busy}
            >
              {snapshot.control.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.marketingName} · {model.provider}
                </option>
              ))}
            </select>
            <small>
              {selectedModel
                ? `${selectedModel.canonicalSlug} → ${selectedModel.apiModelId}`
                : "No runnable model is registered."}
            </small>
          </label>

          <label>
            <span>02 / Test</span>
            <select
              value={testCaseId}
              onChange={(event) => setTestCaseId(event.target.value)}
              disabled={!snapshot.control.available || busy}
            >
              {snapshot.control.tests.map((test) => (
                <option key={test.testCaseId} value={test.testCaseId}>
                  {test.familyName} · {test.caseSlug} · v{test.version}
                </option>
              ))}
            </select>
            <small>
              {selectedTest
                ? `${selectedTest.evaluator.slug}@${selectedTest.evaluator.version} · ${selectedTest.visibility}`
                : "No runnable Test Case is registered."}
            </small>
          </label>

          <label>
            <span>03 / Operator token</span>
            <input
              type="password"
              value={operatorToken}
              onChange={(event) => setOperatorToken(event.target.value)}
              placeholder="MODELAPSE_WEB_OPERATOR_TOKEN"
              autoComplete="current-password"
              disabled={busy}
            />
            <small>
              Used only for this server action; the API control token stays
              server-side.
            </small>
          </label>

          <div className="run-action">
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={
                busy ||
                !snapshot.control.available ||
                !modelId ||
                !testCaseId ||
                !operatorToken
              }
            >
              {busy ? "Run in progress…" : "Run selected test"}
            </button>
            <small>first-party direct · durable queue · immutable evidence</small>
          </div>
        </div>

        {runError ? <div className="notice notice-error">{runError}</div> : null}

        {job ? (
          <div className="job-panel">
            <div>
              <span className="eyebrow">JOB</span>
              <strong>{job.status}</strong>
            </div>
            <dl>
              <div>
                <dt>job id</dt>
                <dd>{job.id}</dd>
              </div>
              <div>
                <dt>attempts</dt>
                <dd>
                  {job.attempts} / {job.maxAttempts}
                </dd>
              </div>
              <div>
                <dt>run id</dt>
                <dd>{job.runId ?? "pending"}</dd>
              </div>
            </dl>
            {job.lastError ? (
              <div className="notice notice-error">{job.lastError}</div>
            ) : null}
            {activeRun ? (
              <div className="result-strip">
                <span className={evaluationClass(activeRun)}>
                  {evaluationLabel(activeRun)}
                </span>
                <span className="badge">
                  evidence {activeRun.evidenceLevel ?? "—"}
                </span>
                <span>
                  {activeRun.model.marketingName ?? activeRun.requestedModel}
                </span>
                <span>{activeRun.test.caseSlug}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="section archive-section" id="archive">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PUBLIC ARCHIVE</p>
            <h2>Recent sealed runs</h2>
          </div>
          <div className="archive-filters">
            <select
              aria-label="Filter Archive by model"
              value={archiveModel}
              onChange={(event) => setArchiveModel(event.target.value)}
            >
              <option value="">All models</option>
              {snapshot.archive.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.marketingName}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter Archive by test"
              value={archiveTest}
              onChange={(event) => setArchiveTest(event.target.value)}
            >
              <option value="">All tests</option>
              {snapshot.archive.tests.map((test) => (
                <option key={test.testCaseId} value={test.testCaseId}>
                  {test.familyName} · {test.caseSlug}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="archive-table" role="table">
          <div className="archive-row archive-header" role="row">
            <span>Run</span>
            <span>Model</span>
            <span>Test</span>
            <span>Evidence</span>
            <span>Evaluation</span>
            <span>Completed</span>
          </div>

          {filteredRuns.map((run) => (
            <article className="archive-row" role="row" key={run.id}>
              <span>
                <strong>{run.id.slice(0, 8)}</strong>
                <small>{run.provider.slug}</small>
              </span>
              <span>
                <strong>
                  {run.model.marketingName ?? run.requestedModel}
                </strong>
                <small>{run.returnedModel ?? run.requestedModel}</small>
              </span>
              <span>
                <strong>{run.test.caseSlug}</strong>
                <small>
                  {run.test.familySlug} · v{run.test.version}
                </small>
              </span>
              <span>
                <b className="badge">{run.evidenceLevel ?? "—"}</b>
                <small>{run.executionPath}</small>
              </span>
              <span>
                <b className={evaluationClass(run)}>{evaluationLabel(run)}</b>
                <small>
                  {run.evaluation
                    ? `${run.evaluation.evaluatorSlug}@${run.evaluation.evaluatorVersion}`
                    : "—"}
                </small>
              </span>
              <span>
                <strong>{formatTimestamp(run.completedAt)}</strong>
                <small>{run.status}</small>
              </span>
            </article>
          ))}

          {filteredRuns.length === 0 ? (
            <div className="empty-state">
              No sealed public Runs match these filters yet.
            </div>
          ) : null}
        </div>
      </section>

      <footer>
        <span>Modelapse</span>
        <span>evidence &gt; claims</span>
      </footer>
    </main>
  );
}

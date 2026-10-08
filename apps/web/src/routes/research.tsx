import { createFileRoute } from "@tanstack/react-router";
import {
  getArchiveCatalog,
  searchArchiveResearch,
  type ArchiveRun,
  type SearchArchiveResearchInput,
} from "../modelapse";

type ResearchSearch = {
  provider?: string;
  modelId?: string;
  testCaseId?: string;
  evidence?: "any" | "E4+" | "missing";
  region?: string;
  accountTier?: string;
  serviceTier?: string;
  cost?: "any" | "estimated" | "unknown";
  cursor?: string;
};

function researchSearch(query: Record<string, unknown>): ResearchSearch {
  const text = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : undefined;
  const evidence = text("evidence");
  const cost = text("cost");
  return {
    ...(text("provider") ? { provider: text("provider") } : {}),
    ...(text("modelId") ? { modelId: text("modelId") } : {}),
    ...(text("testCaseId") ? { testCaseId: text("testCaseId") } : {}),
    ...(evidence === "E4+" || evidence === "missing"
      ? { evidence }
      : {}),
    ...(text("region") ? { region: text("region") } : {}),
    ...(text("accountTier") ? { accountTier: text("accountTier") } : {}),
    ...(text("serviceTier") ? { serviceTier: text("serviceTier") } : {}),
    ...(cost === "estimated" || cost === "unknown" ? { cost } : {}),
    ...(text("cursor") ? { cursor: text("cursor") } : {}),
  };
}

export const Route = createFileRoute("/research")({
  validateSearch: researchSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const request: SearchArchiveResearchInput = {
      ...(deps.provider ? { providerSlug: deps.provider } : {}),
      ...(deps.modelId ? { modelId: deps.modelId } : {}),
      ...(deps.testCaseId ? { testCaseId: deps.testCaseId } : {}),
      ...(deps.evidence ? { evidence: deps.evidence } : {}),
      ...(deps.region ? { region: deps.region } : {}),
      ...(deps.accountTier ? { accountTier: deps.accountTier } : {}),
      ...(deps.serviceTier ? { serviceTier: deps.serviceTier } : {}),
      ...(deps.cost ? { cost: deps.cost } : {}),
      ...(deps.cursor ? { cursor: deps.cursor } : {}),
      limit: 20,
    };
    const [catalog, research] = await Promise.all([
      getArchiveCatalog(),
      searchArchiveResearch({ data: request }),
    ]);
    return { catalog, research };
  },
  component: ArchiveResearchPage,
});

function time(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").replace(".000Z", "Z");
}

function price(run: ArchiveRun): string {
  if (!run.cost?.estimatedNativeCost || !run.cost.pricing?.currency) {
    return "unknown (not free)";
  }
  return `${run.cost.estimatedNativeCost} ${run.cost.pricing.currency}`;
}

function evaluation(run: ArchiveRun): string {
  if (!run.evaluation) return "evaluation unavailable";
  if (run.evaluation.exactMatch === true) return "exact match";
  if (run.evaluation.exactMatch === false) return "mismatch";
  return run.evaluation.status;
}

function ArchiveResearchPage() {
  const { catalog, research } = Route.useLoaderData();
  const filters = Route.useSearch();
  const providerOptions = [...new Map(
    catalog.models.map((model) => [model.provider.slug, model.provider.name]),
  )].sort(([a], [b]) => a.localeCompare(b));
  const withoutCursor = new URLSearchParams();
  if (filters.provider) withoutCursor.set("provider", filters.provider);
  if (filters.modelId) withoutCursor.set("modelId", filters.modelId);
  if (filters.testCaseId) withoutCursor.set("testCaseId", filters.testCaseId);
  if (filters.evidence) withoutCursor.set("evidence", filters.evidence);
  if (filters.region) withoutCursor.set("region", filters.region);
  if (filters.accountTier) withoutCursor.set("accountTier", filters.accountTier);
  if (filters.serviceTier) withoutCursor.set("serviceTier", filters.serviceTier);
  if (filters.cost) withoutCursor.set("cost", filters.cost);

  const nextParams = new URLSearchParams(withoutCursor);
  if (research.nextCursor) nextParams.set("cursor", research.nextCursor);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span>
            <strong>Modelapse</strong>
            <small>AI Model Test &amp; Evolution Archive</small>
          </span>
        </a>
        <nav className="header-nav">
          <a className="header-link" href="/#archive">Archive</a>
          <a className="header-link" href="/compare">Compare</a>
          <span className="header-link header-link-current">Research</span>
        </nav>
      </header>

      <section className="entity-hero">
        <div className="run-breadcrumb">
          <a href="/">Archive</a>
          <span>/</span>
          <span>Research</span>
        </div>
        <p className="eyebrow">ARCHIVE v0.26 · PUBLIC RESEARCH</p>
        <h1>Explore the evidence, not a leaderboard.</h1>
        <p className="run-subtitle">
          Inspect sealed first-party and documented execution records across Providers.
          Every result links to its exact Model, Test Case and Run. Filters select
          records, not winners, and calibration canaries are excluded.
        </p>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RESEARCH FILTERS</p>
            <h2>Build a reproducible evidence slice</h2>
          </div>
          <span className="badge">newest completed first · 20 per page</span>
        </div>
        <form method="get" action="/research" className="control-grid">
          <label>
            <span>Provider</span>
            <select name="provider" defaultValue={filters.provider ?? ""}>
              <option value="">All Providers</option>
              {providerOptions.map(([slug, name]) => (
                <option key={slug} value={slug}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Model</span>
            <select name="modelId" defaultValue={filters.modelId ?? ""}>
              <option value="">All Models</option>
              {catalog.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.provider.slug} · {model.marketingName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Exact Test Case</span>
            <select name="testCaseId" defaultValue={filters.testCaseId ?? ""}>
              <option value="">All non-calibration Tests</option>
              {catalog.tests.filter((test) => test.category !== "calibration").map((test) => (
                <option key={test.testCaseId} value={test.testCaseId}>
                  {test.familyName} · {test.caseSlug} · {test.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Run evidence</span>
            <select name="evidence" defaultValue={filters.evidence ?? "any"}>
              <option value="any">Any evidence level</option>
              <option value="E4+">E4 or E5</option>
              <option value="missing">No evidence level</option>
            </select>
          </label>
          <label>
            <span>Native cost estimate</span>
            <select name="cost" defaultValue={filters.cost ?? "any"}>
              <option value="any">Known or unknown</option>
              <option value="estimated">Estimate available</option>
              <option value="unknown">Estimate unavailable</option>
            </select>
          </label>
          <label>
            <span>Execution region</span>
            <input name="region" defaultValue={filters.region ?? ""} placeholder="e.g. US" maxLength={64} />
          </label>
          <label>
            <span>Account tier</span>
            <input name="accountTier" defaultValue={filters.accountTier ?? ""} placeholder="e.g. paid-standard" maxLength={64} />
          </label>
          <label>
            <span>Effective service tier</span>
            <input name="serviceTier" defaultValue={filters.serviceTier ?? ""} placeholder="e.g. default" maxLength={64} />
          </label>
          <div className="run-action">
            <button type="submit">Apply research filters →</button>
            <small>
              Filters and cursor live in the shareable URL. Each query is bounded
              and sorted by completed timestamp + Run ID.
            </small>
          </div>
        </form>
        <p className="section-note">
          <a className="text-link" href="/research">Clear filters</a>
          {" · "}Missing access, pricing or qualification evidence is not silently
          interpreted as free or normal. Research slices are not statistical samples.
        </p>
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SEALED PUBLIC RECORDS</p>
            <h2>Observed Runs</h2>
          </div>
          <span className="badge">{research.runs.length} record(s) on this page</span>
        </div>
        <p className="section-note">
          Public non-calibration, sealed completed Runs only. No composite score,
          winning order, or quality inference. A newer record is not necessarily
          a better or more representative result.
        </p>
        <div className="integrity-list">
          {research.runs.map((run) => {
            const qualification = run.executionQualification;
            const qCaveats = qualification?.caveats ?? ["qualification_missing"];
            const costCaveats = run.cost?.caveats ?? ["cost_evidence_missing"];
            const match = run.evaluation?.exactMatch;
            return (
              <article className="integrity-row" key={run.id}>
                <div className="integrity-title-line">
                  <div>
                    <strong>{run.provider.name} · {run.model.marketingName ?? run.requestedModel}</strong>
                    <small>{time(run.completedAt)} · {run.id.slice(0, 8)}</small>
                  </div>
                  <div className="run-verdict">
                    <span className={match === true ? "badge badge-pass" : match === false ? "badge badge-fail" : "badge"}>
                      {evaluation(run)}
                    </span>
                    <span className="badge">Evidence {run.evidenceLevel ?? "unknown"}</span>
                  </div>
                </div>
                <p>
                  {run.test.familySlug} · {run.test.caseSlug} · v{run.test.version}
                </p>
                <p>
                  {run.executionPath} · region {qualification?.executionRegion ?? "unknown"}
                  {" · "}account {qualification?.accountTier ?? "unknown"}
                  {" · "}service{" "}
                  {qualification?.returnedServiceTier ?? qualification?.serviceTier ?? "unknown"}
                  {" · "}assurance {qualification?.serviceAssurance ?? "unknown"}
                </p>
                <p>
                  Provider access {qualification?.providerPolicyObservation?.accessState ?? "unknown"}
                  {" · "}Runner access {qualification?.runnerAccessObservation?.accessState ?? "unknown"}
                  {" · "}Calibration eligibility: not evaluated in this research index
                </p>
                <p>
                  Native cost estimate: <strong>{price(run)}</strong>
                  {" · "}pricing source{" "}
                  {run.cost?.pricingObservation?.sourceId?.slice(0, 8) ?? "missing"}
                </p>
                <p className="section-note">
                  Qualification: {qCaveats.length ? qCaveats.join(" · ") : "no caveats reported"}
                  {" · "}Cost: {costCaveats.length ? costCaveats.join(" · ") : "no caveats reported"}
                </p>
                <div className="run-verdict">
                  <a className="text-link" href={`/runs/${run.id}`}>Run evidence →</a>
                  {run.model.id ? (
                    <a className="text-link" href={`/models/${run.model.id}`}>Model →</a>
                  ) : null}
                  <a className="text-link" href={`/tests/${run.test.testCaseId}`}>Test →</a>
                  {run.model.id ? (
                    <a className="text-link" href={`/history/${run.model.id}/${run.test.testCaseId}`}>History →</a>
                  ) : null}
                  {run.model.id ? (
                    <a
                      className="text-link"
                      href={`/compare?modelIds=${encodeURIComponent(run.model.id)}&testCaseId=${encodeURIComponent(run.test.testCaseId)}`}
                    >
                      Compare same Test →
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!research.runs.length ? (
            <div className="empty-state">
              No sealed public benchmark Run matches these conditions. Missing
              results are not proof that the Provider lacks the capability.
            </div>
          ) : null}
        </div>
        <div className="compare-action">
          <small>
            Records are chronological. Pagination only traverses older Run IDs;
            the cursor is not an eligibility or comparability verdict.
          </small>
          {research.hasMore && research.nextCursor ? (
            <a className="text-link" href={`/research?${nextParams.toString()}`}>Older records →</a>
          ) : (
            <span className="badge">End of this slice</span>
          )}
          {filters.cursor ? (
            <a className="text-link" href={`/research?${withoutCursor.toString()}`}>First page ↑</a>
          ) : null}
        </div>
      </section>

      <footer>
        <span>Modelapse · Public Research Explorer</span>
        <a className="text-link" href="/">Back to Archive ↑</a>
      </footer>
    </main>
  );
}

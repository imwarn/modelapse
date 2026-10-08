import { createFileRoute } from "@tanstack/react-router";
import { getResearchCollections } from "../modelapse";

export const Route = createFileRoute("/research/collections")({
  loader: () => getResearchCollections(),
  component: ResearchCollectionIndex,
});

function ResearchCollectionIndex() {
  const collections = Route.useLoaderData();
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span><strong>Modelapse</strong><small>AI Model Test &amp; Evolution Archive</small></span>
        </a>
        <nav className="header-nav">
          <a className="header-link" href="/research">Research</a>
          <a className="header-link" href="/compare">Compare</a>
        </nav>
      </header>
      <section className="entity-hero">
        <div className="run-breadcrumb">
          <a href="/research">Research</a><span>/</span><span>Saved collections</span>
        </div>
        <p className="eyebrow">ARCHIVE v0.27 · REPRODUCIBLE RESEARCH</p>
        <h1>Published research snapshots</h1>
        <p className="run-subtitle">
          These operator-curated collections freeze a finite set of sealed public
          non-calibration Run IDs. Dynamic filters may find newer Runs later,
          but an existing collection never silently changes membership.
        </p>
      </section>
      <section className="section">
        <div className="section-heading"><div><p className="eyebrow">IMMUTABLE MANIFESTS</p><h2>Recently captured collections</h2></div></div>
        <div className="integrity-list">
          {collections.map((collection) => (
            <article className="integrity-row" key={collection.id}>
              <div className="integrity-title-line">
                <strong>{collection.title}</strong>
                <span className="badge">{collection.runIds.length} frozen Runs</span>
              </div>
              {collection.description ? <p>{collection.description}</p> : null}
              <p>Captured {collection.createdAt.replace("T", " ").replace(".000Z", "Z")}</p>
              <small>Manifest SHA-256: {collection.contentSha256}</small>
              <p><a className="text-link" href={`/research/collections/${collection.id}`}>Inspect snapshot and exports →</a></p>
            </article>
          ))}
          {!collections.length ? <div className="empty-state">No public snapshots yet. An operator can capture a bounded research slice from the Research Explorer.</div> : null}
        </div>
      </section>
      <footer><span>Modelapse · Research Collections</span><a className="text-link" href="/research">Research explorer ↑</a></footer>
    </main>
  );
}

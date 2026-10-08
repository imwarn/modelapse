import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  validateArchiveResearchFilters,
  type ArchiveResearchFilters,
} from "./archive-research.js";
import type {
  ArchiveRunView,
  PgArchiveRepository,
} from "./archive-repository.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResearchCollectionSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly filters: ArchiveResearchFilters;
  readonly runIds: readonly string[];
  readonly contentSha256: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly selectionLimit: 50;
}

export interface ResearchCollectionDetail extends ResearchCollectionSummary {
  readonly runs: readonly ArchiveRunView[];
}

export interface CreateResearchCollectionInput {
  readonly title: string;
  readonly description?: string;
  readonly filters: ArchiveResearchFilters;
  readonly actor: string;
}

interface CollectionRow {
  id: string;
  title: string;
  description: string | null;
  filters: ArchiveResearchFilters;
  run_ids: string[];
  content_sha256: string;
  created_by: string;
  created_at: Date;
  selection_limit: 50;
}

function view(row: CollectionRow): ResearchCollectionSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    filters: row.filters,
    runIds: row.run_ids,
    contentSha256: row.content_sha256,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    selectionLimit: row.selection_limit,
  };
}

const SELECT = `
  SELECT
    id, title, description, filters, run_ids, content_sha256,
    created_by, created_at, selection_limit
  FROM modelapse.research_collections
`;

export function researchCollectionDigest(
  filters: ArchiveResearchFilters,
  runIds: readonly string[],
): string {
  const normalized = validateArchiveResearchFilters(filters);
  const { cursor: _cursor, limit: _limit, ...facets } = normalized;
  const canonical = {
    schemaVersion: 1,
    filters: {
      accountTier: facets.accountTier ?? null,
      cost: facets.cost,
      evidence: facets.evidence,
      modelId: facets.modelId ?? null,
      providerSlug: facets.providerSlug ?? null,
      region: facets.region ?? null,
      serviceTier: facets.serviceTier ?? null,
      testCaseId: facets.testCaseId ?? null,
    },
    runIds,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export class PgResearchCollections {
  constructor(
    private readonly pool: Pool,
    private readonly archive: Pick<PgArchiveRepository, "researchRuns" | "getRunsByIds">,
  ) {}

  static connect(
    connectionString: string,
    archive: Pick<PgArchiveRepository, "researchRuns" | "getRunsByIds">,
    options: { readonly max?: number } = {},
  ): PgResearchCollections {
    return new PgResearchCollections(
      new Pool({ connectionString, max: options.max ?? 3 }),
      archive,
    );
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async create(input: CreateResearchCollectionInput): Promise<ResearchCollectionDetail> {
    const title = input.title.trim();
    const actor = input.actor.trim();
    const description = input.description?.trim() || null;
    if (title.length < 3 || title.length > 120 || !actor || actor.length > 100 ||
      (description !== null && description.length > 2000)) {
      throw new Error("invalid_research_collection_metadata");
    }
    // Cursor/offset captures would masquerade as a complete research slice.
    if (input.filters.cursor) {
      throw new Error("research_collection_cursor_not_allowed");
    }
    const filters = validateArchiveResearchFilters({
      ...input.filters,
      limit: 50,
    });
    const page = await this.archive.researchRuns(filters);
    if (page.hasMore) {
      throw new Error("research_collection_exceeds_50_runs");
    }
    if (page.runs.length === 0) {
      throw new Error("research_collection_empty");
    }
    const runIds = page.runs.map((run) => run.id);
    const { limit: _limit, cursor: _cursor, ...frozen } = filters;
    const contentSha256 = researchCollectionDigest(frozen, runIds);
    const result = await this.pool.query<CollectionRow>(
      `INSERT INTO modelapse.research_collections (
         title, description, filters, run_ids, content_sha256, created_by
       )
       VALUES ($1, $2, $3::jsonb, $4::uuid[], $5, $6)
       RETURNING
         id, title, description, filters, run_ids, content_sha256,
         created_by, created_at, selection_limit`,
      [title, description, JSON.stringify(frozen), runIds, contentSha256, actor],
    );
    const summary = view(result.rows[0]!);
    return { ...summary, runs: page.runs };
  }

  async list(limit = 30): Promise<readonly ResearchCollectionSummary[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("invalid_limit");
    }
    const result = await this.pool.query<CollectionRow>(
      SELECT + " ORDER BY created_at DESC, id DESC LIMIT $1",
      [limit],
    );
    return result.rows.map(view);
  }

  async get(id: string): Promise<ResearchCollectionDetail | null> {
    if (!UUID_RE.test(id)) {
      throw new Error("invalid_research_collection_id");
    }
    const result = await this.pool.query<CollectionRow>(
      SELECT + " WHERE id = $1 LIMIT 1",
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const runs = await this.archive.getRunsByIds(row.run_ids);
    if (runs.length !== row.run_ids.length) {
      throw new Error("research_collection_snapshot_incomplete");
    }
    const summary = view(row);
    if (researchCollectionDigest(summary.filters, summary.runIds) !== summary.contentSha256) {
      throw new Error("research_collection_digest_mismatch");
    }
    return { ...summary, runs };
  }
}

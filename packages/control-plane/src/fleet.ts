import { Pool } from "pg";

export type ExecutionEnvironmentServiceAssurance =
  | "documented_default"
  | "documented_variant"
  | "operator_uncertain"
  | "unknown";

export interface ExecutionEnvironmentDescriptor {
  readonly id: string;
  readonly slug: string;
  readonly region: string;
  readonly accountTier: string | null;
  readonly serviceTier: string | null;
  readonly serviceAssurance: ExecutionEnvironmentServiceAssurance;
  readonly enabled: boolean;
  readonly stateEventId: string;
  readonly createdBy: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface ExecutionEnvironmentCapability {
  readonly eventId: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly executionPath: string;
  readonly enabled: boolean;
  readonly selectionPriority: number;
  readonly effectiveAt: string;
  readonly actor: string;
  readonly note: string | null;
}

export interface ExecutionEnvironmentView
  extends ExecutionEnvironmentDescriptor {
  readonly capabilities: readonly ExecutionEnvironmentCapability[];
}

export interface RegisterExecutionEnvironmentInput {
  readonly slug: string;
  readonly region: string;
  readonly accountTier?: string;
  readonly serviceTier?: string;
  readonly serviceAssurance: ExecutionEnvironmentServiceAssurance;
  readonly enabled?: boolean;
  readonly actor: string;
  readonly note?: string;
}

export interface SetExecutionEnvironmentStateInput {
  readonly environmentId: string;
  readonly enabled: boolean;
  readonly actor: string;
  readonly note?: string;
  readonly effectiveAt?: string;
}

export interface DeclareExecutionEnvironmentCapabilityInput {
  readonly environmentId: string;
  readonly providerId: string;
  readonly executionPath: "first_party_direct";
  readonly enabled: boolean;
  readonly selectionPriority?: number;
  readonly actor: string;
  readonly note?: string;
  readonly effectiveAt?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(label + " is required");
  return normalized;
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function effectiveAt(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("effectiveAt must be an ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

function validAssurance(
  value: string,
): value is ExecutionEnvironmentServiceAssurance {
  return (
    value === "documented_default" ||
    value === "documented_variant" ||
    value === "operator_uncertain" ||
    value === "unknown"
  );
}

interface EnvironmentRow {
  id: string;
  slug: string;
  region: string;
  account_tier: string | null;
  service_tier: string | null;
  service_assurance: ExecutionEnvironmentServiceAssurance;
  enabled: boolean;
  state_event_id: string;
  created_by: string;
  note: string | null;
  created_at: Date;
}

function environmentView(row: EnvironmentRow): ExecutionEnvironmentDescriptor {
  return {
    id: row.id,
    slug: row.slug,
    region: row.region,
    accountTier: row.account_tier,
    serviceTier: row.service_tier,
    serviceAssurance: row.service_assurance,
    enabled: row.enabled,
    stateEventId: row.state_event_id,
    createdBy: row.created_by,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

export class PgExecutionFleet {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgExecutionFleet {
    return new PgExecutionFleet(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  private async descriptorRows(): Promise<EnvironmentRow[]> {
    const result = await this.pool.query<EnvironmentRow>(
      `SELECT
         environment.id,
         environment.slug,
         environment.region,
         environment.account_tier,
         environment.service_tier,
         environment.service_assurance,
         state.enabled,
         state.id AS state_event_id,
         environment.created_by,
         environment.note,
         environment.created_at
       FROM modelapse.execution_environments environment
       JOIN modelapse.execution_environment_current_state state
         ON state.environment_id = environment.id
       ORDER BY environment.slug`,
    );
    return result.rows;
  }

  async listEnvironments(): Promise<readonly ExecutionEnvironmentView[]> {
    const environments = await this.descriptorRows();
    if (environments.length === 0) return [];

    const capabilities = await this.pool.query<{
      environment_id: string;
      event_id: string;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      execution_path: string;
      enabled: boolean;
      selection_priority: number;
      effective_at: Date;
      actor: string;
      note: string | null;
    }>(
      `SELECT
         capability.environment_id,
         capability.id AS event_id,
         provider.id AS provider_id,
         provider.slug AS provider_slug,
         provider.name AS provider_name,
         capability.execution_path,
         capability.enabled,
         capability.selection_priority,
         capability.effective_at,
         capability.actor,
         capability.note
       FROM modelapse.execution_environment_capabilities_current capability
       JOIN modelapse.providers provider ON provider.id = capability.provider_id
       WHERE capability.environment_id = ANY($1::uuid[])
       ORDER BY environment_id, provider.slug, capability.execution_path`,
      [environments.map((environment) => environment.id)],
    );

    const byEnvironment = new Map<string, ExecutionEnvironmentCapability[]>();
    for (const row of capabilities.rows) {
      const list = byEnvironment.get(row.environment_id) ?? [];
      list.push({
        eventId: row.event_id,
        provider: {
          id: row.provider_id,
          slug: row.provider_slug,
          name: row.provider_name,
        },
        executionPath: row.execution_path,
        enabled: row.enabled,
        selectionPriority: row.selection_priority,
        effectiveAt: row.effective_at.toISOString(),
        actor: row.actor,
        note: row.note,
      });
      byEnvironment.set(row.environment_id, list);
    }

    return environments.map((row) => ({
      ...environmentView(row),
      capabilities: byEnvironment.get(row.id) ?? [],
    }));
  }

  async resolveWorkerEnvironment(
    slug: string,
  ): Promise<ExecutionEnvironmentDescriptor | null> {
    const normalized = slug.trim();
    if (!normalized || !SLUG_RE.test(normalized)) {
      throw new Error("execution environment slug is invalid");
    }

    const result = await this.pool.query<EnvironmentRow>(
      `SELECT
         environment.id,
         environment.slug,
         environment.region,
         environment.account_tier,
         environment.service_tier,
         environment.service_assurance,
         state.enabled,
         state.id AS state_event_id,
         environment.created_by,
         environment.note,
         environment.created_at
       FROM modelapse.execution_environments environment
       JOIN modelapse.execution_environment_current_state state
         ON state.environment_id = environment.id
       WHERE environment.slug = $1
       LIMIT 1`,
      [normalized],
    );
    return result.rows[0] ? environmentView(result.rows[0]) : null;
  }

  async registerEnvironment(
    input: RegisterExecutionEnvironmentInput,
  ): Promise<ExecutionEnvironmentDescriptor> {
    const slug = input.slug.trim();
    if (!SLUG_RE.test(slug)) {
      throw new Error(
        "slug must use lowercase letters, digits, and hyphens",
      );
    }
    const region = requiredText(input.region, "region");
    const accountTier = optionalText(input.accountTier);
    const serviceTier = optionalText(input.serviceTier);
    if (!validAssurance(input.serviceAssurance)) {
      throw new Error("serviceAssurance is invalid");
    }
    const actor = requiredText(input.actor, "actor");
    const note = optionalText(input.note);
    const enabled = input.enabled ?? true;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{
        id: string;
        slug: string;
        region: string;
        account_tier: string | null;
        service_tier: string | null;
        service_assurance: ExecutionEnvironmentServiceAssurance;
        created_by: string;
        note: string | null;
        created_at: Date;
      }>(
        `INSERT INTO modelapse.execution_environments
          (
            slug,
            region,
            account_tier,
            service_tier,
            service_assurance,
            created_by,
            note
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
           id,
           slug,
           region,
           account_tier,
           service_tier,
           service_assurance,
           created_by,
           note,
           created_at`,
        [
          slug,
          region,
          accountTier,
          serviceTier,
          input.serviceAssurance,
          actor,
          note,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Execution environment insert failed");

      const state = await client.query<{ id: string }>(
        `INSERT INTO modelapse.execution_environment_state_events
          (environment_id, enabled, actor, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [row.id, enabled, actor, note],
      );
      const stateEventId = state.rows[0]?.id;
      if (!stateEventId) throw new Error("Execution environment state insert failed");
      await client.query("COMMIT");

      return {
        id: row.id,
        slug: row.slug,
        region: row.region,
        accountTier: row.account_tier,
        serviceTier: row.service_tier,
        serviceAssurance: row.service_assurance,
        enabled,
        stateEventId,
        createdBy: row.created_by,
        note: row.note,
        createdAt: row.created_at.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async setEnvironmentState(
    input: SetExecutionEnvironmentStateInput,
  ): Promise<{ readonly eventId: string; readonly enabled: boolean }> {
    if (!UUID_RE.test(input.environmentId)) {
      throw new Error("environmentId must be a UUID");
    }
    const actor = requiredText(input.actor, "actor");
    const note = optionalText(input.note);
    const inserted = await this.pool.query<{ id: string; enabled: boolean }>(
      `INSERT INTO modelapse.execution_environment_state_events
        (environment_id, enabled, effective_at, actor, note)
       SELECT $1, $2, $3, $4, $5
       WHERE EXISTS (
         SELECT 1 FROM modelapse.execution_environments WHERE id = $1
       )
       RETURNING id, enabled`,
      [
        input.environmentId,
        input.enabled,
        effectiveAt(input.effectiveAt),
        actor,
        note,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("Execution environment not found");
    return { eventId: row.id, enabled: row.enabled };
  }

  async declareCapability(
    input: DeclareExecutionEnvironmentCapabilityInput,
  ): Promise<ExecutionEnvironmentCapability> {
    if (!UUID_RE.test(input.environmentId)) {
      throw new Error("environmentId must be a UUID");
    }
    if (!UUID_RE.test(input.providerId)) {
      throw new Error("providerId must be a UUID");
    }
    if (input.executionPath !== "first_party_direct") {
      throw new Error("Only first_party_direct fleet capability is supported");
    }
    const priority = input.selectionPriority ?? 100;
    if (!Number.isInteger(priority) || priority < 0 || priority > 100000) {
      throw new Error(
        "selectionPriority must be an integer between 0 and 100000",
      );
    }
    const actor = requiredText(input.actor, "actor");
    const note = optionalText(input.note);

    const inserted = await this.pool.query<{
      event_id: string;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      execution_path: string;
      enabled: boolean;
      selection_priority: number;
      effective_at: Date;
      actor: string;
      note: string | null;
    }>(
      `WITH inserted AS (
         INSERT INTO modelapse.execution_environment_capability_events
           (
             environment_id,
             provider_id,
             execution_path,
             enabled,
             selection_priority,
             effective_at,
             actor,
             note
           )
         SELECT $1, provider.id, $3::modelapse.execution_path, $4, $5, $6, $7, $8
           FROM modelapse.providers provider
          WHERE provider.id = $2
            AND EXISTS (
              SELECT 1
                FROM modelapse.execution_environments
               WHERE id = $1
            )
         RETURNING *
       )
       SELECT
         inserted.id AS event_id,
         provider.id AS provider_id,
         provider.slug AS provider_slug,
         provider.name AS provider_name,
         inserted.execution_path,
         inserted.enabled,
         inserted.selection_priority,
         inserted.effective_at,
         inserted.actor,
         inserted.note
       FROM inserted
       JOIN modelapse.providers provider ON provider.id = inserted.provider_id`,
      [
        input.environmentId,
        input.providerId,
        input.executionPath,
        input.enabled,
        priority,
        effectiveAt(input.effectiveAt),
        actor,
        note,
      ],
    );
    const row = inserted.rows[0];
    if (!row) {
      throw new Error("Execution environment or provider not found");
    }
    return {
      eventId: row.event_id,
      provider: {
        id: row.provider_id,
        slug: row.provider_slug,
        name: row.provider_name,
      },
      executionPath: row.execution_path,
      enabled: row.enabled,
      selectionPriority: row.selection_priority,
      effectiveAt: row.effective_at.toISOString(),
      actor: row.actor,
      note: row.note,
    };
  }
}

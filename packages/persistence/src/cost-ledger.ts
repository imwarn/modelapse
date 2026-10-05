import { Pool } from "pg";

export interface CollectionDailyCostView {
  readonly day: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly currency: string | null;
  readonly completedRuns: number;
  readonly estimatedRuns: number;
  readonly unknownCostRuns: number;
  readonly estimatedNativeCost: string;
}

export interface CollectionBudgetPolicyView {
  readonly id: string;
  readonly providerId: string | null;
  readonly currency: string;
  readonly period: "day" | "month";
  readonly budgetAmount: string;
  readonly effectiveFrom: string;
  readonly actor: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface CollectionBudgetStatusView {
  readonly policyId: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  } | null;
  readonly currency: string;
  readonly period: "day" | "month";
  readonly budgetAmount: string;
  readonly effectiveFrom: string;
  readonly periodStart: string;
  readonly estimatedSpend: string;
  readonly unknownCostRuns: number;
  readonly remainingBudget: string;
}

export interface RecordCollectionBudgetPolicyInput {
  readonly providerId?: string;
  readonly currency: string;
  readonly period: "day" | "month";
  readonly budgetAmount: string;
  readonly effectiveFrom?: string;
  readonly actor: string;
  readonly note?: string;
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const POSITIVE_DECIMAL_RE = /^\d+(?:\.\d+)?$/;

function timestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("effectiveFrom must be an ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

export class PgCostLedger {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCostLedger {
    return new PgCostLedger(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async listDailyCosts(days = 30): Promise<readonly CollectionDailyCostView[]> {
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      throw new Error("days must be an integer between 1 and 366");
    }

    const result = await this.pool.query<{
      day: Date;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      currency: string | null;
      completed_runs: string;
      estimated_runs: string;
      unknown_cost_runs: string;
      estimated_native_cost: string;
    }>(
      `SELECT
         day,
         provider_id,
         provider_slug,
         provider_name,
         currency,
         completed_runs::text,
         estimated_runs::text,
         unknown_cost_runs::text,
         estimated_native_cost::text
       FROM modelapse.collection_cost_daily
       WHERE day >= date_trunc('day', now()) - (($1::int - 1) * interval '1 day')
       ORDER BY day DESC, provider_slug, currency NULLS LAST`,
      [days],
    );

    return result.rows.map((row) => ({
      day: row.day.toISOString(),
      provider: {
        id: row.provider_id,
        slug: row.provider_slug,
        name: row.provider_name,
      },
      currency: row.currency,
      completedRuns: Number(row.completed_runs),
      estimatedRuns: Number(row.estimated_runs),
      unknownCostRuns: Number(row.unknown_cost_runs),
      estimatedNativeCost: row.estimated_native_cost,
    }));
  }

  async listBudgetStatus(): Promise<readonly CollectionBudgetStatusView[]> {
    const result = await this.pool.query<{
      policy_id: string;
      provider_id: string | null;
      provider_slug: string | null;
      provider_name: string | null;
      currency: string;
      period: "day" | "month";
      budget_amount: string;
      effective_from: Date;
      period_start: Date;
      estimated_spend: string;
      unknown_cost_runs: string;
      remaining_budget: string;
    }>(
      `SELECT
         policy_id,
         provider_id,
         provider_slug,
         provider_name,
         currency,
         period,
         budget_amount::text,
         effective_from,
         period_start,
         estimated_spend::text,
         unknown_cost_runs::text,
         remaining_budget::text
       FROM modelapse.collection_budget_status
       ORDER BY provider_slug NULLS FIRST, currency, period`,
    );

    return result.rows.map((row) => ({
      policyId: row.policy_id,
      provider:
        row.provider_id && row.provider_slug && row.provider_name
          ? {
              id: row.provider_id,
              slug: row.provider_slug,
              name: row.provider_name,
            }
          : null,
      currency: row.currency,
      period: row.period,
      budgetAmount: row.budget_amount,
      effectiveFrom: row.effective_from.toISOString(),
      periodStart: row.period_start.toISOString(),
      estimatedSpend: row.estimated_spend,
      unknownCostRuns: Number(row.unknown_cost_runs),
      remainingBudget: row.remaining_budget,
    }));
  }

  async recordBudgetPolicy(
    input: RecordCollectionBudgetPolicyInput,
  ): Promise<CollectionBudgetPolicyView> {
    const currency = input.currency.trim().toUpperCase();
    if (!CURRENCY_RE.test(currency)) {
      throw new Error("currency must be a three-letter currency code");
    }
    if (input.period !== "day" && input.period !== "month") {
      throw new Error("period must be day or month");
    }
    const budgetAmount = input.budgetAmount.trim();
    if (
      !POSITIVE_DECIMAL_RE.test(budgetAmount) ||
      Number(budgetAmount) <= 0
    ) {
      throw new Error("budgetAmount must be a positive decimal string");
    }
    const actor = input.actor.trim();
    if (!actor) throw new Error("actor is required");
    const note = input.note?.trim() || null;

    const result = await this.pool.query<{
      id: string;
      provider_id: string | null;
      currency: string;
      period: "day" | "month";
      budget_amount: string;
      effective_from: Date;
      actor: string;
      note: string | null;
      created_at: Date;
    }>(
      `INSERT INTO modelapse.collection_budget_policies
        (
          provider_id,
          currency,
          period,
          budget_amount,
          effective_from,
          actor,
          note
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
         id,
         provider_id,
         currency,
         period,
         budget_amount::text,
         effective_from,
         actor,
         note,
         created_at`,
      [
        input.providerId ?? null,
        currency,
        input.period,
        budgetAmount,
        timestamp(input.effectiveFrom),
        actor,
        note,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Budget policy insert did not return a row");
    return {
      id: row.id,
      providerId: row.provider_id,
      currency: row.currency,
      period: row.period,
      budgetAmount: row.budget_amount,
      effectiveFrom: row.effective_from.toISOString(),
      actor: row.actor,
      note: row.note,
      createdAt: row.created_at.toISOString(),
    };
  }
}

export type BudgetScope = "job" | "daily" | "provider" | "record";

export class BudgetExceededError extends Error {
  constructor(
    readonly scope: BudgetScope,
    message: string,
    readonly detail: { limit: number; used: number; requested: number; provider?: string },
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export interface BudgetLimits {
  /** Hard cap for this job (credits). */
  maxCredits: number;
  /** Cap across all jobs for the current UTC day, or null for none. */
  dailyCap: number | null;
  /** Credits already spent today by earlier jobs (from the ledger). */
  dailySpentBefore: number;
  /** Per-provider caps for this job. */
  providerCaps: Record<string, number>;
  /** Per-record cap for this job (credits). Infinity disables it. */
  maxRecordCredits: number;
}

export interface Reservation {
  id: number;
  provider: string;
  recordKey: string | null;
  credits: number;
}

/**
 * Reserve-before-call accounting. Reservations use the listed price (worst case) so the job
 * can never exceed `maxCredits` even with calls in flight; `commit` swaps in the actual cost.
 */
export class BudgetGuard {
  private nextId = 1;
  private readonly open = new Map<number, Reservation>();
  private committedTotal = 0;
  private readonly committedByProvider = new Map<string, number>();
  private readonly committedByRecord = new Map<string, number>();

  constructor(readonly limits: BudgetLimits) {}

  private reservedTotal(): number {
    let n = 0;
    for (const r of this.open.values()) n += r.credits;
    return n;
  }

  private reservedFor(provider: string): number {
    let n = 0;
    for (const r of this.open.values()) if (r.provider === provider) n += r.credits;
    return n;
  }

  private reservedForRecord(recordKey: string): number {
    let n = 0;
    for (const r of this.open.values()) if (r.recordKey === recordKey) n += r.credits;
    return n;
  }

  get spent(): number {
    return this.committedTotal;
  }

  get remaining(): number {
    return Math.max(0, this.limits.maxCredits - this.committedTotal - this.reservedTotal());
  }

  /** Non-throwing check used by planners to trim a plan before any call is attempted. */
  check(provider: string, credits: number, recordKey: string | null): BudgetExceededError | null {
    const { limits } = this;
    const jobUsed = this.committedTotal + this.reservedTotal();
    if (jobUsed + credits > limits.maxCredits + 1e-9) {
      return new BudgetExceededError("job", `Job budget of ${limits.maxCredits} credits would be exceeded`, {
        limit: limits.maxCredits,
        used: jobUsed,
        requested: credits,
      });
    }
    if (limits.dailyCap !== null) {
      const dailyUsed = limits.dailySpentBefore + jobUsed;
      if (dailyUsed + credits > limits.dailyCap + 1e-9) {
        return new BudgetExceededError("daily", `Daily budget of ${limits.dailyCap} credits would be exceeded`, {
          limit: limits.dailyCap,
          used: dailyUsed,
          requested: credits,
        });
      }
    }
    const cap = limits.providerCaps[provider];
    if (cap !== undefined) {
      const used = (this.committedByProvider.get(provider) ?? 0) + this.reservedFor(provider);
      if (used + credits > cap + 1e-9) {
        return new BudgetExceededError("provider", `Provider cap of ${cap} credits for ${provider} would be exceeded`, {
          limit: cap,
          used,
          requested: credits,
          provider,
        });
      }
    }
    if (recordKey && Number.isFinite(limits.maxRecordCredits)) {
      const used = (this.committedByRecord.get(recordKey) ?? 0) + this.reservedForRecord(recordKey);
      if (used + credits > limits.maxRecordCredits + 1e-9) {
        return new BudgetExceededError("record", `Per-record cap of ${limits.maxRecordCredits} credits would be exceeded`, {
          limit: limits.maxRecordCredits,
          used,
          requested: credits,
        });
      }
    }
    return null;
  }

  reserve(provider: string, credits: number, recordKey: string | null): Reservation {
    const violation = this.check(provider, credits, recordKey);
    if (violation) throw violation;
    const r: Reservation = { id: this.nextId++, provider, recordKey, credits };
    this.open.set(r.id, r);
    return r;
  }

  /** Replace the reservation with the actual (or, when uncertain, the reserved) cost. */
  commit(r: Reservation, actualCredits: number): void {
    if (!this.open.delete(r.id)) return;
    this.committedTotal += actualCredits;
    this.committedByProvider.set(r.provider, (this.committedByProvider.get(r.provider) ?? 0) + actualCredits);
    if (r.recordKey) this.committedByRecord.set(r.recordKey, (this.committedByRecord.get(r.recordKey) ?? 0) + actualCredits);
  }

  release(r: Reservation): void {
    this.open.delete(r.id);
  }

  snapshot() {
    return {
      spent: this.committedTotal,
      reserved: this.reservedTotal(),
      remaining: this.remaining,
      byProvider: Object.fromEntries(this.committedByProvider),
      maxCredits: this.limits.maxCredits,
      dailyCap: this.limits.dailyCap,
      dailySpentBefore: this.limits.dailySpentBefore,
    };
  }
}

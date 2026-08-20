/** Shared “is this firm actively deploying?” signals for directory cards and the Activity tab. */

export type ActivelyDeployingSignals = {
  /** `firm_records.is_actively_deploying` */
  isActivelyDeploying?: boolean | null;
  /** `firm_records.has_fresh_capital` — newly raised / unspent fund */
  hasFreshCapital?: boolean | null;
  /** `firm_records.likely_actively_deploying` rollup from current funds */
  likelyActivelyDeploying?: boolean | null;
  /** `vc_funds.likely_actively_deploying` for the current fund */
  fundLikelyActivelyDeploying?: boolean | null;
  /** Count of known recent investments */
  recentDealCount?: number | null;
  /** 0–100 directory velocity score (derived from recent deals) */
  dealVelocityScore?: number | null;
  /** Most recent deal announcement */
  lastDealAt?: string | Date | null;
  /** Latest fund vintage year */
  latestFundVintageYear?: number | null;
  /** `firm_records.last_fund_announcement_date` */
  lastFundAnnouncementAt?: string | Date | null;
};

const RECENT_INVESTMENT_MONTHS = 18;
const FRESH_FUND_VINTAGE_YEARS = 2;
const ACTIVE_VELOCITY_FLOOR = 35;

function monthsAgo(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() - months);
  return d;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A firm is actively deploying if it raised a new fund, invested recently,
 * or is explicitly marked as deploying. Positive signals are OR’d — velocity
 * never vetoes a fresh-fund or live fund flag.
 */
export function resolveActivelyDeploying(signals: ActivelyDeployingSignals, now = new Date()): boolean {
  if (signals.isActivelyDeploying === true) return true;
  if (signals.hasFreshCapital === true) return true;
  if (signals.likelyActivelyDeploying === true) return true;
  if (signals.fundLikelyActivelyDeploying === true) return true;

  const dealCount = signals.recentDealCount;
  if (typeof dealCount === "number" && dealCount >= 1) return true;

  const velocity = signals.dealVelocityScore;
  if (typeof velocity === "number" && velocity >= ACTIVE_VELOCITY_FLOOR) return true;

  const lastDeal = parseDate(signals.lastDealAt);
  if (lastDeal && lastDeal >= monthsAgo(now, RECENT_INVESTMENT_MONTHS)) return true;

  const vintage = signals.latestFundVintageYear;
  if (typeof vintage === "number" && Number.isFinite(vintage) && vintage >= now.getFullYear() - FRESH_FUND_VINTAGE_YEARS) {
    return true;
  }

  const fundAnnounced = parseDate(signals.lastFundAnnouncementAt);
  if (fundAnnounced && fundAnnounced >= monthsAgo(now, FRESH_FUND_VINTAGE_YEARS * 12)) {
    return true;
  }

  return false;
}

export function recentDealCount(deals: unknown): number | null {
  if (!Array.isArray(deals)) return null;
  return deals.length;
}

/** Count entries in `last_5_investments` / similar JSON lists. */
export function listedInvestmentCount(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const n = value.filter((item) => item != null && item !== "").length;
  return n > 0 ? n : null;
}

/** Same key as the directory grid (`normalizeFirmName`) — letters/digits only. */
export function deployingNameKey(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

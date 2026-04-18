import { supabasePublicDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";

/**
 * Canonical public Fresh Capital feed source:
 * - RPC: `public.get_new_vc_funds(...)`
 * - Canonical tables behind it: `vc_funds` + derived freshness on `firm_records`
 * - Not candidate staging (`candidate_capital_events*`)
 * - Not `fund_records` except legacy compatibility elsewhere
 */

/**
 * Demo/sample rows: **non-production only**, gated by `VITE_FRESH_CAPITAL_DEMO=true`.
 * Never used when `import.meta.env.PROD` is true.
 */
export class FreshCapitalMisconfiguredError extends Error {
  constructor(message = "Fresh Capital requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.") {
    super(message);
    this.name = "FreshCapitalMisconfiguredError";
  }
}

/** Opt-in demo dataset for local/preview dev builds only. */
export function isFreshCapitalDemoDataEnabled(): boolean {
  if (import.meta.env.PROD) return false;
  return import.meta.env.VITE_FRESH_CAPITAL_DEMO === "true";
}

/** Row shape for `public.get_new_vc_funds` (migration 20260418190000 + 20260423120000). */
export type FreshCapitalFundRow = {
  vc_fund_id: string;
  firm_record_id: string;
  firm_name: string;
  fund_name: string;
  fund_type: string | null;
  fund_sequence_number: number | null;
  vintage_year: number | null;
  announced_date: string | null;
  close_date: string | null;
  target_size_usd: number | null;
  final_size_usd: number | null;
  status: string | null;
  /** Used only for sort ordering client-side — do not render as a “score” on the public page. */
  source_confidence: number | null;
  announcement_url: string | null;
  announcement_title: string | null;
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  geography_focus: string[] | null;
  has_fresh_capital: boolean | null;
  /** Firm-level rollup; sort-only on the public page — do not render numerically. */
  fresh_capital_priority_score: number | null;
  /** Same COALESCE rule as `get_active_funds_by_stage` (see migration 20260423120000). */
  likely_actively_deploying: boolean | null;
};

export type FreshCapitalStageFilter = "all" | "seed" | "series_a" | "growth";

export type HeatmapBucket = {
  label: string;
  count: number;
  /** 0–1 for bar width */
  intensity: number;
  tier: "high" | "moderate" | "low";
};

export type HeatmapSource = "rpc" | "fallback_sector_tag_counts";

const STAGE_RPC: Record<Exclude<FreshCapitalStageFilter, "all">, string[]> = {
  seed: ["Seed"],
  series_a: ["Series A"],
  growth: ["Growth"],
};

export function stageFilterToRpcArray(stage: FreshCapitalStageFilter): string[] | null {
  if (stage === "all") return null;
  return STAGE_RPC[stage];
}

export function formatFundSizeUsd(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${Math.round(value / 1e6)}M`;
  if (value >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value)}`;
}

export function formatAnnouncedDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Sort by recency, then firm priority rollup, then source confidence (ordering only — not displayed). */
export function sortFreshCapitalRows(rows: FreshCapitalFundRow[]): FreshCapitalFundRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.announced_date || a.close_date || "") || 0;
    const tb = Date.parse(b.announced_date || b.close_date || "") || 0;
    if (tb !== ta) return tb - ta;
    const pa = a.fresh_capital_priority_score ?? 0;
    const pb = b.fresh_capital_priority_score ?? 0;
    if (pb !== pa) return pb - pa;
    const ca = a.source_confidence ?? 0;
    const cb = b.source_confidence ?? 0;
    return cb - ca;
  });
}

export function isLikelyNewFundAnnouncement(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "announced" || s === "target" || s === "first_close";
}

/**
 * Fallback heatmap when `get_capital_heatmap_backend` is absent or empty.
 *
 * **Diff vs a proper backend heatmap:** this counts **rows** in the current `get_new_vc_funds`
 * result set and increments one per `sector_focus` tag (multi-tag funds contribute to multiple buckets).
 * It does not weight by fund size, geography, or time beyond whatever window the feed RPC used.
 * When `get_capital_heatmap_backend` exists, the UI uses that as the canonical source instead.
 */
export function aggregateSectorHeatmap(rows: FreshCapitalFundRow[], topN = 8): HeatmapBucket[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const raw of r.sector_focus ?? []) {
      const k = raw?.trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
  const max = sorted[0]?.[1] ?? 1;
  return sorted.map(([label, count]) => {
    const ratio = count / max;
    const tier: HeatmapBucket["tier"] = ratio >= 0.66 ? "high" : ratio >= 0.33 ? "moderate" : "low";
    return { label, count, intensity: ratio, tier };
  });
}

const DEMO_FUNDS: FreshCapitalFundRow[] = [
  {
    vc_fund_id: "00000000-0000-4000-8000-000000000001",
    firm_record_id: "00000000-0000-4000-8000-000000000011",
    firm_name: "Northline Ventures",
    fund_name: "Northline Fund IV",
    fund_type: "venture",
    fund_sequence_number: 4,
    vintage_year: 2026,
    announced_date: new Date().toISOString().slice(0, 10),
    close_date: null,
    target_size_usd: 4e8,
    final_size_usd: null,
    status: "announced",
    source_confidence: 0.82,
    announcement_url: null,
    announcement_title: "Northline Ventures announces $400M Fund IV to back AI infrastructure and devtools.",
    stage_focus: ["Seed", "Series A"],
    sector_focus: ["AI", "Developer Tools"],
    geography_focus: ["North America"],
    has_fresh_capital: true,
    fresh_capital_priority_score: 0.91,
    likely_actively_deploying: true,
  },
  {
    vc_fund_id: "00000000-0000-4000-8000-000000000002",
    firm_record_id: "00000000-0000-4000-8000-000000000012",
    firm_name: "Harbor Peak Capital",
    fund_name: "Harbor Peak Growth II",
    fund_type: "growth",
    fund_sequence_number: 2,
    vintage_year: 2026,
    announced_date: new Date(Date.now() - 864e5 * 4).toISOString().slice(0, 10),
    close_date: null,
    target_size_usd: null,
    final_size_usd: 1.1e9,
    status: "first_close",
    source_confidence: 0.77,
    announcement_url: null,
    announcement_title: null,
    stage_focus: ["Growth", "Series B+"],
    sector_focus: ["Climate", "Energy"],
    geography_focus: ["Global"],
    has_fresh_capital: true,
    fresh_capital_priority_score: 0.88,
    likely_actively_deploying: true,
  },
  {
    vc_fund_id: "00000000-0000-4000-8000-000000000003",
    firm_record_id: "00000000-0000-4000-8000-000000000013",
    firm_name: "Relay Partners",
    fund_name: "Relay Seed III",
    fund_type: "venture",
    fund_sequence_number: 3,
    vintage_year: 2025,
    announced_date: new Date(Date.now() - 864e5 * 21).toISOString().slice(0, 10),
    close_date: null,
    target_size_usd: 1.2e8,
    final_size_usd: null,
    status: "announced",
    source_confidence: 0.74,
    announcement_url: null,
    announcement_title: "Relay closes first $120M tranche for seed-stage founders in fintech and commerce.",
    stage_focus: ["Seed", "Pre-Seed"],
    sector_focus: ["Fintech", "Consumer"],
    geography_focus: ["United States"],
    has_fresh_capital: true,
    fresh_capital_priority_score: 0.72,
    likely_actively_deploying: false,
  },
];

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
  return out.length ? out : null;
}

function readBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function readFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function readInt(v: unknown): number | null {
  const n = readFiniteNumber(v);
  if (n == null) return null;
  return Math.trunc(n);
}

/** Defensive parse of one RPC row — drops malformed rows instead of crashing the page. */
export function parseFreshCapitalFundRow(raw: unknown): FreshCapitalFundRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vc_fund_id = readString(r.vc_fund_id);
  const firm_record_id = readString(r.firm_record_id);
  const firm_name = readString(r.firm_name);
  const fund_name = readString(r.fund_name);
  if (!vc_fund_id || !firm_record_id || !firm_name || !fund_name) return null;

  return {
    vc_fund_id,
    firm_record_id,
    firm_name,
    fund_name,
    fund_type: readString(r.fund_type),
    fund_sequence_number: readInt(r.fund_sequence_number),
    vintage_year: readInt(r.vintage_year),
    announced_date: readString(r.announced_date),
    close_date: readString(r.close_date),
    target_size_usd: readFiniteNumber(r.target_size_usd),
    final_size_usd: readFiniteNumber(r.final_size_usd),
    status: readString(r.status),
    source_confidence: readFiniteNumber(r.source_confidence),
    announcement_url: readString(r.announcement_url),
    announcement_title: readString(r.announcement_title),
    stage_focus: readStringArray(r.stage_focus),
    sector_focus: readStringArray(r.sector_focus),
    geography_focus: readStringArray(r.geography_focus),
    has_fresh_capital: readBool(r.has_fresh_capital),
    fresh_capital_priority_score: readFiniteNumber(r.fresh_capital_priority_score),
    likely_actively_deploying: readBool(r.likely_actively_deploying),
  };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<{ data: T | null; error: Error | null }> {
  const res = await (supabasePublicDirectory as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }> }).rpc(
    name,
    args,
  );
  return { data: res.data ?? null, error: res.error ? new Error(res.error.message) : null };
}

export type FreshCapitalLivePayload = {
  funds: FreshCapitalFundRow[];
  heatmapFromRpc: HeatmapBucket[] | null;
  heatmapRpcError: Error | null;
};

function normalizeHeatmapRpcRows(data: unknown): HeatmapBucket[] | null {
  if (!Array.isArray(data)) return null;
  const normalized: HeatmapBucket[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const dimensionKind = readString(r.dimension_kind);
    if (dimensionKind && dimensionKind !== "sector") continue;
    const label =
      readString(r.dimension_value) ??
      readString(r.label) ??
      readString(r.sector) ??
      readString(r.bucket) ??
      readString(r.name) ??
      readString(r.sector_name);
    const countNum =
      readFiniteNumber(r.signal_count) ??
      readFiniteNumber(r.count) ??
      readFiniteNumber(r.fund_count) ??
      readFiniteNumber(r.n);
    const count = countNum != null && countNum > 0 ? Math.round(countNum) : 1;
    if (!label) continue;
    const act = (readString(r.activity) ?? readString(r.tier) ?? "").toLowerCase();
    let tier: HeatmapBucket["tier"] = "moderate";
    if (act.includes("high")) tier = "high";
    else if (act.includes("low")) tier = "low";
    normalized.push({ label, count, intensity: 0.5, tier });
  }
  if (!normalized.length) return null;
  const max = Math.max(...normalized.map((x) => x.count), 1);
  return normalized.map((x) => ({
    ...x,
    intensity: x.count / max,
  }));
}

export async function fetchFreshCapitalLive(input: {
  stage: FreshCapitalStageFilter;
  sector: string | null;
  fundLimit?: number;
  fundDays?: number;
}): Promise<FreshCapitalLivePayload> {
  if (!isSupabaseConfigured) {
    if (!isFreshCapitalDemoDataEnabled()) {
      throw new FreshCapitalMisconfiguredError();
    }
    let funds = [...DEMO_FUNDS];
    if (input.stage !== "all") {
      const need = new Set(stageFilterToRpcArray(input.stage) ?? []);
      funds = funds.filter((f) => (f.stage_focus ?? []).some((s) => need.has(s)));
    }
    if (input.sector) {
      funds = funds.filter((f) => (f.sector_focus ?? []).includes(input.sector));
    }
    return {
      funds: sortFreshCapitalRows(funds),
      heatmapFromRpc: null,
      heatmapRpcError: null,
    };
  }

  const p_stage = stageFilterToRpcArray(input.stage);
  const p_sector = input.sector ? [input.sector] : null;

  const fundArgs = {
    p_limit: input.fundLimit ?? 72,
    p_days: input.fundDays ?? 150,
    p_stage,
    p_sector,
    p_geography: null,
    p_fund_size_min: null,
    p_fund_size_max: null,
    p_firm_type: null,
  };

  const [fundsRes, heatmapRes] = await Promise.all([
    rpc<unknown[]>("get_new_vc_funds", fundArgs),
    rpc<unknown>("get_capital_heatmap_backend", { p_window_days: input.fundDays ?? 150 }),
  ]);

  if (fundsRes.error) {
    console.warn("[FreshCapital] get_new_vc_funds", fundsRes.error);
    throw fundsRes.error;
  }

  const parsed = (fundsRes.data ?? []).map(parseFreshCapitalFundRow).filter((x): x is FreshCapitalFundRow => Boolean(x));
  const funds = sortFreshCapitalRows(
    parsed.filter((row) => {
      // Canonical verified funds should usually have one of these dates; drop rows that cannot
      // be placed on the timeline instead of rendering a misleading “live” undated item.
      return Boolean(row.announced_date || row.close_date);
    }),
  );

  const heatErr = heatmapRes.error;
  if (heatErr) {
    console.warn("[FreshCapital] get_capital_heatmap_backend", heatErr.message);
  }
  const heatBuckets = !heatmapRes.error ? normalizeHeatmapRpcRows(heatmapRes.data) : null;

  if (import.meta.env.DEV) {
    const outcome =
      heatBuckets && heatBuckets.length > 0
        ? `used_rpc_rows(count=${heatBuckets.length})`
        : heatErr
          ? `rpc_error(${heatErr.message})`
          : heatmapRes.data == null
            ? "rpc_null_body"
            : !Array.isArray(heatmapRes.data)
              ? "rpc_non_array_shape"
              : heatmapRes.data.length === 0
                ? "rpc_empty_array"
                : "rpc_unparsed_rows";
    // grep: [FreshCapital] heatmap_rpc — distinguishes heatmap data path per fetch (feed still loads if RPC fails).
    console.info(`[FreshCapital] heatmap_rpc ${outcome}`);
  }

  return {
    funds,
    heatmapFromRpc: heatBuckets && heatBuckets.length ? heatBuckets : null,
    heatmapRpcError: heatErr,
  };
}

export function topSectorsForFilter(rows: FreshCapitalFundRow[], limit = 10): string[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    for (const s of r.sector_focus ?? []) {
      const k = s?.trim();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, limit);
}

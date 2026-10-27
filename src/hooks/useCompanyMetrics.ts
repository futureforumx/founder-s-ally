import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, getSupabaseAccessToken } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseSmartNumber, smartBlurCurrency } from "@/components/data-room/metricsFormatting";

export type ActiveUsersMode = "mau" | "dau";
export type RunwayUnit = "days" | "months";
export type MetricsBusinessModel = "saas" | "usage" | "marketplace" | "pre_revenue";
export type GrowthRateMode = "yoy" | "mom";
export type PaybackUnit = "days" | "months";
export type RevenueMagnitude = "k" | "m" | "b";

export interface AdaptiveMetricsData {
  businessModel: MetricsBusinessModel;
  arr: string;
  mrr: string;
  mrrIsOverridden: boolean;
  ltvCacRatioIsOverridden: boolean;
  growthRate: string;
  yoyGrowth: string;
  momGrowth: string;
  growthRateMode: GrowthRateMode;
  churnPeriod: "monthly" | "annual";
  annualChurnRate: string;
  committedArr: string;
  recurringRevenuePercent: string;
  customerConcentration: string;
  paidComputeVolume: string;
  gmv: string;
  takeRate: string;
  netRevenue: string;
  netRevenueIsOverridden: boolean;
  gmvGrowth: string;
  transactingAccounts: string;
  activeBuyers: string;
  activeSellers: string;
  transactingAccountType: "buyers" | "sellers";
  averageOrderValue: string;
  signedPipeline: string;
  designPartners: string;
  targetContractValue: string;
  targetLaunchDate: string;
  projectedYear1Revenue: string;
  activeLogos: string;
  cacPaybackUnit: PaybackUnit;
  cacNotTracked: boolean;
  ltvNotTracked: boolean;
  nrrNotTracked: boolean;
  churnNotTracked: boolean;
  keyOpenHires: string;
  revenueMagnitude: RevenueMagnitude;
  cashMagnitude: RevenueMagnitude;
  burnMagnitude: RevenueMagnitude;
  debtMagnitude: RevenueMagnitude;
  marketMagnitude: RevenueMagnitude;
}

export interface CompanyMetricsData extends AdaptiveMetricsData {
  // Team
  headcount: string;
  background: string;
  // Market
  tam: string;
  sam: string;
  som: string;
  // Traction
  nrr: string;
  activeUsers: string;
  activeUsersMode: ActiveUsersMode;
  /** Daily actives when MAU is the stored primary. Kept locally so stickiness can use both. */
  dau: string;
  churnRate: string;
  burnMultiple: string;
  // Unit Economics
  cac: string;
  ltv: string;
  ltvCacRatioOverride: string;
  cacPaybackDays: string;
  // Financial Health
  monthlyBurnRate: string;
  runway: string;
  runwayUnit: RunwayUnit;
  runwayIsOverride: boolean;
  grossMargin: string;
  cashOnHand: string;
  totalDebt: string;
}

export const EMPTY_METRICS: CompanyMetricsData = {
  businessModel: "saas",
  arr: "",
  mrr: "",
  mrrIsOverridden: false,
  ltvCacRatioIsOverridden: false,
  growthRate: "",
  yoyGrowth: "",
  momGrowth: "",
  growthRateMode: "yoy",
  churnPeriod: "monthly",
  annualChurnRate: "",
  committedArr: "",
  recurringRevenuePercent: "",
  customerConcentration: "",
  paidComputeVolume: "",
  gmv: "",
  takeRate: "",
  netRevenue: "",
  netRevenueIsOverridden: false,
  gmvGrowth: "",
  transactingAccounts: "",
  activeBuyers: "",
  activeSellers: "",
  transactingAccountType: "buyers",
  averageOrderValue: "",
  signedPipeline: "",
  designPartners: "",
  targetContractValue: "",
  targetLaunchDate: "",
  projectedYear1Revenue: "",
  activeLogos: "",
  cacPaybackUnit: "months",
  cacNotTracked: false,
  ltvNotTracked: false,
  nrrNotTracked: false,
  churnNotTracked: false,
  keyOpenHires: "",
  revenueMagnitude: "k",
  cashMagnitude: "k",
  burnMagnitude: "k",
  debtMagnitude: "k",
  marketMagnitude: "m",
  headcount: "",
  background: "",
  tam: "",
  sam: "",
  som: "",
  nrr: "",
  activeUsers: "",
  activeUsersMode: "mau",
  dau: "",
  churnRate: "",
  burnMultiple: "",
  cac: "",
  ltv: "",
  ltvCacRatioOverride: "",
  cacPaybackDays: "",
  monthlyBurnRate: "",
  runway: "",
  runwayUnit: "months",
  runwayIsOverride: false,
  grossMargin: "",
  cashOnHand: "",
  totalDebt: "",
};

const LOCAL_STORAGE_KEY = "vekta-company-metrics";
const SAVE_DEBOUNCE_MS = 600;
const ADAPTIVE_METRIC_KEYS: (keyof AdaptiveMetricsData)[] = [
  "businessModel", "arr", "mrr", "mrrIsOverridden", "ltvCacRatioIsOverridden", "growthRate", "yoyGrowth", "momGrowth", "growthRateMode", "churnPeriod", "annualChurnRate", "committedArr",
  "recurringRevenuePercent", "customerConcentration", "paidComputeVolume", "gmv", "takeRate", "netRevenue",
  "netRevenueIsOverridden", "gmvGrowth", "transactingAccounts", "activeBuyers", "activeSellers", "transactingAccountType", "averageOrderValue",
  "signedPipeline", "designPartners", "targetContractValue", "targetLaunchDate", "projectedYear1Revenue",
  "activeLogos", "cacPaybackUnit", "cacNotTracked", "ltvNotTracked", "nrrNotTracked", "churnNotTracked",
  "keyOpenHires", "revenueMagnitude", "cashMagnitude", "burnMagnitude", "debtMagnitude", "marketMagnitude",
];

type MetricsRow = Record<string, unknown>;

/**
 * Only the values the row actually holds. Blank columns are dropped rather than returned as
 * "", so hydration never overwrites something the local copy knows about and the row does
 * not — a deck pre-fill written moments before the fetch resolved, for instance.
 */
function rowToMetrics(row: MetricsRow): Partial<CompanyMetricsData> {
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : undefined;
  const stored: Partial<CompanyMetricsData> = {
    ...(row.extra_metrics && typeof row.extra_metrics === "object" && !Array.isArray(row.extra_metrics)
      ? row.extra_metrics as Partial<AdaptiveMetricsData>
      : {}),
    headcount: text(row.headcount),
    background: text(row.background),
    tam: text(row.tam),
    sam: text(row.sam),
    som: text(row.som),
    nrr: text(row.nrr),
    activeUsers: text(row.active_users),
    // The unit toggles carry a NOT NULL default, so they only count as stored
    // when the value they describe is stored too.
    activeUsersMode: text(row.active_users) ? (row.active_users_mode === "dau" ? "dau" : "mau") : undefined,
    churnRate: text(row.churn_rate),
    burnMultiple: text(row.burn_multiple),
    cac: text(row.cac),
    ltv: text(row.ltv),
    ltvCacRatioOverride: text(row.ltv_cac_ratio_override),
    cacPaybackDays: text(row.cac_payback_days),
    monthlyBurnRate: text(row.monthly_burn_rate),
    runway: text(row.runway),
    runwayUnit: text(row.runway) ? (row.runway_unit === "days" ? "days" : "months") : undefined,
    runwayIsOverride: typeof row.runway_is_override === "boolean" ? row.runway_is_override : undefined,
    grossMargin: text(row.gross_margin),
    cashOnHand: text(row.cash_on_hand),
    totalDebt: text(row.total_debt),
  };

  return Object.fromEntries(
    Object.entries(stored).filter(([, value]) => value !== undefined),
  ) as Partial<CompanyMetricsData>;
}

function metricsToRow(m: CompanyMetricsData, userId: string) {
  const extraMetrics = Object.fromEntries(ADAPTIVE_METRIC_KEYS.map((key) => [key, m[key]]));
  return {
    user_id: userId,
    headcount: m.headcount || null,
    background: m.background || null,
    tam: m.tam || null,
    sam: m.sam || null,
    som: m.som || null,
    nrr: m.nrr || null,
    active_users: m.activeUsers || null,
    active_users_mode: m.activeUsersMode,
    churn_rate: m.churnRate || null,
    burn_multiple: m.burnMultiple || null,
    cac: m.cac || null,
    ltv: m.ltv || null,
    ltv_cac_ratio_override: m.ltvCacRatioOverride || null,
    cac_payback_days: m.cacPaybackDays || null,
    monthly_burn_rate: m.monthlyBurnRate || null,
    runway: m.runway || null,
    runway_unit: m.runwayUnit,
    runway_is_override: m.runwayIsOverride,
    extra_metrics: extraMetrics,
    gross_margin: m.grossMargin || null,
    cash_on_hand: m.cashOnHand || null,
    total_debt: m.totalDebt || null,
    updated_at: new Date().toISOString(),
  };
}

function withComputedMetrics(metrics: CompanyMetricsData): CompanyMetricsData {
  const next = { ...metrics };
  if (!next.runwayIsOverride) {
    const cash = parseSmartNumber(next.cashOnHand);
    const burn = parseSmartNumber(next.monthlyBurnRate);
    next.runway = next.cashOnHand.trim() && cash >= 0 && burn > 0
      ? (Math.round((cash / burn) * 10) / 10).toFixed(1)
      : "";
  }
  if (!next.mrrIsOverridden) {
    const arr = parseSmartNumber(next.arr);
    next.mrr = arr > 0 ? smartBlurCurrency(String(Math.round(arr / 12))) : "";
  }
  if (!next.netRevenueIsOverridden) {
    const gmv = parseSmartNumber(next.gmv);
    const takeRate = parseSmartNumber(next.takeRate);
    next.netRevenue = next.gmv.trim() && next.takeRate.trim() && gmv >= 0 && takeRate >= 0
      ? smartBlurCurrency(String(Math.round(gmv * (takeRate / 100))) )
      : "";
  }
  return next;
}

function readLocalMetrics(): CompanyMetricsData {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return EMPTY_METRICS;
    const saved = JSON.parse(raw) as Partial<CompanyMetricsData>;
    return withComputedMetrics({
      ...EMPTY_METRICS,
      ...saved,
      // Older local records only have a runway value; keep treating it as a founder override.
      runwayIsOverride: typeof saved.runwayIsOverride === "boolean"
        ? saved.runwayIsOverride
        : Boolean(saved.runway?.trim()),
      ltvCacRatioIsOverridden: typeof saved.ltvCacRatioIsOverridden === "boolean"
        ? saved.ltvCacRatioIsOverridden
        : Boolean(saved.ltvCacRatioOverride?.trim()),
    });
  } catch {
    return EMPTY_METRICS;
  }
}

function parseJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Founder-scoped metrics for the Data Room > Metrics tab.
 * localStorage is the source of truth for instant reads/writes; Supabase (`company_metrics`,
 * keyed by the Clerk `user_id`, same pattern as `company_pitch_decks`) is synced best-effort
 * in the background so the data survives across devices once a session exists.
 */
export function useCompanyMetrics() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<CompanyMetricsData>(() => readLocalMetrics());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rlsUserIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const nextSaveDelayRef = useRef<number | null>(null);

  const resolveRlsUserId = useCallback(async (): Promise<string | null> => {
    if (rlsUserIdRef.current) return rlsUserIdRef.current;
    const token = await getSupabaseAccessToken();
    const jwtSub = parseJwtSub(token) ?? user?.id ?? null;
    rlsUserIdRef.current = jwtSub;
    return jwtSub;
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rlsUserId = await resolveRlsUserId();
        if (!rlsUserId) return;

        const { data, error } = await supabase
          .from("company_metrics" as any)
          .select("*")
          .eq("user_id", rlsUserId)
          .maybeSingle();

        if (!active) return;
        if (error) {
          console.warn("[useCompanyMetrics] fetch failed:", error.message);
          return;
        }
        if (data) {
          setMetrics((prev) => {
            const row = data as unknown as MetricsRow;
            const extra = row.extra_metrics;
            const hasRatioOverrideFlag = typeof extra === "object" && extra !== null && !Array.isArray(extra)
              && Object.prototype.hasOwnProperty.call(extra, "ltvCacRatioIsOverridden");
            const merged = { ...prev, ...rowToMetrics(row) };
            if (!hasRatioOverrideFlag) {
              merged.ltvCacRatioIsOverridden = Boolean(merged.ltvCacRatioOverride.trim());
            }
            return withComputedMetrics(merged);
          });
        }
      } catch (err) {
        console.warn("[useCompanyMetrics] fetch error:", err);
      } finally {
        if (active) {
          hydratedRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [resolveRlsUserId]);

  const update = useCallback((patch: Partial<CompanyMetricsData>, options?: { immediate?: boolean }) => {
    if (options?.immediate) nextSaveDelayRef.current = 0;
    setMetrics((prev) => {
      const merged = { ...prev, ...patch };
      if ("mrr" in patch && merged.mrrIsOverridden) {
        const mrr = parseSmartNumber(merged.mrr);
        merged.arr = mrr > 0 ? smartBlurCurrency(String(Math.round(mrr * 12))) : "";
      }
      const next = withComputedMetrics(merged);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const retry = useCallback(() => {
    nextSaveDelayRef.current = 0;
    setMetrics((current) => ({ ...current }));
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const rlsUserId = await resolveRlsUserId();
      if (!rlsUserId) return;
      setSaveState("saving");
      try {
        const { error } = await supabase
          .from("company_metrics" as any)
          .upsert(metricsToRow(metrics, rlsUserId) as any, { onConflict: "user_id" });
        if (error) {
          console.warn("[useCompanyMetrics] save failed:", error.message);
          setSaveState("error");
        } else {
          setSaveState("saved");
        }
      } catch (err) {
        console.warn("[useCompanyMetrics] save error:", err);
        setSaveState("error");
      }
    }, nextSaveDelayRef.current ?? SAVE_DEBOUNCE_MS);
    nextSaveDelayRef.current = null;
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, resolveRlsUserId]);

  return { metrics, update, loading, saveState, retry };
}

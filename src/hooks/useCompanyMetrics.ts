import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, getSupabaseAccessToken } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ActiveUsersMode = "mau" | "dau";
export type RunwayUnit = "days" | "months";

export interface CompanyMetricsData {
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
  churnRate: string;
  burnMultiple: string;
  // Unit Economics
  cac: string;
  ltv: string;
  cacPaybackDays: string;
  // Financial Health
  monthlyBurnRate: string;
  runway: string;
  runwayUnit: RunwayUnit;
  grossMargin: string;
  cashOnHand: string;
  totalDebt: string;
}

export const EMPTY_METRICS: CompanyMetricsData = {
  headcount: "",
  background: "",
  tam: "",
  sam: "",
  som: "",
  nrr: "",
  activeUsers: "",
  activeUsersMode: "mau",
  churnRate: "",
  burnMultiple: "",
  cac: "",
  ltv: "",
  cacPaybackDays: "",
  monthlyBurnRate: "",
  runway: "",
  runwayUnit: "months",
  grossMargin: "",
  cashOnHand: "",
  totalDebt: "",
};

const LOCAL_STORAGE_KEY = "vekta-company-metrics";
const SAVE_DEBOUNCE_MS = 700;

type MetricsRow = Record<string, string | null>;

function rowToMetrics(row: MetricsRow): Partial<CompanyMetricsData> {
  return {
    headcount: row.headcount ?? "",
    background: row.background ?? "",
    tam: row.tam ?? "",
    sam: row.sam ?? "",
    som: row.som ?? "",
    nrr: row.nrr ?? "",
    activeUsers: row.active_users ?? "",
    activeUsersMode: row.active_users_mode === "dau" ? "dau" : "mau",
    churnRate: row.churn_rate ?? "",
    burnMultiple: row.burn_multiple ?? "",
    cac: row.cac ?? "",
    ltv: row.ltv ?? "",
    cacPaybackDays: row.cac_payback_days ?? "",
    monthlyBurnRate: row.monthly_burn_rate ?? "",
    runway: row.runway ?? "",
    runwayUnit: row.runway_unit === "days" ? "days" : "months",
    grossMargin: row.gross_margin ?? "",
    cashOnHand: row.cash_on_hand ?? "",
    totalDebt: row.total_debt ?? "",
  };
}

function metricsToRow(m: CompanyMetricsData, userId: string) {
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
    cac_payback_days: m.cacPaybackDays || null,
    monthly_burn_rate: m.monthlyBurnRate || null,
    runway: m.runway || null,
    runway_unit: m.runwayUnit,
    gross_margin: m.grossMargin || null,
    cash_on_hand: m.cashOnHand || null,
    total_debt: m.totalDebt || null,
    updated_at: new Date().toISOString(),
  };
}

function readLocalMetrics(): CompanyMetricsData {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return EMPTY_METRICS;
    return { ...EMPTY_METRICS, ...JSON.parse(raw) };
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
          setMetrics((prev) => ({ ...prev, ...rowToMetrics(data as unknown as MetricsRow) }));
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

  const update = useCallback((patch: Partial<CompanyMetricsData>) => {
    setMetrics((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
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
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, resolveRlsUserId]);

  return { metrics, update, loading, saveState };
}

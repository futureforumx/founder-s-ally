import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Pause,
  Play,
  ExternalLink,
  Landmark,
  BarChart2,
  LineChart,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase, supabasePublicDirectory, supabaseVcDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import { rpcSearchFirmRecords } from "@/lib/firmSearchRpc";
import type { FirmDeal } from "@/hooks/useInvestorProfile";
import { fetchFreshCapitalLive, parseFreshCapitalFundRow, type FreshCapitalFundRow } from "@/lib/freshCapitalPublic";
import { looksLikeFirmRecordsUuid } from "@/lib/pickFirmXUrl";
import { safeLower, safeTrim } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface FundRecord {
  id: string;
  fund_name: string;
  fund_status?: string | null;
  vintage_year?: number | null;
  size_usd?: number | null;
  actively_deploying?: boolean | null;
  deployed_pct?: number | null;
  strategy?: string | null;
}

/** Row shape returned from the fund_data table (EDGAR-sourced fund filings) */
interface EDGARFundRow {
  id: string;
  fund_name: string;
  fund_number: number | null;
  total_amount_usd: number | null;
  amount_sold_usd: number | null;
  pct_deployed: number | null;
  fund_status: string | null;
  vintage_year: number | null;
  stages: string[] | null;
  sectors: string[] | null;
  geographies: string[] | null;
  edgar_filing_url: string | null;
  edgar_cik: string | null;
  edgar_state: string | null;
}

interface DealRow {
  id: string;
  firm_id: string;
  company_name: string;
  amount: string | null;
  stage: string | null;
  date_announced: string | null;
  created_at: string;
}

interface ActivityDashboardProps {
  firmName: string;
  firmDisplayName?: string | null;
  firmRecordsId?: string | null;
  /** Strongest `firm_records.id` hint from the panel (`databaseFirmId` / live profile). */
  databaseFirmRecordId?: string | null;
  vcDirectoryFirmId?: string | null;
  companySector?: string;
  /** Pre-loaded deals from liveProfile — supplements DB query */
  deals?: FirmDeal[] | null;
  fallbackAum?: string | null;
  fallbackIsActivelyDeploying?: boolean | null;
  fallbackRecentDeals?: string[] | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DB = supabaseVcDirectory as unknown as { from: (t: string) => any };
/** Same anon transport as `/fresh-capital` — avoids JWT/RLS mismatches on `vc_funds` reads. */
const PUBLIC_DB = supabasePublicDirectory as unknown as { from: (t: string) => any; rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

type RpcLike = {
  rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function parseAmountUsd(amount: string | null): number | null {
  const s = safeTrim(amount);
  if (!s) return null;
  const lower = s.toLowerCase().replace(/[,\s]/g, "");
  const multiplier = lower.includes("billion") || /\db$/.test(lower) ? 1e9
    : lower.includes("million") || lower.includes("mn") || /\dm$/.test(lower) ? 1e6
    : lower.includes("thousand") || /\dk$/.test(lower) ? 1e3
    : 1;
  const num = parseFloat(lower.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? null : num * multiplier;
}

function inferStage(amount: string | null): "Pre-Seed" | "Seed" | "Series A" | "Series B+" | null {
  const usd = parseAmountUsd(amount);
  if (usd == null) return null;
  if (usd < 1_500_000) return "Pre-Seed";
  if (usd < 8_000_000) return "Seed";
  if (usd < 30_000_000) return "Series A";
  return "Series B+";
}

function dealDate(d: DealRow): Date {
  return new Date(d.date_announced ?? d.created_at);
}

/** Build a 12-month rolling array ending at the current month */
function buildMonthBuckets(deals: DealRow[]): { label: string; count: number; stages: Record<string, number> }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed
    const matching = deals.filter((deal) => {
      const dt = dealDate(deal);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });
    const stages: Record<string, number> = {};
    matching.forEach((deal) => {
      const s = inferStage(deal.amount) ?? "Unknown";
      stages[s] = (stages[s] ?? 0) + 1;
    });
    return { label: MONTH_LABELS[month], count: matching.length, stages };
  });
}

const STAGE_ORDER: Record<string, number> = { "Pre-Seed": 0, "Seed": 1, "Series A": 2, "Series B+": 3 };

async function resolveFirmRecordId(
  firmRecordsId: string | null,
  vcDirectoryFirmId: string | null,
  firmDisplayName: string | null,
): Promise<string | null> {
  const trimmedFirmId = safeTrim(firmRecordsId) || null;
  if (trimmedFirmId && looksLikeFirmRecordsUuid(trimmedFirmId)) return trimmedFirmId;

  const candidateVcDirectoryId =
    safeTrim(vcDirectoryFirmId) ||
    (trimmedFirmId && !looksLikeFirmRecordsUuid(trimmedFirmId) ? trimmedFirmId : null);
  if (candidateVcDirectoryId) {
    const { data: byPrisma } = await DB
      .from("firm_records")
      .select("id")
      .eq("prisma_firm_id", candidateVcDirectoryId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    const prismaId = (byPrisma as { id: string } | null)?.id ?? null;
    if (prismaId) return prismaId;
  }

  const displayTrim = safeTrim(firmDisplayName);
  if (!displayTrim) return null;
  const trimmed = displayTrim;

  const { data: exact } = await DB
    .from("firm_records")
    .select("id")
    .ilike("firm_name", trimmed)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const exactId = (exact as { id: string } | null)?.id ?? null;
  if (exactId) return exactId;

  const rpcRows = await rpcSearchFirmRecords(trimmed, 8, null, supabaseVcDirectory);
  const rpcFirst = rpcRows[0] as { id?: string } | undefined;
  if (rpcFirst?.id) return String(rpcFirst.id);

  const { data: partial } = await DB
    .from("firm_records")
    .select("id")
    .ilike("firm_name", `%${trimmed}%`)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return (partial as { id: string } | null)?.id ?? null;
}

// ── Data hooks ───────────────────────────────────────────────────────────────

function parseNumericUsd(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[^0-9.\-eE]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Maps Fresh Capital canonical `vc_funds` rows into the Activity card shape. */
function mapVcFundRowToFundRecord(row: Record<string, unknown>): FundRecord {
  const final = parseNumericUsd(row.final_size_usd);
  const target = parseNumericUsd(row.target_size_usd);
  const size_usd = final ?? target ?? null;
  const deploying = row.likely_actively_deploying;
  return {
    id: String(row.id ?? ""),
    fund_name: String(row.name ?? "").trim() || "Fund",
    fund_status: typeof row.status === "string" ? row.status : null,
    vintage_year: typeof row.vintage_year === "number" ? row.vintage_year : null,
    size_usd,
    actively_deploying: typeof deploying === "boolean" ? deploying : null,
    deployed_pct: null,
    strategy: null,
  };
}

function freshCapitalRowToFundRecord(row: FreshCapitalFundRow): FundRecord {
  const final = parseNumericUsd(row.final_size_usd);
  const target = parseNumericUsd(row.target_size_usd);
  const size_usd = final ?? target ?? null;
  return {
    id: row.vc_fund_id,
    fund_name: safeTrim(row.fund_name) || "Fund",
    fund_status: row.status ?? null,
    vintage_year: row.vintage_year ?? null,
    size_usd,
    actively_deploying: row.likely_actively_deploying ?? null,
    deployed_pct: null,
    strategy: null,
  };
}

/** Same rows as DB `vc_funds` for one firm — `SECURITY DEFINER` RPC (see migration `get_firm_funds`). */
function mapGetFirmFundsRpcRow(row: Record<string, unknown>): FundRecord {
  const final = parseNumericUsd(row.final_size_usd);
  const target = parseNumericUsd(row.target_size_usd);
  const deploying = row.likely_actively_deploying;
  const statusRaw = row.status;
  return {
    id: String(row.vc_fund_id ?? ""),
    fund_name: safeTrim(String(row.fund_name ?? "")) || "Fund",
    fund_status: statusRaw != null && statusRaw !== "" ? String(statusRaw) : null,
    vintage_year: typeof row.vintage_year === "number" ? row.vintage_year : null,
    size_usd: final ?? target ?? null,
    actively_deploying: typeof deploying === "boolean" ? deploying : null,
    deployed_pct: null,
    strategy: null,
  };
}

async function fetchFundsViaGetFirmFundsOneClient(client: RpcLike, firmRecordId: string): Promise<FundRecord[]> {
  const res = await client.rpc("get_firm_funds", { p_firm_record_id: firmRecordId });
  if (res.error || !Array.isArray(res.data) || res.data.length === 0) return [];
  return (res.data as Record<string, unknown>[]).map(mapGetFirmFundsRpcRow).filter((f) => safeTrim(f.id));
}

/** Try every Supabase client — anon vs JWT sometimes differ on RPC/table exposure in prod. */
async function fetchFundsViaGetFirmFundsRpc(firmRecordId: string): Promise<FundRecord[]> {
  const clients = [
    PUBLIC_DB as RpcLike,
    supabaseVcDirectory as unknown as RpcLike,
    supabase as unknown as RpcLike,
  ];
  for (const c of clients) {
    const rows = await fetchFundsViaGetFirmFundsOneClient(c, firmRecordId);
    if (rows.length) return rows;
  }
  return [];
}

/**
 * Exact same RPC stack as `/fresh-capital`; filter to this firm so the Activity card cannot diverge from the feed.
 */
async function fetchFundsFromFreshCapitalFeed(
  resolvedFirmRecordId: string,
  firmDisplayName: string | null,
  alternateFirmLabel: string | null,
): Promise<FundRecord[]> {
  try {
    const { funds } = await fetchFreshCapitalLive({
      stage: "all",
      sector: null,
      fundLimit: 200,
      fundDays: 365,
    });
    const byId = funds.filter((f) => f.firm_record_id === resolvedFirmRecordId);
    if (byId.length) return byId.map(freshCapitalRowToFundRecord);
    const keys = distinctNameKeys(firmDisplayName, alternateFirmLabel);
    for (const key of keys) {
      const hits = funds.filter((f) => safeLower(safeTrim(f.firm_name)) === key);
      if (hits.length) {
        const cid = hits[0].firm_record_id;
        return funds.filter((f) => f.firm_record_id === cid).map(freshCapitalRowToFundRecord);
      }
    }
    for (const key of keys) {
      if (key.length < 4) continue;
      const hits = funds.filter((f) => safeLower(safeTrim(f.firm_name)).includes(key));
      if (hits.length) {
        const cid = hits[0].firm_record_id;
        return funds.filter((f) => f.firm_record_id === cid).map(freshCapitalRowToFundRecord);
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[ActivityDashboard] fetchFundsFromFreshCapitalFeed", e);
    return [];
  }
  return [];
}

/** Fallback if RPC missing/outdated in an environment — direct `vc_funds` read (anon). */
async function fetchVcFundsForFirmPublic(firmRecordId: string): Promise<FundRecord[]> {
  const vcRes = await PUBLIC_DB
    .from("vc_funds")
    .select(
      "id, name, status, vintage_year, target_size_usd, final_size_usd, likely_actively_deploying, announced_date, close_date",
    )
    .eq("firm_record_id", firmRecordId)
    .is("deleted_at", null)
    .order("announced_date", { ascending: false, nullsFirst: false })
    .limit(80);

  if (vcRes.error || !Array.isArray(vcRes.data) || vcRes.data.length === 0) return [];
  return (vcRes.data as Record<string, unknown>[]).map(mapVcFundRowToFundRecord);
}

function distinctNameKeys(...names: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = safeLower(safeTrim(n));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Canonical vehicles for Activity “Current Fund” — same rows as `/fresh-capital` (`vc_funds` via public read + `get_new_vc_funds` fallback).
 * Legacy `fund_records` only when no canonical vehicles resolve.
 */
function useActivityFundsList(
  firmRecordsId: string | null,
  vcDirectoryFirmId: string | null,
  firmDisplayName: string | null,
  /** Second spelling for RPC name matching (e.g. panel title vs hero display name). */
  alternateFirmLabel?: string | null,
  preferredFirmRecordsUuid?: string | null,
) {
  return useQuery<FundRecord[]>({
    queryKey: [
      "activity-funds-list",
      firmRecordsId,
      vcDirectoryFirmId,
      safeLower(firmDisplayName),
      safeLower(alternateFirmLabel),
      safeLower(preferredFirmRecordsUuid),
    ],
    queryFn: async () => {
      const fromProps =
        [preferredFirmRecordsUuid, firmRecordsId]
          .map((x) => safeTrim(x))
          .find((id) => id && looksLikeFirmRecordsUuid(id)) ?? null;
      const resolvedId =
        fromProps ?? (await resolveFirmRecordId(firmRecordsId, vcDirectoryFirmId, firmDisplayName));
      if (!resolvedId) return [];

      let vcMapped = await fetchFundsViaGetFirmFundsRpc(resolvedId);
      if (!vcMapped.length) {
        vcMapped = await fetchVcFundsForFirmPublic(resolvedId);
      }
      if (!vcMapped.length) {
        vcMapped = await fetchFundsFromFreshCapitalFeed(resolvedId, firmDisplayName, alternateFirmLabel ?? null);
      }

      if (!vcMapped.length) {
        const rpcArgs = {
          p_limit: 200,
          p_days: 365,
          p_stage: null as string[] | null,
          p_sector: null as string[] | null,
          p_geography: null as string[] | null,
          p_fund_size_min: null as number | null,
          p_fund_size_max: null as number | null,
          p_firm_type: null as string[] | null,
        };
        const rpcRes = await PUBLIC_DB.rpc("get_new_vc_funds", rpcArgs);
        if (!rpcRes.error && Array.isArray(rpcRes.data)) {
          const parsed = rpcRes.data.map(parseFreshCapitalFundRow).filter((x): x is FreshCapitalFundRow => Boolean(x));
          let canonicalId: string | null = null;
          const byResolved = parsed.filter((r) => r.firm_record_id === resolvedId);
          if (byResolved.length) {
            canonicalId = resolvedId;
          } else {
            const keys = distinctNameKeys(firmDisplayName, alternateFirmLabel);
            for (const key of keys) {
              const hit = parsed.find((r) => safeLower(safeTrim(r.firm_name)) === key);
              if (hit) {
                canonicalId = hit.firm_record_id;
                break;
              }
            }
          }
          if (canonicalId) {
            vcMapped = await fetchFundsViaGetFirmFundsRpc(canonicalId);
            if (!vcMapped.length) {
              vcMapped = await fetchVcFundsForFirmPublic(canonicalId);
            }
            if (!vcMapped.length) {
              vcMapped = parsed
                .filter((r) => r.firm_record_id === canonicalId)
                .map(freshCapitalRowToFundRecord);
            }
          }
        }
      }

      if (!vcMapped.length) {
        const { data: legacy, error: legacyErr } = await DB
          .from("fund_records")
          .select("id, fund_name, fund_status, vintage_year, size_usd, actively_deploying, deployed_pct, strategy")
          .eq("firm_id", resolvedId)
          .is("deleted_at", null)
          .order("vintage_year", { ascending: false })
          .limit(80);
        if (!legacyErr && legacy?.length) return legacy as FundRecord[];
      }

      return vcMapped;
    },
    enabled: Boolean(
      (safeTrim(firmRecordsId) ||
        safeTrim(vcDirectoryFirmId) ||
        safeTrim(firmDisplayName) ||
        safeTrim(alternateFirmLabel) ||
        safeTrim(preferredFirmRecordsUuid)) &&
        isSupabaseConfigured,
    ),
    staleTime: 0,
    retry: false,
  });
}

type FirmFundingIntelRow = {
  funding_intel_activity_score: number | null;
  funding_intel_momentum_score: number | null;
  funding_intel_pace_label: string | null;
  funding_intel_summary: string | null;
  funding_intel_focus_json: Record<string, unknown> | null;
  funding_intel_recent_investments_json: unknown[] | null;
  funding_intel_updated_at: string | null;
};

function paceLabelShort(raw: string | null | undefined): string {
  const u = safeTrim(raw).toLowerCase();
  if (u === "accelerating") return "Accelerating";
  if (u === "steady") return "Steady";
  if (u === "slowing") return "Cooling";
  if (u === "insufficient_data") return "—";
  return safeTrim(raw) || "—";
}

function useFirmFundingIntel(
  firmRecordsId: string | null,
  vcDirectoryFirmId: string | null,
  firmDisplayName: string | null,
) {
  return useQuery<FirmFundingIntelRow | null>({
    queryKey: ["activity-firm-funding-intel", firmRecordsId, vcDirectoryFirmId, safeLower(firmDisplayName)],
    queryFn: async () => {
      const resolvedId = await resolveFirmRecordId(firmRecordsId, vcDirectoryFirmId, firmDisplayName);
      if (!resolvedId) return null;
      const { data, error } = await DB
        .from("firm_records")
        .select(
          [
            "funding_intel_activity_score,funding_intel_momentum_score,funding_intel_pace_label",
            ",funding_intel_summary,funding_intel_focus_json,funding_intel_recent_investments_json,funding_intel_updated_at",
          ].join(""),
        )
        .eq("id", resolvedId)
        .maybeSingle();
      if (error) return null;
      return (data as FirmFundingIntelRow | null) ?? null;
    },
    enabled: Boolean((safeTrim(firmRecordsId) || safeTrim(vcDirectoryFirmId) || safeTrim(firmDisplayName)) && isSupabaseConfigured),
    retry: false,
  });
}

function useRecentDeals(firmRecordsId: string | null, vcDirectoryFirmId: string | null, firmDisplayName: string | null) {
  return useQuery<DealRow[]>({
    queryKey: ["activity-deals", firmRecordsId, vcDirectoryFirmId, safeLower(firmDisplayName)],
    queryFn: async () => {
      const resolvedId = await resolveFirmRecordId(firmRecordsId, vcDirectoryFirmId, firmDisplayName);
      if (!resolvedId) return [];
      const { data, error } = await DB
        .from("firm_recent_deals")
        .select("id, firm_id, company_name, amount, stage, date_announced, created_at")
        .eq("firm_id", resolvedId)
        .order("date_announced", { ascending: false, nullsFirst: false });
      if (error) return [];
      return (data ?? []) as DealRow[];
    },
    enabled: Boolean((safeTrim(firmRecordsId) || safeTrim(vcDirectoryFirmId) || safeTrim(firmDisplayName)) && isSupabaseConfigured),
    retry: false,
  });
}

/** Queries fund_data (EDGAR Form D filings) by firm name — used as fallback + history panel */
function useEDGARFunds(firmName: string | null) {
  return useQuery<EDGARFundRow[]>({
    queryKey: ["edgar-funds", safeLower(firmName)],
    queryFn: async () => {
      const name = safeTrim(firmName);
      if (!name) return [];
      const { data, error } = await DB
        .from("fund_data")
        .select("id, fund_name, fund_number, total_amount_usd, amount_sold_usd, pct_deployed, fund_status, vintage_year, stages, sectors, geographies, edgar_filing_url, edgar_cik, edgar_state")
        .ilike("firm_name", name)
        .order("vintage_year", { ascending: false, nullsFirst: false })
        .order("total_amount_usd", { ascending: false, nullsFirst: false });
      if (error) return [];
      return (data ?? []) as EDGARFundRow[];
    },
    enabled: Boolean(safeTrim(firmName) && isSupabaseConfigured),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CurrentFundCard({
  funds,
  fundIndex,
  onPrev,
  onNext,
  loading,
  fallbackAum,
  fallbackIsActivelyDeploying,
  edgarFallback,
}: {
  funds: FundRecord[];
  fundIndex: number;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
  fallbackAum?: string | null;
  fallbackIsActivelyDeploying?: boolean | null;
  edgarFallback?: EDGARFundRow | null;
}) {
  const idx = funds.length > 0 ? Math.min(Math.max(0, fundIndex), funds.length - 1) : 0;
  const fund = funds.length > 0 ? funds[idx] : null;
  const canStep = funds.length > 1;
  const pct = fund?.deployed_pct ?? null;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = pct != null ? (Math.min(pct, 100) / 100) * circumference : 0;
  const isDeploying = fund?.actively_deploying === true;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <Skeleton className="h-[68px] w-[68px] rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }

  // Use EDGAR data as fallback when no fund_records entry exists
  if (!fund && edgarFallback) {
    const edgar = edgarFallback;
    const edgarPct = edgar.pct_deployed ?? null;
    const edgarCircumference = 2 * Math.PI * 28;
    const edgarStrokeDash = edgarPct != null ? (Math.min(edgarPct, 100) / 100) * edgarCircumference : 0;
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="shrink-0 relative">
          <svg width="68" height="68" viewBox="0 0 68 68" className="transform -rotate-90">
            <circle cx="34" cy="34" r="28" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
            {edgarPct != null && (
              <circle cx="34" cy="34" r="28" fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="5"
                strokeDasharray={`${edgarStrokeDash} ${edgarCircumference}`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            )}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
            {edgarPct != null ? `${edgarPct.toFixed(0)}%` : "—"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Latest Fund</p>
            <span className="text-[8px] font-mono bg-muted/60 text-muted-foreground/70 px-1 py-0.5 rounded">SEC EDGAR</span>
          </div>
          <p className="text-sm font-bold text-foreground leading-tight truncate">{edgar.fund_name}</p>
          <p className="text-[10px] text-muted-foreground">
            {edgar.vintage_year ? `Vintage ${edgar.vintage_year} · ` : ""}
            {edgar.total_amount_usd ? `${fmtUsd(edgar.total_amount_usd)} · ` : ""}
            {edgarPct != null ? `${edgarPct.toFixed(0)}% Deployed` : "Deployment data from filing"}
          </p>
          {edgar.edgar_filing_url && (
            <a href={edgar.edgar_filing_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[9px] text-muted-foreground/50 hover:text-muted-foreground mt-0.5">
              <ExternalLink className="h-2.5 w-2.5" /> SEC Filing
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="shrink-0 h-[68px] w-[68px] rounded-full border border-border/60 flex items-center justify-center bg-secondary/30">
          <Landmark className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Current Fund</p>
          {fallbackAum ? (
            <>
              <p className="text-sm font-semibold text-foreground">{fallbackAum} AUM</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {fallbackIsActivelyDeploying ? "Actively deploying" : "Firm-level data available; fund breakdown pending"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-muted-foreground">No fund data</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Not yet synced from VC directory</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      <div className="shrink-0 relative">
        <svg width="68" height="68" viewBox="0 0 68 68" className="transform -rotate-90">
          <circle cx="34" cy="34" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          {pct != null && (
            <circle
              cx="34" cy="34" r={radius}
              fill="none"
              stroke={isDeploying ? "hsl(var(--success))" : "hsl(var(--muted-foreground))"}
              strokeWidth="5"
              strokeDasharray={`${strokeDash} ${circumference}`}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
          {pct != null ? `${pct.toFixed(0)}%` : "—"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
            Current Fund
          </p>
          {canStep ? (
            <div className="flex items-center gap-1">
              <span className="text-[9px] tabular-nums text-muted-foreground/80">
                {idx + 1}/{funds.length}
              </span>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Previous fund"
                onClick={onPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Next fund"
                onClick={onNext}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        <p className="text-sm font-bold text-foreground leading-tight truncate">{fund.fund_name}</p>
        <p className="text-[10px] text-muted-foreground">
          {fund.vintage_year ? `Vintage ${fund.vintage_year} · ` : ""}
          {fund.size_usd ? `${fmtUsd(fund.size_usd)} · ` : ""}
          {pct != null ? `Est. ${pct.toFixed(0)}% Deployed` : "Deployment data pending"}
        </p>
        {isDeploying && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-[10px] font-semibold text-success">Actively Writing Checks</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ActivityDashboard({
  firmName,
  firmDisplayName,
  firmRecordsId,
  databaseFirmRecordId,
  vcDirectoryFirmId,
  companySector,
  deals: dealsProp,
  fallbackAum,
  fallbackIsActivelyDeploying,
  fallbackRecentDeals,
}: ActivityDashboardProps) {
  const [paceView, setPaceView] = useState<"pace" | "trend">("pace");
  const [autoCycle, setAutoCycle] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<"stage" | "sector">("stage");
  const [focusAutoCycle, setFocusAutoCycle] = useState(true);
  const [focusView, setFocusView] = useState<"stage" | "sector">("stage");
  const [fundIdx, setFundIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: activityFunds = [], isLoading: fundLoading } = useActivityFundsList(
    firmRecordsId ?? null,
    vcDirectoryFirmId ?? null,
    firmDisplayName ?? firmName,
    firmName,
    databaseFirmRecordId ?? null,
  );
  const { data: edgarFunds = [], isLoading: edgarLoading } = useEDGARFunds(firmDisplayName ?? firmName);
  const edgarLatestFund = edgarFunds[0] ?? null;
  const [showAllEdgarFunds, setShowAllEdgarFunds] = useState(false);

  const { data: dbDeals = [], isLoading: dealsLoading } = useRecentDeals(
    firmRecordsId ?? null,
    vcDirectoryFirmId ?? null,
    firmDisplayName ?? firmName,
  );
  const { data: fundingIntel } = useFirmFundingIntel(
    firmRecordsId ?? null,
    vcDirectoryFirmId ?? null,
    firmDisplayName ?? firmName,
  );

  useEffect(() => {
    setFundIdx(0);
  }, [firmRecordsId, vcDirectoryFirmId, firmDisplayName]);

  useEffect(() => {
    setFundIdx((i) =>
      activityFunds.length === 0 ? 0 : Math.min(i, activityFunds.length - 1),
    );
  }, [activityFunds]);

  const stepFundPrev = useCallback(() => {
    setFundIdx((i) =>
      activityFunds.length <= 1 ? 0 : (i - 1 + activityFunds.length) % activityFunds.length,
    );
  }, [activityFunds.length]);

  const stepFundNext = useCallback(() => {
    setFundIdx((i) =>
      activityFunds.length <= 1 ? 0 : (i + 1) % activityFunds.length,
    );
  }, [activityFunds.length]);

  const showEdgarOnMainCard = activityFunds.length === 0;

  // Merge DB deals with prop deals (prop deals may have more context)
  const allDeals = useMemo((): DealRow[] => {
    const db = dbDeals ?? [];
    // If we have prop deals but no DB deals, convert prop deals to DealRow shape
    if (db.length === 0 && dealsProp?.length) {
      return dealsProp.map((d) => ({
        id: d.id,
        firm_id: "",
        company_name: d.company_name,
        amount: d.amount,
        stage: d.stage,
        date_announced: d.date_announced,
        created_at: d.date_announced ?? new Date().toISOString(),
      }));
    }
    return db;
  }, [dbDeals, dealsProp]);

  const buckets = useMemo(() => buildMonthBuckets(allDeals), [allDeals]);
  const maxCount = useMemo(() => Math.max(...buckets.map((b) => b.count), 1), [buckets]);
  const totalDeals = useMemo(() => allDeals.length, [allDeals]);

  // Investment pace: last 6 months vs previous 6
  const { pace, prevPace, trendPct, trendDir } = useMemo(() => {
    const recent6 = buckets.slice(6).reduce((s, b) => s + b.count, 0);
    const prev6 = buckets.slice(0, 6).reduce((s, b) => s + b.count, 0);
    const currentPace = +(recent6 / 6).toFixed(1);
    const previousPace = +(prev6 / 6).toFixed(1);
    const change = previousPace > 0 ? Math.round(((currentPace - previousPace) / previousPace) * 100) : 0;
    const dir: "up" | "down" | "flat" = change > 5 ? "up" : change < -5 ? "down" : "flat";
    return { pace: currentPace, prevPace: previousPace, trendPct: Math.abs(change), trendDir: dir };
  }, [buckets]);

  // Stage distribution from real deal data
  const stageBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    allDeals.forEach((d) => {
      const stage = inferStage(d.amount) ?? "Unknown";
      counts[stage] = (counts[stage] ?? 0) + 1;
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return Object.entries(counts)
      .filter(([k]) => k !== "Unknown")
      .sort((a, b) => (STAGE_ORDER[a[0]] ?? 99) - (STAGE_ORDER[b[0]] ?? 99))
      .map(([stage, count]) => ({ stage, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }, [allDeals]);

  // Sector distribution from stage field (which holds company category)
  const sectorBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    allDeals.forEach((d) => {
      const tag = safeTrim(d.stage);
      if (tag) counts[tag] = (counts[tag] ?? 0) + 1;
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sector, count]) => ({ sector, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }, [allDeals]);

  // Auto-cycle timers
  const startCycle = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setPaceView((v) => v === "pace" ? "trend" : "pace"), 5000);
  }, []);
  useEffect(() => {
    if (autoCycle) startCycle();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoCycle, startCycle]);

  useEffect(() => {
    if (focusAutoCycle) {
      if (focusIntervalRef.current) clearInterval(focusIntervalRef.current);
      focusIntervalRef.current = setInterval(() => setFocusView((v) => v === "stage" ? "sector" : "stage"), 5000);
    }
    return () => { if (focusIntervalRef.current) clearInterval(focusIntervalRef.current); };
  }, [focusAutoCycle]);

  // Stage color helpers
  const STAGE_COLORS: Record<string, string> = {
    "Pre-Seed": "bg-success/15 text-success",
    "Seed": "bg-success/20 text-success",
    "Series A": "bg-accent/15 text-accent",
    "Series B+": "bg-primary/15 text-primary",
  };
  const SECTOR_COLORS = ["bg-primary/15 text-primary", "bg-warning/15 text-warning", "bg-destructive/15 text-destructive"];

  const hasEnoughData = totalDeals > 0;

  const showFundingIntel =
    fundingIntel &&
    (fundingIntel.funding_intel_activity_score != null ||
      fundingIntel.funding_intel_momentum_score != null ||
      safeTrim(fundingIntel.funding_intel_summary));

  return (
    <div className="space-y-4">
      {/* Row 1: Fund Pulse Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* Card 1: Funds from vc_funds (Fresh Capital parity), legacy fund_records fallback, EDGAR last */}
        <CurrentFundCard
          funds={activityFunds}
          fundIndex={fundIdx}
          onPrev={stepFundPrev}
          onNext={stepFundNext}
          loading={fundLoading || (showEdgarOnMainCard && edgarLoading)}
          fallbackAum={fallbackAum}
          fallbackIsActivelyDeploying={fallbackIsActivelyDeploying}
          edgarFallback={showEdgarOnMainCard ? edgarLatestFund : undefined}
        />

        {/* Card 2: Investment Pace (live from deal data) */}
        <div
          className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center relative overflow-hidden cursor-pointer select-none"
          onClick={() => setAutoCycle((v) => !v)}
        >
          <button
            className="absolute top-2.5 right-2.5 p-1 rounded-md hover:bg-secondary transition-colors"
            onClick={(e) => { e.stopPropagation(); setAutoCycle((v) => !v); }}
          >
            {autoCycle ? <Pause className="w-3 h-3 text-muted-foreground" /> : <Play className="w-3 h-3 text-muted-foreground" />}
          </button>

          {dealsLoading ? (
            <div className="space-y-2 w-full flex flex-col items-center">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-3 w-36" />
            </div>
          ) : !hasEnoughData ? (
            <div className="flex flex-col items-center gap-1.5">
              <BarChart2 className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Investment Pace</p>
              <p className="text-xs text-muted-foreground/60">No deal data recorded yet</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {paceView === "pace" ? (
                <motion.div key="pace" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }} className="flex flex-col items-center">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Investment Pace</p>
                  <p className="text-4xl font-black text-foreground leading-none">{pace}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Deals / month (6mo avg)</p>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">{totalDeals} total deals tracked</p>
                </motion.div>
              ) : (
                <motion.div key="trend" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }} className="flex flex-col items-center">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">6-Month Trend</p>
                  <div className={`flex items-center gap-1.5 ${trendDir === "up" ? "text-success" : trendDir === "down" ? "text-destructive" : "text-muted-foreground"}`}>
                    {trendDir === "up" && <TrendingUp className="w-6 h-6" />}
                    {trendDir === "down" && <TrendingDown className="w-6 h-6" />}
                    {trendDir === "flat" && <Minus className="w-6 h-6" />}
                    <span className="text-3xl font-black leading-none">
                      {trendDir === "flat" ? "0%" : `${trendDir === "up" ? "+" : "-"}${trendPct}%`}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">{prevPace} → {pace} deals/mo</p>
                  <div className={`text-[9px] font-semibold mt-1 px-2 py-0.5 rounded-full ${trendDir === "up" ? "bg-success/10 text-success" : trendDir === "down" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
                    {trendDir === "up" ? "Accelerating" : trendDir === "down" ? "Decelerating" : "Steady pace"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Card 3: Stage / Sector Bias (computed from live deals) */}
        <div
          className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center relative overflow-hidden cursor-pointer select-none"
          onClick={() => setFocusAutoCycle((v) => !v)}
        >
          <button
            className="absolute top-2.5 right-2.5 p-1 rounded-md hover:bg-secondary transition-colors"
            onClick={(e) => { e.stopPropagation(); setFocusAutoCycle((v) => !v); }}
          >
            {focusAutoCycle ? <Pause className="w-3 h-3 text-muted-foreground" /> : <Play className="w-3 h-3 text-muted-foreground" />}
          </button>

          {dealsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
            </div>
          ) : !hasEnoughData ? (
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Focus</p>
              <p className="text-xs text-muted-foreground/60">Insufficient data</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {focusView === "stage" ? (
                <motion.div key="focus-stage" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Focus · Stage</p>
                  {stageBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {stageBreakdown.map(({ stage, pct }) => (
                        <span key={stage} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${STAGE_COLORS[stage] ?? "bg-muted text-muted-foreground"}`}>
                          {pct}% {stage}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">Stage data not available</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">Based on {totalDeals} recorded deal{totalDeals !== 1 ? "s" : ""}</p>
                </motion.div>
              ) : (
                <motion.div key="focus-sector" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent Focus · Sector</p>
                  {sectorBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {sectorBreakdown.map(({ sector, pct }, i) => (
                        <span key={sector} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${SECTOR_COLORS[i] ?? "bg-muted text-muted-foreground"}`}>
                          {pct > 0 ? `${pct}% ` : ""}{sector}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">Sector data not available</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">Based on {totalDeals} recorded deal{totalDeals !== 1 ? "s" : ""}</p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {showFundingIntel ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <LineChart className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              Funding intel (90d, news-linked)
            </p>
            {fundingIntel!.funding_intel_pace_label ? (
              <Badge variant="outline" className="text-[9px] font-medium">
                {paceLabelShort(fundingIntel!.funding_intel_pace_label)}
              </Badge>
            ) : null}
          </div>
          <div className="mb-2 flex flex-wrap gap-4 text-sm">
            {fundingIntel!.funding_intel_activity_score != null ? (
              <span className="font-semibold tabular-nums">
                Activity <span className="text-accent">{Math.round(fundingIntel!.funding_intel_activity_score)}</span>/100
              </span>
            ) : null}
            {fundingIntel!.funding_intel_momentum_score != null ? (
              <span className="font-semibold tabular-nums">
                Momentum <span className="text-accent">{Math.round(fundingIntel!.funding_intel_momentum_score)}</span>/100
              </span>
            ) : null}
          </div>
          {safeTrim(fundingIntel!.funding_intel_summary) ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{fundingIntel!.funding_intel_summary}</p>
          ) : null}
          {Array.isArray(fundingIntel!.funding_intel_focus_json?.recent_focus) &&
          (fundingIntel!.funding_intel_focus_json!.recent_focus as string[]).length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {(fundingIntel!.funding_intel_focus_json!.recent_focus as string[]).map((s) => (
                <Badge key={s} variant="secondary" className="text-[9px]">
                  {s}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Row 2: Deal Heatmap (live, by month) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Deal Heatmap</p>
              <p className="text-[10px] text-muted-foreground">12-month rolling · {totalDeals} deal{totalDeals !== 1 ? "s" : ""} recorded</p>
            </div>
            {hasEnoughData && (
              <div className="flex items-center bg-secondary rounded-lg p-0.5">
                <button
                  onClick={() => setHeatmapMode("stage")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${heatmapMode === "stage" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Stage
                </button>
                <button
                  onClick={() => setHeatmapMode("sector")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${heatmapMode === "sector" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sector
                </button>
              </div>
            )}
          </div>
          {hasEnoughData && (
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success/60" /> Seed</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-accent/60" /> Series A</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/30" /> Other</span>
            </div>
          )}
        </div>

        {dealsLoading ? (
          <div className="flex items-end gap-1.5 h-24">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${20 + Math.random() * 60}%` }} />
            ))}
          </div>
        ) : !hasEnoughData ? (
          <div className="h-24 flex items-center justify-center">
            <div className="text-center">
              <BarChart2 className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/50">Deal history data not yet available for {firmDisplayName ?? firmName}</p>
            </div>
          </div>
        ) : (
          <TooltipProvider delayDuration={0}>
            <div className="flex items-end gap-1.5 h-24">
              {buckets.map((b) => {
                const seedCount = b.stages["Seed"] ?? 0;
                const preCount = b.stages["Pre-Seed"] ?? 0;
                const aCount = b.stages["Series A"] ?? 0;
                const otherCount = b.count - seedCount - preCount - aCount;
                const seedH = ((seedCount + preCount) / maxCount) * 100;
                const aH = (aCount / maxCount) * 100;
                const otherH = (Math.max(otherCount, 0) / maxCount) * 100;
                return (
                  <Tooltip key={b.label}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex flex-col items-center justify-end cursor-pointer group" style={{ height: "100%" }}>
                        {b.count > 0 && (
                          <span className="text-[9px] font-bold text-muted-foreground mb-0.5 group-hover:text-foreground transition-colors">{b.count}</span>
                        )}
                        {otherH > 0 && <div className="w-full rounded-t-sm bg-muted-foreground/20 group-hover:bg-muted-foreground/40 transition-colors" style={{ height: `${otherH}%` }} />}
                        {aH > 0 && <div className="w-full bg-accent/40 group-hover:bg-accent/60 transition-colors" style={{ height: `${aH}%` }} />}
                        {seedH > 0 && <div className={`w-full bg-success/40 group-hover:bg-success/60 transition-colors ${otherH === 0 && aH === 0 ? "rounded-t-sm" : ""} rounded-b-sm`} style={{ height: `${seedH}%` }} />}
                        {b.count === 0 && <div className="w-full rounded-sm bg-border/30" style={{ height: "4px" }} />}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-foreground text-background text-[10px] px-2.5 py-1.5 rounded-lg shadow-xl border-0 max-w-[200px]">
                      <p className="font-bold">{b.label}: {b.count} deal{b.count !== 1 ? "s" : ""}</p>
                      {b.count > 0 && (
                        <p className="text-background/70">
                          {Object.entries(b.stages).map(([s, n]) => `${n} ${s}`).join(", ")}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              {buckets.map((b) => (
                <span key={b.label} className="flex-1 text-center text-[8px] text-muted-foreground">{b.label}</span>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Row 3: Recent Transactions (live from firm_recent_deals) */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Recent Transactions</p>
          {!hasEnoughData && !dealsLoading && (
            <p className="text-[9px] text-muted-foreground/60">No transactions recorded</p>
          )}
        </div>
        <div className="divide-y divide-border">
          {dealsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="h-7 w-7 rounded-md shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))
          ) : !hasEnoughData && !(fallbackRecentDeals && fallbackRecentDeals.length > 0) ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground/50">Transaction history not yet available for {firmDisplayName ?? firmName}</p>
            </div>
          ) : (
            hasEnoughData ? allDeals.slice(0, 8).map((deal) => {
              const stage = inferStage(deal.amount);
              const dateStr = deal.date_announced
                ? new Date(deal.date_announced).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                : new Date(deal.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });
              const sectorMatch =
                companySector && safeLower(deal.stage).includes(companySector.toLowerCase());
              const initial = safeTrim(deal.company_name).charAt(0).toUpperCase() || "?";
              const stageColor = stage === "Seed" || stage === "Pre-Seed"
                ? "bg-success/15 text-success border-success/20"
                : stage === "Series A"
                  ? "bg-accent/15 text-accent border-accent/20"
                  : "bg-muted text-muted-foreground border-border";

              return (
                <div key={deal.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-2 hover:bg-secondary/50 transition-colors cursor-pointer group">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border text-[10px] font-bold text-muted-foreground shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{deal.company_name}</span>
                      {sectorMatch && <span className="text-[8px] text-warning">★</span>}
                    </div>
                    {deal.stage && (
                      <p className="text-[10px] text-muted-foreground truncate">{deal.stage}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 w-16 text-center">{dateStr}</span>
                  {deal.amount && (
                    <span className="text-[10px] font-medium text-foreground shrink-0 w-14 text-right">{deal.amount}</span>
                  )}
                  {stage && (
                    <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${stageColor}`}>{stage}</Badge>
                  )}
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-accent shrink-0 transition-colors" />
                </div>
              );
            }) : (fallbackRecentDeals ?? []).slice(0, 8).map((deal, i) => (
              <div key={`${firmName}-fallback-deal-${i}`} className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/50 transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border text-[10px] font-bold text-muted-foreground shrink-0">
                  {(deal.charAt(0).toUpperCase() || "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground truncate">{deal}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">Firm-level recent deal signal</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* EDGAR Fund History — sourced from SEC Form D filings */}
      {edgarFunds.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
            onClick={() => setShowAllEdgarFunds((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold text-foreground">Fund History</span>
              <span className="text-[9px] font-mono bg-muted/60 text-muted-foreground/70 px-1.5 py-0.5 rounded">
                {edgarFunds.length} SEC EDGAR filing{edgarFunds.length !== 1 ? "s" : ""}
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground/60">{showAllEdgarFunds ? "▲ collapse" : "▼ expand"}</span>
          </button>

          {showAllEdgarFunds && (
            <div className="border-t border-border divide-y divide-border/50">
              {edgarFunds.map((ef) => (
                <div key={ef.id} className="flex items-center gap-3 px-4 py-2.5">
                  {/* Deployment ring */}
                  <div className="shrink-0 relative">
                    <svg width="36" height="36" viewBox="0 0 36 36" className="transform -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
                      {ef.pct_deployed != null && (
                        <circle cx="18" cy="18" r="14" fill="none"
                          stroke="hsl(var(--muted-foreground))"
                          strokeWidth="3"
                          strokeDasharray={`${(Math.min(ef.pct_deployed, 100) / 100) * 2 * Math.PI * 14} ${2 * Math.PI * 14}`}
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-foreground">
                      {ef.pct_deployed != null ? `${ef.pct_deployed.toFixed(0)}%` : "—"}
                    </span>
                  </div>

                  {/* Fund details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">{ef.fund_name}</span>
                      {ef.fund_status && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 font-mono shrink-0">
                          {ef.fund_status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {ef.vintage_year ? `${ef.vintage_year}` : ""}
                      {ef.vintage_year && ef.total_amount_usd ? " · " : ""}
                      {ef.total_amount_usd ? fmtUsd(ef.total_amount_usd) : ""}
                      {ef.amount_sold_usd && ef.total_amount_usd ? ` raised of ${fmtUsd(ef.total_amount_usd)}` : ""}
                      {ef.edgar_state ? ` · ${ef.edgar_state}` : ""}
                    </p>
                    {(ef.stages?.length || ef.sectors?.length) && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {ef.stages?.slice(0, 2).map((s) => (
                          <span key={s} className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">{s}</span>
                        ))}
                        {ef.sectors?.slice(0, 2).map((s) => (
                          <span key={s} className="text-[8px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* SEC filing link */}
                  {ef.edgar_filing_url && (
                    <a href={ef.edgar_filing_url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

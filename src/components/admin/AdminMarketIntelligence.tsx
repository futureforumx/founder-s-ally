import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, Building2, Users, Briefcase, ExternalLink,
  TrendingUp, MapPin, CheckCircle2, XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// ── Edge-function helper ───────────────────────────────────────────────────────
// Supabase gateway rejects RS256 (WorkOS) JWTs even with verify_jwt=false.
// Fix: anon key (HS256) in Authorization so the gateway accepts the request,
//      WorkOS JWT in X-User-Auth for our own admin identity check inside the function.

async function callMarketIntel(params: Record<string, string>): Promise<{ rows: unknown[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "Supabase not configured" };

  const userToken = await getSupabaseBearerForFunctions();
  const anonKey   = SUPABASE_ANON_KEY ?? "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };
  if (userToken && userToken !== anonKey) {
    headers["X-User-Auth"] = `Bearer ${userToken}`;
  }

  const qs  = new URLSearchParams(params).toString();
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel${qs ? `?${qs}` : ""}`;

  try {
    const res  = await fetch(url, { method: "GET", headers });
    const json = await res.json().catch(() => ({})) as { rows?: unknown[]; total?: number; error?: string };
    if (!res.ok) return { rows: [], total: 0, error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [], total: json.total ?? 0 };
  } catch (e: unknown) {
    return { rows: [], total: 0, error: (e as Error)?.message ?? "Network error" };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B${suffix}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M${suffix}`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K${suffix}`;
  return `$${n}${suffix}`;
}

function scoreColor(n: number | null | undefined): string {
  if (n == null) return "rgba(255,255,255,0.2)";
  if (n >= 0.7) return "#2EE6A6";
  if (n >= 0.4) return "#f59e0b";
  return "#ef4444";
}

function TagChips({ items, max = 3 }: { items: string[] | null | undefined; max?: number }) {
  if (!items?.length) return <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>;
  const visible = items.slice(0, max);
  const rest = items.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((t) => (
        <span
          key={t}
          className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
          style={{ background: "rgba(46,230,166,0.08)", color: "#2EE6A6" }}
        >
          {t}
        </span>
      ))}
      {rest > 0 && (
        <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          +{rest}
        </span>
      )}
    </div>
  );
}

function Pill({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        background: color ? `${color}1a` : "rgba(255,255,255,0.06)",
        color: color ?? "rgba(255,255,255,0.4)",
      }}
    >
      {label}
    </span>
  );
}

// ── Sub-types ──────────────────────────────────────────────────────────────────

type StartupRow = {
  id: string;
  company_name: string;
  sector: string | null;
  stage: string;
  status: string;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  total_raised_usd: number | null;
  last_round_type: string | null;
  headcount: number | null;
  momentum_score: number | null;
  investor_fit_score: number | null;
  company_url: string | null;
  description_short: string | null;
  yc_batch: string | null;
  created_at: string;
};

type FounderRow = {
  id: string;
  full_name: string;
  role: string | null;
  startup_id: string;
  is_repeat_founder: boolean;
  has_prior_exit: boolean;
  operator_to_founder: boolean;
  track_record_score: number | null;
  location: string | null;
  domain_expertise: string[] | null;
  prior_companies: string[] | null;
  founder_archetype: string | null;
  linkedin_url: string | null;
  email: string | null;
  created_at: string;
  // joined
  startup_name?: string | null;
};

type OperatorRow = {
  id: string;
  full_name: string;
  title: string | null;
  sector_focus: string[] | null;
  expertise: string[] | null;
  prior_companies: string[] | null;
  completeness_score: number;
  enrichment_status: string;
  is_available: boolean | null;
  ready_for_live: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  email: string | null;
  stage_focus: string | null;
  source: string | null;
  updated_at: string;
};

// ── Sub-panel: Companies ───────────────────────────────────────────────────────

const COL_C = "2fr 1fr 1fr 1fr 1fr 1fr 0.8fr 0.7fr";

function CompaniesPanel() {
  const [rows, setRows] = useState<StartupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {
      entity: "companies",
      limit:  String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };
    if (dSearch)              params.search = dSearch;
    if (filterStage  !== "all") params.stage  = filterStage;
    if (filterStatus !== "all") params.status = filterStatus;

    const { rows: data, total: cnt, error: fetchErr } = await callMarketIntel(params);
    if (fetchErr) {
      setError(fetchErr);
    } else {
      setRows(data as StartupRow[]);
      setTotal(cnt);
    }
    setLoading(false);
  }, [dSearch, filterStage, filterStatus, page]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input
            placeholder="Search companies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-[12px]"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}
          />
        </div>
        <Select value={filterStage} onValueChange={(v) => { setFilterStage(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-32 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}>
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            <SelectItem value="pre_seed">Pre-Seed</SelectItem>
            <SelectItem value="seed">Seed</SelectItem>
            <SelectItem value="series_a">Series A</SelectItem>
            <SelectItem value="series_b">Series B</SelectItem>
            <SelectItem value="series_c">Series C+</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-32 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="stealth">Stealth</SelectItem>
            <SelectItem value="acquired">Acquired</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={fetchRows}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
        <span className="ml-auto font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {total.toLocaleString()} companies
        </span>
      </div>

      {/* table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        {/* header */}
        <div
          className="grid px-4 py-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{ gridTemplateColumns: COL_C, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span>Company</span>
          <span>Sector</span>
          <span>Stage</span>
          <span>Location</span>
          <span>Raised</span>
          <span>Headcount</span>
          <span>Fit Score</span>
          <span>Status</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 px-4 py-10 text-[13px]" style={{ color: "#ef4444" }}>
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="py-14 text-center text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            No companies found
          </div>
        )}

        {!loading && !error && rows.map((row) => (
          <div
            key={row.id}
            className="grid items-center gap-x-3 border-b px-4 py-3 transition-colors hover:bg-white/[0.025]"
            style={{ gridTemplateColumns: COL_C, borderColor: "rgba(255,255,255,0.05)" }}
          >
            {/* name + url */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-[13px] font-medium text-white/90">{row.company_name}</span>
                {row.yc_batch && (
                  <span className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                    {row.yc_batch}
                  </span>
                )}
                {row.company_url && (
                  <a href={row.company_url} target="_blank" rel="noreferrer" className="shrink-0 opacity-30 hover:opacity-70 transition-opacity">
                    <ExternalLink className="h-3 w-3" style={{ color: "#2EE6A6" }} />
                  </a>
                )}
              </div>
              {row.description_short && (
                <p className="truncate text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {row.description_short}
                </p>
              )}
            </div>

            {/* sector */}
            <span className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              {row.sector ?? "—"}
            </span>

            {/* stage */}
            <span className="truncate text-[12px] capitalize" style={{ color: "rgba(255,255,255,0.6)" }}>
              {row.stage?.replace(/_/g, " ") ?? "—"}
            </span>

            {/* location */}
            <span className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {[row.hq_city, row.hq_state ?? row.hq_country].filter(Boolean).join(", ") || "—"}
            </span>

            {/* raised */}
            <span className="font-mono text-[12px]" style={{ color: row.total_raised_usd ? "#e0e0e0" : "rgba(255,255,255,0.2)" }}>
              {fmt(row.total_raised_usd)}
            </span>

            {/* headcount */}
            <span className="font-mono text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              {row.headcount != null ? row.headcount.toLocaleString() : "—"}
            </span>

            {/* fit score */}
            <span className="font-mono text-[12px] font-semibold" style={{ color: scoreColor(row.investor_fit_score) }}>
              {row.investor_fit_score != null ? (row.investor_fit_score * 100).toFixed(0) : "—"}
            </span>

            {/* status */}
            <Pill
              label={row.status ?? "—"}
              color={row.status === "active" ? "#2EE6A6" : row.status === "acquired" ? "#3db4f2" : undefined}
            />
          </div>
        ))}
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {page + 1} / {pages}
          </span>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-panel: Founders ───────────────────────────────────────────────────────

const COL_F = "2fr 1.5fr 1fr 1fr 1fr 1fr 0.8fr";

function FoundersPanel() {
  const [rows, setRows] = useState<FounderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [filterRepeat, setFilterRepeat] = useState("all");
  const [filterExit, setFilterExit] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {
      entity: "founders",
      limit:  String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };
    if (dSearch)             params.search = dSearch;
    if (filterRepeat === "yes") params.repeat = "true";
    if (filterRepeat === "no")  params.repeat = "false";
    if (filterExit   === "yes") params.exit   = "true";
    if (filterExit   === "no")  params.exit   = "false";

    const { rows: data, total: cnt, error: fetchErr } = await callMarketIntel(params);
    if (fetchErr) {
      setError(fetchErr);
    } else {
      setRows(data as FounderRow[]);
      setTotal(cnt);
    }
    setLoading(false);
  }, [dSearch, filterRepeat, filterExit, page]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input
            placeholder="Search founders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-[12px]"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}
          />
        </div>
        <Select value={filterRepeat} onValueChange={(v) => { setFilterRepeat(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}>
            <SelectValue placeholder="Repeat founder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All founders</SelectItem>
            <SelectItem value="yes">Repeat founders</SelectItem>
            <SelectItem value="no">First-time founders</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterExit} onValueChange={(v) => { setFilterExit(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-32 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}>
            <SelectValue placeholder="Prior exit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any exit</SelectItem>
            <SelectItem value="yes">Has exit</SelectItem>
            <SelectItem value="no">No exit</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={fetchRows}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
        <span className="ml-auto font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {total.toLocaleString()} founders
        </span>
      </div>

      {/* table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div
          className="grid px-4 py-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{ gridTemplateColumns: COL_F, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span>Name</span>
          <span>Expertise</span>
          <span>Prior Cos</span>
          <span>Archetype</span>
          <span>Location</span>
          <span>Track Score</span>
          <span>Signals</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 px-4 py-10 text-[13px]" style={{ color: "#ef4444" }}>
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="py-14 text-center text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            No founders found
          </div>
        )}

        {!loading && !error && rows.map((row) => (
          <div
            key={row.id}
            className="grid items-center gap-x-3 border-b px-4 py-3 transition-colors hover:bg-white/[0.025]"
            style={{ gridTemplateColumns: COL_F, borderColor: "rgba(255,255,255,0.05)" }}
          >
            {/* name */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-[13px] font-medium text-white/90">{row.full_name}</span>
                {row.linkedin_url && (
                  <a href={row.linkedin_url} target="_blank" rel="noreferrer" className="shrink-0 opacity-30 hover:opacity-70 transition-opacity">
                    <ExternalLink className="h-3 w-3" style={{ color: "#3db4f2" }} />
                  </a>
                )}
              </div>
              {row.role && (
                <p className="truncate text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{row.role}</p>
              )}
            </div>

            {/* expertise */}
            <TagChips items={row.domain_expertise} max={2} />

            {/* prior companies */}
            <TagChips items={row.prior_companies} max={2} />

            {/* archetype */}
            <span className="truncate text-[12px] capitalize" style={{ color: "rgba(255,255,255,0.5)" }}>
              {row.founder_archetype?.replace(/_/g, " ") ?? "—"}
            </span>

            {/* location */}
            <div className="flex items-center gap-1 min-w-0">
              {row.location && <MapPin className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />}
              <span className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {row.location ?? "—"}
              </span>
            </div>

            {/* track record score */}
            <span className="font-mono text-[12px] font-semibold" style={{ color: scoreColor(row.track_record_score) }}>
              {row.track_record_score != null ? (row.track_record_score * 100).toFixed(0) : "—"}
            </span>

            {/* signal badges */}
            <div className="flex flex-wrap gap-1">
              {row.is_repeat_founder && (
                <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ background: "rgba(46,230,166,0.12)", color: "#2EE6A6" }}>
                  Repeat
                </span>
              )}
              {row.has_prior_exit && (
                <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ background: "rgba(61,180,242,0.12)", color: "#3db4f2" }}>
                  Exit
                </span>
              )}
              {row.operator_to_founder && (
                <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
                  Ops→
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {page + 1} / {pages}
          </span>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-panel: Operators ──────────────────────────────────────────────────────

const COL_O = "2fr 1.5fr 1fr 1.5fr 1fr 0.9fr 0.9fr 0.7fr";

function OperatorsPanel() {
  const [rows, setRows] = useState<OperatorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [filterAvail, setFilterAvail] = useState("all");
  const [filterEnrich, setFilterEnrich] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {
      entity: "operators",
      limit:  String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };
    if (dSearch)              params.search     = dSearch;
    if (filterAvail === "yes")  params.available  = "true";
    if (filterAvail === "no")   params.available  = "false";
    if (filterEnrich !== "all") params.enrichment = filterEnrich;

    const { rows: data, total: cnt, error: fetchErr } = await callMarketIntel(params);
    if (fetchErr) {
      setError(fetchErr);
    } else {
      setRows(data as OperatorRow[]);
      setTotal(cnt);
    }
    setLoading(false);
  }, [dSearch, filterAvail, filterEnrich, page]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const pages = Math.ceil(total / PAGE_SIZE);

  function enrichColor(status: string): string {
    switch (status) {
      case "enriched": return "#2EE6A6";
      case "partial":  return "#f59e0b";
      case "pending":  return "rgba(255,255,255,0.3)";
      case "failed":   return "#ef4444";
      default:         return "rgba(255,255,255,0.2)";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input
            placeholder="Search operators…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-[12px]"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}
          />
        </div>
        <Select value={filterAvail} onValueChange={(v) => { setFilterAvail(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}>
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All availability</SelectItem>
            <SelectItem value="yes">Available</SelectItem>
            <SelectItem value="no">Unavailable</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEnrich} onValueChange={(v) => { setFilterEnrich(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}>
            <SelectValue placeholder="Enrichment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All enrichment</SelectItem>
            <SelectItem value="enriched">Enriched</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={fetchRows}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
        <span className="ml-auto font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {total.toLocaleString()} operators
        </span>
      </div>

      {/* table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div
          className="grid px-4 py-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{ gridTemplateColumns: COL_O, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span>Name</span>
          <span>Expertise</span>
          <span>Stage Focus</span>
          <span>Prior Cos</span>
          <span>Location</span>
          <span>Completeness</span>
          <span>Enrichment</span>
          <span>Available</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 px-4 py-10 text-[13px]" style={{ color: "#ef4444" }}>
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="py-14 text-center text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            No operators found
          </div>
        )}

        {!loading && !error && rows.map((row) => (
          <div
            key={row.id}
            className="grid items-center gap-x-3 border-b px-4 py-3 transition-colors hover:bg-white/[0.025]"
            style={{ gridTemplateColumns: COL_O, borderColor: "rgba(255,255,255,0.05)" }}
          >
            {/* name + title */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-[13px] font-medium text-white/90">{row.full_name}</span>
                {row.linkedin_url && (
                  <a href={row.linkedin_url} target="_blank" rel="noreferrer" className="shrink-0 opacity-30 hover:opacity-70 transition-opacity">
                    <ExternalLink className="h-3 w-3" style={{ color: "#3db4f2" }} />
                  </a>
                )}
              </div>
              {row.title && (
                <p className="truncate text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{row.title}</p>
              )}
            </div>

            {/* expertise */}
            <TagChips items={row.expertise} max={2} />

            {/* stage focus */}
            <span className="truncate text-[12px] capitalize" style={{ color: "rgba(255,255,255,0.5)" }}>
              {row.stage_focus?.replace(/_/g, " ") ?? "—"}
            </span>

            {/* prior companies */}
            <TagChips items={row.prior_companies} max={2} />

            {/* location */}
            <div className="flex items-center gap-1 min-w-0">
              {(row.city || row.state || row.country) && (
                <MapPin className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />
              )}
              <span className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {[row.city, row.state ?? row.country].filter(Boolean).join(", ") || "—"}
              </span>
            </div>

            {/* completeness */}
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.round(row.completeness_score * 100)}%`, background: scoreColor(row.completeness_score) }}
                />
              </div>
              <span className="font-mono text-[11px] w-7 text-right shrink-0" style={{ color: scoreColor(row.completeness_score) }}>
                {Math.round(row.completeness_score * 100)}
              </span>
            </div>

            {/* enrichment */}
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize"
              style={{ background: `${enrichColor(row.enrichment_status)}1a`, color: enrichColor(row.enrichment_status) }}
            >
              {row.enrichment_status}
            </span>

            {/* available */}
            <div className="flex items-center">
              {row.is_available === true
                ? <CheckCircle2 className="h-4 w-4" style={{ color: "#2EE6A6" }} />
                : row.is_available === false
                ? <XCircle className="h-4 w-4" style={{ color: "rgba(255,255,255,0.2)" }} />
                : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
              }
            </div>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {page + 1} / {pages}
          </span>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────

type MarketTab = "companies" | "founders" | "operators";

const TABS: { key: MarketTab; label: string; icon: React.ReactNode }[] = [
  { key: "companies", label: "Companies", icon: <Building2 className="h-3.5 w-3.5" /> },
  { key: "founders",  label: "Founders",  icon: <Users className="h-3.5 w-3.5" /> },
  { key: "operators", label: "Operators", icon: <Briefcase className="h-3.5 w-3.5" /> },
];

export function AdminMarketIntelligence() {
  const [tab, setTab] = useState<MarketTab>("companies");

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white/90">Market Intelligence</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            Browse companies, founders, and operators in the Vekta dataset
          </p>
        </div>
        <TrendingUp className="h-5 w-5 shrink-0 mt-1" style={{ color: "#2EE6A6" }} />
      </div>

      {/* tab bar */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: "rgba(255,255,255,0.04)", width: "fit-content" }}>
        {TABS.map(({ key, label, icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-medium transition-colors"
              style={{
                background: active ? "rgba(46,230,166,0.1)" : "transparent",
                color: active ? "#2EE6A6" : "rgba(255,255,255,0.4)",
                border: active ? "1px solid rgba(46,230,166,0.2)" : "1px solid transparent",
              }}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {/* panel */}
      {tab === "companies" && <CompaniesPanel />}
      {tab === "founders"  && <FoundersPanel />}
      {tab === "operators" && <OperatorsPanel />}
    </div>
  );
}

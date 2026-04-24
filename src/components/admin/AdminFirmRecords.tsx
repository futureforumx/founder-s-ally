import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Building2, AlertCircle, CheckCircle2, Globe, MapPin, Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AdminFirmDetail, type FirmRow } from "./AdminFirmDetail";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const GRID = "2fr 1fr 1.5fr 1fr 1.2fr 1fr 0.8fr 0.8fr 0.7fr";

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(n: number | null): string {
  if (n === null) return "rgba(255,255,255,0.2)";
  if (n >= 0.7) return "#2EE6A6";
  if (n >= 0.4) return "#f59e0b";
  return "#ef4444";
}

function enrichmentBadgeStyle(status: string | null): { bg: string; text: string } {
  switch (status) {
    case "enriched":    return { bg: "rgba(46,230,166,0.12)", text: "#2EE6A6" };
    case "partial":     return { bg: "rgba(245,158,11,0.12)", text: "#f59e0b" };
    case "pending":     return { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" };
    case "failed":      return { bg: "rgba(239,68,68,0.12)", text: "#ef4444" };
    default:            return { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.3)" };
  }
}

// ── Tag chip display ──────────────────────────────────────────────────────────

function TagChips({ items, max = 3 }: { items: string[] | null; max?: number }) {
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

// ── Main component ─────────────────────────────────────────────────────────────

export function AdminFirmRecords() {
  const [rows, setRows] = useState<FirmRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterNeedsReview, setFilterNeedsReview] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedFirm, setSelectedFirm] = useState<FirmRow | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterType !== "all") params.set("firm_type", filterType);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterNeedsReview !== "all") params.set("needs_review", filterNeedsReview);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    if (!SUPABASE_URL) {
      toast.error("Supabase not configured");
      setLoading(false);
      return;
    }

    try {
      const { getSupabaseBearerForFunctions } = await import("@/integrations/supabase/client");
      const bearer = await getSupabaseBearerForFunctions();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY ?? ""}`,
      };
      if (bearer && bearer !== SUPABASE_ANON_KEY) {
        headers["X-User-Auth"] = `Bearer ${bearer}`;
      }

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-update-firm-record?${params.toString()}`,
        { method: "GET", headers }
      );
      const json = await res.json().catch(() => ({})) as { rows?: FirmRow[]; total?: number; error?: string };
      if (!res.ok || json.error) {
        toast.error("Failed to load firm records", { description: json.error ?? `HTTP ${res.status}` });
      } else {
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      }
    } catch (e) {
      toast.error("Network error", { description: e instanceof Error ? e.message : "Unknown error" });
    }
    setLoading(false);
  }, [debouncedSearch, filterType, filterStatus, filterNeedsReview, page]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSaved = useCallback((updated: FirmRow) => {
    setRows((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setSelectedFirm(null);
  }, []);

  // ── Full-screen detail view ────────────────────────────────────────────────
  if (selectedFirm) {
    return (
      <AdminFirmDetail
        firmRecord={selectedFirm}
        onBack={() => setSelectedFirm(null)}
        onSaved={handleSaved}
      />
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold text-white/90">Firm Records</h1>
          <p className="mt-1 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {total.toLocaleString()} firms · Search, view and manually update any record
          </p>
        </div>
        <button
          onClick={fetchRows}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors disabled:opacity-40"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input
            placeholder="Search firm name or website…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/25 focus-visible:ring-emerald-500/40"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 border-white/10 bg-white/5 text-xs text-white/70">
            <SelectValue placeholder="Firm Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="vc">VC</SelectItem>
            <SelectItem value="micro_vc">Micro VC</SelectItem>
            <SelectItem value="family_office">Family Office</SelectItem>
            <SelectItem value="corporate_vc">Corporate VC</SelectItem>
            <SelectItem value="accelerator">Accelerator</SelectItem>
            <SelectItem value="angel_network">Angel Network</SelectItem>
            <SelectItem value="private_equity">Private Equity</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 border-white/10 bg-white/5 text-xs text-white/70">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="enriched">Enriched</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="stale">Stale</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterNeedsReview} onValueChange={(v) => { setFilterNeedsReview(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 border-white/10 bg-white/5 text-xs text-white/70">
            <SelectValue placeholder="Review Flag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Needs Review</SelectItem>
            <SelectItem value="false">Reviewed / OK</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {/* Column headers */}
          <div
            className="grid items-center gap-2 px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest"
            style={{
              background: "rgba(255,255,255,0.02)",
              color: "rgba(255,255,255,0.3)",
              gridTemplateColumns: GRID,
            }}
          >
            <span>Firm</span>
            <span>Type</span>
            <span>Website</span>
            <span>HQ</span>
            <span>Sectors</span>
            <span>Stages</span>
            <span>Status</span>
            <span>Score</span>
            <span>Updated</span>
          </div>

          {rows.map((row) => {
            const enrichStyle = enrichmentBadgeStyle(row.enrichment_status);
            return (
              <div
                key={row.id}
                className="group grid items-center gap-2 px-4 py-3 border-t cursor-pointer transition-colors hover:bg-white/[0.025]"
                style={{ borderColor: "rgba(255,255,255,0.04)", gridTemplateColumns: GRID }}
                onClick={() => setSelectedFirm(row)}
              >
                {/* Firm */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {row.logo_url ? (
                    <img
                      src={row.logo_url}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-md object-contain"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    />
                  ) : (
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{ background: "rgba(46,230,166,0.07)" }}
                    >
                      <Building2 className="h-3.5 w-3.5" style={{ color: "#2EE6A6" }} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/85 truncate leading-tight">
                      {row.firm_name}
                    </p>
                    {row.needs_review && (
                      <span className="flex items-center gap-1 font-mono text-[8px] uppercase" style={{ color: "#f59e0b" }}>
                        <AlertCircle className="h-2.5 w-2.5" /> needs review
                      </span>
                    )}
                    {row.ready_for_live && !row.needs_review && (
                      <span className="flex items-center gap-1 font-mono text-[8px] uppercase" style={{ color: "#2EE6A6" }}>
                        <CheckCircle2 className="h-2.5 w-2.5" /> live
                      </span>
                    )}
                  </div>
                </div>

                {/* Type */}
                <span className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {row.firm_type ?? "—"}
                </span>

                {/* Website */}
                {row.website_url ? (
                  <a
                    href={row.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 min-w-0 hover:text-emerald-400 transition-colors"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="text-[10px] truncate font-mono">
                      {row.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </span>
                  </a>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.15)" }} className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    <span className="text-[10px]">—</span>
                  </span>
                )}

                {/* HQ */}
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />
                  <span className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {[row.hq_city, row.hq_country].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>

                {/* Sectors */}
                <TagChips items={row.sector_focus} max={2} />

                {/* Stages */}
                <TagChips items={row.stage_focus} max={2} />

                {/* Enrichment status */}
                <span
                  className="inline-block rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide w-fit"
                  style={{ background: enrichStyle.bg, color: enrichStyle.text }}
                >
                  {row.enrichment_status ?? "—"}
                </span>

                {/* Completeness score */}
                <span className="font-mono text-[11px] font-bold" style={{ color: scoreColor(row.completeness_score) }}>
                  {row.completeness_score !== null ? `${Math.round(row.completeness_score * 100)}%` : "—"}
                </span>

                {/* Updated */}
                <div className="flex items-center gap-1 justify-between">
                  <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {row.updated_at
                      ? formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })
                      : "—"}
                  </span>
                  <Eye
                    className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    style={{ color: "#2EE6A6" }}
                  />
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <p className="py-14 text-center font-mono text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
              No firm records found.
            </p>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-white/5 disabled:opacity-30"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-[11px] w-16 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-white/5 disabled:opacity-30"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

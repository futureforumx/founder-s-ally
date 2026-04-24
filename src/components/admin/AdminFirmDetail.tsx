/**
 * AdminFirmDetail
 *
 * Full-screen firm profile view inside the Admin Console.
 * - Matches the app's FirmProfile layout (header + tabs)
 * - "Edit Record" toggles all text fields to editable inputs
 * - Saves via admin-update-firm-record edge function (PATCH)
 * - Related data (funds, people, investments) loaded read-only from vc_firms
 */

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Edit3, Save, X, Loader2, Globe, Mail, MapPin,
  Building2, ExternalLink, Linkedin, Twitter, AlertCircle, CheckCircle2,
  RefreshCw, BookOpen,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabaseVcDirectory } from "@/integrations/supabase/client";
import { fetchVCFirmDetail, type VCFirmDetail, type VcFundRow } from "@/lib/vcFirmDetail";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { stripRedundantFirmPrefixFromFundName } from "@/lib/fundNameNormalizer";

// ── Shared types (mirror AdminFirmRecords) ────────────────────────────────────

export interface FirmRow {
  id: string;
  firm_name: string;
  legal_name: string | null;
  firm_type: string | null;
  website_url: string | null;
  email: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  sector_focus: string[] | null;
  stage_focus: string[] | null;
  geo_focus: string[] | null;
  enrichment_status: string | null;
  manual_review_status: string | null;
  needs_review: boolean;
  ready_for_live: boolean;
  completeness_score: number | null;
  data_confidence_score: number | null;
  aum: string | null;
  avg_check_size: string | null;
  description: string | null;
  elevator_pitch: string | null;
  logo_url: string | null;
  updated_at: string | null;
  created_at: string;
}

interface AdminFirmDetailProps {
  firmRecord: FirmRow;
  onBack: () => void;
  onSaved: (updated: FirmRow) => void;
}

// ── Draft state ───────────────────────────────────────────────────────────────

type Draft = {
  firm_name: string; legal_name: string; firm_type: string;
  website_url: string; email: string; phone: string;
  linkedin_url: string; x_url: string; crunchbase_url: string;
  angellist_url: string; pitchbook_url: string; openvc_url: string;
  hq_city: string; hq_state: string; hq_country: string; address: string;
  sector_focus: string; stage_focus: string; geo_focus: string; investment_themes: string;
  description: string; elevator_pitch: string; tagline: string; investment_philosophy: string;
  aum: string; avg_check_size: string; current_fund_name: string; current_fund_size: string;
  logo_url: string;
  enrichment_status: string; manual_review_status: string;
  needs_review: boolean; ready_for_live: boolean;
};

function rowToDraft(r: FirmRow): Draft {
  return {
    firm_name: r.firm_name ?? "",
    legal_name: r.legal_name ?? "",
    firm_type: r.firm_type ?? "",
    website_url: r.website_url ?? "",
    email: r.email ?? "",
    phone: "",
    linkedin_url: "",
    x_url: "",
    crunchbase_url: "",
    angellist_url: "",
    pitchbook_url: "",
    openvc_url: "",
    hq_city: r.hq_city ?? "",
    hq_state: r.hq_state ?? "",
    hq_country: r.hq_country ?? "",
    address: "",
    sector_focus: r.sector_focus?.join(", ") ?? "",
    stage_focus: r.stage_focus?.join(", ") ?? "",
    geo_focus: r.geo_focus?.join(", ") ?? "",
    investment_themes: "",
    description: r.description ?? "",
    elevator_pitch: r.elevator_pitch ?? "",
    tagline: "",
    investment_philosophy: "",
    aum: r.aum ?? "",
    avg_check_size: r.avg_check_size ?? "",
    current_fund_name: "",
    current_fund_size: "",
    logo_url: r.logo_url ?? "",
    enrichment_status: r.enrichment_status ?? "",
    manual_review_status: r.manual_review_status ?? "",
    needs_review: r.needs_review ?? false,
    ready_for_live: r.ready_for_live ?? false,
  };
}

function strToArr(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: unknown): string {
  if (!iso || typeof iso !== "string") return "—";
  try { return format(parseISO(iso), "MMM d, yyyy"); } catch { return iso; }
}

function fmtUsd(n: unknown): string {
  if (n == null || typeof n !== "number") return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function scoreColor(n: number | null): string {
  if (n === null) return "rgba(255,255,255,0.3)";
  if (n >= 0.7) return "#2EE6A6";
  if (n >= 0.4) return "#f59e0b";
  return "#ef4444";
}

// ── Inline field components ───────────────────────────────────────────────────

function InlineText({
  value, editing, onChange, placeholder, className,
  multiline = false, rows = 3,
}: {
  value: string; editing: boolean; onChange: (v: string) => void;
  placeholder?: string; className?: string; multiline?: boolean; rows?: number;
}) {
  if (!editing) {
    return value ? (
      <span className={className}>{value}</span>
    ) : (
      <span className={`${className ?? ""} opacity-30`}>{placeholder ?? "—"}</span>
    );
  }
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y"
      />
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 border-white/10 bg-white/5 text-sm text-white/85 placeholder:text-white/20 focus-visible:ring-emerald-500/30"
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
      {children}
    </p>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-5 ${className ?? ""}`}
      style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0a0a0a" }}
    >
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: active ? "rgba(46,230,166,0.1)" : "transparent",
        color: active ? "#2EE6A6" : "rgba(255,255,255,0.45)",
      }}
    >
      {children}
    </button>
  );
}

function TagPill({ label }: { label: string }) {
  return (
    <span
      className="rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
      style={{ background: "rgba(46,230,166,0.08)", color: "#2EE6A6" }}
    >
      {label}
    </span>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label, color = "#2EE6A6" }: {
  value: boolean; onChange: (v: boolean) => void; label: string; color?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!value)}
        className="relative h-5 w-9 rounded-full transition-colors cursor-pointer"
        style={{ background: value ? `${color}66` : "rgba(255,255,255,0.08)" }}
      >
        <div
          className="absolute top-0.5 h-4 w-4 rounded-full transition-transform"
          style={{
            background: value ? color : "rgba(255,255,255,0.3)",
            transform: value ? "translateX(18px)" : "translateX(2px)",
          }}
        />
      </div>
      <span className="text-xs text-white/60">{label}</span>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminFirmDetail({ firmRecord, onBack, onSaved }: AdminFirmDetailProps) {
  const [draft, setDraft] = useState<Draft>(() => rowToDraft(firmRecord));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "funds" | "people" | "investments" | "signals" | "sources">("overview");

  // Load vc_firms detail (funds, people, investments, etc.) from the vc_firms table
  const [vcFirmDetail, setVcFirmDetail] = useState<VCFirmDetail | null>(null);
  const [vcLoading, setVcLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setVcLoading(true);

    (async () => {
      try {
        // Look up the vc_firms row that links to this firm_records.id
        const { data: vcRow } = await (supabaseVcDirectory as any)
          .from("vc_firms")
          .select("id")
          .eq("firm_record_id", firmRecord.id)
          .is("deleted_at", null)
          .maybeSingle();

        if (cancelled) return;

        if (vcRow?.id) {
          const detail = await fetchVCFirmDetail(supabaseVcDirectory, vcRow.id);
          if (!cancelled) setVcFirmDetail(detail);
        }
      } catch (e) {
        console.warn("[AdminFirmDetail] vc_firms lookup failed:", e);
      } finally {
        if (!cancelled) setVcLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [firmRecord.id]);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }, []);

  const handleCancel = () => {
    setDraft(rowToDraft(firmRecord));
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    if (!SUPABASE_URL) {
      toast.error("Supabase not configured");
      setSaving(false);
      return;
    }

    const patch: Record<string, unknown> = {
      firm_name: draft.firm_name.trim() || firmRecord.firm_name,
      legal_name: draft.legal_name.trim() || null,
      firm_type: draft.firm_type.trim() || null,
      website_url: draft.website_url.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      linkedin_url: draft.linkedin_url.trim() || null,
      x_url: draft.x_url.trim() || null,
      crunchbase_url: draft.crunchbase_url.trim() || null,
      angellist_url: draft.angellist_url.trim() || null,
      pitchbook_url: draft.pitchbook_url.trim() || null,
      openvc_url: draft.openvc_url.trim() || null,
      hq_city: draft.hq_city.trim() || null,
      hq_state: draft.hq_state.trim() || null,
      hq_country: draft.hq_country.trim() || null,
      address: draft.address.trim() || null,
      sector_focus: strToArr(draft.sector_focus),
      stage_focus: strToArr(draft.stage_focus),
      geo_focus: strToArr(draft.geo_focus),
      investment_themes: strToArr(draft.investment_themes),
      description: draft.description.trim() || null,
      elevator_pitch: draft.elevator_pitch.trim() || null,
      tagline: draft.tagline.trim() || null,
      investment_philosophy: draft.investment_philosophy.trim() || null,
      aum: draft.aum.trim() || null,
      avg_check_size: draft.avg_check_size.trim() || null,
      current_fund_name: draft.current_fund_name.trim() || null,
      current_fund_size: draft.current_fund_size.trim() || null,
      logo_url: draft.logo_url.trim() || null,
      enrichment_status: draft.enrichment_status.trim() || null,
      manual_review_status: draft.manual_review_status.trim() || null,
      needs_review: draft.needs_review,
      ready_for_live: draft.ready_for_live,
    };

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
        `${SUPABASE_URL}/functions/v1/admin-update-firm-record?id=${encodeURIComponent(firmRecord.id)}`,
        { method: "PATCH", headers, body: JSON.stringify(patch) }
      );
      const json = await res.json().catch(() => ({})) as { row?: FirmRow; error?: string };
      if (!res.ok || json.error) {
        toast.error("Save failed", { description: json.error ?? `HTTP ${res.status}` });
      } else if (json.row) {
        onSaved(json.row);
        setDraft(rowToDraft(json.row));
        setEditing(false);
        toast.success("Firm record saved");
      }
    } catch (e) {
      toast.error("Network error", { description: e instanceof Error ? e.message : "Unknown" });
    }

    setSaving(false);
  };

  // Resolve display values
  const hq = [draft.hq_city, draft.hq_state, draft.hq_country].filter(Boolean).join(", ");

  const funds = [...(vcFirmDetail?.vc_funds ?? [])].sort((a, b) =>
    String(a.fund_name ?? "").localeCompare(String(b.fund_name ?? ""))
  );
  const people = [...(vcFirmDetail?.vc_people ?? [])].sort((a, b) =>
    `${a.first_name ?? ""} ${a.last_name ?? ""}`.localeCompare(`${b.first_name ?? ""} ${b.last_name ?? ""}`)
  );
  const investments = [...(vcFirmDetail?.vc_investments ?? [])].sort((a, b) =>
    String(b.investment_date ?? "").localeCompare(String(a.investment_date ?? ""))
  );
  const signals = [...(vcFirmDetail?.vc_signals ?? [])].sort((a, b) =>
    String(b.signal_date ?? "").localeCompare(String(a.signal_date ?? ""))
  );
  const sources = [...(vcFirmDetail?.vc_source_links ?? [])].sort((a, b) =>
    String(a.label ?? "").localeCompare(String(b.label ?? ""))
  );

  return (
    <div className="space-y-0">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between mb-6 pb-5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-white/80"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Firm Records
        </button>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: "rgba(46,230,166,0.15)", color: "#2EE6A6" }}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Changes
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit Record
            </button>
          )}
        </div>
      </div>

      {/* ── Profile header ───────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border p-6 mb-6"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0a0a0a" }}
      >
        <div className="flex items-start gap-5">
          {/* Logo */}
          <div className="shrink-0">
            {editing ? (
              <div className="space-y-1">
                {draft.logo_url ? (
                  <img
                    src={draft.logo_url}
                    alt=""
                    className="h-16 w-16 rounded-xl object-contain border"
                    style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                  />
                ) : (
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-xl border"
                    style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(46,230,166,0.06)" }}
                  >
                    <Building2 className="h-7 w-7" style={{ color: "#2EE6A6" }} />
                  </div>
                )}
                <Input
                  value={draft.logo_url}
                  onChange={(e) => set("logo_url", e.target.value)}
                  placeholder="Logo URL"
                  className="h-7 w-36 border-white/10 bg-white/5 text-[10px] text-white/60 placeholder:text-white/20 focus-visible:ring-emerald-500/30"
                />
              </div>
            ) : (
              draft.logo_url ? (
                <img
                  src={draft.logo_url}
                  alt=""
                  className="h-16 w-16 rounded-xl object-contain border"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-xl border"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(46,230,166,0.06)" }}
                >
                  <Building2 className="h-7 w-7" style={{ color: "#2EE6A6" }} />
                </div>
              )
            )}
          </div>

          {/* Name + pitch + badges */}
          <div className="flex-1 min-w-0">
            {/* Firm name */}
            {editing ? (
              <Input
                value={draft.firm_name}
                onChange={(e) => set("firm_name", e.target.value)}
                placeholder="Firm name"
                className="mb-2 h-9 border-white/10 bg-white/5 text-xl font-semibold text-white/90 placeholder:text-white/20 focus-visible:ring-emerald-500/30"
              />
            ) : (
              <h1 className="text-2xl font-semibold text-white/90 mb-1">{draft.firm_name}</h1>
            )}

            {/* Elevator pitch */}
            {editing ? (
              <textarea
                value={draft.elevator_pitch}
                onChange={(e) => set("elevator_pitch", e.target.value)}
                placeholder="Elevator pitch — one sentence about what this firm does"
                rows={2}
                className="mb-3 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-none"
              />
            ) : draft.elevator_pitch ? (
              <p className="mb-3 text-sm max-w-2xl" style={{ color: "rgba(255,255,255,0.5)" }}>
                {draft.elevator_pitch}
              </p>
            ) : null}

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2">
              {editing ? (
                <Select value={draft.firm_type || "__none__"} onValueChange={(v) => set("firm_type", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-7 w-36 border-white/10 bg-white/5 text-xs text-white/70">
                    <SelectValue placeholder="Firm type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="vc">VC</SelectItem>
                    <SelectItem value="micro_vc">Micro VC</SelectItem>
                    <SelectItem value="family_office">Family Office</SelectItem>
                    <SelectItem value="corporate_vc">Corporate VC</SelectItem>
                    <SelectItem value="accelerator">Accelerator</SelectItem>
                    <SelectItem value="angel_network">Angel Network</SelectItem>
                    <SelectItem value="private_equity">Private Equity</SelectItem>
                    <SelectItem value="hedge_fund">Hedge Fund</SelectItem>
                    <SelectItem value="fund_of_funds">Fund of Funds</SelectItem>
                    <SelectItem value="incubator">Incubator</SelectItem>
                    <SelectItem value="studio">Studio</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              ) : draft.firm_type ? (
                <span
                  className="rounded-md border px-2.5 py-0.5 text-xs font-medium"
                  style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.04)" }}
                >
                  {draft.firm_type.replace(/_/g, " ")}
                </span>
              ) : null}

              {editing ? (
                <Input
                  value={draft.aum}
                  onChange={(e) => set("aum", e.target.value)}
                  placeholder="AUM e.g. $500M"
                  className="h-7 w-28 border-white/10 bg-white/5 text-xs text-white/60 placeholder:text-white/20 focus-visible:ring-emerald-500/30"
                />
              ) : draft.aum ? (
                <span
                  className="rounded-md border px-2.5 py-0.5 text-xs font-medium"
                  style={{ borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.03)" }}
                >
                  AUM: {draft.aum}
                </span>
              ) : null}

              {editing ? (
                <div className="flex items-center gap-1">
                  <Input value={draft.hq_city} onChange={(e) => set("hq_city", e.target.value)} placeholder="City"
                    className="h-7 w-24 border-white/10 bg-white/5 text-xs text-white/60 placeholder:text-white/20" />
                  <Input value={draft.hq_state} onChange={(e) => set("hq_state", e.target.value)} placeholder="State"
                    className="h-7 w-16 border-white/10 bg-white/5 text-xs text-white/60 placeholder:text-white/20" />
                  <Input value={draft.hq_country} onChange={(e) => set("hq_country", e.target.value)} placeholder="Country"
                    className="h-7 w-20 border-white/10 bg-white/5 text-xs text-white/60 placeholder:text-white/20" />
                </div>
              ) : hq ? (
                <span className="flex items-center gap-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <MapPin className="h-3.5 w-3.5" /> {hq}
                </span>
              ) : null}

              {/* Website link */}
              {editing ? (
                <Input value={draft.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://..."
                  className="h-7 w-48 border-white/10 bg-white/5 text-xs text-white/60 placeholder:text-white/20" />
              ) : draft.website_url ? (
                <a href={draft.website_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium hover:underline"
                  style={{ color: "#2EE6A6" }}>
                  <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                </a>
              ) : null}

              {/* Social links (view-only, edit in Overview tab) */}
              {!editing && (
                <>
                  {firmRecord.email && (
                    <a href={`mailto:${firmRecord.email}`} className="transition-colors hover:text-white/70" style={{ color: "rgba(255,255,255,0.3)" }}>
                      <Mail className="h-4 w-4" />
                    </a>
                  )}
                </>
              )}
            </div>

            {/* Status flags */}
            <div className="mt-2 flex items-center gap-3">
              {firmRecord.needs_review && !editing && (
                <span className="flex items-center gap-1 font-mono text-[9px] uppercase" style={{ color: "#f59e0b" }}>
                  <AlertCircle className="h-3 w-3" /> Needs Review
                </span>
              )}
              {firmRecord.ready_for_live && !editing && (
                <span className="flex items-center gap-1 font-mono text-[9px] uppercase" style={{ color: "#2EE6A6" }}>
                  <CheckCircle2 className="h-3 w-3" /> Live
                </span>
              )}
              {firmRecord.completeness_score !== null && (
                <span className="font-mono text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Completeness:{" "}
                  <span style={{ color: scoreColor(firmRecord.completeness_score) }}>
                    {Math.round(firmRecord.completeness_score * 100)}%
                  </span>
                </span>
              )}
              <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                ID: {firmRecord.id}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 mb-5 border-b pb-3"
        style={{ borderColor: "rgba(255,255,255,0.05)" }}
      >
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</TabButton>
        <TabButton active={activeTab === "funds"} onClick={() => setActiveTab("funds")}>
          Funds {vcFirmDetail ? `(${funds.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "people"} onClick={() => setActiveTab("people")}>
          People {vcFirmDetail ? `(${people.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "investments"} onClick={() => setActiveTab("investments")}>
          Investments {vcFirmDetail ? `(${investments.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "signals"} onClick={() => setActiveTab("signals")}>
          Signals {vcFirmDetail ? `(${signals.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "sources"} onClick={() => setActiveTab("sources")}>
          Sources {vcFirmDetail ? `(${sources.length})` : ""}
        </TabButton>
      </div>

      {/* ══ Overview tab ═══════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-5">

          {/* Description */}
          <Card>
            <p className="mb-3 text-xs font-semibold text-white/60 uppercase tracking-widest">About</p>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <FieldLabel>Tagline</FieldLabel>
                  <Input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="One-line tagline"
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea value={draft.description} onChange={(e) => set("description", e.target.value)}
                    rows={5} placeholder="Full description of the firm..."
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y" />
                </div>
                <div>
                  <FieldLabel>Investment Philosophy</FieldLabel>
                  <textarea value={draft.investment_philosophy} onChange={(e) => set("investment_philosophy", e.target.value)}
                    rows={3} placeholder="Investment philosophy..."
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-y" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {draft.tagline && <p className="text-sm font-medium text-white/70 italic">"{draft.tagline}"</p>}
                {draft.description ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {draft.description}
                  </p>
                ) : (
                  <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.2)" }}>No description.</p>
                )}
                {draft.investment_philosophy && (
                  <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <p className="mb-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Investment Philosophy</p>
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{draft.investment_philosophy}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Focus */}
          <Card>
            <p className="mb-4 text-xs font-semibold text-white/60 uppercase tracking-widest">Investment Focus</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <FieldLabel>Sector Focus</FieldLabel>
                {editing ? (
                  <Input value={draft.sector_focus} onChange={(e) => set("sector_focus", e.target.value)}
                    placeholder="SaaS, Fintech, AI (comma-separated)"
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {strToArr(draft.sector_focus).length > 0
                      ? strToArr(draft.sector_focus).map((s) => <TagPill key={s} label={s} />)
                      : <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                  </div>
                )}
              </div>
              <div>
                <FieldLabel>Stage Focus</FieldLabel>
                {editing ? (
                  <Input value={draft.stage_focus} onChange={(e) => set("stage_focus", e.target.value)}
                    placeholder="pre_seed, seed, series_a"
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {strToArr(draft.stage_focus).length > 0
                      ? strToArr(draft.stage_focus).map((s) => <TagPill key={s} label={s} />)
                      : <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                  </div>
                )}
              </div>
              <div>
                <FieldLabel>Geo Focus</FieldLabel>
                {editing ? (
                  <Input value={draft.geo_focus} onChange={(e) => set("geo_focus", e.target.value)}
                    placeholder="North America, Europe"
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {strToArr(draft.geo_focus).length > 0
                      ? strToArr(draft.geo_focus).map((s) => <TagPill key={s} label={s} />)
                      : <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                  </div>
                )}
              </div>
              {editing && (
                <div>
                  <FieldLabel>Investment Themes</FieldLabel>
                  <Input value={draft.investment_themes} onChange={(e) => set("investment_themes", e.target.value)}
                    placeholder="Climate Tech, Future of Work"
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                </div>
              )}
            </div>
          </Card>

          {/* Fund details + contact */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card>
              <p className="mb-4 text-xs font-semibold text-white/60 uppercase tracking-widest">Fund &amp; AUM</p>
              <div className="space-y-3">
                {(["aum", "avg_check_size", "current_fund_name", "current_fund_size"] as const).map((key) => {
                  const labels: Record<string, string> = {
                    aum: "AUM (display)", avg_check_size: "Avg Check Size",
                    current_fund_name: "Current Fund Name", current_fund_size: "Current Fund Size",
                  };
                  const placeholders: Record<string, string> = {
                    aum: "$500M", avg_check_size: "$2M", current_fund_name: "Fund III", current_fund_size: "$250M",
                  };
                  return (
                    <div key={key}>
                      <FieldLabel>{labels[key]}</FieldLabel>
                      {editing ? (
                        <Input value={draft[key]} onChange={(e) => set(key, e.target.value)}
                          placeholder={placeholders[key]}
                          className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                      ) : (
                        <p className="text-sm" style={{ color: draft[key] ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>
                          {draft[key] || "—"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <p className="mb-4 text-xs font-semibold text-white/60 uppercase tracking-widest">Contact &amp; Links</p>
              <div className="space-y-3">
                {(["email", "linkedin_url", "x_url", "crunchbase_url", "angellist_url"] as const).map((key) => {
                  const labels: Record<string, string> = {
                    email: "Email", linkedin_url: "LinkedIn", x_url: "X (Twitter)",
                    crunchbase_url: "Crunchbase", angellist_url: "AngelList",
                  };
                  const placeholders: Record<string, string> = {
                    email: "info@firm.com", linkedin_url: "https://linkedin.com/...", x_url: "https://x.com/...",
                    crunchbase_url: "https://crunchbase.com/...", angellist_url: "https://angel.co/...",
                  };
                  return (
                    <div key={key}>
                      <FieldLabel>{labels[key]}</FieldLabel>
                      {editing ? (
                        <Input value={draft[key]} onChange={(e) => set(key, e.target.value)}
                          placeholder={placeholders[key]}
                          className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                      ) : draft[key] ? (
                        key === "email" ? (
                          <a href={`mailto:${draft[key]}`} className="text-sm hover:underline" style={{ color: "#2EE6A6" }}>
                            {draft[key]}
                          </a>
                        ) : (
                          <a href={draft[key]} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-sm hover:underline truncate" style={{ color: "#2EE6A6" }}>
                            {draft[key].replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                          </a>
                        )
                      ) : (
                        <p className="text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Status & workflow */}
          <Card>
            <p className="mb-4 text-xs font-semibold text-white/60 uppercase tracking-widest">Status &amp; Workflow</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <FieldLabel>Enrichment Status</FieldLabel>
                {editing ? (
                  <Select value={draft.enrichment_status || "__none__"} onValueChange={(v) => set("enrichment_status", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white/70">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="enriched">Enriched</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="stale">Stale</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{draft.enrichment_status || "—"}</p>
                )}
              </div>
              <div>
                <FieldLabel>Review Status</FieldLabel>
                {editing ? (
                  <Select value={draft.manual_review_status || "__none__"} onValueChange={(v) => set("manual_review_status", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white/70">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="needs_review">Needs Review</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{draft.manual_review_status || "—"}</p>
                )}
              </div>
              <div>
                <FieldLabel>Completeness</FieldLabel>
                <p className="text-sm font-bold font-mono" style={{ color: scoreColor(firmRecord.completeness_score) }}>
                  {firmRecord.completeness_score !== null ? `${Math.round(firmRecord.completeness_score * 100)}%` : "—"}
                </p>
              </div>
              <div>
                <FieldLabel>Data Confidence</FieldLabel>
                <p className="text-sm font-bold font-mono" style={{ color: scoreColor(firmRecord.data_confidence_score) }}>
                  {firmRecord.data_confidence_score !== null ? `${Math.round(firmRecord.data_confidence_score * 100)}%` : "—"}
                </p>
              </div>
            </div>
            {editing && (
              <div className="mt-4 flex items-center gap-6 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <Toggle value={draft.needs_review} onChange={(v) => set("needs_review", v)} label="Needs Review" color="#f59e0b" />
                <Toggle value={draft.ready_for_live} onChange={(v) => set("ready_for_live", v)} label="Ready for Live" color="#2EE6A6" />
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ══ Funds tab ══════════════════════════════════════════════════════════ */}
      {activeTab === "funds" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
            </div>
          ) : funds.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No funds linked to this firm record.</p>
          ) : (
            funds.map((f: VcFundRow) => (
              <Card key={f.id}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-white/85">
                    {stripRedundantFirmPrefixFromFundName(String(vcFirmDetail?.firm_name ?? ""), String(f.fund_name ?? "Fund"))}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {f.fund_status ? <Badge variant="outline" className="text-[10px]">{String(f.fund_status)}</Badge> : null}
                    {f.fund_type ? <Badge variant="secondary" className="text-[10px]">{String(f.fund_type).replace(/_/g, " ")}</Badge> : null}
                    {f.actively_deploying === true ? <Badge className="text-[10px]">Deploying</Badge> : null}
                  </div>
                </div>
                {typeof f.focus_summary === "string" && f.focus_summary && (
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: "rgba(255,255,255,0.45)" }}>{f.focus_summary}</p>
                )}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4" style={{ color: "rgba(255,255,255,0.45)" }}>
                  <div>Vintage: {f.vintage_year != null ? String(f.vintage_year) : "—"}</div>
                  <div>Size: {fmtUsd(f.size_usd)}</div>
                  <div>AUM: {fmtUsd(f.aum_usd)}</div>
                  <div>Lead/Follow: {f.lead_follow != null ? String(f.lead_follow).replace(/_/g, " ") : "—"}</div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ══ People tab ═════════════════════════════════════════════════════════ */}
      {activeTab === "people" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
            </div>
          ) : people.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No team members linked.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {people.map((p) => {
                const fullName = String(
                  (p as any).preferred_name || `${(p as any).first_name ?? ""} ${(p as any).last_name ?? ""}`.trim() || "Partner"
                );
                const initials = fullName.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase();
                return (
                  <Card key={p.id} className="flex flex-col">
                    <div className="flex items-start gap-3">
                      {(p as any).avatar_url ? (
                        <img src={String((p as any).avatar_url)} alt={fullName}
                          className="h-10 w-10 shrink-0 rounded-lg object-cover border"
                          style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                          style={{ background: "rgba(46,230,166,0.08)", color: "#2EE6A6" }}>
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white/85 truncate">{fullName}</p>
                        <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {[(p as any).title, (p as any).role].filter(Boolean).join(" · ") || "Partner"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          {(p as any).linkedin_url && <a href={String((p as any).linkedin_url)} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white/60"><Linkedin className="h-3.5 w-3.5" /></a>}
                          {(p as any).x_url && <a href={String((p as any).x_url)} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white/60"><Twitter className="h-3.5 w-3.5" /></a>}
                          {(p as any).email && <a href={`mailto:${(p as any).email}`} style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white/60"><Mail className="h-3.5 w-3.5" /></a>}
                        </div>
                      </div>
                    </div>
                    {(p as any).bio && (
                      <p className="mt-3 text-xs line-clamp-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {String((p as any).bio)}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Investments tab ════════════════════════════════════════════════════ */}
      {activeTab === "investments" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
            </div>
          ) : investments.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No investments recorded.</p>
          ) : (
            investments.map((inv) => (
              <Card key={inv.id}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-white/85">{String(inv.company_name ?? "—")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {inv.sector ? <Badge variant="outline" className="text-[10px]">{String(inv.sector).replace(/_/g, " ")}</Badge> : null}
                    {inv.stage_at_investment ? <Badge variant="secondary" className="text-[10px]">{String(inv.stage_at_investment).replace(/_/g, " ")}</Badge> : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4" style={{ color: "rgba(255,255,255,0.45)" }}>
                  <div>Date: {fmtDate(inv.investment_date)}</div>
                  <div>Check: {fmtUsd(inv.check_size_usd)}</div>
                  <div>Round: {inv.round_type != null ? String(inv.round_type) : "—"}</div>
                  <div>Location: {inv.location != null ? String(inv.location) : "—"}</div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ══ Signals tab ════════════════════════════════════════════════════════ */}
      {activeTab === "signals" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
            </div>
          ) : signals.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No signals.</p>
          ) : (
            signals.map((s) => (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-white/85">{String(s.title ?? "—")}</p>
                  {s.signal_type ? <Badge variant="outline" className="text-[10px]">{String(s.signal_type).replace(/_/g, " ")}</Badge> : null}
                </div>
                <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>{fmtDate(s.signal_date)}</p>
                {typeof s.description === "string" && s.description && (
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{s.description}</p>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* ══ Sources tab ════════════════════════════════════════════════════════ */}
      {activeTab === "sources" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
            </div>
          ) : sources.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No source links.</p>
          ) : (
            sources.map((src) => (
              <Card key={src.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white/80">{String(src.label ?? "")}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {String(src.source_type ?? "").replace(/_/g, " ")}
                    </p>
                  </div>
                  <a href={String(src.url ?? "#")} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-sm font-medium hover:underline"
                    style={{ color: "#2EE6A6" }}>
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

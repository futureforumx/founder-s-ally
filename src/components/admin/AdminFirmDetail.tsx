/**
 * AdminFirmDetail
 *
 * Full-screen firm profile view inside the Admin Console.
 * Tabs: Overview · Links · Classifications · Funds · People · Investments · Signals · Sources
 */

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Edit3, Save, X, Loader2, Globe, Mail, MapPin,
  Building2, ExternalLink, Linkedin, Twitter, AlertCircle, CheckCircle2,
  Link2, Tag,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase, supabaseVcDirectory } from "@/integrations/supabase/client";
import { fetchVCFirmDetail, type VCFirmDetail, type VcFundRow } from "@/lib/vcFirmDetail";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { stripRedundantFirmPrefixFromFundName } from "@/lib/fundNameNormalizer";

// ── Shared FirmRow type ───────────────────────────────────────────────────────

export interface FirmRow {
  id: string;
  firm_name: string;
  legal_name: string | null;
  firm_type: string | null;
  website_url: string | null;
  email: string | null;
  phone: string | null;
  founded_year: number | null;
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
  // Link fields
  contact_page_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  crunchbase_url?: string | null;
  angellist_url?: string | null;
  pitchbook_url?: string | null;
  openvc_url?: string | null;
  vcsheet_url?: string | null;
  wellfound_url?: string | null;
  signal_nfx_url?: string | null;
  tracxn_url?: string | null;
  cb_insights_url?: string | null;
  trustfinta_url?: string | null;
  startups_gallery_url?: string | null;
  substack_url?: string | null;
  medium_url?: string | null;
  beehiiv_url?: string | null;
  blog_url?: string | null;
  firm_blog_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  youtube_url?: string | null;
  // Classification fields
  entity_type?: string | null;
  thesis_orientation?: string | null;
  sector_classification?: string | null;
  stage_classification?: string | null;
  structure_classification?: string | null;
  theme_classification?: string | null;
  impact_orientation?: string | null;
  strategy_classifications?: string[] | null;
  ownership_type?: string | null;
  has_fresh_capital?: boolean | null;
  is_actively_deploying?: boolean | null;
  underrepresented_founders_focus?: boolean | null;
  ca_sb54_compliant?: boolean | null;
  verification_status?: string | null;
  fund_status?: string | null;
}

interface AdminFirmDetailProps {
  firmRecord: FirmRow;
  onBack: () => void;
  onSaved: (updated: FirmRow) => void;
}

// ── Draft state ───────────────────────────────────────────────────────────────

type Draft = {
  // Identity
  firm_name: string; legal_name: string; firm_type: string; founded_year: string;
  logo_url: string;
  // Contact
  email: string; phone: string; address: string;
  hq_city: string; hq_state: string; hq_country: string;
  // Profile text
  description: string; elevator_pitch: string; tagline: string; investment_philosophy: string;
  // Focus
  sector_focus: string; stage_focus: string; geo_focus: string; investment_themes: string;
  // Fund / AUM
  aum: string; avg_check_size: string; current_fund_name: string; current_fund_size: string;
  // Status
  enrichment_status: string; manual_review_status: string;
  needs_review: boolean; ready_for_live: boolean;
  // Links — Web & Contact
  website_url: string; contact_page_url: string;
  // Links — Social
  linkedin_url: string; x_url: string; instagram_url: string;
  facebook_url: string; youtube_url: string;
  // Links — VC Directories
  crunchbase_url: string; angellist_url: string; pitchbook_url: string;
  openvc_url: string; vcsheet_url: string; wellfound_url: string;
  signal_nfx_url: string; tracxn_url: string; cb_insights_url: string;
  trustfinta_url: string; startups_gallery_url: string;
  // Links — Content
  substack_url: string; medium_url: string; beehiiv_url: string;
  blog_url: string; firm_blog_url: string;
  // Classifications
  entity_type: string; thesis_orientation: string;
  sector_classification: string; stage_classification: string;
  structure_classification: string; theme_classification: string;
  impact_orientation: string; strategy_classifications: string;
  ownership_type: string;
  has_fresh_capital: boolean; is_actively_deploying: boolean;
  underrepresented_founders_focus: boolean; ca_sb54_compliant: boolean;
  verification_status: string; fund_status: string;
};

function rowToDraft(r: FirmRow): Draft {
  return {
    firm_name: r.firm_name ?? "",
    legal_name: r.legal_name ?? "",
    firm_type: r.firm_type ?? "",
    founded_year: r.founded_year != null ? String(r.founded_year) : "",
    logo_url: r.logo_url ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: "",
    hq_city: r.hq_city ?? "",
    hq_state: r.hq_state ?? "",
    hq_country: r.hq_country ?? "",
    description: r.description ?? "",
    elevator_pitch: r.elevator_pitch ?? "",
    tagline: "",
    investment_philosophy: "",
    sector_focus: r.sector_focus?.join(", ") ?? "",
    stage_focus: r.stage_focus?.join(", ") ?? "",
    geo_focus: r.geo_focus?.join(", ") ?? "",
    investment_themes: "",
    aum: r.aum ?? "",
    avg_check_size: r.avg_check_size ?? "",
    current_fund_name: "",
    current_fund_size: "",
    enrichment_status: r.enrichment_status ?? "",
    manual_review_status: r.manual_review_status ?? "",
    needs_review: r.needs_review ?? false,
    ready_for_live: r.ready_for_live ?? false,
    // Links
    website_url: r.website_url ?? "",
    contact_page_url: r.contact_page_url ?? "",
    linkedin_url: r.linkedin_url ?? "",
    x_url: r.x_url ?? "",
    instagram_url: r.instagram_url ?? "",
    facebook_url: r.facebook_url ?? "",
    youtube_url: r.youtube_url ?? "",
    crunchbase_url: r.crunchbase_url ?? "",
    angellist_url: r.angellist_url ?? "",
    pitchbook_url: r.pitchbook_url ?? "",
    openvc_url: r.openvc_url ?? "",
    vcsheet_url: r.vcsheet_url ?? "",
    wellfound_url: r.wellfound_url ?? "",
    signal_nfx_url: r.signal_nfx_url ?? "",
    tracxn_url: r.tracxn_url ?? "",
    cb_insights_url: r.cb_insights_url ?? "",
    trustfinta_url: r.trustfinta_url ?? "",
    startups_gallery_url: r.startups_gallery_url ?? "",
    substack_url: r.substack_url ?? "",
    medium_url: r.medium_url ?? "",
    beehiiv_url: r.beehiiv_url ?? "",
    blog_url: r.blog_url ?? "",
    firm_blog_url: r.firm_blog_url ?? "",
    // Classifications
    entity_type: r.entity_type ?? "",
    thesis_orientation: r.thesis_orientation ?? "",
    sector_classification: r.sector_classification ?? "",
    stage_classification: r.stage_classification ?? "",
    structure_classification: r.structure_classification ?? "",
    theme_classification: r.theme_classification ?? "",
    impact_orientation: r.impact_orientation ?? "",
    strategy_classifications: r.strategy_classifications?.join(", ") ?? "",
    ownership_type: r.ownership_type ?? "",
    has_fresh_capital: r.has_fresh_capital ?? false,
    is_actively_deploying: r.is_actively_deploying ?? false,
    underrepresented_founders_focus: r.underrepresented_founders_focus ?? false,
    ca_sb54_compliant: r.ca_sb54_compliant ?? false,
    verification_status: r.verification_status ?? "",
    fund_status: r.fund_status ?? "",
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

// ── Sub-components ────────────────────────────────────────────────────────────

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

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
      {children}
    </p>
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

/** A URL field: shows a clickable link in view mode, an Input in edit mode. */
function LinkField({ label, value, editing, onChange, placeholder }: {
  label: string; value: string; editing: boolean;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {editing ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "https://..."}
          className="h-8 border-white/10 bg-white/5 text-xs text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30"
        />
      ) : value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs hover:underline truncate"
          style={{ color: "#2EE6A6" }}
        >
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
          {value.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      ) : (
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>—</p>
      )}
    </div>
  );
}

/** A Select field that shows as text in view mode. */
function SelectField({ label, value, options, editing, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  editing: boolean; onChange: (v: string) => void;
}) {
  const display = options.find(o => o.value === value)?.label ?? value.replace(/_/g, " ");
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {editing ? (
        <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
          <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white/70">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm" style={{ color: value ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>
          {value ? display : "—"}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ActiveTab = "overview" | "links" | "classifications" | "funds" | "people" | "investments" | "signals" | "sources";

export function AdminFirmDetail({ firmRecord, onBack, onSaved }: AdminFirmDetailProps) {
  const [draft, setDraft] = useState<Draft>(() => rowToDraft(firmRecord));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const [vcFirmDetail, setVcFirmDetail] = useState<VCFirmDetail | null>(null);
  const [vcLoading, setVcLoading] = useState(true);

  // ── firm_investors: the real people table linked to firm_records ──────────────
  const [firmInvestors, setFirmInvestors] = useState<Record<string, unknown>[]>([]);
  const [investorsLoading, setInvestorsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setInvestorsLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("firm_investors")
          .select(
            "id, full_name, first_name, last_name, preferred_name, title, seniority, investor_type, " +
            "avatar_url, headshot_url, bio, short_summary, email, " +
            "linkedin_url, x_url, website_url, personal_website, " +
            "stage_focus, sector_focus, check_size_min, check_size_max, " +
            "is_active, is_actively_investing, deleted_at, " +
            "match_score, reputation_score, responsiveness_score"
          )
          .eq("firm_id", firmRecord.id)
          .is("deleted_at", null)
          .eq("is_active", true)
          .order("full_name", { ascending: true });
        if (!cancelled) {
          if (error) console.warn("[AdminFirmDetail] firm_investors fetch failed:", error.message);
          else setFirmInvestors(data ?? []);
        }
      } catch (e) {
        console.warn("[AdminFirmDetail] firm_investors fetch error:", e);
      } finally {
        if (!cancelled) setInvestorsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [firmRecord.id]);

  useEffect(() => {
    let cancelled = false;
    setVcLoading(true);
    (async () => {
      try {
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
    if (!SUPABASE_URL) { toast.error("Supabase not configured"); setSaving(false); return; }

    const patch: Record<string, unknown> = {
      // Identity
      firm_name: draft.firm_name.trim() || firmRecord.firm_name,
      legal_name: draft.legal_name.trim() || null,
      firm_type: draft.firm_type.trim() || null,
      founded_year: draft.founded_year ? parseInt(draft.founded_year) || null : null,
      logo_url: draft.logo_url.trim() || null,
      // Contact
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      hq_city: draft.hq_city.trim() || null,
      hq_state: draft.hq_state.trim() || null,
      hq_country: draft.hq_country.trim() || null,
      // Profile
      description: draft.description.trim() || null,
      elevator_pitch: draft.elevator_pitch.trim() || null,
      tagline: draft.tagline.trim() || null,
      investment_philosophy: draft.investment_philosophy.trim() || null,
      // Focus
      sector_focus: strToArr(draft.sector_focus),
      stage_focus: strToArr(draft.stage_focus),
      geo_focus: strToArr(draft.geo_focus),
      investment_themes: strToArr(draft.investment_themes),
      // Fund
      aum: draft.aum.trim() || null,
      avg_check_size: draft.avg_check_size.trim() || null,
      current_fund_name: draft.current_fund_name.trim() || null,
      current_fund_size: draft.current_fund_size.trim() || null,
      // Status
      enrichment_status: draft.enrichment_status.trim() || null,
      manual_review_status: draft.manual_review_status.trim() || null,
      needs_review: draft.needs_review,
      ready_for_live: draft.ready_for_live,
      // Links
      website_url: draft.website_url.trim() || null,
      contact_page_url: draft.contact_page_url.trim() || null,
      linkedin_url: draft.linkedin_url.trim() || null,
      x_url: draft.x_url.trim() || null,
      instagram_url: draft.instagram_url.trim() || null,
      facebook_url: draft.facebook_url.trim() || null,
      youtube_url: draft.youtube_url.trim() || null,
      crunchbase_url: draft.crunchbase_url.trim() || null,
      angellist_url: draft.angellist_url.trim() || null,
      pitchbook_url: draft.pitchbook_url.trim() || null,
      openvc_url: draft.openvc_url.trim() || null,
      vcsheet_url: draft.vcsheet_url.trim() || null,
      wellfound_url: draft.wellfound_url.trim() || null,
      signal_nfx_url: draft.signal_nfx_url.trim() || null,
      tracxn_url: draft.tracxn_url.trim() || null,
      cb_insights_url: draft.cb_insights_url.trim() || null,
      trustfinta_url: draft.trustfinta_url.trim() || null,
      startups_gallery_url: draft.startups_gallery_url.trim() || null,
      substack_url: draft.substack_url.trim() || null,
      medium_url: draft.medium_url.trim() || null,
      beehiiv_url: draft.beehiiv_url.trim() || null,
      blog_url: draft.blog_url.trim() || null,
      firm_blog_url: draft.firm_blog_url.trim() || null,
      // Classifications
      entity_type: draft.entity_type.trim() || null,
      thesis_orientation: draft.thesis_orientation.trim() || null,
      sector_classification: draft.sector_classification.trim() || null,
      stage_classification: draft.stage_classification.trim() || null,
      structure_classification: draft.structure_classification.trim() || null,
      theme_classification: draft.theme_classification.trim() || null,
      impact_orientation: draft.impact_orientation.trim() || null,
      strategy_classifications: strToArr(draft.strategy_classifications),
      ownership_type: draft.ownership_type.trim() || null,
      has_fresh_capital: draft.has_fresh_capital,
      is_actively_deploying: draft.is_actively_deploying,
      underrepresented_founders_focus: draft.underrepresented_founders_focus,
      ca_sb54_compliant: draft.ca_sb54_compliant,
      verification_status: draft.verification_status.trim() || null,
      fund_status: draft.fund_status.trim() || null,
    };

    try {
      const { getSupabaseBearerForFunctions } = await import("@/integrations/supabase/client");
      const bearer = await getSupabaseBearerForFunctions();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY ?? ""}`,
      };
      if (bearer && bearer !== SUPABASE_ANON_KEY) headers["X-User-Auth"] = `Bearer ${bearer}`;

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

  const hq = [draft.hq_city, draft.hq_state, draft.hq_country].filter(Boolean).join(", ");

  const funds = [...(vcFirmDetail?.vc_funds ?? [])].sort((a, b) =>
    String(a.fund_name ?? "").localeCompare(String(b.fund_name ?? ""))
  );
  const people = [...(vcFirmDetail?.vc_people ?? [])].sort((a, b) =>
    `${(a as any).first_name ?? ""} ${(a as any).last_name ?? ""}`.localeCompare(
      `${(b as any).first_name ?? ""} ${(b as any).last_name ?? ""}`
    )
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
              <button onClick={handleCancel} disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: "rgba(46,230,166,0.15)", color: "#2EE6A6" }}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Changes
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}>
              <Edit3 className="h-3.5 w-3.5" /> Edit Record
            </button>
          )}
        </div>
      </div>

      {/* ── Profile header ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border p-6 mb-6"
        style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0a0a0a" }}>
        <div className="flex items-start gap-5">
          {/* Logo */}
          <div className="shrink-0">
            {editing ? (
              <div className="space-y-1">
                {draft.logo_url ? (
                  <img src={draft.logo_url} alt=""
                    className="h-16 w-16 rounded-xl object-contain border"
                    style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }} />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border"
                    style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(46,230,166,0.06)" }}>
                    <Building2 className="h-7 w-7" style={{ color: "#2EE6A6" }} />
                  </div>
                )}
                <Input value={draft.logo_url} onChange={(e) => set("logo_url", e.target.value)}
                  placeholder="Logo URL"
                  className="h-7 w-36 border-white/10 bg-white/5 text-[10px] text-white/60 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
              </div>
            ) : (
              draft.logo_url ? (
                <img src={draft.logo_url} alt=""
                  className="h-16 w-16 rounded-xl object-contain border"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }} />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border"
                  style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(46,230,166,0.06)" }}>
                  <Building2 className="h-7 w-7" style={{ color: "#2EE6A6" }} />
                </div>
              )
            )}
          </div>

          {/* Name + pitch + badges */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <Input value={draft.firm_name} onChange={(e) => set("firm_name", e.target.value)}
                placeholder="Firm name"
                className="mb-2 h-9 border-white/10 bg-white/5 text-xl font-semibold text-white/90 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
            ) : (
              <h1 className="text-2xl font-semibold text-white/90 mb-1">{draft.firm_name}</h1>
            )}

            {editing ? (
              <textarea value={draft.elevator_pitch} onChange={(e) => set("elevator_pitch", e.target.value)}
                placeholder="Elevator pitch" rows={2}
                className="mb-3 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 resize-none" />
            ) : draft.elevator_pitch ? (
              <p className="mb-3 text-sm max-w-2xl" style={{ color: "rgba(255,255,255,0.5)" }}>{draft.elevator_pitch}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {editing ? (
                <Select value={draft.firm_type || "__none__"} onValueChange={(v) => set("firm_type", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-7 w-36 border-white/10 bg-white/5 text-xs text-white/70">
                    <SelectValue placeholder="Firm type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {["vc","micro_vc","family_office","corporate_vc","accelerator","angel_network","private_equity","hedge_fund","fund_of_funds","incubator","studio","other"].map(v => (
                      <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : draft.firm_type ? (
                <span className="rounded-md border px-2.5 py-0.5 text-xs font-medium"
                  style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.04)" }}>
                  {draft.firm_type.replace(/_/g, " ")}
                </span>
              ) : null}

              {editing ? (
                <Input value={draft.aum} onChange={(e) => set("aum", e.target.value)} placeholder="AUM e.g. $500M"
                  className="h-7 w-28 border-white/10 bg-white/5 text-xs text-white/60 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
              ) : draft.aum ? (
                <span className="rounded-md border px-2.5 py-0.5 text-xs font-medium"
                  style={{ borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.03)" }}>
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

              {!editing && draft.website_url ? (
                <a href={draft.website_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium hover:underline"
                  style={{ color: "#2EE6A6" }}>
                  <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                </a>
              ) : null}
              {!editing && firmRecord.email && (
                <a href={`mailto:${firmRecord.email}`} className="transition-colors hover:text-white/70"
                  style={{ color: "rgba(255,255,255,0.3)" }}>
                  <Mail className="h-4 w-4" />
                </a>
              )}
            </div>

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
      <div className="flex flex-wrap items-center gap-1 mb-5 border-b pb-3"
        style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</TabButton>
        <TabButton active={activeTab === "links"} onClick={() => setActiveTab("links")}>Links</TabButton>
        <TabButton active={activeTab === "classifications"} onClick={() => setActiveTab("classifications")}>Classifications</TabButton>
        <TabButton active={activeTab === "funds"} onClick={() => setActiveTab("funds")}>
          Funds{vcFirmDetail ? ` (${funds.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "people"} onClick={() => setActiveTab("people")}>
          People{!investorsLoading ? ` (${firmInvestors.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "investments"} onClick={() => setActiveTab("investments")}>
          Investments{vcFirmDetail ? ` (${investments.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "signals"} onClick={() => setActiveTab("signals")}>
          Signals{vcFirmDetail ? ` (${signals.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "sources"} onClick={() => setActiveTab("sources")}>
          Sources{vcFirmDetail ? ` (${sources.length})` : ""}
        </TabButton>
      </div>

      {/* ══ Overview tab ═══════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* About */}
          <Card>
            <CardTitle>About</CardTitle>
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
                    rows={5} placeholder="Full description..."
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
                ) : <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.2)" }}>No description.</p>}
                {draft.investment_philosophy && (
                  <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <p className="mb-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Investment Philosophy</p>
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{draft.investment_philosophy}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Investment Focus */}
          <Card>
            <CardTitle>Investment Focus</CardTitle>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {(["sector_focus", "stage_focus", "geo_focus"] as const).map((key) => {
                const labels = { sector_focus: "Sector Focus", stage_focus: "Stage Focus", geo_focus: "Geo Focus" };
                const placeholders = { sector_focus: "SaaS, Fintech, AI", stage_focus: "pre_seed, seed, series_a", geo_focus: "North America, Europe" };
                return (
                  <div key={key}>
                    <FieldLabel>{labels[key]}</FieldLabel>
                    {editing ? (
                      <Input value={draft[key]} onChange={(e) => set(key, e.target.value)}
                        placeholder={placeholders[key]}
                        className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {strToArr(draft[key]).length > 0
                          ? strToArr(draft[key]).map((s) => <TagPill key={s} label={s} />)
                          : <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                      </div>
                    )}
                  </div>
                );
              })}
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

          {/* Fund & AUM + Contact */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card>
              <CardTitle>Fund &amp; AUM</CardTitle>
              <div className="space-y-3">
                {(["aum", "avg_check_size", "current_fund_name", "current_fund_size"] as const).map((key) => {
                  const labels: Record<string, string> = { aum: "AUM (display)", avg_check_size: "Avg Check Size", current_fund_name: "Current Fund Name", current_fund_size: "Current Fund Size" };
                  const placeholders: Record<string, string> = { aum: "$500M", avg_check_size: "$2M", current_fund_name: "Fund III", current_fund_size: "$250M" };
                  return (
                    <div key={key}>
                      <FieldLabel>{labels[key]}</FieldLabel>
                      {editing ? (
                        <Input value={draft[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholders[key]}
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
              <CardTitle>Contact</CardTitle>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Email</FieldLabel>
                  {editing ? (
                    <Input value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="info@firm.com"
                      className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                  ) : draft.email ? (
                    <a href={`mailto:${draft.email}`} className="text-sm hover:underline" style={{ color: "#2EE6A6" }}>{draft.email}</a>
                  ) : <p className="text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>—</p>}
                </div>
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  {editing ? (
                    <Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 212 555 0100"
                      className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                  ) : <p className="text-sm" style={{ color: draft.phone ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>{draft.phone || "—"}</p>}
                </div>
                <div>
                  <FieldLabel>Address</FieldLabel>
                  {editing ? (
                    <Input value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Market St..."
                      className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                  ) : <p className="text-sm" style={{ color: draft.address ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>{draft.address || "—"}</p>}
                </div>
              </div>
            </Card>
          </div>

          {/* Status & Workflow */}
          <Card>
            <CardTitle>Status &amp; Workflow</CardTitle>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <FieldLabel>Enrichment Status</FieldLabel>
                {editing ? (
                  <Select value={draft.enrichment_status || "__none__"} onValueChange={(v) => set("enrichment_status", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white/70"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {["enriched","partial","pending","failed","stale","manual"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{draft.enrichment_status || "—"}</p>}
              </div>
              <div>
                <FieldLabel>Review Status</FieldLabel>
                {editing ? (
                  <Select value={draft.manual_review_status || "__none__"} onValueChange={(v) => set("manual_review_status", v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white/70"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {["approved","needs_review","rejected","in_progress"].map(v => <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{draft.manual_review_status || "—"}</p>}
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

      {/* ══ Links tab ══════════════════════════════════════════════════════════ */}
      {activeTab === "links" && (
        <div className="space-y-5">

          {/* Web & Contact */}
          <Card>
            <CardTitle><span className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Web &amp; Contact</span></CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LinkField label="Website" value={draft.website_url} editing={editing} onChange={(v) => set("website_url", v)} placeholder="https://firm.com" />
              <LinkField label="Contact Page" value={draft.contact_page_url} editing={editing} onChange={(v) => set("contact_page_url", v)} placeholder="https://firm.com/contact" />
            </div>
          </Card>

          {/* Social */}
          <Card>
            <CardTitle><span className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5" /> Social</span></CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <LinkField label="LinkedIn" value={draft.linkedin_url} editing={editing} onChange={(v) => set("linkedin_url", v)} placeholder="https://linkedin.com/company/..." />
              <LinkField label="X (Twitter)" value={draft.x_url} editing={editing} onChange={(v) => set("x_url", v)} placeholder="https://x.com/..." />
              <LinkField label="Instagram" value={draft.instagram_url} editing={editing} onChange={(v) => set("instagram_url", v)} placeholder="https://instagram.com/..." />
              <LinkField label="Facebook" value={draft.facebook_url} editing={editing} onChange={(v) => set("facebook_url", v)} placeholder="https://facebook.com/..." />
              <LinkField label="YouTube" value={draft.youtube_url} editing={editing} onChange={(v) => set("youtube_url", v)} placeholder="https://youtube.com/..." />
            </div>
          </Card>

          {/* VC Directories */}
          <Card>
            <CardTitle><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> VC Directories</span></CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <LinkField label="Crunchbase" value={draft.crunchbase_url} editing={editing} onChange={(v) => set("crunchbase_url", v)} />
              <LinkField label="AngelList" value={draft.angellist_url} editing={editing} onChange={(v) => set("angellist_url", v)} />
              <LinkField label="Pitchbook" value={draft.pitchbook_url} editing={editing} onChange={(v) => set("pitchbook_url", v)} />
              <LinkField label="OpenVC" value={draft.openvc_url} editing={editing} onChange={(v) => set("openvc_url", v)} />
              <LinkField label="VC Sheet" value={draft.vcsheet_url} editing={editing} onChange={(v) => set("vcsheet_url", v)} />
              <LinkField label="Wellfound" value={draft.wellfound_url} editing={editing} onChange={(v) => set("wellfound_url", v)} />
              <LinkField label="Signal NFX" value={draft.signal_nfx_url} editing={editing} onChange={(v) => set("signal_nfx_url", v)} />
              <LinkField label="Tracxn" value={draft.tracxn_url} editing={editing} onChange={(v) => set("tracxn_url", v)} />
              <LinkField label="CB Insights" value={draft.cb_insights_url} editing={editing} onChange={(v) => set("cb_insights_url", v)} />
              <LinkField label="Trustfinta" value={draft.trustfinta_url} editing={editing} onChange={(v) => set("trustfinta_url", v)} />
              <LinkField label="Startups Gallery" value={draft.startups_gallery_url} editing={editing} onChange={(v) => set("startups_gallery_url", v)} />
            </div>
          </Card>

          {/* Content & Newsletters */}
          <Card>
            <CardTitle>Content &amp; Newsletters</CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <LinkField label="Substack" value={draft.substack_url} editing={editing} onChange={(v) => set("substack_url", v)} />
              <LinkField label="Medium" value={draft.medium_url} editing={editing} onChange={(v) => set("medium_url", v)} />
              <LinkField label="Beehiiv" value={draft.beehiiv_url} editing={editing} onChange={(v) => set("beehiiv_url", v)} />
              <LinkField label="Blog" value={draft.blog_url} editing={editing} onChange={(v) => set("blog_url", v)} />
              <LinkField label="Firm Blog" value={draft.firm_blog_url} editing={editing} onChange={(v) => set("firm_blog_url", v)} />
            </div>
          </Card>
        </div>
      )}

      {/* ══ Classifications tab ════════════════════════════════════════════════ */}
      {activeTab === "classifications" && (
        <div className="space-y-5">

          {/* Entity & Structure */}
          <Card>
            <CardTitle><span className="flex items-center gap-2"><Tag className="h-3.5 w-3.5" /> Entity &amp; Structure</span></CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <SelectField
                label="Entity Type"
                value={draft.entity_type}
                editing={editing}
                onChange={(v) => set("entity_type", v)}
                options={[
                  { value: "Institutional", label: "Institutional" },
                  { value: "Micro", label: "Micro" },
                  { value: "Solo GP", label: "Solo GP" },
                  { value: "Angel", label: "Angel" },
                  { value: "Corporate (CVC)", label: "Corporate (CVC)" },
                  { value: "Family Office", label: "Family Office" },
                  { value: "Accelerator / Studio", label: "Accelerator / Studio" },
                  { value: "Syndicate", label: "Syndicate" },
                  { value: "Fund of Funds", label: "Fund of Funds" },
                ]}
              />
              <SelectField
                label="Structure"
                value={draft.structure_classification}
                editing={editing}
                onChange={(v) => set("structure_classification", v)}
                options={[
                  { value: "partnership", label: "Partnership" },
                  { value: "solo_gp", label: "Solo GP" },
                  { value: "syndicate", label: "Syndicate" },
                  { value: "cvc", label: "CVC" },
                  { value: "family_office", label: "Family Office" },
                  { value: "private_equity", label: "Private Equity" },
                ]}
              />
              <div>
                <FieldLabel>Ownership Type</FieldLabel>
                {editing ? (
                  <Input value={draft.ownership_type} onChange={(e) => set("ownership_type", e.target.value)} placeholder="e.g. independent, corporate"
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                ) : <p className="text-sm" style={{ color: draft.ownership_type ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>{draft.ownership_type || "—"}</p>}
              </div>
              <div>
                <FieldLabel>Founded Year</FieldLabel>
                {editing ? (
                  <Input value={draft.founded_year} onChange={(e) => set("founded_year", e.target.value)} placeholder="2012" type="number"
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                ) : <p className="text-sm" style={{ color: draft.founded_year ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>{draft.founded_year || "—"}</p>}
              </div>
              <div>
                <FieldLabel>Verification Status</FieldLabel>
                {editing ? (
                  <Input value={draft.verification_status} onChange={(e) => set("verification_status", e.target.value)} placeholder="verified, unverified..."
                    className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                ) : <p className="text-sm" style={{ color: draft.verification_status ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>{draft.verification_status || "—"}</p>}
              </div>
            </div>
          </Card>

          {/* Investment Style */}
          <Card>
            <CardTitle>Investment Style</CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <SelectField
                label="Thesis Orientation"
                value={draft.thesis_orientation}
                editing={editing}
                onChange={(v) => set("thesis_orientation", v)}
                options={[
                  { value: "Generalist", label: "Generalist" },
                  { value: "Sector-Focused", label: "Sector-Focused" },
                  { value: "Thesis-Driven", label: "Thesis-Driven" },
                  { value: "Founder-First", label: "Founder-First" },
                  { value: "Geographic", label: "Geographic" },
                  { value: "Operator-led", label: "Operator-led" },
                ]}
              />
              <SelectField
                label="Sector Classification"
                value={draft.sector_classification}
                editing={editing}
                onChange={(v) => set("sector_classification", v)}
                options={[
                  { value: "generalist", label: "Generalist" },
                  { value: "sector_focused", label: "Sector Focused" },
                  { value: "multi_sector", label: "Multi-Sector" },
                ]}
              />
              <SelectField
                label="Stage Classification"
                value={draft.stage_classification}
                editing={editing}
                onChange={(v) => set("stage_classification", v)}
                options={[
                  { value: "early_stage", label: "Early Stage" },
                  { value: "multi_stage", label: "Multi-Stage" },
                  { value: "growth", label: "Growth" },
                  { value: "buyout", label: "Buyout" },
                ]}
              />
              <SelectField
                label="Theme Classification"
                value={draft.theme_classification}
                editing={editing}
                onChange={(v) => set("theme_classification", v)}
                options={[
                  { value: "generalist", label: "Generalist" },
                  { value: "theme_driven", label: "Theme-Driven" },
                  { value: "multi_theme", label: "Multi-Theme" },
                ]}
              />
            </div>
          </Card>

          {/* Strategy Tags */}
          <Card>
            <CardTitle>Strategy Classifications</CardTitle>
            <div>
              <FieldLabel>Tags (comma-separated)</FieldLabel>
              {editing ? (
                <Input value={draft.strategy_classifications} onChange={(e) => set("strategy_classifications", e.target.value)}
                  placeholder="deep_tech, climate, future_of_work"
                  className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {strToArr(draft.strategy_classifications).length > 0
                    ? strToArr(draft.strategy_classifications).map(s => <TagPill key={s} label={s} />)
                    : <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>No strategy classifications set.</span>}
                </div>
              )}
            </div>
          </Card>

          {/* Activity, Impact & Compliance */}
          <Card>
            <CardTitle>Activity, Impact &amp; Compliance</CardTitle>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-3">
                <SelectField
                  label="Impact Orientation"
                  value={draft.impact_orientation}
                  editing={editing}
                  onChange={(v) => set("impact_orientation", v)}
                  options={[
                    { value: "primary", label: "Primary" },
                    { value: "integrated", label: "Integrated" },
                    { value: "considered", label: "Considered" },
                    { value: "none", label: "None" },
                  ]}
                />
                <div>
                  <FieldLabel>Fund Status</FieldLabel>
                  {editing ? (
                    <Input value={draft.fund_status} onChange={(e) => set("fund_status", e.target.value)} placeholder="actively deploying, closed, etc."
                      className="h-8 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/20 focus-visible:ring-emerald-500/30" />
                  ) : <p className="text-sm" style={{ color: draft.fund_status ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)" }}>{draft.fund_status || "—"}</p>}
                </div>
              </div>
              <div className="space-y-3">
                <Toggle value={draft.has_fresh_capital} onChange={(v) => set("has_fresh_capital", v)} label="Has Fresh Capital" color="#2EE6A6" />
                <Toggle value={draft.is_actively_deploying} onChange={(v) => set("is_actively_deploying", v)} label="Actively Deploying" color="#2EE6A6" />
                <Toggle value={draft.underrepresented_founders_focus} onChange={(v) => set("underrepresented_founders_focus", v)} label="Underrepresented Founders Focus" color="#00D4FF" />
                <Toggle value={draft.ca_sb54_compliant} onChange={(v) => set("ca_sb54_compliant", v)} label="CA SB-54 Compliant" color="#00D4FF" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ══ Funds tab ══════════════════════════════════════════════════════════ */}
      {activeTab === "funds" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>
          ) : funds.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No funds linked.</p>
          ) : funds.map((f: VcFundRow) => (
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
          ))}
        </div>
      )}

      {/* ══ People tab ═════════════════════════════════════════════════════════ */}
      {activeTab === "people" && (
        <div className="space-y-4">
          {investorsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
            </div>
          ) : firmInvestors.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
              No team members linked to this firm.
            </p>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
                {firmInvestors.length} {firmInvestors.length === 1 ? "person" : "people"} at {firmRecord.firm_name}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {firmInvestors.map((p) => {
                  const photo = String(p.headshot_url ?? p.avatar_url ?? "");
                  const fullName = String(
                    p.preferred_name ||
                    `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
                    p.full_name ||
                    "Partner"
                  );
                  const initials = fullName.split(" ").slice(0, 2).map((n: string) => n[0] ?? "").join("").toUpperCase();
                  const subtitle = [p.title, p.seniority, p.investor_type]
                    .filter(Boolean).map(String).join(" · ") || "Partner";
                  const blurb = String(p.short_summary ?? p.bio ?? "");
                  const checksMin = typeof p.check_size_min === "number" ? p.check_size_min : null;
                  const checksMax = typeof p.check_size_max === "number" ? p.check_size_max : null;

                  return (
                    <Card key={String(p.id)} className="flex flex-col">
                      <div className="flex items-start gap-3">
                        {photo ? (
                          <img src={photo} alt={fullName}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover border"
                            style={{ borderColor: "rgba(255,255,255,0.08)" }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                            style={{ background: "rgba(46,230,166,0.08)", color: "#2EE6A6" }}>
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white/85 truncate">{fullName}</p>
                          <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{subtitle}</p>

                          {/* Check size if available */}
                          {(checksMin !== null || checksMax !== null) && (
                            <p className="mt-0.5 font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                              {checksMin !== null && checksMax !== null
                                ? `$${(checksMin / 1e3).toFixed(0)}K – $${(checksMax / 1e6).toFixed(1)}M`
                                : checksMin !== null
                                ? `from $${(checksMin / 1e3).toFixed(0)}K`
                                : `up to $${(checksMax! / 1e6).toFixed(1)}M`}
                            </p>
                          )}

                          <div className="mt-1.5 flex items-center gap-2">
                            {p.linkedin_url && (
                              <a href={String(p.linkedin_url)} target="_blank" rel="noreferrer"
                                style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white/60">
                                <Linkedin className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {p.x_url && (
                              <a href={String(p.x_url)} target="_blank" rel="noreferrer"
                                style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white/60">
                                <Twitter className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {p.email && (
                              <a href={`mailto:${String(p.email)}`}
                                style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white/60">
                                <Mail className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {p.website_url && (
                              <a href={String(p.website_url)} target="_blank" rel="noreferrer"
                                style={{ color: "rgba(255,255,255,0.3)" }} className="hover:text-white/60">
                                <Globe className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Match / reputation scores */}
                        {(p.match_score != null || p.reputation_score != null) && (
                          <div className="shrink-0 text-right">
                            {p.match_score != null && (
                              <p className="font-mono text-[10px]" style={{ color: "#2EE6A6" }}>
                                match {p.match_score}
                              </p>
                            )}
                            {p.reputation_score != null && (
                              <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                                rep {p.reputation_score}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {blurb && (
                        <p className="mt-3 text-xs line-clamp-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {blurb}
                        </p>
                      )}

                      {/* Focus tags */}
                      {Array.isArray(p.sector_focus) && p.sector_focus.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(p.sector_focus as string[]).slice(0, 4).map((s) => (
                            <TagPill key={s} label={s} />
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ Investments tab ════════════════════════════════════════════════════ */}
      {activeTab === "investments" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>
          ) : investments.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No investments recorded.</p>
          ) : investments.map((inv) => (
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
          ))}
        </div>
      )}

      {/* ══ Signals tab ════════════════════════════════════════════════════════ */}
      {activeTab === "signals" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>
          ) : signals.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No signals.</p>
          ) : signals.map((s) => (
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
          ))}
        </div>
      )}

      {/* ══ Sources tab ════════════════════════════════════════════════════════ */}
      {activeTab === "sources" && (
        <div className="space-y-3">
          {vcLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>
          ) : sources.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No source links.</p>
          ) : sources.map((src) => (
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
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, Building2, ExternalLink, X, CheckCircle2, XCircle,
  MapPin, DollarSign, Users, Briefcase, Save, Copy, Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FirmLogo } from "@/components/ui/firm-logo";
import { getSupabaseBearerForFunctions, supabase } from "@/integrations/supabase/client";
import { Constants } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;
const FIRM_ENTITY_TYPE_ENUM = Constants.public.Enums.entity_type;
const STAGE_FOCUS_ENUM = Constants.public.Enums.stage_focus_enum;

/** Order for Preferred Stage dropdown (labels must match `public.stage_focus_enum` in Postgres). */
const STAGE_FOCUS_DISPLAY_ORDER: readonly string[] = [
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series B+",
  "Series C",
  "Series C+",
  "Series D",
  "Growth",
  "Friends and Family",
];

function selectOptionsFromDbEnum(enumValues: readonly string[], current: string | null | undefined) {
  const options = enumValues.map((v) => ({ value: v, label: v }));
  const c = current?.trim();
  if (c && !enumValues.includes(c)) options.push({ value: c, label: `${c} (legacy)` });
  return options;
}

function orderedStageSelectOptions(
  dbEnumValues: readonly string[],
  current: string | null | undefined,
): { value: string; label: string }[] {
  const allowed = new Set(dbEnumValues);
  const out: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const v of STAGE_FOCUS_DISPLAY_ORDER) {
    if (allowed.has(v) && !seen.has(v)) {
      out.push({ value: v, label: v });
      seen.add(v);
    }
  }
  for (const v of dbEnumValues) {
    if (!seen.has(v)) {
      out.push({ value: v, label: v });
      seen.add(v);
    }
  }
  const c = current?.trim();
  if (c && !seen.has(c)) out.push({ value: c, label: `${c} (legacy)` });
  return out;
}
const COL = "2.1fr 1.7fr 1fr 1.4fr 1.3fr 0.75fr 0.75fr 0.85fr";
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// ── Types ──────────────────────────────────────────────────────────────────────

type FirmRow = {
  id: string; firm_name: string; legal_name: string | null; aliases: string[] | null; alternate_names: string[] | null; slug: string | null;
  team_people_url?: string | null;
  tagline: string | null; elevator_pitch: string | null; description: string | null; sentiment_detail: string | null;
  location: string | null; address: string | null; hq_city: string | null; hq_state: string | null; hq_zip_code: string | null; hq_country: string | null;
  locations?: Record<string, unknown> | null;
  website_url: string | null; logo_url: string | null; favicon_url: string | null; linkedin_url: string | null;
  x_url: string | null; facebook_url: string | null; instagram_url: string | null; youtube_url: string | null; substack_url: string | null; medium_url: string | null;
  crunchbase_url: string | null; signal_nfx_url: string | null; cb_insights_url: string | null; openvc_url: string | null; pitchbook_url: string | null; vcsheet_url: string | null; contact_page_url: string | null;
  email: string | null; phone: string | null;
  aum: string | null; aum_usd: number | null; founded_year: number | null;
  current_fund_name: string | null; lead_partner: string | null; lead_or_follow: string | null;
  preferred_stage: string | null; stage_focus: string[] | null; thesis_verticals: string[] | null; strategy_classifications: string[] | null;
  firm_type: string | null; entity_type: string | null; min_check_size: number | null; max_check_size: number | null; total_headcount: number | null;
  market_sentiment: string | null; recent_deals: string[] | null; is_actively_deploying: boolean | null;
  enrichment_status: string; completeness_score: number; status: string | null;
  needs_review: boolean; ready_for_live: boolean;
  manual_review_status: string | null; updated_at: string | null;
};

type FirmInvestorRow = {
  id: string; firm_id: string; created_at: string | null; updated_at: string | null; deleted_at: string | null;
  full_name: string; first_name: string | null; last_name: string | null; preferred_name: string | null; alternate_names: string[] | null;
  slug: string | null; title: string | null; seniority: string | null; investor_type: string | null;
  email: string | null; phone: string | null; linkedin_url: string | null; x_url: string | null; website_url: string | null;
  personal_website: string | null; firm_bio_page_url: string | null; facebook_url: string | null; instagram_url: string | null;
  youtube_url: string | null; tiktok_url: string | null; medium_url: string | null; substack_url: string | null; tracxn_url: string | null;
  city: string | null; state: string | null; country: string | null; timezone: string | null;
  avatar_url: string | null; headshot_url: string | null; avatar_source_url: string | null; avatar_source_type: string | null;
  avatar_confidence: number | null; avatar_last_verified_at: string | null; avatar_needs_review: boolean;
  is_active: boolean; is_actively_investing: boolean; cold_outreach_ok: boolean; warm_intro_preferred: boolean;
  needs_review: boolean; ready_for_live: boolean;
  stage_focus: string[] | null; sector_focus: string[] | null; personal_thesis_tags: string[] | null; portfolio_companies: string[] | null;
  geographic_focus: string[] | null; domain_expertise: string[] | null; investing_themes: string[] | null;
  current_areas_of_interest: string[] | null; notable_investments: string[] | null; networks: string[] | null;
  board_seats: string[] | null; prior_firms: string[] | null; prior_firm_associations: string[] | null;
  stage_concentration: string[] | null; geographic_concentration: string[] | null; thematic_concentration: string[] | null; sub_sectors: string[] | null;
  short_summary: string | null; bio: string | null; background_summary: string | null; education_summary: string | null;
  founder_background: string | null; operator_background: string | null; recent_focus: string | null;
  avg_deal_size: string | null; check_size_min: number | null; check_size_max: number | null; sweet_spot: number | null;
  lead_vs_follow: string | null; investment_pace: string | null; investment_style: string | null;
  total_known_investments: number | null; recent_deal_count: number | null; last_active_date: string | null;
  last_capital_signal_at: string | null; last_enriched_at: string | null;
  match_score: number | null; network_strength: number | null; reputation_score: number | null; responsiveness_score: number | null;
  value_add_score: number | null; capital_freshness_boost_score: number | null; completeness_score: number;
  enrichment_status: string; source_count: number; prisma_person_id: string | null;
  articles: Json | null; blog_posts: Json | null; interviews: Json | null; podcasts: Json | null; past_investments: Json | null;
  recent_investments: Json | null; recent_news: Json | null; last_3_investments: Json | null; last_5_investments: Json | null;
  co_investors: Json | null; prior_roles: Json | null;
};

type FirmPortfolioRow = {
  id: string; firm_id: string; company_name: string; normalized_company_name: string | null;
  amount: string | null; stage: string | null; date_announced: string | null; investment_status: string | null;
  is_notable: boolean | null; portfolio_company_website: string | null; portfolio_company_linkedin: string | null;
  source_name: string | null; source_url: string | null; source_confidence: number | null; updated_at: string | null;
};

type FirmModalTab = "profile" | "funds" | "investors" | "portfolio";

/** Row shape from GET `entity=fresh-funds` (see `freshFundRow` in admin-market-intel). */
type FirmLinkedFundRow = {
  id: string;
  firm_record_id: string;
  fund_name: string | null;
  fund_type: string | null;
  fund_sequence_number: number | null;
  vintage_year: number | null;
  announced_date: string | null;
  close_date: string | null;
  target_size_usd: number | null;
  final_size_usd: number | null;
  currency: string | null;
  status: string | null;
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  geography_focus: string[] | null;
  announcement_url: string | null;
  announcement_title: string | null;
  manually_verified: boolean | null;
  verification_status: string | null;
  estimated_check_min_usd: number | null;
  estimated_check_max_usd: number | null;
};

// ── API ────────────────────────────────────────────────────────────────────────

async function adminHeaders(): Promise<Record<string, string>> {
  const tok = await getSupabaseBearerForFunctions();
  const anon = SUPABASE_ANON_KEY ?? "";
  const h: Record<string, string> = {
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
    apikey: anon,
  };
  if (tok && tok !== anon) h["X-User-Auth"] = `Bearer ${tok}`;
  return h;
}

async function fetchFirms(params: Record<string, string>): Promise<{ rows: FirmRow[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "Supabase not configured" };
  const qs = new URLSearchParams({ ...params, entity: "firms" }).toString();
  try {
    const res  = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${qs}`, { headers: await adminHeaders() });
    const json = await res.json().catch(() => ({})) as { rows?: FirmRow[]; total?: number; error?: string };
    if (!res.ok) return { rows: [], total: 0, error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [], total: json.total ?? 0 };
  } catch (e: unknown) { return { rows: [], total: 0, error: (e as Error)?.message }; }
}

async function patchFirm(id: string, patch: Record<string, unknown>): Promise<{ row?: FirmRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=firms&id=${encodeURIComponent(id)}`;
  try {
    const res  = await fetch(url, { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(patch) });
    const json = await res.json().catch(() => ({})) as { row?: FirmRow; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) { return { error: (e as Error)?.message }; }
}

async function createFirm(body: Record<string, unknown>): Promise<{ row?: FirmRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=firms`;
  try {
    const res = await fetch(url, { method: "POST", headers: await adminHeaders(), body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({})) as { row?: FirmRow; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) {
    return { error: (e as Error)?.message };
  }
}

async function fetchFirmLinkedRows<T>(entity: "firm-investors" | "firm-portfolio", firmId: string): Promise<{ rows: T[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "Supabase not configured" };
  const qs = new URLSearchParams({ entity, firm_id: firmId, limit: "100", offset: "0" }).toString();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${qs}`, { headers: await adminHeaders() });
    const json = await res.json().catch(() => ({})) as { rows?: T[]; total?: number; error?: string };
    if (!res.ok) return { rows: [], total: 0, error: json.error ?? `HTTP ${res.status}` };
    return { rows: json.rows ?? [], total: json.total ?? 0 };
  } catch (e: unknown) { return { rows: [], total: 0, error: (e as Error)?.message }; }
}

async function fetchFirmLinkedFunds(firmRecordId: string): Promise<{ rows: FirmLinkedFundRow[]; total: number; error?: string }> {
  if (!SUPABASE_URL) return { rows: [], total: 0, error: "Supabase not configured" };
  const fid = firmRecordId.trim();
  if (!fid) return { rows: [], total: 0, error: "Missing firm id" };
  /** Dedicated entity: server requires firm_id — cannot return the global Fund Watch list */
  const qs = new URLSearchParams({
    entity: "firm-funds",
    firm_id: fid,
    limit: "100",
    offset: "0",
  }).toString();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${qs}`, { headers: await adminHeaders() });
    const json = await res.json().catch(() => ({})) as { rows?: FirmLinkedFundRow[]; total?: number; error?: string };
    if (!res.ok) return { rows: [], total: 0, error: json.error ?? `HTTP ${res.status}` };
    const rows = (json.rows ?? []).filter((r) => r.firm_record_id === fid);
    return { rows, total: rows.length };
  } catch (e: unknown) {
    return { rows: [], total: 0, error: (e as Error)?.message };
  }
}

async function patchFund(id: string, patch: Record<string, unknown>): Promise<{ row?: FirmLinkedFundRow; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fresh-funds&id=${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(patch) });
    const json = await res.json().catch(() => ({})) as { row?: FirmLinkedFundRow; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) { return { error: (e as Error)?.message }; }
}

async function patchLinkedRow<T>(entity: "firm-investors" | "firm-portfolio", id: string, patch: Record<string, unknown>): Promise<{ row?: T; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=${entity}&id=${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(patch) });
    const json = await res.json().catch(() => ({})) as { row?: T; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) { return { error: (e as Error)?.message }; }
}

// ── Shared edit-panel helpers ──────────────────────────────────────────────────

const IC = "w-full rounded px-3 py-1.5 text-[12px] text-white/80 focus:outline-none transition-colors";
const IS = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" } as const;
const IF = { ...IS, borderColor: "rgba(46,230,166,0.4)" } as const;

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</label>
      {children}
    </div>
  );
}
function TF({ label, value, onChange, type = "text", placeholder }: { label: string; value: string | null | undefined; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <FL label={label}><input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={IC} style={IS} onFocus={e => Object.assign(e.target.style, IF)} onBlur={e => Object.assign(e.target.style, IS)} /></FL>;
}
function RF({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  return (
    <FL label={label}>
      <div
        className={`${IC} min-h-[31px] overflow-hidden text-ellipsis whitespace-nowrap font-mono`}
        title={value == null ? "" : String(value)}
        style={{ ...IS, color: value == null || value === "" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.48)" }}
      >
        {value == null || value === "" ? "—" : String(value)}
      </div>
    </FL>
  );
}
function externalHref(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
function faviconPreviewFromWebsite(value: string | null | undefined): string | null {
  const href = externalHref(value);
  if (!href) return null;
  try {
    const { hostname } = new URL(href);
    return hostname ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64` : null;
  } catch {
    return null;
  }
}
function UF({ label, value, onChange, placeholder }: { label: string; value: string | null | undefined; onChange: (v: string) => void; placeholder?: string }) {
  const href = externalHref(value);
  return (
    <FL label={label}>
      <div className="flex gap-1.5">
        <input
          type="url"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${IC} min-w-0 flex-1`}
          style={IS}
          onFocus={e => Object.assign(e.target.style, IF)}
          onBlur={e => Object.assign(e.target.style, IS)}
        />
        <a
          href={href ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!href}
          onClick={e => { if (!href) e.preventDefault(); }}
          className="inline-flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded transition-opacity"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.09)",
            color: href ? "#2EE6A6" : "rgba(255,255,255,0.18)",
            opacity: href ? 1 : 0.6,
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </FL>
  );
}
function BrandAssetPreview({
  label,
  src,
  fallbackSrc,
  initial,
  className,
}: {
  label: string;
  src: string | null;
  fallbackSrc?: string | null;
  initial: string;
  className: string;
}) {
  const primary = externalHref(src);
  const fallback = fallbackSrc && fallbackSrc !== primary ? fallbackSrc : null;
  const [tier, setTier] = useState<0 | 1 | 2>(() => (primary ? 0 : fallback ? 1 : 2));

  useEffect(() => {
    setTier(primary ? 0 : fallback ? 1 : 2);
  }, [primary, fallback]);

  const currentSrc = tier === 0 ? primary : tier === 1 ? fallback : null;

  return (
    <div>
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
      <div
        className={`flex items-center justify-center overflow-hidden rounded bg-white/[0.03] ${className}`}
        style={{ border: "1px solid rgba(255,255,255,0.09)" }}
      >
        {currentSrc ? (
          <img
            src={currentSrc}
            alt=""
            className="h-full w-full object-contain p-1"
            referrerPolicy="no-referrer"
            onError={() => setTier(prev => (prev === 0 && fallback ? 1 : 2))}
          />
        ) : (
          <span className="font-semibold text-white/35">{initial}</span>
        )}
      </div>
    </div>
  );
}
function NF({ label, value, onChange, placeholder }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string }) {
  return <FL label={label}><input type="number" value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder={placeholder} className={IC} style={IS} onFocus={e => Object.assign(e.target.style, IF)} onBlur={e => Object.assign(e.target.style, IS)} /></FL>;
}
function TA({ label, value, onChange, rows = 3 }: { label: string; value: string | null | undefined; onChange: (v: string) => void; rows?: number }) {
  return <FL label={label}><textarea value={value ?? ""} onChange={e => onChange(e.target.value)} rows={rows} className={`${IC} resize-none`} style={IS} onFocus={e => Object.assign(e.target.style, IF)} onBlur={e => Object.assign(e.target.style, IS)} /></FL>;
}
function BF({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  const on = value === true;
  return (
    <FL label={label}>
      <button onClick={() => onChange(!on)} className="flex items-center gap-2 rounded px-3 py-1.5 text-[12px] transition-colors w-full" style={{ background: on ? "rgba(46,230,166,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${on ? "rgba(46,230,166,0.3)" : "rgba(255,255,255,0.08)"}`, color: on ? "#2EE6A6" : "rgba(255,255,255,0.4)" }}>
        {on ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {on ? "Yes" : "No"}
      </button>
    </FL>
  );
}
function SF({ label, value, onChange, options }: { label: string; value: string | null | undefined; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <FL label={label}>
      <select value={value ?? ""} onChange={e => onChange(e.target.value)} className={IC} style={IS}>
        <option value="">— not set —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FL>
  );
}
function TagF({ label, value, onChange }: { label: string; value: string[] | null | undefined; onChange: (v: string[]) => void }) {
  const canonical = (value ?? []).join("\n");
  const [text, setText] = useState(canonical);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(canonical);
  }, [canonical]);

  return (
    <FL label={`${label} (one per line)`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          focusedRef.current = true;
          Object.assign(e.target.style, IF);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          Object.assign(e.target.style, IS);
          const next = text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          onChange(next);
        }}
        rows={4}
        spellCheck={false}
        placeholder="One entry per line — commas and other punctuation allowed"
        className={`${IC} min-h-[88px] resize-y font-mono`}
        style={IS}
      />
    </FL>
  );
}
function JF({ label, value, onChange, rows = 5 }: { label: string; value: Json | null | undefined; onChange: (v: Json | null) => void; rows?: number }) {
  const canonical = value == null ? "" : JSON.stringify(value, null, 2);
  const [text, setText] = useState(canonical);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(canonical);
  }, [canonical]);

  return (
    <FL label={`${label} (JSON)`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          focusedRef.current = true;
          Object.assign(e.target.style, IF);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          Object.assign(e.target.style, IS);
          const trimmed = text.trim();
          if (!trimmed) {
            onChange(null);
            setText("");
            return;
          }
          try {
            const parsed = JSON.parse(trimmed) as Json;
            onChange(parsed);
            setText(JSON.stringify(parsed, null, 2));
          } catch {
            toast.error(`${label} must be valid JSON`);
            setText(canonical);
          }
        }}
        rows={rows}
        spellCheck={false}
        placeholder='{"source": "manual"}'
        className={`${IC} min-h-[108px] resize-y font-mono`}
        style={IS}
      />
    </FL>
  );
}
function Sect({ title }: { title: string }) {
  return <div className="pt-1"><p className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "#2EE6A6" }}>{title}</p><div className="h-px mb-3" style={{ background: "rgba(46,230,166,0.15)" }} /></div>;
}

function fmtAum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}
function fmtMoney(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}
function fmtCheckRange(min: number | null | undefined, max: number | null | undefined): string {
  const lo = fmtMoney(min);
  const hi = fmtMoney(max);
  if (lo && hi) return `${lo}–${hi}`;
  return lo ?? hi ?? "—";
}
function fmtFundDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function displayLocation(row: FirmRow): string {
  return row.location || [row.hq_city, row.hq_state ?? row.hq_country].filter(Boolean).join(", ") || "—";
}
type FirmAdminStatus = "live" | "needs_review" | "archive";
function getFirmAdminStatus(row: FirmRow): FirmAdminStatus {
  const normalized = (row.status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "archive" || normalized === "archived") return "archive";
  if (row.needs_review || normalized === "needs_review") return "needs_review";
  return "live";
}
function firmStatusLabel(status: FirmAdminStatus): string {
  if (status === "needs_review") return "NEEDS REVIEW";
  if (status === "archive") return "ARCHIVE";
  return "LIVE";
}
function firmStatusStyle(status: FirmAdminStatus) {
  if (status === "needs_review") return { background: "rgba(245,158,11,0.15)", color: "#f59e0b", borderColor: "rgba(245,158,11,0.25)" };
  if (status === "archive") return { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.42)", borderColor: "rgba(255,255,255,0.1)" };
  return { background: "rgba(46,230,166,0.12)", color: "#2EE6A6", borderColor: "rgba(46,230,166,0.28)" };
}
function scoreColor(n: number): string {
  return n >= 70 ? "#2EE6A6" : n >= 40 ? "#f59e0b" : "#ef4444";
}
function enrichColor(s: string): string {
  return s === "enriched" ? "#2EE6A6" : s === "partial" ? "#f59e0b" : s === "failed" ? "#ef4444" : "rgba(255,255,255,0.3)";
}
function TagChips({ items, max = 3 }: { items: string[] | null | undefined; max?: number }) {
  if (!items?.length) return <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>;
  const rest = items.length - max;
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, max).map(t => <span key={t} className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ background: "rgba(46,230,166,0.08)", color: "#2EE6A6" }}>{t}</span>)}
      {rest > 0 && <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>+{rest}</span>}
    </div>
  );
}

// ── Editable detail modal ──────────────────────────────────────────────────────

function FirmEditPanel({ row, onClose, onSaved }: { row: FirmRow; onClose: () => void; onSaved: (r: FirmRow) => void }) {
  const [draft, setDraft] = useState<FirmRow>({ ...row });
  const [activeTab, setActiveTab] = useState<FirmModalTab>("profile");
  const [funds, setFunds] = useState<FirmLinkedFundRow[]>([]);
  const [fundDrafts, setFundDrafts] = useState<Record<string, { min: number | null; max: number | null; saving: boolean }>>({});
  const [investors, setInvestors] = useState<FirmInvestorRow[]>([]);
  const [portfolio, setPortfolio] = useState<FirmPortfolioRow[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FirmRow>(k: K) { return (v: FirmRow[K]) => setDraft(d => ({ ...d, [k]: v })); }
  const faviconFallback = faviconPreviewFromWebsite(draft.website_url);
  const locationLine = displayLocation(draft);
  const stageLine = draft.preferred_stage || draft.stage_focus?.join(", ") || "—";
  const focusLine = draft.firm_type || draft.lead_or_follow || draft.entity_type || "—";
  const visiblePitch = draft.elevator_pitch || draft.description || draft.sentiment_detail || "";
  const investmentCount = draft.recent_deals?.length ?? null;
  const firmStatus = getFirmAdminStatus(draft);

  const setFirmStatus = (next: FirmAdminStatus) => {
    setDraft(d => ({
      ...d,
      status: next,
      ready_for_live: next === "live",
      needs_review: next === "needs_review",
      manual_review_status: next === "needs_review" ? "needs_review" : next,
    }));
  };

  useEffect(() => {
    let cancelled = false;
    setLinkedLoading(true);
    setLinkedError(null);
    Promise.all([
      fetchFirmLinkedFunds(row.id),
      fetchFirmLinkedRows<FirmInvestorRow>("firm-investors", row.id),
      fetchFirmLinkedRows<FirmPortfolioRow>("firm-portfolio", row.id),
    ]).then(([fundRes, investorRes, portfolioRes]) => {
      if (cancelled) return;
      const error = fundRes.error ?? investorRes.error ?? portfolioRes.error ?? null;
      setLinkedError(error);
      setFunds(fundRes.rows);
      // Initialise per-fund check size drafts
      const initialDrafts: Record<string, { min: number | null; max: number | null; saving: boolean }> = {};
      for (const f of fundRes.rows) {
        initialDrafts[f.id] = { min: f.estimated_check_min_usd ?? null, max: f.estimated_check_max_usd ?? null, saving: false };
      }
      setFundDrafts(initialDrafts);
      setInvestors(investorRes.rows);
      setPortfolio(portfolioRes.rows);
    }).finally(() => {
      if (!cancelled) setLinkedLoading(false);
    });
    return () => { cancelled = true; };
  }, [row.id]);

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, deleted_at, sector_embedding, updated_at, ...patch } = draft as FirmRow & { created_at?: unknown; deleted_at?: unknown; sector_embedding?: unknown };
    const { row: updated, error } = await patchFirm(row.id, patch as Record<string, unknown>);
    if (error) { toast.error("Save failed", { description: error }); }
    else { toast.success("Saved"); if (updated) onSaved(updated); }
    setSaving(false);
  };

  const saveFundCheckSize = async (fundId: string) => {
    const d = fundDrafts[fundId];
    if (!d) return;
    setFundDrafts(prev => ({ ...prev, [fundId]: { ...prev[fundId], saving: true } }));
    const { error } = await patchFund(fundId, {
      estimated_check_min_usd: d.min,
      estimated_check_max_usd: d.max,
    });
    if (error) toast.error("Fund save failed", { description: error });
    else {
      toast.success("Check size saved");
      setFunds(prev => prev.map(f => f.id === fundId
        ? { ...f, estimated_check_min_usd: d.min, estimated_check_max_usd: d.max }
        : f
      ));
    }
    setFundDrafts(prev => ({ ...prev, [fundId]: { ...prev[fundId], saving: false } }));
  };

  const saveInvestor = async (item: FirmInvestorRow) => {
    const { id, firm_id, created_at, deleted_at, updated_at, ...patch } = item;
    const { row: updated, error } = await patchLinkedRow<FirmInvestorRow>("firm-investors", id, patch);
    if (error) toast.error("Investor save failed", { description: error });
    else {
      toast.success("Investor saved");
      if (updated) setInvestors(prev => prev.map(r => r.id === updated.id ? updated : r));
    }
  };

  const savePortfolioCompany = async (item: FirmPortfolioRow) => {
    const { id, firm_id, updated_at, ...patch } = item;
    const { row: updated, error } = await patchLinkedRow<FirmPortfolioRow>("firm-portfolio", id, patch);
    if (error) toast.error("Portfolio save failed", { description: error });
    else {
      toast.success("Portfolio company saved");
      if (updated) setPortfolio(prev => prev.map(r => r.id === updated.id ? updated : r));
    }
  };

  function updateInvestor<K extends keyof FirmInvestorRow>(id: string, key: K, value: FirmInvestorRow[K]) {
    setInvestors(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
  }

  function updatePortfolio<K extends keyof FirmPortfolioRow>(id: string, key: K, value: FirmPortfolioRow[K]) {
    setPortfolio(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close firm editor" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c0c] shadow-2xl">
        <div className="relative shrink-0 overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-violet-500/[0.08] blur-3xl" />
            <div className="absolute left-1/3 -top-10 h-56 w-56 rounded-full bg-sky-500/[0.07] blur-3xl" />
            <div className="absolute right-0 -top-8 h-64 w-64 rounded-full bg-emerald-500/[0.08] blur-3xl" />
          </div>
          <div className="relative z-10 flex items-start gap-6 px-8 pb-5 pt-6">
            <FirmLogo
              firmName={draft.firm_name || "Firm"}
              logoUrl={draft.logo_url}
              websiteUrl={draft.website_url}
              size="lg"
              className="h-[86px] w-[86px] rounded-2xl border-white/10 bg-white/[0.04] ring-1 ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-1.5">
                <input
                  value={draft.firm_name ?? ""}
                  onChange={e => set("firm_name")(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[21px] font-semibold leading-tight tracking-[-0.4px] text-white outline-none"
                  placeholder="Firm name"
                />
                <CheckCircle2 className="h-[15px] w-[15px] shrink-0 fill-emerald-400/15 text-emerald-400" />
              </div>
              <textarea
                value={visiblePitch}
                onChange={e => set("elevator_pitch")(e.target.value)}
                rows={3}
                className="mb-2.5 w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-snug text-white/55 outline-none placeholder:text-white/25"
                placeholder="Editable elevator pitch shown under the firm name"
              />
              <div className="flex min-w-0 flex-nowrap items-center gap-0 overflow-hidden text-[11px] leading-snug text-white/70">
                <span className="flex min-w-0 max-w-[42%] items-center gap-1.5 overflow-hidden pr-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span className="min-w-0 truncate font-medium text-white/85">{locationLine}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-white/15 pl-3">
                  <DollarSign className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span className="font-medium text-white/80">{draft.aum || fmtAum(draft.aum_usd)}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-white/15 pl-3">
                  <Users className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span className="font-medium text-white/80">{draft.total_headcount != null ? draft.total_headcount : "—"}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-white/15 pl-3">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <span className="font-medium text-white/80">{investmentCount ?? "—"}</span>
                </span>
              </div>
            </div>
            <div className="flex w-[230px] shrink-0 flex-col items-end gap-2.5">
              <div className="flex items-center gap-1.5">
                <select
                  value={firmStatus}
                  onChange={e => setFirmStatus(e.target.value as FirmAdminStatus)}
                  className="h-[34px] rounded-xl px-3 text-[11px] font-semibold uppercase tracking-[0.12em] outline-none"
                  style={{ ...firmStatusStyle(firmStatus), border: `1px solid ${firmStatusStyle(firmStatus).borderColor}` }}
                >
                  <option value="live">LIVE</option>
                  <option value="needs_review">NEEDS REVIEW</option>
                  <option value="archive">ARCHIVE</option>
                </select>
                <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-[9px] text-[13px] font-semibold disabled:opacity-50" style={{ background: "#2EE6A6", color: "#020403" }}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={onClose} className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white">
                  <X className="h-[14px] w-[14px]" />
                </button>
              </div>
              <div className="w-full space-y-1 text-right">
                <p className="truncate text-[10px] text-white/55"><span className="font-medium text-white/75">Sector:</span> {focusLine}</p>
                <p className="truncate text-[10px] text-white/55"><span className="font-medium text-white/75">Stage:</span> {stageLine}</p>
                <p className="truncate text-[10px] text-white/55"><span className="font-medium text-white/75">Check:</span> {fmtCheckRange(draft.min_check_size, draft.max_check_size)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-b border-white/10 px-8 py-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            {([
              ["profile", "Firm Profile"],
              ["funds", `Funds (${funds.length})`],
              ["investors", `Linked Investors (${investors.length})`],
              ["portfolio", `Portfolio Companies (${portfolio.length})`],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors"
                style={{
                  background: activeTab === tab ? "rgba(255,255,255,0.1)" : "transparent",
                  color: activeTab === tab ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {activeTab === "profile" ? (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <Sect title="Identity" />
              <div className="grid grid-cols-2 gap-3">
                <TF label="Firm Name" value={draft.firm_name} onChange={set("firm_name")} />
                <TF label="Slug" value={draft.slug} onChange={set("slug")} />
              </div>
              <TF label="Registered Name" value={draft.legal_name} onChange={set("legal_name")} />
              <TagF label="Aliases" value={draft.aliases} onChange={set("aliases")} />
              <TagF label="Alternate Names" value={draft.alternate_names} onChange={set("alternate_names")} />
              <TF label="Tagline" value={draft.tagline} onChange={set("tagline")} />
              <TA label="Description" value={draft.description} onChange={set("description")} rows={4} />
              <TA label="Sentiment Detail" value={draft.sentiment_detail} onChange={set("sentiment_detail")} rows={3} />

              <Sect title="Investment Card Fields" />
              <div className="grid grid-cols-2 gap-3">
                <TF label="AUM Display" value={draft.aum} onChange={set("aum")} placeholder="$1.2B" />
                <NF label="AUM (USD)" value={draft.aum_usd} onChange={set("aum_usd")} placeholder="1200000000" />
                <NF label="Min Check Size" value={draft.min_check_size} onChange={set("min_check_size")} />
                <NF label="Max Check Size" value={draft.max_check_size} onChange={set("max_check_size")} />
                <NF label="Team Headcount" value={draft.total_headcount} onChange={set("total_headcount")} />
                <NF label="Founded Year" value={draft.founded_year} onChange={set("founded_year")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SF
                  label="Preferred Stage"
                  value={draft.preferred_stage}
                  onChange={(v) => set("preferred_stage")(v === "" ? null : v)}
                  options={orderedStageSelectOptions(STAGE_FOCUS_ENUM, draft.preferred_stage)}
                />
                <TF label="Sector Focus" value={draft.firm_type} onChange={set("firm_type")} />
                <SF
                  label="Entity Type"
                  value={draft.entity_type}
                  onChange={(v) => set("entity_type")(v === "" ? null : v)}
                  options={selectOptionsFromDbEnum(FIRM_ENTITY_TYPE_ENUM, draft.entity_type)}
                />
                <TF label="Lead Partner" value={draft.lead_partner} onChange={set("lead_partner")} />
              </div>
              <TF label="Current Fund Name" value={draft.current_fund_name} onChange={set("current_fund_name")} />
              <SF label="Lead or Follow" value={draft.lead_or_follow} onChange={set("lead_or_follow")} options={[
                { value: "lead", label: "Lead" },
                { value: "follow", label: "Follow" },
                { value: "either", label: "Either" },
              ]} />
              <div>
                <TagF label="Stage Focus" value={draft.stage_focus} onChange={set("stage_focus")} />
                <p className="mt-1.5 text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.32)" }}>
                  One stage per line. Use the same labels as Preferred Stage (e.g. <span className="text-white/50">Series B</span>, not &quot;Series B round&quot;).
                </p>
              </div>
              <TagF label="Thesis Verticals" value={draft.thesis_verticals} onChange={set("thesis_verticals")} />
              <TagF label="Strategy Classifications" value={draft.strategy_classifications} onChange={set("strategy_classifications")} />
              <TagF label="Recent Deals" value={draft.recent_deals} onChange={set("recent_deals")} />
            </div>

            <div className="space-y-4">
              <Sect title="Brand Assets" />
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-3">
                <BrandAssetPreview label="Logo" src={draft.logo_url} initial={(draft.firm_name || "?").charAt(0).toUpperCase()} className="h-20 w-20 text-lg" />
                <UF label="Logo URL" value={draft.logo_url} onChange={set("logo_url")} placeholder="https://firm.com/logo.svg" />
                <BrandAssetPreview label="Favicon" src={draft.favicon_url} fallbackSrc={faviconFallback} initial={(draft.firm_name || "?").charAt(0).toUpperCase()} className="h-12 w-12 text-sm" />
                <UF label="Favicon URL" value={draft.favicon_url} onChange={set("favicon_url")} placeholder="https://firm.com/favicon.ico" />
              </div>

              <Sect title="Location" />
              <TF label="Location Display" value={draft.location} onChange={set("location")} placeholder="San Francisco, CA" />
              <TF label="Address" value={draft.address} onChange={set("address")} />
              <div className="grid grid-cols-4 gap-2">
                <TF label="City" value={draft.hq_city} onChange={set("hq_city")} />
                <TF label="State" value={draft.hq_state} onChange={set("hq_state")} />
                <TF label="ZIP" value={draft.hq_zip_code} onChange={set("hq_zip_code")} />
                <TF label="Country" value={draft.hq_country} onChange={set("hq_country")} />
              </div>

              <Sect title="Contact & Web" />
              <UF label="Website URL" value={draft.website_url} onChange={set("website_url")} placeholder="https://firm.com" />
              <UF label="Contact Page URL" value={draft.contact_page_url} onChange={set("contact_page_url")} placeholder="https://firm.com/contact" />
              <div className="grid grid-cols-2 gap-3">
                <TF label="Email" value={draft.email} onChange={set("email")} type="email" />
                <TF label="Phone" value={draft.phone} onChange={set("phone")} />
              </div>
              <UF label="LinkedIn Profile" value={draft.linkedin_url} onChange={set("linkedin_url")} placeholder="https://www.linkedin.com/company/..." />
              <UF label="X Profile" value={draft.x_url} onChange={set("x_url")} placeholder="https://x.com/..." />
              <UF label="Facebook" value={draft.facebook_url} onChange={set("facebook_url")} />
              <UF label="Instagram" value={draft.instagram_url} onChange={set("instagram_url")} />
              <UF label="YouTube" value={draft.youtube_url} onChange={set("youtube_url")} />
              <UF label="Substack" value={draft.substack_url} onChange={set("substack_url")} placeholder="https://...substack.com" />
              <UF label="Medium" value={draft.medium_url} onChange={set("medium_url")} placeholder="https://medium.com/..." />

              <Sect title="Databases" />
              <UF label="Crunchbase" value={draft.crunchbase_url} onChange={set("crunchbase_url")} placeholder="https://www.crunchbase.com/organization/..." />
              <UF label="Signal" value={draft.signal_nfx_url} onChange={set("signal_nfx_url")} placeholder="https://signal.nfx.com/..." />
              <UF label="CB Insights" value={draft.cb_insights_url} onChange={set("cb_insights_url")} />
              <UF label="OpenVC" value={draft.openvc_url} onChange={set("openvc_url")} />
              <UF label="PitchBook" value={draft.pitchbook_url} onChange={set("pitchbook_url")} />
              <UF label="VC Sheet" value={draft.vcsheet_url} onChange={set("vcsheet_url")} />

              <Sect title="Admin Status" />
              <div className="grid grid-cols-2 gap-3">
                <SF label="Firm Status" value={firmStatus} onChange={v => setFirmStatus(v as FirmAdminStatus)} options={[
                  { value: "live", label: "LIVE" },
                  { value: "needs_review", label: "NEEDS REVIEW" },
                  { value: "archive", label: "ARCHIVE" },
                ]} />
                <SF label="Enrichment Status" value={draft.enrichment_status} onChange={set("enrichment_status")} options={[
                  { value: "enriched", label: "Enriched" },
                  { value: "partial", label: "Partial" },
                  { value: "pending", label: "Pending" },
                  { value: "failed", label: "Failed" },
                ]} />
              </div>
              <TA label="Market Sentiment" value={draft.market_sentiment} onChange={set("market_sentiment")} rows={2} />
              <div className="grid grid-cols-2 gap-3">
                <BF label="Actively Deploying" value={draft.is_actively_deploying} onChange={set("is_actively_deploying")} />
              </div>
            </div>
          </div>
          ) : activeTab === "funds" ? (
            <div className="space-y-3">
              <Sect title="Linked funds (vc_funds)" />
              <p className="text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>
                Fund vehicles linked to this firm record. To create or edit fields, use{" "}
                <span className="font-medium text-white/55">Admin → Fresh Capital → Fund Watch</span>.
              </p>
              {linkedLoading && (
                <div className="flex items-center gap-2 py-8 text-[12px] text-white/45">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading funds…
                </div>
              )}
              {linkedError && !linkedLoading && (
                <div className="rounded border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{linkedError}</div>
              )}
              {!linkedLoading && !linkedError && funds.length === 0 && (
                <div className="rounded border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-[12px] text-white/35">
                  No linked funds found for this firm
                </div>
              )}
              {!linkedLoading && funds.map(fund => (
                <div
                  key={fund.id}
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-white/90">{fund.fund_name ?? "—"}</p>
                      <p className="mt-1 font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.32)" }}>
                        {fund.id}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {fund.announcement_url ? (
                        <a
                          href={fund.announcement_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[11px] font-medium text-[#2EE6A6] transition-colors hover:bg-white/[0.06]"
                        >
                          Announcement <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      <span
                        className="rounded-md border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
                        style={{ color: "rgba(255,255,255,0.65)" }}
                      >
                        {fund.status ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.32)" }}>Vintage</p>
                      <p className="mt-0.5 text-[12px] text-white/75">{fund.vintage_year ?? "—"}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.32)" }}>Announced</p>
                      <p className="mt-0.5 text-[12px] text-white/75">{fmtFundDate(fund.announced_date)}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.32)" }}>Close</p>
                      <p className="mt-0.5 text-[12px] text-white/75">{fmtFundDate(fund.close_date)}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.32)" }}>Target / Final</p>
                      <p className="mt-0.5 text-[12px] text-white/75">
                        {(fmtMoney(fund.target_size_usd) ?? "—")} / {(fmtMoney(fund.final_size_usd) ?? "—")}
                        {fund.currency && fund.currency !== "USD" ? ` ${fund.currency}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div>
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.32)" }}>Stage focus</p>
                      <TagChips items={fund.stage_focus ?? []} max={6} />
                    </div>
                    <div>
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.32)" }}>Geo focus</p>
                      <TagChips items={fund.geography_focus ?? []} max={6} />
                    </div>
                    <div>
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.32)" }}>Themes / sector</p>
                      <TagChips items={fund.sector_focus ?? []} max={6} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {fund.fund_type ? <span>Type: <span className="text-white/55">{fund.fund_type}</span></span> : null}
                    {fund.fund_sequence_number != null ? <span>Sequence: <span className="text-white/55">{fund.fund_sequence_number}</span></span> : null}
                    {fund.verification_status ? (
                      <span>Verification: <span className="text-white/55">{fund.verification_status}</span></span>
                    ) : null}
                    {fund.manually_verified ? <span className="text-emerald-400/90">Manually verified</span> : null}
                  </div>
                  {fund.announcement_title ? (
                    <p className="mt-2 text-[11px] leading-snug italic" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {fund.announcement_title}
                    </p>
                  ) : null}
                  {/* Inline check size editing */}
                  <div className="mt-3 flex items-end gap-3 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="flex-1">
                      <label className="block font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.32)" }}>Est. Check Min (USD)</label>
                      <input
                        type="number"
                        className="w-full rounded px-2.5 py-1.5 text-[12px] text-white/80 focus:outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                        value={fundDrafts[fund.id]?.min ?? ""}
                        onChange={e => setFundDrafts(prev => ({ ...prev, [fund.id]: { ...prev[fund.id], min: e.target.value === "" ? null : Number(e.target.value) } }))}
                        placeholder="e.g. 250000"
                        step={25000}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.32)" }}>Est. Check Max (USD)</label>
                      <input
                        type="number"
                        className="w-full rounded px-2.5 py-1.5 text-[12px] text-white/80 focus:outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                        value={fundDrafts[fund.id]?.max ?? ""}
                        onChange={e => setFundDrafts(prev => ({ ...prev, [fund.id]: { ...prev[fund.id], max: e.target.value === "" ? null : Number(e.target.value) } }))}
                        placeholder="e.g. 1000000"
                        step={25000}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={fundDrafts[fund.id]?.saving}
                      onClick={() => saveFundCheckSize(fund.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
                      style={{ background: "#2EE6A6", color: "#020403" }}
                    >
                      {fundDrafts[fund.id]?.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      {fundDrafts[fund.id]?.saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === "investors" ? (
            <div className="space-y-3">
              <Sect title="Linked Investors" />
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <UF
                  label="LinkedIn team / people URL"
                  value={draft.team_people_url}
                  onChange={set("team_people_url")}
                  placeholder="https://www.linkedin.com/company/.../people/ or firm team page"
                />
                <p className="mt-1.5 text-[10px] leading-snug" style={{ color: "rgba(255,255,255,0.32)" }}>
                  Firm-level people page for future LinkedIn/team scrapes. Persists with the main <span className="text-white/55">Save</span> button above.
                </p>
              </div>
              {linkedLoading && <div className="flex items-center gap-2 py-8 text-[12px] text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading linked investors…</div>}
              {linkedError && <div className="rounded border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{linkedError}</div>}
              {!linkedLoading && !linkedError && investors.length === 0 && <div className="rounded border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-[12px] text-white/35">No linked investors found</div>}
              {investors.map(item => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto]">
                    <TF label="Investor Name" value={item.full_name} onChange={v => updateInvestor(item.id, "full_name", v)} />
                    <TF label="Title" value={item.title} onChange={v => updateInvestor(item.id, "title", v)} />
                    <TF label="Email" value={item.email} onChange={v => updateInvestor(item.id, "email", v)} />
                    <RF label="Investor ID" value={item.id} />
                    <button type="button" onClick={() => saveInvestor(item)} className="mt-5 inline-flex h-[31px] items-center justify-center gap-1.5 rounded px-3 text-[12px] font-semibold" style={{ background: "#2EE6A6", color: "#020403" }}>
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>

                  <Sect title="Profile" />
                  <div className="grid gap-3 lg:grid-cols-4">
                    <TF label="First Name" value={item.first_name} onChange={v => updateInvestor(item.id, "first_name", v)} />
                    <TF label="Last Name" value={item.last_name} onChange={v => updateInvestor(item.id, "last_name", v)} />
                    <TF label="Preferred Name" value={item.preferred_name} onChange={v => updateInvestor(item.id, "preferred_name", v)} />
                    <TF label="Seniority" value={item.seniority} onChange={v => updateInvestor(item.id, "seniority", v)} />
                    <TF label="Investor Type" value={item.investor_type} onChange={v => updateInvestor(item.id, "investor_type", v)} />
                    <TF label="Phone" value={item.phone} onChange={v => updateInvestor(item.id, "phone", v)} />
                    <TF label="Timezone" value={item.timezone} onChange={v => updateInvestor(item.id, "timezone", v)} />
                    <TF label="Slug" value={item.slug} onChange={v => updateInvestor(item.id, "slug", v)} />
                  </div>
                  <div className="mt-3">
                    <TagF label="Alternate Names" value={item.alternate_names} onChange={v => updateInvestor(item.id, "alternate_names", v)} />
                  </div>

                  <Sect title="Social & Web" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <UF label="LinkedIn" value={item.linkedin_url} onChange={v => updateInvestor(item.id, "linkedin_url", v)} />
                    <UF label="X" value={item.x_url} onChange={v => updateInvestor(item.id, "x_url", v)} />
                    <UF label="Website" value={item.website_url} onChange={v => updateInvestor(item.id, "website_url", v)} />
                    <UF label="Personal Website" value={item.personal_website} onChange={v => updateInvestor(item.id, "personal_website", v)} />
                    <UF label="Firm Bio Page" value={item.firm_bio_page_url} onChange={v => updateInvestor(item.id, "firm_bio_page_url", v)} />
                    <UF label="Facebook" value={item.facebook_url} onChange={v => updateInvestor(item.id, "facebook_url", v)} />
                    <UF label="Instagram" value={item.instagram_url} onChange={v => updateInvestor(item.id, "instagram_url", v)} />
                    <UF label="YouTube" value={item.youtube_url} onChange={v => updateInvestor(item.id, "youtube_url", v)} />
                    <UF label="TikTok" value={item.tiktok_url} onChange={v => updateInvestor(item.id, "tiktok_url", v)} />
                    <UF label="Medium" value={item.medium_url} onChange={v => updateInvestor(item.id, "medium_url", v)} />
                    <UF label="Substack" value={item.substack_url} onChange={v => updateInvestor(item.id, "substack_url", v)} />
                    <UF label="Tracxn" value={item.tracxn_url} onChange={v => updateInvestor(item.id, "tracxn_url", v)} />
                  </div>

                  <Sect title="Images" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <UF label="Avatar URL" value={item.avatar_url} onChange={v => updateInvestor(item.id, "avatar_url", v)} />
                    <UF label="Headshot URL" value={item.headshot_url} onChange={v => updateInvestor(item.id, "headshot_url", v)} />
                    <UF label="Avatar Source URL" value={item.avatar_source_url} onChange={v => updateInvestor(item.id, "avatar_source_url", v)} />
                    <TF label="Avatar Source Type" value={item.avatar_source_type} onChange={v => updateInvestor(item.id, "avatar_source_type", v)} />
                    <NF label="Avatar Confidence" value={item.avatar_confidence} onChange={v => updateInvestor(item.id, "avatar_confidence", v)} />
                    <TF label="Avatar Verified At" value={item.avatar_last_verified_at} onChange={v => updateInvestor(item.id, "avatar_last_verified_at", v)} />
                  </div>
                  <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
                    <BF label="Avatar Needs Review" value={item.avatar_needs_review} onChange={v => updateInvestor(item.id, "avatar_needs_review", v)} />
                  </div>

                  <Sect title="Location & Access" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <TF label="City" value={item.city} onChange={v => updateInvestor(item.id, "city", v)} />
                    <TF label="State" value={item.state} onChange={v => updateInvestor(item.id, "state", v)} />
                    <TF label="Country" value={item.country} onChange={v => updateInvestor(item.id, "country", v)} />
                  </div>
                  <div className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <BF label="Active" value={item.is_active} onChange={v => updateInvestor(item.id, "is_active", v)} />
                    <BF label="Actively Investing" value={item.is_actively_investing} onChange={v => updateInvestor(item.id, "is_actively_investing", v)} />
                    <BF label="Cold Outreach OK" value={item.cold_outreach_ok} onChange={v => updateInvestor(item.id, "cold_outreach_ok", v)} />
                    <BF label="Warm Intro Preferred" value={item.warm_intro_preferred} onChange={v => updateInvestor(item.id, "warm_intro_preferred", v)} />
                  </div>

                  <Sect title="Focus & Thesis" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <TagF label="Stage Focus" value={item.stage_focus} onChange={v => updateInvestor(item.id, "stage_focus", v)} />
                    <TagF label="Sector Focus" value={item.sector_focus} onChange={v => updateInvestor(item.id, "sector_focus", v)} />
                    <TagF label="Thesis Tags" value={item.personal_thesis_tags} onChange={v => updateInvestor(item.id, "personal_thesis_tags", v)} />
                    <TagF label="Portfolio Companies" value={item.portfolio_companies} onChange={v => updateInvestor(item.id, "portfolio_companies", v)} />
                    <TagF label="Geographic Focus" value={item.geographic_focus} onChange={v => updateInvestor(item.id, "geographic_focus", v)} />
                    <TagF label="Domain Expertise" value={item.domain_expertise} onChange={v => updateInvestor(item.id, "domain_expertise", v)} />
                    <TagF label="Investing Themes" value={item.investing_themes} onChange={v => updateInvestor(item.id, "investing_themes", v)} />
                    <TagF label="Current Areas of Interest" value={item.current_areas_of_interest} onChange={v => updateInvestor(item.id, "current_areas_of_interest", v)} />
                    <TagF label="Notable Investments" value={item.notable_investments} onChange={v => updateInvestor(item.id, "notable_investments", v)} />
                    <TagF label="Networks" value={item.networks} onChange={v => updateInvestor(item.id, "networks", v)} />
                    <TagF label="Board Seats" value={item.board_seats} onChange={v => updateInvestor(item.id, "board_seats", v)} />
                    <TagF label="Prior Firms" value={item.prior_firms} onChange={v => updateInvestor(item.id, "prior_firms", v)} />
                    <TagF label="Prior Firm Associations" value={item.prior_firm_associations} onChange={v => updateInvestor(item.id, "prior_firm_associations", v)} />
                    <TagF label="Stage Concentration" value={item.stage_concentration} onChange={v => updateInvestor(item.id, "stage_concentration", v)} />
                    <TagF label="Geographic Concentration" value={item.geographic_concentration} onChange={v => updateInvestor(item.id, "geographic_concentration", v)} />
                    <TagF label="Thematic Concentration" value={item.thematic_concentration} onChange={v => updateInvestor(item.id, "thematic_concentration", v)} />
                    <TagF label="Sub-Sectors" value={item.sub_sectors} onChange={v => updateInvestor(item.id, "sub_sectors", v)} />
                  </div>

                  <Sect title="Narrative" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <TA label="Short Summary" value={item.short_summary} onChange={v => updateInvestor(item.id, "short_summary", v)} rows={2} />
                    <TA label="Bio" value={item.bio} onChange={v => updateInvestor(item.id, "bio", v)} rows={2} />
                    <TA label="Background Summary" value={item.background_summary} onChange={v => updateInvestor(item.id, "background_summary", v)} rows={3} />
                    <TA label="Education Summary" value={item.education_summary} onChange={v => updateInvestor(item.id, "education_summary", v)} rows={3} />
                    <TA label="Founder Background" value={item.founder_background} onChange={v => updateInvestor(item.id, "founder_background", v)} rows={3} />
                    <TA label="Operator Background" value={item.operator_background} onChange={v => updateInvestor(item.id, "operator_background", v)} rows={3} />
                    <TA label="Recent Focus" value={item.recent_focus} onChange={v => updateInvestor(item.id, "recent_focus", v)} rows={2} />
                  </div>

                  <Sect title="Investment Behavior" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <TF label="Avg Deal Size" value={item.avg_deal_size} onChange={v => updateInvestor(item.id, "avg_deal_size", v)} />
                    <NF label="Check Size Min" value={item.check_size_min} onChange={v => updateInvestor(item.id, "check_size_min", v)} />
                    <NF label="Check Size Max" value={item.check_size_max} onChange={v => updateInvestor(item.id, "check_size_max", v)} />
                    <NF label="Sweet Spot" value={item.sweet_spot} onChange={v => updateInvestor(item.id, "sweet_spot", v)} />
                    <TF label="Lead vs Follow" value={item.lead_vs_follow} onChange={v => updateInvestor(item.id, "lead_vs_follow", v)} />
                    <TF label="Investment Pace" value={item.investment_pace} onChange={v => updateInvestor(item.id, "investment_pace", v)} />
                    <TF label="Investment Style" value={item.investment_style} onChange={v => updateInvestor(item.id, "investment_style", v)} />
                    <NF label="Total Known Investments" value={item.total_known_investments} onChange={v => updateInvestor(item.id, "total_known_investments", v)} />
                    <NF label="Recent Deal Count" value={item.recent_deal_count} onChange={v => updateInvestor(item.id, "recent_deal_count", v)} />
                    <TF label="Last Active Date" value={item.last_active_date} onChange={v => updateInvestor(item.id, "last_active_date", v)} />
                    <TF label="Last Capital Signal At" value={item.last_capital_signal_at} onChange={v => updateInvestor(item.id, "last_capital_signal_at", v)} />
                    <TF label="Last Enriched At" value={item.last_enriched_at} onChange={v => updateInvestor(item.id, "last_enriched_at", v)} />
                  </div>

                  <Sect title="Scores & Enrichment" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <NF label="Match Score" value={item.match_score} onChange={v => updateInvestor(item.id, "match_score", v)} />
                    <NF label="Network Strength" value={item.network_strength} onChange={v => updateInvestor(item.id, "network_strength", v)} />
                    <NF label="Reputation Score" value={item.reputation_score} onChange={v => updateInvestor(item.id, "reputation_score", v)} />
                    <NF label="Responsiveness Score" value={item.responsiveness_score} onChange={v => updateInvestor(item.id, "responsiveness_score", v)} />
                    <NF label="Value Add Score" value={item.value_add_score} onChange={v => updateInvestor(item.id, "value_add_score", v)} />
                    <NF label="Capital Freshness Boost" value={item.capital_freshness_boost_score} onChange={v => updateInvestor(item.id, "capital_freshness_boost_score", v)} />
                    <NF label="Completeness Score" value={item.completeness_score} onChange={v => updateInvestor(item.id, "completeness_score", v ?? 0)} />
                    <NF label="Source Count" value={item.source_count} onChange={v => updateInvestor(item.id, "source_count", v ?? 0)} />
                    <TF label="Enrichment Status" value={item.enrichment_status} onChange={v => updateInvestor(item.id, "enrichment_status", v)} />
                  </div>
                  <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
                    <BF label="Needs Review" value={item.needs_review} onChange={v => updateInvestor(item.id, "needs_review", v)} />
                    <BF label="Ready for Live" value={item.ready_for_live} onChange={v => updateInvestor(item.id, "ready_for_live", v)} />
                  </div>

                  <Sect title="Source Payloads" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <JF label="Articles" value={item.articles} onChange={v => updateInvestor(item.id, "articles", v)} />
                    <JF label="Blog Posts" value={item.blog_posts} onChange={v => updateInvestor(item.id, "blog_posts", v)} />
                    <JF label="Interviews" value={item.interviews} onChange={v => updateInvestor(item.id, "interviews", v)} />
                    <JF label="Podcasts" value={item.podcasts} onChange={v => updateInvestor(item.id, "podcasts", v)} />
                    <JF label="Past Investments" value={item.past_investments} onChange={v => updateInvestor(item.id, "past_investments", v)} />
                    <JF label="Recent Investments" value={item.recent_investments} onChange={v => updateInvestor(item.id, "recent_investments", v)} />
                    <JF label="Recent News" value={item.recent_news} onChange={v => updateInvestor(item.id, "recent_news", v)} />
                    <JF label="Last 3 Investments" value={item.last_3_investments} onChange={v => updateInvestor(item.id, "last_3_investments", v)} />
                    <JF label="Last 5 Investments" value={item.last_5_investments} onChange={v => updateInvestor(item.id, "last_5_investments", v)} />
                    <JF label="Co-Investors" value={item.co_investors} onChange={v => updateInvestor(item.id, "co_investors", v)} />
                    <JF label="Prior Roles" value={item.prior_roles} onChange={v => updateInvestor(item.id, "prior_roles", v)} />
                  </div>

                  <Sect title="System Metadata" />
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <RF label="Firm ID" value={item.firm_id} />
                    <RF label="Prisma Person ID" value={item.prisma_person_id} />
                    <RF label="Created At" value={item.created_at} />
                    <RF label="Updated At" value={item.updated_at} />
                    <RF label="Deleted At" value={item.deleted_at} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <Sect title="Portfolio Companies" />
              {linkedLoading && <div className="flex items-center gap-2 py-8 text-[12px] text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio companies…</div>}
              {linkedError && <div className="rounded border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{linkedError}</div>}
              {!linkedLoading && !linkedError && portfolio.length === 0 && <div className="rounded border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-[12px] text-white/35">No linked portfolio companies found</div>}
              {portfolio.map(item => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]">
                    <TF label="Company Name" value={item.company_name} onChange={v => updatePortfolio(item.id, "company_name", v)} />
                    <TF label="Stage" value={item.stage} onChange={v => updatePortfolio(item.id, "stage", v)} />
                    <TF label="Amount" value={item.amount} onChange={v => updatePortfolio(item.id, "amount", v)} />
                    <TF label="Date Announced" value={item.date_announced} onChange={v => updatePortfolio(item.id, "date_announced", v)} type="date" />
                    <button type="button" onClick={() => savePortfolioCompany(item)} className="mt-5 inline-flex h-[31px] items-center justify-center gap-1.5 rounded px-3 text-[12px] font-semibold" style={{ background: "#2EE6A6", color: "#020403" }}>
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <TF label="Normalized Name" value={item.normalized_company_name} onChange={v => updatePortfolio(item.id, "normalized_company_name", v)} />
                    <TF label="Investment Status" value={item.investment_status} onChange={v => updatePortfolio(item.id, "investment_status", v)} />
                    <NF label="Source Confidence" value={item.source_confidence} onChange={v => updatePortfolio(item.id, "source_confidence", v)} />
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <UF label="Company Website" value={item.portfolio_company_website} onChange={v => updatePortfolio(item.id, "portfolio_company_website", v)} />
                    <UF label="Company LinkedIn" value={item.portfolio_company_linkedin} onChange={v => updatePortfolio(item.id, "portfolio_company_linkedin", v)} />
                    <UF label="Source URL" value={item.source_url} onChange={v => updatePortfolio(item.id, "source_url", v)} />
                  </div>
                  <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
                    <TF label="Source Name" value={item.source_name} onChange={v => updatePortfolio(item.id, "source_name", v)} />
                    <BF label="Notable" value={item.is_notable} onChange={v => updatePortfolio(item.id, "is_notable", v)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddFirmModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: FirmRow) => void | Promise<void>;
}) {
  const [firmName, setFirmName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [legalName, setLegalName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFirmName("");
      setWebsiteUrl("");
      setSlug("");
      setLegalName("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const name = firmName.trim();
    if (!name) {
      toast.error("Firm name is required");
      return;
    }
    setSubmitting(true);
    const body: Record<string, unknown> = { firm_name: name };
    const w = websiteUrl.trim();
    const s = slug.trim();
    const l = legalName.trim();
    if (w) body.website_url = w;
    if (s) body.slug = s;
    if (l) body.legal_name = l;
    const { row, error } = await createFirm(body);
    setSubmitting(false);
    if (error) {
      toast.error("Could not create firm", { description: error });
      return;
    }
    if (row) {
      toast.success("Firm created — opens as NEEDS REVIEW");
      await Promise.resolve(onCreated(row));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close add firm dialog" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white/90">Add firm record</h2>
            <p className="mt-1 text-[12px] leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>
              Creates a new row in <span className="font-mono text-white/55">firm_records</span>. Status defaults to NEEDS REVIEW; fill the rest in the editor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <TF label="Firm name *" value={firmName} onChange={setFirmName} placeholder="e.g. Acme Ventures" />
          <UF label="Website URL" value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://…" />
          <TF label="Slug" value={slug} onChange={setSlug} placeholder="Optional URL slug" />
          <TF label="Legal name" value={legalName} onChange={setLegalName} placeholder="Optional registered name" />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white/85"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: "#2EE6A6", color: "#020403" }}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {submitting ? "Creating…" : "Create firm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AdminFirmRecords() {
  const [rows, setRows]           = useState<FirmRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [totalFirms, setTotalFirms] = useState<number | null>(null);
  const [liveFirms, setLiveFirms] = useState<number | null>(null);
  const [avgCompleteness, setAvgCompleteness] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [dSearch, setDSearch]     = useState("");
  const [filterEnrich, setFilterEnrich] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage]           = useState(0);
  const [selected, setSelected]   = useState<FirmRow | null>(null);
  const [addOpen, setAddOpen]     = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const [
        { count: totalCount, error: totalErr },
        { count: liveCount, error: liveErr },
        { data: latestData, error: latestErr },
      ] = await Promise.all([
        supabase
          .from("firm_records")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        supabase
          .from("firm_records")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("ready_for_live", true),
        supabase
          .from("firm_records")
          .select("updated_at")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(1),
      ]);

      if (totalErr) throw totalErr;
      if (liveErr) throw liveErr;
      if (latestErr) throw latestErr;

      setTotalFirms(totalCount ?? 0);
      setLiveFirms(liveCount ?? 0);
      setLastUpdateAt(latestData?.[0]?.updated_at ?? null);

      const pageSize = 1000;
      let offset = 0;
      let scoreSum = 0;
      let scoreCount = 0;

      while (true) {
        const { data, error: scoreErr } = await supabase
          .from("firm_records")
          .select("completeness_score")
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (scoreErr) throw scoreErr;

        const chunk = data ?? [];
        for (const row of chunk) {
          const score = Number(row.completeness_score ?? 0);
          if (Number.isFinite(score)) {
            scoreSum += score;
            scoreCount += 1;
          }
        }
        if (chunk.length < pageSize) break;
        offset += pageSize;
      }

      setAvgCompleteness(scoreCount > 0 ? scoreSum / scoreCount : 0);
    } catch (metricsErr) {
      console.warn("[AdminFirmRecords] Failed to load metrics:", metricsErr);
      setTotalFirms(null);
      setLiveFirms(null);
      setAvgCompleteness(null);
      setLastUpdateAt(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true); setError(null);
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) };
    if (dSearch)               params.search         = dSearch;
    if (filterEnrich !== "all") params.enrichment    = filterEnrich;
    if (filterStatus === "live") params.ready_for_live = "true";
    if (filterStatus === "needs_review") params.needs_review = "true";
    if (filterStatus === "archive") params.status = "archive";
    const { rows: data, total: cnt, error: e } = await fetchFirms(params);
    if (e) setError(e); else { setRows(data); setTotal(cnt); }
    setLoading(false);
  }, [dSearch, filterEnrich, filterStatus, page]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const handleSaved = (updated: FirmRow) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelected(updated);
    void loadMetrics();
  };

  const handleFirmCreated = useCallback(
    async (row: FirmRow) => {
      await loadRows();
      await loadMetrics();
      setSelected(row);
    },
    [loadMetrics, loadRows],
  );

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-white/90">Firm Records</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>Click any row to view and edit all fields</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold"
            style={{ background: "rgba(46,230,166,0.14)", color: "#2EE6A6", border: "1px solid rgba(46,230,166,0.35)" }}
          >
            <Plus className="h-4 w-4" /> Add firm
          </button>
          <Building2 className="h-5 w-5" style={{ color: "#2EE6A6" }} />
        </div>
      </div>

      {/* toolbar */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total firms",
            value: totalFirms == null ? "—" : totalFirms.toLocaleString(),
            accent: "rgba(46,230,166,0.32)",
          },
          {
            label: "Live firms",
            value: liveFirms == null ? "—" : liveFirms.toLocaleString(),
            accent: "rgba(46,230,166,0.32)",
          },
          {
            label: "Avg. profile completeness",
            value: avgCompleteness == null ? "—" : `${Math.round(avgCompleteness)}%`,
            accent: "rgba(91,92,255,0.32)",
          },
          {
            label: "Last update",
            value: lastUpdateAt
              ? new Date(lastUpdateAt).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "—",
            accent: "rgba(46,230,166,0.2)",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border px-4 py-3"
            style={{
              borderColor: "rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.02)",
              boxShadow: `inset 0 0 0 1px ${card.accent}`,
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.38)" }}>
              {card.label}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              {metricsLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#2EE6A6" }} />
              ) : null}
              <p className="text-lg font-semibold text-white/90">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input placeholder="Search name / slug, or paste firm record UUID…" value={search} onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }} />
        </div>
        <Select value={filterEnrich} onValueChange={v => { setFilterEnrich(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-36 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All enrichment</SelectItem>
            <SelectItem value="enriched">Enriched</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-40 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="live">LIVE</SelectItem>
            <SelectItem value="needs_review">NEEDS REVIEW</SelectItem>
            <SelectItem value="archive">ARCHIVE</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={() => { void loadRows(); void loadMetrics(); }} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px]" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
        <span className="ml-auto font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{total.toLocaleString()} firms</span>
      </div>

      {/* table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="grid px-4 py-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{ gridTemplateColumns: COL, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span>Firm</span><span>Record ID</span><span>Location</span><span>Stage Focus</span><span>Verticals</span><span>AUM</span><span>Score</span><span>Status</span>
        </div>

        {loading && <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} /></div>}
        {!loading && error && <div className="flex items-center gap-2 px-4 py-10 text-[13px]" style={{ color: "#ef4444" }}><AlertCircle className="h-4 w-4" /> {error}</div>}
        {!loading && !error && rows.length === 0 && <div className="py-14 text-center text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>No firm records found</div>}

        {!loading && !error && rows.map(row => {
          const isSelected = selected?.id === row.id;
          return (
            <div key={row.id}
              onClick={() => setSelected(row)}
              className="grid items-center gap-x-3 border-b px-4 py-3 cursor-pointer transition-colors"
              style={{ gridTemplateColumns: COL, borderColor: "rgba(255,255,255,0.05)", background: isSelected ? "rgba(46,230,166,0.06)" : undefined }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  {(row.logo_url || row.favicon_url) && <img src={externalHref(row.logo_url || row.favicon_url) ?? undefined} alt="" className="h-4 w-4 rounded object-contain shrink-0" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                  <span className="truncate text-[13px] font-medium text-white/90">{row.firm_name}</span>
                  {row.website_url && <a href={externalHref(row.website_url) ?? undefined} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="shrink-0 opacity-30 hover:opacity-70"><ExternalLink className="h-3 w-3" style={{ color: "#2EE6A6" }} /></a>}
                </div>
                <span className="font-mono text-[9px] uppercase" style={{ color: enrichColor(row.enrichment_status) }}>{row.enrichment_status}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate font-mono text-[10px]" title={row.id} style={{ color: "rgba(255,255,255,0.42)" }}>{row.id}</span>
                <button
                  type="button"
                  aria-label={`Copy firm record ID for ${row.firm_name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(row.id).then(
                      () => toast.success("Firm record ID copied"),
                      () => toast.error("Could not copy firm record ID"),
                    );
                  }}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/10 hover:text-white/75"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <span className="truncate text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>{displayLocation(row)}</span>
              <TagChips items={row.stage_focus} max={3} />
              <TagChips items={row.thesis_verticals} max={2} />
              <span className="font-mono text-[12px]" style={{ color: row.aum_usd ? "#e0e0e0" : "rgba(255,255,255,0.2)" }}>{fmtAum(row.aum_usd)}</span>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-8 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <div className="h-full rounded-full" style={{ width: `${row.completeness_score}%`, background: scoreColor(row.completeness_score) }} />
                </div>
                <span className="font-mono text-[10px]" style={{ color: scoreColor(row.completeness_score) }}>{row.completeness_score}</span>
              </div>
              <div className="flex items-center">
                {(() => {
                  const status = getFirmAdminStatus(row);
                  return <span className="rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold" style={firmStatusStyle(status)}>{firmStatusLabel(status)}</span>;
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
          <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))} className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <AddFirmModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={handleFirmCreated} />

      {/* slide-in edit panel */}
      {selected && <FirmEditPanel row={selected} onClose={() => setSelected(null)} onSaved={handleSaved} />}
    </div>
  );
}

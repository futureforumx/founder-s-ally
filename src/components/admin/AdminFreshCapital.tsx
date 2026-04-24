/**
 * AdminFreshCapital — admin console tab for Fund Watch (vc_funds) and Latest Funding (fi_deals_canonical).
 *
 * Reads + writes go through the `admin-fresh-capital-write` edge function (service-role,
 * admin-gated). Falls back gracefully when the function returns 403 or is unreachable.
 */
import { type ReactNode, useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type FundRow = {
  id: string;
  firm_record_id: string;
  name: string;
  fund_type: string | null;
  fund_sequence_number: number | null;
  vintage_year: number | null;
  announced_date: string | null;
  close_date: string | null;
  target_size_usd: number | null;
  final_size_usd: number | null;
  status: string | null;
  stage_focus: string[];
  sector_focus: string[];
  geography_focus: string[];
  announcement_url: string | null;
  announcement_title: string | null;
  manually_verified: boolean;
  verification_status: string;
  likely_actively_deploying: boolean | null;
  source_confidence: number;
  created_at: string;
  updated_at: string;
  firm_records?: {
    firm_name: string;
    website_url: string | null;
    location: string | null;
    logo_url: string | null;
    hq_city: string | null;
    hq_country: string | null;
  };
};

type DealRow = {
  id: string;
  company_name: string;
  company_domain: string | null;
  company_website: string | null;
  company_location: string | null;
  company_logo_url: string | null;
  sector_normalized: string | null;
  round_type_normalized: string | null;
  amount_raw: string | null;
  amount_minor_units: number | null;
  announced_date: string | null;
  lead_investor: string | null;
  co_investors: string[];
  primary_source_url: string | null;
  primary_press_url: string | null;
  source_type: string;
  is_rumor: boolean;
  confidence_score: number;
  needs_review: boolean;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};

// ─── API helper ───────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function callAdminFreshCapital(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  params: Record<string, string>,
  body?: unknown,
): Promise<{ data?: unknown; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };

  // Supabase's edge function gateway rejects RS256 (WorkOS) JWTs even with verify_jwt=false.
  // Fix: always send the anon key (HS256) as Authorization so the gateway accepts the request,
  // then forward the WorkOS JWT in X-User-Auth for our own admin identity check inside the function.
  const userToken = await getSupabaseBearerForFunctions();
  const anonKey = SUPABASE_ANON_KEY ?? "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };
  // Attach real user JWT only when it differs from the anon key (i.e. user is logged in)
  if (userToken && userToken !== anonKey) {
    headers["X-User-Auth"] = `Bearer ${userToken}`;
  }

  const qs = new URLSearchParams(params).toString();
  const url = `${SUPABASE_URL}/functions/v1/admin-fresh-capital-write${qs ? `?${qs}` : ""}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (json as { error?: string; message?: string }).error
        ?? (json as { message?: string }).message
        ?? `HTTP ${res.status}`;
      return { error: msg };
    }
    return { data: json };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const CELL = "px-3 py-2.5 text-[12px] align-top";
const TH = "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-left whitespace-nowrap";

/** Resolve a favicon URL from a logo_url or website URL. */
function faviconSrc(logoUrl: string | null | undefined, websiteUrl: string | null | undefined): string | null {
  if (logoUrl) return logoUrl;
  if (!websiteUrl) return null;
  try {
    const domain = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
  } catch {
    return null;
  }
}

function FaviconImg({
  logoUrl,
  websiteUrl,
  name,
}: {
  logoUrl?: string | null;
  websiteUrl?: string | null;
  name: string;
}) {
  const src = faviconSrc(logoUrl, websiteUrl);
  if (!src) {
    return (
      <div className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-[9px] font-bold uppercase" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
        {name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className="h-6 w-6 shrink-0 rounded-md object-contain"
      style={{ background: "rgba(255,255,255,0.04)" }}
      onError={(e) => {
        const t = e.currentTarget;
        t.style.display = "none";
        const fallback = t.nextElementSibling as HTMLElement | null;
        if (fallback) fallback.style.display = "flex";
      }}
    />
  );
}

function Pill({ label, color = "zinc" }: { label: string; color?: "teal" | "sky" | "zinc" | "amber" }) {
  const cls: Record<string, string> = {
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    zinc: "border-zinc-600/60 bg-zinc-900 text-zinc-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls[color]}`}>
      {label}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.35)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  "w-full rounded-md border px-2.5 py-1.5 text-[12px] outline-none transition-colors bg-[#0d0d0d] text-white/80 placeholder:text-white/20";
const INPUT_STYLE = { borderColor: "rgba(255,255,255,0.1)" };

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_CLS}
      style={INPUT_STYLE}
    />
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_CLS}
      style={INPUT_STYLE}
    />
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS}
      style={INPUT_STYLE}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS}
      style={INPUT_STYLE}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[#2EE6A6]"
      />
      {label}
    </label>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border shadow-2xl"
        style={{ background: "#0d0d0d", borderColor: "rgba(255,255,255,0.1)" }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <span className="text-[13px] font-semibold text-white/80">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/** URL input with a live logo preview thumbnail below it. */
function LogoInput({
  label,
  value,
  onChange,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  return (
    <label className="flex flex-col gap-1 col-span-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.35)" }}>
        {label}
      </span>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        className={INPUT_CLS}
        style={INPUT_STYLE}
      />
      {value.trim() && (
        <div className="flex items-center gap-2 pt-1">
          <img
            src={value.trim()}
            alt={name}
            className="h-8 w-8 rounded-md object-contain shrink-0"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            onError={(e) => {
              e.currentTarget.style.opacity = "0.25";
            }}
          />
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>Preview</span>
        </div>
      )}
    </label>
  );
}

// ─── Pipeline Source Config ───────────────────────────────────────────────────

type PipelineSourceRow = {
  id: string;
  pipeline: string;
  source_key: string;
  name: string;
  description: string | null;
  base_url: string | null;
  enabled: boolean;
  max_items: number;
  cron_schedule: string | null;
  notes: string | null;
  last_run_at: string | null;
  updated_at: string;
};

type SourceEdit = {
  enabled?: boolean;
  max_items?: number;
  cron_schedule?: string | null;
  notes?: string | null;
};

const CRON_PRESETS = [
  { label: "Hourly",      value: "0 * * * *" },
  { label: "Daily 6am",  value: "0 6 * * *" },
  { label: "Daily 9am",  value: "0 9 * * *" },
  { label: "Weekly Mon", value: "0 6 * * 1" },
];

function SourcesModal({
  pipeline,
  onClose,
}: {
  pipeline: "fund-watch" | "latest-funding";
  onClose: () => void;
}) {
  const pipelineKey = pipeline === "fund-watch" ? "vc_funds" : "fi_deals";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [rows, setRows] = useState<PipelineSourceRow[]>([]);
  const [edits, setEdits] = useState<Record<string, SourceEdit>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setApiErr(null);
      const { data, error } = await callAdminFreshCapital("GET", {
        table: "pipeline_source_config",
        pipeline: pipelineKey,
      });
      if (error) { setApiErr(error); setLoading(false); return; }
      setRows(((data as { rows: PipelineSourceRow[] })?.rows) ?? []);
      setLoading(false);
    })();
  }, [pipelineKey]);

  const set = (id: string, patch: Partial<SourceEdit>) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const get = <K extends keyof PipelineSourceRow>(
    row: PipelineSourceRow,
    k: K,
  ): PipelineSourceRow[K] => {
    const ed = edits[row.id];
    if (ed && k in ed) return (ed as unknown as PipelineSourceRow)[k];
    return row[k];
  };

  const hasChanges = Object.keys(edits).length > 0;

  const handleSave = async () => {
    if (!hasChanges) { onClose(); return; }
    setSaving(true);
    setApiErr(null);
    for (const [id, patch] of Object.entries(edits)) {
      const { error } = await callAdminFreshCapital(
        "PATCH",
        { table: "pipeline_source_config", id },
        patch,
      );
      if (error) { setApiErr(error); setSaving(false); return; }
    }
    setSaving(false);
    onClose();
  };

  const title = pipeline === "fund-watch" ? "Fund Watch" : "Latest Funding";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl border shadow-2xl"
        style={{ background: "#0d0d0d", borderColor: "rgba(255,255,255,0.1)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" style={{ color: "#2EE6A6" }} />
              <span className="text-[13px] font-semibold text-white/80">
                {title} — Sources &amp; Schedule
              </span>
            </div>
            <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Toggle sources on/off, set max items per run, and configure cron schedules.
              Changes apply on the next pipeline run.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {apiErr && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {apiErr}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <table className="w-full border-collapse text-white/70">
                <thead>
                  <tr style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Source</th>
                    <th className={TH} style={{ color: "rgba(255,255,255,0.35)", width: 90 }}>Max Items</th>
                    <th className={TH} style={{ color: "rgba(255,255,255,0.35)", width: 180 }}>
                      Cron Schedule
                    </th>
                    <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Notes</th>
                    <th className={TH} style={{ color: "rgba(255,255,255,0.35)", width: 72 }}>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const enabled = get(row, "enabled");
                    const cronVal = String(get(row, "cron_schedule") ?? "");
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          opacity: enabled ? 1 : 0.45,
                        }}
                      >
                        {/* Source info */}
                        <td className="px-3 py-3 align-top">
                          <div className="text-[12px] font-medium text-white/80">{row.name}</div>
                          {row.base_url && (
                            <a
                              href={row.base_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-[10px] hover:underline"
                              style={{ color: "rgba(255,255,255,0.3)" }}
                            >
                              {row.base_url.replace(/^https?:\/\//, "").slice(0, 40)}
                              {row.base_url.length > 40 && "…"}
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          )}
                          {row.description && (
                            <p
                              className="mt-0.5 text-[10px] leading-snug"
                              style={{ color: "rgba(255,255,255,0.22)" }}
                            >
                              {row.description}
                            </p>
                          )}
                        </td>

                        {/* Max items */}
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            value={String(get(row, "max_items") ?? 100)}
                            onChange={(e) =>
                              set(row.id, { max_items: Math.max(1, parseInt(e.target.value) || 100) })
                            }
                            className="w-20 rounded-md border px-2 py-1 text-[12px] outline-none bg-[#0d0d0d] text-white/80"
                            style={{ borderColor: "rgba(255,255,255,0.1)" }}
                          />
                        </td>

                        {/* Cron schedule */}
                        <td className="px-3 py-3 align-top">
                          <input
                            type="text"
                            value={cronVal}
                            onChange={(e) =>
                              set(row.id, { cron_schedule: e.target.value.trim() || null })
                            }
                            placeholder="0 6 * * *"
                            className="w-full rounded-md border px-2 py-1 text-[12px] font-mono outline-none bg-[#0d0d0d] text-white/80 placeholder:text-white/20"
                            style={{ borderColor: "rgba(255,255,255,0.1)" }}
                          />
                          <div className="mt-1 flex flex-wrap gap-1">
                            {CRON_PRESETS.map((p) => (
                              <button
                                key={p.value}
                                type="button"
                                onClick={() => set(row.id, { cron_schedule: p.value })}
                                className="rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors"
                                style={{
                                  background:
                                    cronVal === p.value
                                      ? "rgba(46,230,166,0.15)"
                                      : "rgba(255,255,255,0.04)",
                                  color:
                                    cronVal === p.value
                                      ? "#2EE6A6"
                                      : "rgba(255,255,255,0.3)",
                                  border: "1px solid",
                                  borderColor:
                                    cronVal === p.value
                                      ? "rgba(46,230,166,0.3)"
                                      : "rgba(255,255,255,0.08)",
                                }}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Notes */}
                        <td className="px-3 py-3 align-top">
                          <input
                            type="text"
                            value={String(get(row, "notes") ?? "")}
                            onChange={(e) =>
                              set(row.id, { notes: e.target.value || null })
                            }
                            placeholder="Optional notes…"
                            className="w-full rounded-md border px-2 py-1 text-[12px] outline-none bg-[#0d0d0d] text-white/80 placeholder:text-white/20"
                            style={{ borderColor: "rgba(255,255,255,0.1)" }}
                          />
                        </td>

                        {/* Enabled toggle */}
                        <td className="px-3 py-3 align-top text-center">
                          <button
                            type="button"
                            onClick={() => set(row.id, { enabled: !enabled })}
                            className="inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors"
                            style={{
                              background: enabled ? "#2EE6A6" : "rgba(255,255,255,0.1)",
                              borderColor: enabled ? "#2EE6A6" : "rgba(255,255,255,0.15)",
                            }}
                            role="switch"
                            aria-checked={enabled}
                          >
                            <span
                              className="pointer-events-none my-auto h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                              style={{ transform: enabled ? "translateX(16px)" : "translateX(2px)" }}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Cron reference */}
          {!loading && (
            <div
              className="rounded-md border px-3 py-2.5"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
            >
              <p
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                Cron format&nbsp;&nbsp;
                <span style={{ color: "rgba(255,255,255,0.18)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  minute · hour · day-of-month · month · day-of-week
                </span>
              </p>
              <div
                className="grid grid-cols-4 gap-x-4 gap-y-0.5 text-[10px]"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                <span><code className="mr-1.5 text-white/40">0 * * * *</code>Hourly</span>
                <span><code className="mr-1.5 text-white/40">0 6 * * *</code>Daily 6am</span>
                <span><code className="mr-1.5 text-white/40">0 9 * * *</code>Daily 9am</span>
                <span><code className="mr-1.5 text-white/40">0 6 * * 1</code>Weekly Mon</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-5 py-4"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            {hasChanges
              ? `${Object.keys(edits).length} source${Object.keys(edits).length === 1 ? "" : "s"} modified`
              : "No unsaved changes"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: "#2EE6A6", color: "#000" }}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {hasChanges ? "Save Changes" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Fund Watch ───────────────────────────────────────────────────────────────

const FUND_STATUS_OPTIONS = [
  { value: "", label: "— status —" },
  { value: "announced", label: "Announced" },
  { value: "first_close", label: "First Close" },
  { value: "final_close", label: "Final Close" },
  { value: "closed", label: "Closed" },
  { value: "rumored", label: "Rumored" },
];

type FundFormState = {
  firm_name: string;
  firm_record_id: string;
  firm_logo_url: string;
  name: string;
  fund_type: string;
  announced_date: string;
  target_size_usd: string;
  final_size_usd: string;
  status: string;
  stage_focus: string;
  sector_focus: string;
  geography_focus: string;
  announcement_url: string;
  announcement_title: string;
  manually_verified: boolean;
  likely_actively_deploying: boolean;
};

const EMPTY_FUND: FundFormState = {
  firm_name: "",
  firm_record_id: "",
  firm_logo_url: "",
  name: "",
  fund_type: "",
  announced_date: "",
  target_size_usd: "",
  final_size_usd: "",
  status: "announced",
  stage_focus: "",
  sector_focus: "",
  geography_focus: "",
  announcement_url: "",
  announcement_title: "",
  manually_verified: false,
  likely_actively_deploying: false,
};

function fundToForm(row: FundRow): FundFormState {
  return {
    firm_name: row.firm_records?.firm_name ?? "",
    firm_record_id: row.firm_record_id,
    firm_logo_url: row.firm_records?.logo_url ?? "",
    name: row.name,
    fund_type: row.fund_type ?? "",
    announced_date: row.announced_date ?? "",
    target_size_usd: row.target_size_usd != null ? String(row.target_size_usd) : "",
    final_size_usd: row.final_size_usd != null ? String(row.final_size_usd) : "",
    status: row.status ?? "announced",
    stage_focus: (row.stage_focus ?? []).join(", "),
    sector_focus: (row.sector_focus ?? []).join(", "),
    geography_focus: (row.geography_focus ?? []).join(", "),
    announcement_url: row.announcement_url ?? "",
    announcement_title: row.announcement_title ?? "",
    manually_verified: row.manually_verified,
    likely_actively_deploying: row.likely_actively_deploying ?? false,
  };
}

function formToFundPayload(f: FundFormState) {
  const csvToArray = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  return {
    // fund fields
    firm_name: f.firm_name || undefined,
    firm_record_id: f.firm_record_id || undefined,
    name: f.name,
    fund_type: f.fund_type || null,
    announced_date: f.announced_date || null,
    target_size_usd: f.target_size_usd ? parseFloat(f.target_size_usd) : null,
    final_size_usd: f.final_size_usd ? parseFloat(f.final_size_usd) : null,
    status: f.status || null,
    stage_focus: csvToArray(f.stage_focus),
    sector_focus: csvToArray(f.sector_focus),
    geography_focus: csvToArray(f.geography_focus),
    announcement_url: f.announcement_url || null,
    announcement_title: f.announcement_title || null,
    manually_verified: f.manually_verified,
    likely_actively_deploying: f.likely_actively_deploying,
    // firm logo — handled separately via firm_records PATCH, passed through for the save handler
    _firm_logo_url: f.firm_logo_url.trim() || null,
  };
}

function FundForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial: FundFormState;
  onSave: (payload: ReturnType<typeof formToFundPayload>) => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<FundFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const set = (k: keyof FundFormState) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setFormErr("Fund name is required"); return; }
    if (isNew && !form.firm_name.trim() && !form.firm_record_id.trim()) {
      setFormErr("Firm name or firm_record_id is required for new funds");
      return;
    }
    setSaving(true);
    setFormErr(null);
    await onSave(formToFundPayload(form));
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {formErr && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {formErr}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {isNew && (
          <Field label="Firm Name (or enter firm_record_id below)">
            <TextInput value={form.firm_name} onChange={set("firm_name")} placeholder="Acme Ventures" />
          </Field>
        )}
        {isNew && (
          <Field label="Firm Record ID (UUID, optional if firm name given)">
            <TextInput value={form.firm_record_id} onChange={set("firm_record_id")} placeholder="uuid…" />
          </Field>
        )}
        <Field label="Fund Name *">
          <TextInput value={form.name} onChange={set("name")} placeholder="Fund III" />
        </Field>
        <Field label="Fund Type">
          <TextInput value={form.fund_type} onChange={set("fund_type")} placeholder="Venture, Growth, CVC…" />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={set("status")} options={FUND_STATUS_OPTIONS} />
        </Field>
        <Field label="Announced Date">
          <DateInput value={form.announced_date} onChange={set("announced_date")} />
        </Field>
        <Field label="Target Size (USD)">
          <NumberInput value={form.target_size_usd} onChange={set("target_size_usd")} placeholder="250000000" />
        </Field>
        <Field label="Final Size (USD)">
          <NumberInput value={form.final_size_usd} onChange={set("final_size_usd")} placeholder="300000000" />
        </Field>
        <Field label="Stage Focus (comma-separated)">
          <TextInput value={form.stage_focus} onChange={set("stage_focus")} placeholder="Seed, Series A" />
        </Field>
        <Field label="Sector Focus (comma-separated)">
          <TextInput value={form.sector_focus} onChange={set("sector_focus")} placeholder="AI, Fintech" />
        </Field>
        <Field label="Geography Focus (comma-separated)">
          <TextInput value={form.geography_focus} onChange={set("geography_focus")} placeholder="US, Europe" />
        </Field>
        <Field label="Announcement URL">
          <TextInput value={form.announcement_url} onChange={set("announcement_url")} placeholder="https://…" />
        </Field>
        <Field label="Announcement Title">
          <TextInput value={form.announcement_title} onChange={set("announcement_title")} placeholder="Firm raises $250M Fund III" />
        </Field>
        <LogoInput
          label="Firm Logo URL"
          value={form.firm_logo_url}
          onChange={set("firm_logo_url")}
          name={form.firm_name || form.name}
        />
      </div>

      <div className="flex gap-4 pt-1">
        <Checkbox checked={form.manually_verified} onChange={set("manually_verified")} label="Manually verified" />
        <Checkbox
          checked={form.likely_actively_deploying}
          onChange={set("likely_actively_deploying")}
          label="Likely actively deploying"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
          style={{ background: "#2EE6A6", color: "#000" }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {isNew ? "Create Fund" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function FundWatchSection() {
  const [rows, setRows] = useState<FundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<FundRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    const params: Record<string, string> = { table: "vc_funds", limit: "80" };
    if (search) params.search = search;
    const { data, error } = await callAdminFreshCapital("GET", params);
    if (error) { setApiError(error); setLoading(false); return; }
    setRows(((data as { rows: FundRow[] })?.rows) ?? []);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (id: string, payload: ReturnType<typeof formToFundPayload>) => {
    // Strip fields that don't exist as vc_funds columns:
    //   _firm_logo_url — internal; applied to firm_records separately
    //   firm_name      — lives in firm_records, not vc_funds; causes 500 on PATCH
    const { _firm_logo_url, firm_name: _firmName, ...fundPayload } = payload;

    const { error } = await callAdminFreshCapital("PATCH", { table: "vc_funds", id }, fundPayload);
    if (error) { showToast(`Error: ${error}`); return; }

    // Also update the firm's logo if changed
    if (_firm_logo_url !== undefined && editRow?.firm_record_id) {
      const { error: logoErr } = await callAdminFreshCapital(
        "PATCH",
        { table: "firm_records", id: editRow.firm_record_id },
        { logo_url: _firm_logo_url },
      );
      if (logoErr) { showToast(`Fund saved, but logo update failed: ${logoErr}`); await load(); return; }
    }

    setEditRow(null);
    showToast("Fund updated");
    await load();
  };

  const handleCreate = async (payload: ReturnType<typeof formToFundPayload>) => {
    // Strip the internal logo field — logo is applied to the auto-created firm record after creation
    const { _firm_logo_url, ...fundPayload } = payload;
    const { data, error } = await callAdminFreshCapital("POST", { table: "vc_funds" }, fundPayload);
    if (error) { showToast(`Error: ${error}`); return; }

    // If a logo URL was provided and we got a firm_record_id back, update the firm record
    if (_firm_logo_url) {
      const newRow = (data as { row?: { firm_record_id?: string } })?.row;
      if (newRow?.firm_record_id) {
        await callAdminFreshCapital(
          "PATCH",
          { table: "firm_records", id: newRow.firm_record_id },
          { logo_url: _firm_logo_url },
        );
      }
    }

    setShowNew(false);
    showToast("Fund created");
    await load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete fund "${name}"? This soft-deletes it from the feed.`)) return;
    const { error } = await callAdminFreshCapital("DELETE", { table: "vc_funds", id });
    if (error) { showToast(`Error: ${error}`); return; }
    showToast("Fund removed");
    await load();
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-emerald-500/30 bg-emerald-900/80 px-4 py-2.5 text-[12px] font-medium text-emerald-200 shadow-xl backdrop-blur-sm">
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by fund name…"
            className="w-full rounded-md border bg-[#0d0d0d] py-1.5 pl-8 pr-3 text-[12px] text-white/70 outline-none placeholder:text-white/20"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          />
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
        >
          <RefreshCw className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
          style={{ background: "#2EE6A6", color: "#000" }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Fund
        </button>
        <button
          type="button"
          onClick={() => setShowSources(true)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Sources
        </button>
      </div>

      {showSources && (
        <SourcesModal pipeline="fund-watch" onClose={() => setShowSources(false)} />
      )}

      {apiError && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-white/70">
            <thead>
              <tr style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="px-2 py-2 w-8" />
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Firm</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Fund</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Size</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Announced</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Themes</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Geo Focus</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Stage</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Status</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {apiError ? "Could not load funds" : "No funds found"}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const size = row.final_size_usd ?? row.target_size_usd;
                  const sizeLabel = size != null
                    ? size >= 1_000_000_000
                      ? `$${(size / 1e9).toFixed(1)}B`
                      : `$${(size / 1e6).toFixed(0)}M`
                    : "—";

                  return (
                    <>
                      <tr
                        key={row.id}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <td className="px-2 py-2.5 align-top w-8">
                          <FaviconImg
                            logoUrl={row.firm_records?.logo_url}
                            websiteUrl={row.firm_records?.website_url}
                            name={row.firm_records?.firm_name ?? row.name}
                          />
                        </td>
                        <td className={CELL}>
                          <span className="font-medium text-white/80">
                            {row.firm_records?.firm_name ?? "—"}
                          </span>
                        </td>
                        <td className={CELL}>
                          <span className="max-w-[180px] block truncate">{row.name}</span>
                        </td>
                        <td className={`${CELL} tabular-nums whitespace-nowrap`}>{sizeLabel}</td>
                        <td className={`${CELL} whitespace-nowrap`}>{row.announced_date ?? "—"}</td>
                        <td className={CELL}>
                          <div className="flex flex-wrap gap-1 max-w-[140px]">
                            {(row.sector_focus ?? []).slice(0, 2).map((s) => (
                              <Pill key={s} label={s} color="teal" />
                            ))}
                            {(row.sector_focus ?? []).length > 2 && (
                              <Pill label={`+${(row.sector_focus ?? []).length - 2}`} color="zinc" />
                            )}
                            {(row.sector_focus ?? []).length === 0 && <span className="text-white/20">—</span>}
                          </div>
                        </td>
                        <td className={CELL}>
                          <div className="flex flex-wrap gap-1 max-w-[120px]">
                            {(row.geography_focus ?? []).slice(0, 2).map((g) => (
                              <Pill key={g} label={g} color="sky" />
                            ))}
                            {(row.geography_focus ?? []).length > 2 && (
                              <Pill label={`+${(row.geography_focus ?? []).length - 2}`} color="zinc" />
                            )}
                            {(row.geography_focus ?? []).length === 0 && <span className="text-white/20">—</span>}
                          </div>
                        </td>
                        <td className={CELL}>
                          <div className="flex flex-wrap gap-1">
                            {(row.stage_focus ?? []).slice(0, 2).map((s) => (
                              <Pill key={s} label={s} color="sky" />
                            ))}
                          </div>
                        </td>
                        <td className={CELL}>
                          <Pill
                            label={row.manually_verified ? "Verified" : (row.status ?? "—")}
                            color={row.manually_verified ? "teal" : "zinc"}
                          />
                        </td>
                        <td className={CELL}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditRow(row); }}
                              className="rounded p-1 transition-colors hover:bg-white/10"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" style={{ color: "#2EE6A6" }} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDelete(row.id, row.name); }}
                              className="rounded p-1 transition-colors hover:bg-red-500/10"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400/60" />
                            </button>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.25)" }} />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.25)" }} />
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.id}-expanded`} style={{ background: "rgba(46,230,166,0.02)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid grid-cols-3 gap-3 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                              <div><span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">Deploying</span><br />{row.likely_actively_deploying == null ? "Unknown" : row.likely_actively_deploying ? "Yes" : "No"}</div>
                              {row.announcement_url && (
                                <div className="col-span-2">
                                  <span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">Source</span><br />
                                  <a href={row.announcement_url} target="_blank" rel="noopener" className="text-[#2EE6A6]/70 underline underline-offset-2 hover:text-[#2EE6A6]">
                                    {row.announcement_title ?? row.announcement_url}
                                  </a>
                                </div>
                              )}
                              <div><span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">Fund ID</span><br /><span className="font-mono">{row.id}</span></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editRow && (
        <Modal title={`Edit — ${editRow.firm_records?.firm_name ?? "Fund"} · ${editRow.name}`} onClose={() => setEditRow(null)}>
          <FundForm
            initial={fundToForm(editRow)}
            isNew={false}
            onSave={(payload) => handleSave(editRow.id, payload)}
            onCancel={() => setEditRow(null)}
          />
        </Modal>
      )}

      {/* New modal */}
      {showNew && (
        <Modal title="New VC Fund" onClose={() => setShowNew(false)}>
          <FundForm
            initial={EMPTY_FUND}
            isNew={true}
            onSave={handleCreate}
            onCancel={() => setShowNew(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Latest Funding ───────────────────────────────────────────────────────────

type DealFormState = {
  company_name: string;
  company_logo_url: string;
  company_website: string;
  company_location: string;
  sector_normalized: string;
  round_type_normalized: string;
  amount_raw: string;
  announced_date: string;
  lead_investor: string;
  co_investors: string;
  primary_source_url: string;
  is_rumor: boolean;
  needs_review: boolean;
  review_reason: string;
  confidence_score: string;
};

const EMPTY_DEAL: DealFormState = {
  company_name: "",
  company_logo_url: "",
  company_website: "",
  company_location: "",
  sector_normalized: "",
  round_type_normalized: "",
  amount_raw: "",
  announced_date: "",
  lead_investor: "",
  co_investors: "",
  primary_source_url: "",
  is_rumor: false,
  needs_review: false,
  review_reason: "",
  confidence_score: "0.85",
};

function dealToForm(row: DealRow): DealFormState {
  return {
    company_name: row.company_name,
    company_logo_url: row.company_logo_url ?? "",
    company_website: row.company_website ?? "",
    company_location: row.company_location ?? "",
    sector_normalized: row.sector_normalized ?? "",
    round_type_normalized: row.round_type_normalized ?? "",
    amount_raw: row.amount_raw ?? "",
    announced_date: row.announced_date ?? "",
    lead_investor: row.lead_investor ?? "",
    co_investors: (row.co_investors ?? []).join(", "),
    primary_source_url: row.primary_source_url ?? "",
    is_rumor: row.is_rumor,
    needs_review: row.needs_review,
    review_reason: row.review_reason ?? "",
    confidence_score: String(row.confidence_score),
  };
}

function formToDealPayload(f: DealFormState) {
  return {
    company_name: f.company_name,
    company_logo_url: f.company_logo_url.trim() || null,
    company_website: f.company_website || null,
    company_location: f.company_location || null,
    sector_normalized: f.sector_normalized || null,
    round_type_normalized: f.round_type_normalized || null,
    amount_raw: f.amount_raw || null,
    announced_date: f.announced_date || null,
    lead_investor: f.lead_investor || null,
    co_investors: f.co_investors
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    primary_source_url: f.primary_source_url || null,
    is_rumor: f.is_rumor,
    needs_review: f.needs_review,
    review_reason: f.review_reason || null,
    confidence_score: f.confidence_score ? parseFloat(f.confidence_score) : 0.85,
  };
}

function DealForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial: DealFormState;
  onSave: (payload: ReturnType<typeof formToDealPayload>) => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<DealFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const set = (k: keyof DealFormState) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.company_name.trim()) { setFormErr("Company name is required"); return; }
    setSaving(true);
    setFormErr(null);
    await onSave(formToDealPayload(form));
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {formErr && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {formErr}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Company Name *">
          <TextInput value={form.company_name} onChange={set("company_name")} placeholder="Acme Inc." />
        </Field>
        <Field label="Company Website">
          <TextInput value={form.company_website} onChange={set("company_website")} placeholder="https://…" />
        </Field>
        <LogoInput
          label="Company Logo URL"
          value={form.company_logo_url}
          onChange={set("company_logo_url")}
          name={form.company_name}
        />
        <Field label="Location">
          <TextInput value={form.company_location} onChange={set("company_location")} placeholder="San Francisco, CA" />
        </Field>
        <Field label="Sector">
          <TextInput value={form.sector_normalized} onChange={set("sector_normalized")} placeholder="AI, Fintech…" />
        </Field>
        <Field label="Round Type">
          <TextInput value={form.round_type_normalized} onChange={set("round_type_normalized")} placeholder="Series A" />
        </Field>
        <Field label="Amount (display label)">
          <TextInput value={form.amount_raw} onChange={set("amount_raw")} placeholder="$20M" />
        </Field>
        <Field label="Announced Date">
          <DateInput value={form.announced_date} onChange={set("announced_date")} />
        </Field>
        <Field label="Lead Investor">
          <TextInput value={form.lead_investor} onChange={set("lead_investor")} placeholder="Sequoia Capital" />
        </Field>
        <Field label="Co-investors (comma-separated)">
          <TextInput value={form.co_investors} onChange={set("co_investors")} placeholder="a16z, Index Ventures" />
        </Field>
        <Field label="Source URL">
          <TextInput value={form.primary_source_url} onChange={set("primary_source_url")} placeholder="https://techcrunch.com/…" />
        </Field>
        <Field label="Confidence (0–1)">
          <NumberInput value={form.confidence_score} onChange={set("confidence_score")} placeholder="0.85" />
        </Field>
        <Field label="Review Reason">
          <TextInput value={form.review_reason} onChange={set("review_reason")} placeholder="Why flagged for review…" />
        </Field>
      </div>

      <div className="flex gap-4 pt-1">
        <Checkbox checked={form.is_rumor} onChange={set("is_rumor")} label="Mark as rumor" />
        <Checkbox checked={form.needs_review} onChange={set("needs_review")} label="Needs review" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-50"
          style={{ background: "#2EE6A6", color: "#000" }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {isNew ? "Create Deal" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function LatestFundingSection() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<DealRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    const params: Record<string, string> = { table: "fi_deals_canonical", limit: "80" };
    if (search) params.search = search;
    const { data, error } = await callAdminFreshCapital("GET", params);
    if (error) { setApiError(error); setLoading(false); return; }
    setRows(((data as { rows: DealRow[] })?.rows) ?? []);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (id: string, payload: ReturnType<typeof formToDealPayload>) => {
    const { error } = await callAdminFreshCapital("PATCH", { table: "fi_deals_canonical", id }, payload);
    if (error) { showToast(`Error: ${error}`); return; }
    setEditRow(null);
    showToast("Deal updated");
    await load();
  };

  const handleCreate = async (payload: ReturnType<typeof formToDealPayload>) => {
    const { error } = await callAdminFreshCapital("POST", { table: "fi_deals_canonical" }, payload);
    if (error) { showToast(`Error: ${error}`); return; }
    setShowNew(false);
    showToast("Deal created");
    await load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete deal for "${name}"? This is permanent.`)) return;
    const { error } = await callAdminFreshCapital("DELETE", { table: "fi_deals_canonical", id });
    if (error) { showToast(`Error: ${error}`); return; }
    showToast("Deal deleted");
    await load();
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-emerald-500/30 bg-emerald-900/80 px-4 py-2.5 text-[12px] font-medium text-emerald-200 shadow-xl backdrop-blur-sm">
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name…"
            className="w-full rounded-md border bg-[#0d0d0d] py-1.5 pl-8 pr-3 text-[12px] text-white/70 outline-none placeholder:text-white/20"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          />
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
        >
          <RefreshCw className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
          style={{ background: "#2EE6A6", color: "#000" }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Deal
        </button>
        <button
          type="button"
          onClick={() => setShowSources(true)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Sources
        </button>
      </div>

      {showSources && (
        <SourcesModal pipeline="latest-funding" onClose={() => setShowSources(false)} />
      )}

      {apiError && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-white/70">
            <thead>
              <tr style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="px-2 py-2 w-8" />
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Company</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Round</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Amount</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Date</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Sector</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Lead Investor</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Co-investors</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Flags</th>
                <th className={TH} style={{ color: "rgba(255,255,255,0.35)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {apiError ? "Could not load deals" : "No deals found"}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const coInvestors = row.co_investors ?? [];
                  return (
                    <>
                      <tr
                        key={row.id}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <td className="px-2 py-2.5 align-top w-8">
                          <FaviconImg
                            logoUrl={row.company_logo_url}
                            websiteUrl={row.company_website ?? (row.company_domain ? `https://${row.company_domain}` : null)}
                            name={row.company_name}
                          />
                        </td>
                        <td className={CELL}>
                          <span className="font-medium text-white/80">{row.company_name}</span>
                        </td>
                        <td className={CELL}>
                          {row.round_type_normalized ? <Pill label={row.round_type_normalized} color="sky" /> : "—"}
                        </td>
                        <td className={`${CELL} tabular-nums whitespace-nowrap`}>{row.amount_raw ?? "—"}</td>
                        <td className={`${CELL} whitespace-nowrap`}>{row.announced_date ?? "—"}</td>
                        <td className={CELL}>{row.sector_normalized ?? "—"}</td>
                        <td className={CELL}>
                          <span className="max-w-[140px] block truncate">{row.lead_investor ?? "—"}</span>
                        </td>
                        <td className={CELL}>
                          {coInvestors.length === 0 ? (
                            <span className="text-white/20">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {coInvestors.slice(0, 2).map((c) => (
                                <Pill key={c} label={c} color="zinc" />
                              ))}
                              {coInvestors.length > 2 && (
                                <Pill label={`+${coInvestors.length - 2}`} color="zinc" />
                              )}
                            </div>
                          )}
                        </td>
                        <td className={CELL}>
                          <div className="flex gap-1">
                            {row.is_rumor && <Pill label="Rumor" color="amber" />}
                            {row.needs_review && <Pill label="Review" color="amber" />}
                          </div>
                        </td>
                        <td className={CELL}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditRow(row); }}
                              className="rounded p-1 transition-colors hover:bg-white/10"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" style={{ color: "#2EE6A6" }} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDelete(row.id, row.company_name); }}
                              className="rounded p-1 transition-colors hover:bg-red-500/10"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400/60" />
                            </button>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.25)" }} />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.25)" }} />
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.id}-expanded`} style={{ background: "rgba(46,230,166,0.02)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid grid-cols-3 gap-3 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                              <div>
                                <span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">Location</span>
                                <br />{row.company_location ?? "—"}
                              </div>
                              <div>
                                <span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">Confidence</span>
                                <br />{(row.confidence_score * 100).toFixed(0)}%
                              </div>
                              {row.primary_source_url && (
                                <div className="col-span-1">
                                  <span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">Source</span>
                                  <br />
                                  <a href={row.primary_source_url} target="_blank" rel="noopener" className="text-[#2EE6A6]/70 underline underline-offset-2 hover:text-[#2EE6A6] break-all">
                                    {row.primary_source_url}
                                  </a>
                                </div>
                              )}
                              {row.review_reason && (
                                <div className="col-span-3">
                                  <span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">Review Reason</span>
                                  <br />{row.review_reason}
                                </div>
                              )}
                              <div><span className="font-semibold text-white/30 uppercase tracking-widest text-[9px]">ID</span><br /><span className="font-mono">{row.id}</span></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editRow && (
        <Modal title={`Edit — ${editRow.company_name}`} onClose={() => setEditRow(null)}>
          <DealForm
            initial={dealToForm(editRow)}
            isNew={false}
            onSave={(payload) => handleSave(editRow.id, payload)}
            onCancel={() => setEditRow(null)}
          />
        </Modal>
      )}

      {showNew && (
        <Modal title="New Funding Deal" onClose={() => setShowNew(false)}>
          <DealForm
            initial={EMPTY_DEAL}
            isNew={true}
            onSave={handleCreate}
            onCancel={() => setShowNew(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

const MAIN_TABS = [
  { id: "fund-watch" as const, label: "Fund Watch" },
  { id: "latest-funding" as const, label: "Latest Funding" },
] as const;

type MainTab = (typeof MAIN_TABS)[number]["id"];

export function AdminFreshCapital() {
  const [tab, setTab] = useState<MainTab>("fund-watch");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="h-4 w-4 shrink-0" style={{ color: "#2EE6A6" }} />
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#2EE6A6" }}>
            Fresh Capital
          </h2>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Manage vc_funds (Fund Watch) and fi_deals_canonical (Latest Funding) — direct table CRUD via service role
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div
        className="inline-flex gap-1 rounded-lg border p-1"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#0a0a0a" }}
      >
        {MAIN_TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="rounded-md px-4 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: isActive ? "rgba(46,230,166,0.1)" : "transparent",
                color: isActive ? "#2EE6A6" : "rgba(255,255,255,0.4)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "fund-watch" && <FundWatchSection />}
      {tab === "latest-funding" && <LatestFundingSection />}
    </div>
  );
}

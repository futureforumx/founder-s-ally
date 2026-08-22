/**
 * Fresh Capital admin — enrichment sources, schedules, pipeline docs, and run monitors.
 * Reads/writes via admin-market-intel (fi_sources patch + telemetry tables).
 */

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Loader2,
  Clock,
  Database,
  GitBranch,
  AlertCircle,
  Save,
  Plus,
} from "lucide-react";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  FUND_WATCH_FEED_SOURCES,
  isPipelineSourceEnabled,
  lastScannedFromSyncRun,
  normalizeDisabledSourceKeys,
  normalizeSourceUrl,
  slugFromSourceName,
  withSourceEnabled,
} from "@/lib/freshCapitalPipelineSources";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function adminHeaders(): Promise<Record<string, string>> {
  const jwt = await getSupabaseBearerForFunctions();
  const anon = SUPABASE_ANON_KEY ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anon}`,
    apikey: anon,
    "X-User-Auth": jwt ?? "",
  };
}

async function fetchJson<T>(path: string): Promise<{ data?: T; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${path}`, {
      headers: await adminHeaders(),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { data: json as T };
  } catch (e: unknown) {
    return { error: (e as Error)?.message ?? String(e) };
  }
}

type FiSourceRow = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  adapter_key: string;
  source_type: string;
  credibility_score: number;
  active: boolean;
  poll_interval_minutes: number;
  metadata: Record<string, unknown>;
  last_fetched_at: string | null;
  updated_at: string;
};

type FiFetchRunRow = {
  id: string;
  source_id: string;
  source_slug?: string | null;
  source_name?: string | null;
  run_mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  docs_fetched: number;
  deals_upserted: number;
  error_count: number;
  error_summary: string | null;
};

type VcSyncRunRow = {
  id: string;
  phase: string;
  status: string;
  dry_run: boolean;
  stats: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type DailySyncRow = {
  id: string | null;
  completed_at: string | null;
  started_at: string | null;
  stats: Record<string, unknown> | null;
};

type FcEnrichmentSettingsRow = {
  id: string;
  fund_watch_source_keys: string | null;
  fund_watch_schedule_note: string | null;
  latest_funding_schedule_note: string | null;
  process_notes: string | null;
  disabled_source_keys: string[];
  updated_at: string;
};

const EMPTY_FC_ENRICHMENT: FcEnrichmentSettingsRow = {
  id: "default",
  fund_watch_source_keys: "",
  fund_watch_schedule_note: "",
  latest_funding_schedule_note: "",
  process_notes: "",
  disabled_source_keys: [],
  updated_at: "",
};

const HDR: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "monospace",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.35)",
  padding: "8px 10px",
};

const CELL: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 11,
  color: "rgba(255,255,255,0.78)",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function FreshCapitalEnrichmentAdmin() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<FiSourceRow[]>([]);
  const [fetchRuns, setFetchRuns] = useState<FiFetchRunRow[]>([]);
  const [syncRuns, setSyncRuns] = useState<VcSyncRunRow[]>([]);
  const [syncLatest, setSyncLatest] = useState<VcSyncRunRow[]>([]);
  const [dailySync, setDailySync] = useState<DailySyncRow | null>(null);
  const [fcSettings, setFcSettings] = useState<FcEnrichmentSettingsRow>(EMPTY_FC_ENRICHMENT);
  const [fcSettingsError, setFcSettingsError] = useState<string | null>(null);
  const [savingFcSettings, setSavingFcSettings] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<FiSourceRow>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const lim = "limit=60&offset=0";
    const [
      srcRes,
      fetchRes,
      syncRes,
      latestRes,
      dailyRes,
      fcRes,
    ] = await Promise.all([
      fetchJson<{ rows: FiSourceRow[]; total: number }>(`entity=fisources&${lim}`),
      fetchJson<{ rows: FiFetchRunRow[] }>(`entity=fifetchruns&${lim}`),
      fetchJson<{ rows: VcSyncRunRow[] }>(`entity=vcfundsyncruns&${lim}`),
      fetchJson<{ rows: VcSyncRunRow[] }>(`entity=vcfundsynclatest`),
      fetchJson<{ row: DailySyncRow | null }>(`entity=latestvcdailysync`),
      fetchJson<{ row: FcEnrichmentSettingsRow | null }>(`entity=fcenrichmentsettings`),
    ]);
    setFcSettingsError(fcRes.error ?? null);
    if (fcRes.data?.row) {
      const r = fcRes.data.row;
      setFcSettings({
        id: r.id,
        fund_watch_source_keys: r.fund_watch_source_keys ?? "",
        fund_watch_schedule_note: r.fund_watch_schedule_note ?? "",
        latest_funding_schedule_note: r.latest_funding_schedule_note ?? "",
        process_notes: r.process_notes ?? "",
        disabled_source_keys: normalizeDisabledSourceKeys(r.disabled_source_keys),
        updated_at: r.updated_at,
      });
    } else if (!fcRes.error) {
      setFcSettings(EMPTY_FC_ENRICHMENT);
    }
    const errMsg =
      srcRes.error ??
      fetchRes.error ??
      syncRes.error ??
      latestRes.error ??
      dailyRes.error ??
      null;
    if (errMsg) setError(errMsg);
    if (srcRes.data?.rows) setSources(srcRes.data.rows);
    if (fetchRes.data?.rows) setFetchRuns(fetchRes.data.rows);
    if (syncRes.data?.rows) setSyncRuns(syncRes.data.rows);
    if (latestRes.data?.rows) setSyncLatest(latestRes.data.rows);
    setDailySync(dailyRes.data?.row ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = (id: string, patch: Partial<FiSourceRow>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  const saveSource = async (row: FiSourceRow) => {
    const d = drafts[row.id];
    if (!d || !Object.keys(d).length) {
      toast.message("No changes to save");
      return;
    }
    setSavingId(row.id);
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.poll_interval_minutes !== undefined) patch.poll_interval_minutes = d.poll_interval_minutes;
    if (d.credibility_score !== undefined) patch.credibility_score = d.credibility_score;
    try {
      if (!SUPABASE_URL) throw new Error("Supabase not configured");
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fisources&id=${encodeURIComponent(row.id)}`,
        { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(patch) },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success("Source updated");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      void load();
    } catch (e: unknown) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSavingId(null);
    }
  };

  const displaySource = (row: FiSourceRow): FiSourceRow => ({ ...row, ...drafts[row.id] });

  const saveFcSettings = async () => {
    setSavingFcSettings(true);
    try {
      if (!SUPABASE_URL) throw new Error("Supabase not configured");
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fcenrichmentsettings`,
        {
          method: "PATCH",
          headers: await adminHeaders(),
          body: JSON.stringify({
            fund_watch_source_keys: fcSettings.fund_watch_source_keys || null,
            fund_watch_schedule_note: fcSettings.fund_watch_schedule_note || null,
            latest_funding_schedule_note: fcSettings.latest_funding_schedule_note || null,
            process_notes: fcSettings.process_notes || null,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success("Enrichment notes saved");
      if (json.row) {
        const r = json.row as FcEnrichmentSettingsRow;
        setFcSettings({
          id: r.id,
          fund_watch_source_keys: r.fund_watch_source_keys ?? "",
          fund_watch_schedule_note: r.fund_watch_schedule_note ?? "",
          latest_funding_schedule_note: r.latest_funding_schedule_note ?? "",
          process_notes: r.process_notes ?? "",
          disabled_source_keys: normalizeDisabledSourceKeys(r.disabled_source_keys),
          updated_at: r.updated_at,
        });
      }
      setFcSettingsError(null);
    } catch (e: unknown) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSavingFcSettings(false);
    }
  };

  const lastFetchForSource = (row: FiSourceRow): string | null => {
    if (row.last_fetched_at) return row.last_fetched_at;
    const times = fetchRuns
      .filter((r) => r.source_id === row.id || r.source_slug === row.slug)
      .map((r) => r.completed_at || r.started_at)
      .filter(Boolean)
      .sort();
    return times.at(-1) ?? null;
  };

  const toggleLatestFundingSource = async (row: FiSourceRow, enabled: boolean) => {
    const prev = row.active;
    setSources((list) => list.map((s) => (s.id === row.id ? { ...s, active: enabled } : s)));
    setSavingId(row.id);
    try {
      if (!SUPABASE_URL) throw new Error("Supabase not configured");
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fisources&id=${encodeURIComponent(row.id)}`,
        { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify({ active: enabled }) },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch (e: unknown) {
      setSources((list) => list.map((s) => (s.id === row.id ? { ...s, active: prev } : s)));
      toast.error("Could not update source", { description: String(e) });
    } finally {
      setSavingId(null);
    }
  };

  const addSource = async () => {
    const name = addName.trim();
    const url = normalizeSourceUrl(addUrl);
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (!url) {
      toast.error("Enter a valid URL");
      return;
    }
    setAdding(true);
    try {
      if (!SUPABASE_URL) throw new Error("Supabase not configured");
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fisources`,
        {
          method: "POST",
          headers: await adminHeaders(),
          body: JSON.stringify({ name, base_url: url }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.row) {
        setSources((list) => [...list, json.row as FiSourceRow].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setAddName("");
      setAddUrl("");
      toast.success("Source added");
    } catch (e: unknown) {
      toast.error("Could not add source", { description: String(e) });
    } finally {
      setAdding(false);
    }
  };

  const toggleFundWatchSource = async (key: string, enabled: boolean) => {
    const prev = fcSettings.disabled_source_keys;
    const next = withSourceEnabled(prev, key, enabled);
    setFcSettings((s) => ({ ...s, disabled_source_keys: next }));
    setSavingId(`fw:${key}`);
    try {
      if (!SUPABASE_URL) throw new Error("Supabase not configured");
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=fcenrichmentsettings`,
        {
          method: "PATCH",
          headers: await adminHeaders(),
          body: JSON.stringify({ disabled_source_keys: next }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.row?.disabled_source_keys) {
        setFcSettings((s) => ({
          ...s,
          disabled_source_keys: normalizeDisabledSourceKeys(json.row.disabled_source_keys),
        }));
      }
    } catch (e: unknown) {
      setFcSettings((s) => ({ ...s, disabled_source_keys: prev }));
      toast.error("Could not update source", { description: String(e) });
    } finally {
      setSavingId(null);
    }
  };

  const sourceSwitchClass =
    "data-[state=checked]:!bg-[#2EE6A6] data-[state=unchecked]:!bg-white/20 [&>span]:data-[state=checked]:!bg-[#050505] [&>span]:data-[state=unchecked]:!bg-white/80";

  return (
    <div className="flex flex-col gap-6 h-full min-h-0 overflow-auto pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white/90">Enrichment &amp; pipelines</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Turn sources on or off, then review schedules, process notes, and recent runs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-3" style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}>
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="text-[12px] text-red-200">{error}</span>
        </div>
      )}

      {loading && !sources.length && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#2EE6A6" }} />
        </div>
      )}

      <div className="rounded-xl border p-4" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400/80">Sources</p>
        <p className="mb-4 text-[12px] text-white/45">
          ON/OFF controls whether the next scheduled job scans that feed. Last scanned is the most recent successful fetch.
        </p>
        <form
          className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void addSource();
          }}
        >
          <label className="text-[10px] uppercase tracking-wider text-white/35">
            Name
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[12px] text-white/85"
              placeholder="GeekWire Fundings"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />
          </label>
          <label className="text-[10px] uppercase tracking-wider text-white/35">
            URL
            <input
              className="mt-1 w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[12px] text-white/85"
              placeholder="https://www.geekwire.com/fundings/"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={adding || !addName.trim() || !addUrl.trim()}
            className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-md px-3 text-[11px] font-semibold disabled:opacity-40"
            style={{ background: "#2EE6A6", color: "#050505" }}
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add source
          </button>
        </form>
        {addName.trim() ? (
          <p className="mb-3 font-mono text-[10px] text-white/30">
            Slug: {slugFromSourceName(addName)}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.6fr) 130px 88px minmax(160px,1fr)", minWidth: 580 }}>
            <div style={HDR}>Source</div>
            <div style={HDR}>Pipeline</div>
            <div style={HDR}>Status</div>
            <div style={HDR}>Last scanned</div>

            {sources.map((row) => {
              const on = Boolean(row.active);
              const busy = savingId === row.id;
              return (
                <div key={`lf-${row.id}`} style={{ display: "contents" }}>
                  <div style={CELL}>
                    <div className="truncate text-white/85">{row.name}</div>
                    <div className="truncate font-mono text-[10px] text-white/30">{row.slug}</div>
                  </div>
                  <div style={CELL}>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-300/90"
                      style={{ background: "rgba(56,189,248,0.12)" }}
                    >
                      Latest Funding
                    </span>
                  </div>
                  <div style={CELL}>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={on}
                        disabled={busy || loading}
                        onCheckedChange={(v) => void toggleLatestFundingSource(row, v)}
                        className={sourceSwitchClass}
                        aria-label={`${row.name} ${on ? "on" : "off"}`}
                      />
                      <span
                        className="font-mono text-[10px] uppercase tracking-wider"
                        style={{ color: on ? "#2EE6A6" : "rgba(255,255,255,0.35)" }}
                      >
                        {busy ? "…" : on ? "On" : "Off"}
                      </span>
                    </div>
                  </div>
                  <div style={{ ...CELL, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    {fmtTs(lastFetchForSource(row))}
                  </div>
                </div>
              );
            })}

            {FUND_WATCH_FEED_SOURCES.map((src) => {
              const on = isPipelineSourceEnabled(src.key, fcSettings.disabled_source_keys);
              const busy = savingId === `fw:${src.key}`;
              const scanned = on
                ? lastScannedFromSyncRun(dailySync?.stats ?? null, src.key, dailySync?.completed_at)
                : null;
              return (
                <div key={`fw-${src.key}`} style={{ display: "contents" }}>
                  <div style={CELL}>
                    <div className="truncate text-white/85">{src.name}</div>
                    <div className="truncate font-mono text-[10px] text-white/30">{src.key}</div>
                  </div>
                  <div style={CELL}>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300/90"
                      style={{ background: "rgba(46,230,166,0.12)" }}
                    >
                      New Funds
                    </span>
                  </div>
                  <div style={CELL}>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={on}
                        disabled={busy || loading}
                        onCheckedChange={(v) => void toggleFundWatchSource(src.key, v)}
                        className={sourceSwitchClass}
                        aria-label={`${src.name} ${on ? "on" : "off"}`}
                      />
                      <span
                        className="font-mono text-[10px] uppercase tracking-wider"
                        style={{ color: on ? "#2EE6A6" : "rgba(255,255,255,0.35)" }}
                      >
                        {busy ? "…" : on ? "On" : "Off"}
                      </span>
                    </div>
                  </div>
                  <div style={{ ...CELL, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{fmtTs(scanned)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Schedules + operator notes (Fund Watch vs Latest Funding) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-emerald-400/90" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">New Funds</span>
          </div>
          <p className="text-[12px] leading-relaxed text-white/55">
            <strong className="text-white/80">Default schedule:</strong> <code className="text-[10px] text-white/45">vc-fund-sync.yml</code> —{" "}
            <code className="rounded bg-white/5 px-1 text-[10px]">0 7 * * *</code> UTC ·{" "}
            <code className="text-[10px]">npm run vc:fund-sync:daily</code>. Production keys live in CI secrets (
            <code className="text-[10px]">VC_FUND_SOURCE_KEYS</code>).
          </p>
          <label className="mt-3 block text-[10px] uppercase tracking-wider text-white/35">
            Source keys (reference / intent)
            <textarea
              rows={3}
              className="mt-1 w-full resize-y rounded border border-white/10 bg-black/20 px-2 py-1.5 font-mono text-[11px] text-white/85"
              placeholder="Comma-separated keys aligned with VC_FUND_SOURCE_KEYS (documentation for operators)"
              value={fcSettings.fund_watch_source_keys}
              onChange={(e) => setFcSettings((s) => ({ ...s, fund_watch_source_keys: e.target.value }))}
            />
          </label>
          <label className="mt-2 block text-[10px] uppercase tracking-wider text-white/35">
            Schedule &amp; env notes
            <textarea
              rows={4}
              className="mt-1 w-full resize-y rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[12px] text-white/85"
              placeholder="Overrides, dry-run flags, or timing notes for this process…"
              value={fcSettings.fund_watch_schedule_note}
              onChange={(e) => setFcSettings((s) => ({ ...s, fund_watch_schedule_note: e.target.value }))}
            />
          </label>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400/90" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">Latest Funding</span>
          </div>
          <p className="text-[12px] leading-relaxed text-white/55">
            <strong className="text-white/80">Default schedule:</strong> <code className="text-[10px] text-white/45">funding-ingest.yml</code> —{" "}
            <code className="rounded bg-white/5 px-1 text-[10px]">0 8,9 * * *</code> UTC · then{" "}
            <code className="text-[10px]">npm run intel:funding:pipeline</code>.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-white/45">
            <strong className="text-white/65">Sources:</strong> ON/OFF lives in the Sources table above. Poll interval and credibility stay in the registry cards below.
          </p>
          <label className="mt-3 block text-[10px] uppercase tracking-wider text-white/35">
            Schedule &amp; pipeline notes
            <textarea
              rows={7}
              className="mt-1 w-full resize-y rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[12px] text-white/85"
              placeholder="Ingest timing, manual runs, or linking caveats…"
              value={fcSettings.latest_funding_schedule_note}
              onChange={(e) => setFcSettings((s) => ({ ...s, latest_funding_schedule_note: e.target.value }))}
            />
          </label>
        </div>
      </div>

      {fcSettingsError && (
        <div className="rounded-lg border px-4 py-2" style={{ borderColor: "rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.08)" }}>
          <span className="text-[11px] text-amber-100/90">
            Enrichment settings unavailable: {fcSettingsError} (apply migration <code className="text-[10px]">20260503140000_fresh_capital_enrichment_settings</code> and deploy latest{" "}
            <code className="text-[10px]">admin-market-intel</code>. You can still edit Latest Funding <code className="text-[10px]">fi_sources</code> below.)
          </span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={savingFcSettings}
          onClick={() => void saveFcSettings()}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: "#2EE6A6", color: "#050505" }}
        >
          {savingFcSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save enrichment notes
        </button>
      </div>

      {/* Process summary */}
      <div className="rounded-xl border p-4" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400/80">Process overview</p>
        <ul className="list-disc space-y-1.5 pl-5 text-[12px] leading-relaxed text-white/55">
          <li>
            <span className="text-white/70">New Funds:</span> candidates from adapters → clustering → promotion into{" "}
            <code className="text-[10px]">vc_funds</code> + firm rollups; runs logged in <code className="text-[10px]">vc_fund_sync_runs</code>.
          </li>
          <li>
            <span className="text-white/70">Latest Funding:</span> poll sources → <code className="text-[10px]">fi_fetch_runs</code> / documents → raw deals →{" "}
            <code className="text-[10px]">fi_deals_canonical</code> (admin list).
          </li>
        </ul>
        <label className="mt-3 block text-[10px] uppercase tracking-wider text-white/35">
          Operator notes
          <textarea
            rows={4}
            className="mt-1 w-full resize-y rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[12px] text-white/85"
            placeholder="Cross-process reminders, on-call context, links to runbooks…"
            value={fcSettings.process_notes}
            onChange={(e) => setFcSettings((s) => ({ ...s, process_notes: e.target.value }))}
          />
        </label>
        <p className="mt-3 text-[11px] text-white/35">
          CI definitions: <code className="text-[10px]">.github/workflows/vc-fund-sync.yml</code> and{" "}
          <code className="text-[10px]">.github/workflows/funding-ingest.yml</code> in this repository.
        </p>
      </div>

      {/* Last daily VC sync */}
      <div className="rounded-xl border px-4 py-3" style={{ borderColor: "rgba(46,230,166,0.25)", background: "rgba(46,230,166,0.06)" }}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Clock className="h-4 w-4 text-emerald-400/90" />
          <span className="font-medium text-white/80">Last successful daily VC fund sync</span>
          {dailySync?.completed_at ? (
            <span className="text-white/60">{fmtTs(dailySync.completed_at)}</span>
          ) : (
            <span className="text-white/35">No completed daily run in view (or not deployed yet)</span>
          )}
        </div>
        {dailySync?.stats && (
          <pre className="mt-2 max-h-24 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px] text-white/45">
            {JSON.stringify(dailySync.stats, null, 2)}
          </pre>
        )}
      </div>

      {/* Latest per phase */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          VC fund sync — latest per phase
        </p>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 90px 1fr 160px 160px", minWidth: 640 }}>
            <div style={HDR}>Phase</div>
            <div style={HDR}>Status</div>
            <div style={HDR}>Stats / error</div>
            <div style={HDR}>Started</div>
            <div style={HDR}>Completed</div>
            {syncLatest.map((r) => (
              <div key={`${r.phase ?? "?"}-${r.started_at ?? r.id}`} style={{ display: "contents" }}>
                <div style={CELL} className="font-mono text-emerald-400/90">{r.phase}</div>
                <div style={CELL}>{r.status}</div>
                <div style={{ ...CELL, fontSize: 10 }} className="truncate">
                  {r.error_message ? (
                    <span className="text-red-300/90">{r.error_message}</span>
                  ) : (
                    <span className="text-white/40">{r.stats ? JSON.stringify(r.stats) : "—"}</span>
                  )}
                </div>
                <div style={{ ...CELL, fontSize: 10 }}>{fmtTs(r.started_at)}</div>
                <div style={{ ...CELL, fontSize: 10 }}>{fmtTs(r.completed_at)}</div>
              </div>
            ))}
            {!syncLatest.length && !loading && (
              <div className="col-span-5 px-4 py-6 text-center text-[12px] text-white/35">No rows in vc_fund_sync_latest_runs</div>
            )}
          </div>
        </div>
      </div>

      {/* VC sync history */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          VC fund sync — recent runs
        </p>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px 90px 1fr 140px 140px", minWidth: 560 }}>
            <div style={HDR}>Phase</div>
            <div style={HDR}>Status</div>
            <div style={HDR}>Error</div>
            <div style={HDR}>Started</div>
            <div style={HDR}>Completed</div>
            {syncRuns.map((r) => (
              <div key={r.id} style={{ display: "contents" }}>
                <div style={CELL} className="font-mono">{r.phase}</div>
                <div style={CELL}>{r.status}{r.dry_run ? " (dry)" : ""}</div>
                <div style={{ ...CELL, fontSize: 10 }} className="truncate text-red-300/80">{r.error_message ?? "—"}</div>
                <div style={{ ...CELL, fontSize: 10 }}>{fmtTs(r.started_at)}</div>
                <div style={{ ...CELL, fontSize: 10 }}>{fmtTs(r.completed_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fi sources */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          Latest Funding — source registry (fi_sources)
        </p>
        <p className="mb-3 text-[11px] text-white/40">
          Slug and adapter are fixed in migrations. Use Sources above for ON/OFF; adjust poll interval, label, and credibility here.
        </p>
        <div className="space-y-3">
          {sources.map((row) => {
            const d = displaySource(row);
            const dirty = Boolean(drafts[row.id] && Object.keys(drafts[row.id]).length);
            return (
              <div
                key={row.id}
                className="rounded-lg border p-3"
                style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] text-emerald-400/90">{row.slug}</span>
                    <span className="ml-2 text-[10px] text-white/35">{row.adapter_key}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!dirty || savingId === row.id}
                    onClick={() => void saveSource(row)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
                    style={{ background: dirty ? "#2EE6A6" : "rgba(255,255,255,0.08)", color: dirty ? "#050505" : "rgba(255,255,255,0.35)" }}
                  >
                    {savingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-[10px] uppercase tracking-wider text-white/35">
                    Name
                    <input
                      className="mt-1 w-full rounded border border-white/10 bg-black/20 px-2 py-1 text-[12px] text-white/85"
                      value={d.name}
                      onChange={(e) => setDraft(row.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-white/35">
                    Poll (min)
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full rounded border border-white/10 bg-black/20 px-2 py-1 text-[12px] text-white/85"
                      value={d.poll_interval_minutes}
                      onChange={(e) => setDraft(row.id, { poll_interval_minutes: Number(e.target.value) })}
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-white/35">
                    Credibility (0–1)
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      className="mt-1 w-full rounded border border-white/10 bg-black/20 px-2 py-1 text-[12px] text-white/85"
                      value={d.credibility_score}
                      onChange={(e) => setDraft(row.id, { credibility_score: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <p className="mt-2 truncate text-[10px] text-white/30">{row.base_url}</p>
                <p className="text-[10px] text-white/25">Last fetch: {fmtTs(row.last_fetched_at)} · type {row.source_type}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fetch runs */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          Latest Funding — recent fetch runs (fi_fetch_runs)
        </p>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 80px 80px 70px 70px 70px 140px", minWidth: 720 }}>
            <div style={HDR}>Source</div>
            <div style={HDR}>Mode</div>
            <div style={HDR}>Status</div>
            <div style={HDR}>Docs</div>
            <div style={HDR}>Deals</div>
            <div style={HDR}>Err</div>
            <div style={HDR}>Started</div>
            {fetchRuns.map((r) => (
              <div key={r.id} style={{ display: "contents" }}>
                <div style={CELL} className="truncate">
                  <span className="text-white/75">{r.source_name ?? r.source_slug ?? r.source_id.slice(0, 8)}</span>
                  <span className="ml-1 font-mono text-[10px] text-white/35">{r.source_slug}</span>
                </div>
                <div style={CELL}>{r.run_mode}</div>
                <div style={CELL}>{r.status}</div>
                <div style={CELL}>{r.docs_fetched}</div>
                <div style={CELL}>{r.deals_upserted}</div>
                <div style={CELL} className={r.error_count ? "text-amber-400/90" : ""}>{r.error_count}</div>
                <div style={{ ...CELL, fontSize: 10 }}>{fmtTs(r.started_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

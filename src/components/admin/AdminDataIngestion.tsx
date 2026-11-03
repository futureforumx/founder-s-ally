import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, Database, FileUp, ShieldCheck } from "lucide-react";
import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { parseImportFile, buildStagingRequest } from "@/lib/data-ingestion/import";
import { normalizeSourceRecord } from "@/lib/data-ingestion/normalize";
import { dataQualityScore, validateEntity } from "@/lib/data-ingestion/validate";
import type { MarketDataProvider, MarketEntityType, SourceRecord } from "@/lib/data-ingestion/types";

const panelStyle = { borderColor: "rgba(255,255,255,.08)", background: "#0a0a0a" };
const ENTITY_TYPES: MarketEntityType[] = ["company", "firm", "person", "funding_round"];

function mapRawSource(provider: MarketDataProvider, entityType: MarketEntityType, row: Record<string, unknown>, importJobId: string): SourceRecord {
  const sourceId = String(row.source_id ?? row.uuid ?? row.id ?? row.external_id ?? "").trim();
  return {
    provider, entityType, sourceId, sourceUrl: String(row.source_url ?? row.profile_url ?? row.url ?? "") || null,
    retrievedAt: new Date().toISOString(), payload: row, payloadHash: "", importJobId, licenseScope: "local-preview",
  };
}

export function AdminDataIngestion() {
  const [provider, setProvider] = useState<MarketDataProvider>("crunchbase");
  const [entityType, setEntityType] = useState<MarketEntityType>("company");
  const [licenseScope, setLicenseScope] = useState("");
  const [usageExpiresAt, setUsageExpiresAt] = useState("");
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [overview, setOverview] = useState<{ jobs: Array<Record<string, unknown>>; analytics: Record<string, number> } | null>(null);
  const [jobId] = useState(() => globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}`);
  const preview = useMemo(() => records.map((row) => {
    const normalized = normalizeSourceRecord(mapRawSource(provider, entityType, row, jobId));
    return { normalized, issues: validateEntity(normalized) };
  }), [records, provider, entityType, jobId]);
  const quarantined = preview.filter((row) => row.issues.some((issue) => issue.severity === "error")).length;
  const needsReview = preview.filter((row) => row.issues.length > 0).length;
  const averageQuality = preview.length ? Math.round(preview.reduce((sum, row) => sum + dataQualityScore(row.normalized), 0) / preview.length) : 0;
  const uniqueHashes = new Set(records.map((record) => JSON.stringify(record))).size;

  async function refreshOverview() {
    try {
      const token = await getSupabaseAccessToken();
      if (!token) return;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/authorized-market-data-ingest`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "X-User-Auth": token },
      });
      if (response.ok) setOverview(await response.json());
    } catch { /* keep the manual import workflow usable if status is not deployed yet */ }
  }
  useEffect(() => { void refreshOverview(); }, []);

  async function onFile(file?: File) {
    if (!file) return;
    setError(""); setResult(null); setFileName(file.name);
    try {
      const parsed = await parseImportFile(file);
      if (!parsed.length) throw new Error("The selected file has no data rows.");
      if (parsed.length > 100) throw new Error("Imports are limited to 100 records per batch.");
      setRecords(parsed);
    } catch (value) { setRecords([]); setError(value instanceof Error ? value.message : "Could not parse the selected file."); }
  }

  async function stage(dryRun: boolean) {
    setBusy(true); setError(""); setResult(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Your admin session is unavailable. Sign in again and retry.");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/authorized-market-data-ingest`, {
        method: "POST", headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "X-User-Auth": token, "Content-Type": "application/json" },
      body: JSON.stringify(buildStagingRequest({ provider, entityType, licenseScope, records, dryRun, usageExpiresAt })),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Import request failed (${response.status}).`);
      setResult(payload);
      void refreshOverview();
    } catch (value) { setError(value instanceof Error ? value.message : "Import request failed."); }
    finally { setBusy(false); }
  }

  async function purgeExpired() {
    setBusy(true); setError("");
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Your admin session is unavailable. Sign in again and retry.");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/authorized-market-data-ingest`, {
        method: "POST", headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "X-User-Auth": token, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge_expired" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Purge failed (${response.status}).`);
      setResult(payload); void refreshOverview();
    } catch (value) { setError(value instanceof Error ? value.message : "Purge failed."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <header className="border-b pb-4" style={{ borderColor: "rgba(255,255,255,.08)" }}>
      <div className="font-mono text-[10px] uppercase tracking-[.2em] text-emerald-300">Data management</div>
      <h1 className="mt-1 text-xl font-semibold text-white">Authorized data ingestion</h1>
      <p className="mt-1 max-w-3xl text-sm text-white/45">Stage licensed source exports against VEKTA’s existing startup, founder, firm, and funding records. Canonical production records are not changed by this workflow.</p>
    </header>

    <section className="grid gap-3 md:grid-cols-2">
      {[{ name: "Crunchbase", details: "Authorized API or licensed export only. Browser scraping is disabled by provider terms.", state: "Awaiting server license configuration" }, { name: "Tracxn", details: "Authorized API or licensed export only. Platform data is internal-use unless broader rights are granted.", state: "Awaiting server license configuration" }].map((source) => <article key={source.name} className="rounded-xl border p-4" style={panelStyle}>
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-white/85">{source.name}</h2><p className="mt-1 text-xs leading-5 text-white/45">{source.details}</p></div><span className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2 py-1 text-[10px] text-amber-200">Not connected</span></div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-white/35"><ShieldCheck className="h-3.5 w-3.5" />{source.state}</div>
      </article>)}
    </section>

    <section className="rounded-xl border p-5" style={panelStyle}>
      <div className="flex items-center gap-2"><FileUp className="h-4 w-4 text-emerald-300"/><h2 className="text-sm font-semibold text-white/85">Import authorized export</h2></div>
      <p className="mt-1 text-xs text-white/40">Accepts JSON arrays or CSV with a header row. Required provenance: provider entity ID, source URL where provided, and a server-configured license scope.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-[11px] text-white/50">Provider<select className="mt-1 w-full rounded-md border bg-black px-3 py-2 text-sm text-white" value={provider} onChange={(event) => setProvider(event.target.value as MarketDataProvider)}><option value="crunchbase">Crunchbase</option><option value="tracxn">Tracxn</option></select></label>
        <label className="text-[11px] text-white/50">Entity type<select className="mt-1 w-full rounded-md border bg-black px-3 py-2 text-sm text-white" value={entityType} onChange={(event) => setEntityType(event.target.value as MarketEntityType)}>{ENTITY_TYPES.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}</select></label>
        <label className="text-[11px] text-white/50">License scope ID<input className="mt-1 w-full rounded-md border bg-black px-3 py-2 text-sm text-white" value={licenseScope} onChange={(event) => setLicenseScope(event.target.value)} placeholder="Must match server-approved scope" /></label>
      </div>
      <label className="mt-3 block max-w-sm text-[11px] text-white/50">Authorized usage expiry <input type="date" className="mt-1 w-full rounded-md border bg-black px-3 py-2 text-sm text-white" value={usageExpiresAt} onChange={(event) => setUsageExpiresAt(event.target.value || "")} /><span className="mt-1 block text-[10px] text-white/30">Set the license end date to make later expiration cleanup traceable.</span></label>
      <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-sm text-white/55 hover:border-emerald-300/40">
        <ArrowDownToLine className="h-4 w-4" />{fileName || "Choose a CSV or JSON export"}<input className="sr-only" type="file" accept=".csv,.json,application/json,text/csv" onChange={(event) => void onFile(event.target.files?.[0])}/>
      </label>
      {error && <div role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-300"><AlertTriangle className="h-4 w-4"/>{error}</div>}
      {records.length > 0 && <>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[ ["Records", records.length], ["Ready to stage", records.length - quarantined], ["Quarantined", quarantined], ["Need review", needsReview], ["Avg. data quality", `${averageQuality}%`] ].map(([label, value]) => <div key={label} className="rounded-lg border p-3" style={panelStyle}><div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div><div className="mt-1 font-mono text-lg text-white/80">{value}</div></div>)}
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border" style={panelStyle}><table className="w-full text-left text-xs"><thead className="text-white/35"><tr><th className="p-3">Source record</th><th className="p-3">Normalized name</th><th className="p-3">Domain</th><th className="p-3">Quality</th></tr></thead><tbody>{preview.slice(0, 8).map(({ normalized, issues }, index) => <tr key={`${normalized.sourceId}-${index}`} className="border-t border-white/5"><td className="max-w-44 truncate p-3 text-white/45">{normalized.sourceId || "Missing provider ID"}</td><td className="p-3 text-white/80">{normalized.name || "—"}</td><td className="p-3 text-white/45">{normalized.domain || "—"}</td><td className="p-3">{issues.length ? <span className="text-amber-200">{issues.map((issue) => issue.code).join(", ")}</span> : <span className="text-emerald-300">Ready</span>}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={busy || !licenseScope.trim()} onClick={() => void stage(true)} className="rounded-md border px-3 py-2 text-xs text-white/70 disabled:opacity-40">{busy ? "Working…" : "Check authorization"}</button><button type="button" disabled={busy || !licenseScope.trim()} onClick={() => void stage(false)} className="rounded-md bg-emerald-300 px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">Stage raw records</button><span className="text-[11px] text-white/35">{uniqueHashes} unique input rows · raw staging only</span></div>
      </>}
      {result && <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre></div>}
    </section>

    <section className="rounded-xl border p-5" style={panelStyle}>
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white/85">Ingestion jobs and quality</h2><p className="mt-1 text-xs text-white/40">Persistent job status and staged/quarantined counts from the existing ingestion tables.</p></div><button type="button" disabled={busy} onClick={() => void purgeExpired()} className="rounded-md border border-red-300/20 px-3 py-2 text-[11px] text-red-200 disabled:opacity-40">Purge expired source payloads</button></div>
      <div className="mt-4 grid grid-cols-3 gap-2">{[["Collected", overview?.analytics.recordsCollected ?? "—"], ["Raw staged", overview?.analytics.recordsStaged ?? "—"], ["Quarantined", overview?.analytics.recordsQuarantined ?? "—"]].map(([label, value]) => <div key={label} className="rounded-lg border p-3" style={panelStyle}><div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div><div className="mt-1 font-mono text-lg text-white/80">{value}</div></div>)}</div>
      <div className="mt-3 space-y-2">{overview?.jobs?.length ? overview.jobs.map((job) => <div key={String(job.id)} className="flex flex-wrap justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={panelStyle}><span className="text-white/65">{String(job.sourceAdapter)} · {String(job.id).slice(0, 8)}</span><span className="text-white/40">{String(job.status)} · {String((job.stats as Record<string, unknown> | null)?.staged ?? 0)} staged · {String((job.stats as Record<string, unknown> | null)?.quarantined ?? 0)} quarantined</span></div>) : <p className="py-3 text-xs text-white/35">No ingestion jobs are available. Deploy the authorized ingestion function to enable persistent status.</p>}</div>
    </section>

    <section className="rounded-xl border p-4 text-xs leading-5 text-white/45" style={panelStyle}><div className="flex gap-2 text-white/70"><Database className="h-4 w-4 shrink-0 text-emerald-300"/><span>Integration model</span></div><p className="mt-2">Raw source payloads and job checkpoints use the existing <code>source_records</code> and <code>ingestion_jobs</code> tables. Review and promotion must target the existing <code>startups</code>, <code>startup_founders</code>, <code>firm_records</code>, <code>firm_investors</code>, and funding-round tables. Field-level provenance and approved customer-facing usage must be configured before any canonical promotion is enabled.</p></section>
  </div>;
}

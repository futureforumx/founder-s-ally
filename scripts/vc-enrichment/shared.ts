/**
 * shared.ts — Shared enrichment infrastructure
 *
 * Provides: Supabase client, env loading, matching/normalization, merge logic,
 * checkpointing, rate limiting, provenance tracking, batch DB operations,
 * logging, and retry utilities used by all three source scrapers.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// ── Env loading ──────────────────────────────────────────────────────────────

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    return v.slice(1, -1);
  return v;
}

export function loadEnvFiles(files = [".env", ".env.local", ".env.enrichment"]): void {
  const root = process.cwd();
  for (const name of files) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined && process.env[m[1]] !== "") continue;
      const v = stripQuotes(m[2].trim());
      if (v) process.env[m[1]] = v;
    }
  }
}

export const env = (n: string) => (process.env[n] || "").trim();
export const envInt = (n: string, fb: number) => { const v = parseInt(env(n), 10); return isFinite(v) && v > 0 ? v : fb; };
export const envBool = (n: string) => ["1", "true", "yes"].includes(env(n).toLowerCase());

// ── Supabase client ──────────────────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

// ── Logging ──────────────────────────────────────────────────────────────────

const LOG_DIR = join(process.cwd(), "data", "enrichment-logs");

export function initLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

let _logFile = "";

export function setLogFile(runId: string): void {
  initLogDir();
  _logFile = join(LOG_DIR, `${runId}.log`);
}

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (_logFile) try { appendFileSync(_logFile, line + "\n"); } catch { /* ignore */ }
}

// ── Sleep / Rate Limiting ────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class RateLimiter {
  private lastCall = 0;
  constructor(private minDelayMs: number) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minDelayMs) await sleep(this.minDelayMs - elapsed);
    this.lastCall = Date.now();
  }
  setDelay(ms: number) { this.minDelayMs = ms; }
}

// ── Retry with exponential backoff ───────────────────────────────────────────

export async function retry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const delay = Math.min(baseDelayMs * Math.pow(2, i - 1), 30_000);
      log(`  retry ${label} attempt ${i}/${maxAttempts}: ${err.message} — waiting ${delay}ms`);
      if (i < maxAttempts) await sleep(delay);
    }
  }
  throw lastError;
}

// ── DB retry wrapper ─────────────────────────────────────────────────────────

export async function dbRetry<T>(
  label: string,
  fn: () => Promise<{ data: T; error: { message: string } | null }>,
  maxAttempts = 4,
): Promise<T> {
  let lastError = "";
  for (let i = 1; i <= maxAttempts; i++) {
    const { data, error } = await fn();
    if (!error) return data;
    lastError = error.message;
    const delay = Math.min(750 * i, 8_000);
    log(`  db ${label} attempt ${i}/${maxAttempts}: ${lastError}`);
    if (i < maxAttempts) await sleep(delay);
  }
  throw new Error(`${label}: ${lastError}`);
}

// ── Name normalization ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "llc", "inc", "ltd", "lp", "plc", "the", "and", "for", "corp", "corporation",
  "company", "holdings", "group", "fund", "funds", "management", "advisors",
  "advisory", "vc", "llp", "partners", "ventures", "capital", "investments",
  "individual", "co",
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, " $1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(w => w.length >= 2)
    .join(" ");
}

export function normalizeNameForMatch(name: string): string {
  return normalizeName(name)
    .split(/\s+/)
    .filter(w => !STOP_WORDS.has(w))
    .join(" ");
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = String(url).trim();
  try {
    const h = new URL(t.startsWith("http") ? t : `https://${t}`).hostname;
    return h.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// ── Entity matching ──────────────────────────────────────────────────────────

export interface MatchResult {
  method: "exact_domain" | "exact_name" | "profile_url" | "fuzzy_name";
  confidence: number;
  matchedId: string;
  matchedName: string;
}

export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeNameForMatch(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeNameForMatch(b).split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export function isStrongNameMatch(scraped: string, db: string): boolean {
  const ns = normalizeNameForMatch(scraped);
  const nd = normalizeNameForMatch(db);
  if (ns === nd) return true;
  const overlap = tokenOverlap(scraped, db);
  return overlap >= 0.85;
}

export function matchEntityByDomain(
  domain: string | null,
  records: Array<{ id: string; firm_name: string; website_url?: string | null }>,
): MatchResult | null {
  if (!domain) return null;
  const d = extractDomain(domain);
  if (!d) return null;
  for (const r of records) {
    const rd = extractDomain(r.website_url);
    if (rd && rd === d) {
      return { method: "exact_domain", confidence: 0.95, matchedId: r.id, matchedName: r.firm_name };
    }
  }
  return null;
}

export function matchEntityByName(
  name: string,
  records: Array<{ id: string; firm_name: string }>,
): MatchResult | null {
  const nn = normalizeNameForMatch(name);
  // Exact normalized name match
  for (const r of records) {
    if (normalizeNameForMatch(r.firm_name) === nn) {
      return { method: "exact_name", confidence: 0.9, matchedId: r.id, matchedName: r.firm_name };
    }
  }
  // Fuzzy match
  let best: MatchResult | null = null;
  let bestScore = 0;
  for (const r of records) {
    const score = tokenOverlap(name, r.firm_name);
    if (score >= 0.85 && score > bestScore) {
      bestScore = score;
      best = { method: "fuzzy_name", confidence: Math.min(score, 0.8), matchedId: r.id, matchedName: r.firm_name };
    }
  }
  return best;
}

// ── Merge logic ──────────────────────────────────────────────────────────────

/** Field sensitivity / confidence tiers */
const HIGH_TRUST_FIELDS = new Set([
  "website_url", "linkedin_url", "firm_name", "hq_city", "hq_state", "hq_country",
  "founded_year", "description", "logo_url",
]);
const MEDIUM_TRUST_FIELDS = new Set([
  "aum", "total_investments", "total_exits", "avg_deal_size", "deals_last_12m",
  "check_size_min", "check_size_max", "total_headcount", "current_fund_size",
  "num_funds", "active_portfolio_count", "exited_portfolio_count",
]);
// Everything else is low trust → auto-apply if empty

export interface FieldUpdate {
  field: string;
  oldValue: any;
  newValue: any;
  confidence: number;
  autoApply: boolean;
  reviewRequired: boolean;
}

export function isEmptyOrWeak(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t === "null" || t === "undefined" || t === "N/A" || t === "n/a" || t === "Unknown";
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function computeFieldUpdates(
  existingRecord: Record<string, any>,
  scrapedFields: Record<string, any>,
  sourceConfidence: number,
): FieldUpdate[] {
  const updates: FieldUpdate[] = [];

  for (const [field, newVal] of Object.entries(scrapedFields)) {
    if (newVal === null || newVal === undefined) continue;
    if (typeof newVal === "string" && newVal.trim() === "") continue;

    const oldVal = existingRecord[field];
    const existingIsEmpty = isEmptyOrWeak(oldVal);

    if (!existingIsEmpty) {
      // Existing value is strong — only overwrite with high confidence from a high-trust field
      if (HIGH_TRUST_FIELDS.has(field) && sourceConfidence >= 0.9) {
        // Even then, only if values are clearly different and new is clearly better
        continue; // Conservative: don't overwrite strong existing values
      }
      continue; // Don't overwrite non-empty fields
    }

    // Field is empty/weak — determine if we auto-apply or queue for review
    const confidence = sourceConfidence;
    let autoApply = true;
    let reviewRequired = false;

    if (field === "email") {
      // Email needs explicit public availability
      autoApply = false;
      reviewRequired = true;
    } else if (MEDIUM_TRUST_FIELDS.has(field) && confidence < 0.7) {
      autoApply = false;
      reviewRequired = true;
    }

    updates.push({
      field,
      oldValue: oldVal,
      newValue: newVal,
      confidence,
      autoApply,
      reviewRequired,
    });
  }

  return updates;
}

// ── Provenance recording ─────────────────────────────────────────────────────

export interface ProvenanceRecord {
  entity_type: "firm" | "investor";
  entity_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  source_platform: string;
  source_url: string | null;
  confidence_score: number;
  extraction_method: string;
  match_method: string;
  reviewer_required: boolean;
  raw_snippet?: string;
  auto_applied: boolean;
}

export async function recordProvenance(
  supabase: SupabaseClient,
  records: ProvenanceRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const rows = records.map(r => ({
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    field_name: r.field_name,
    old_value: r.old_value != null ? String(r.old_value) : null,
    new_value: String(r.new_value),
    source_platform: r.source_platform,
    source_url: r.source_url,
    confidence_score: r.confidence_score,
    extraction_method: r.extraction_method,
    match_method: r.match_method,
    reviewer_required: r.reviewer_required,
    raw_snippet: r.raw_snippet || null,
    auto_applied: r.auto_applied,
    scraped_at: new Date().toISOString(),
  }));

  // Batch insert in chunks of 100
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from("enrichment_field_provenance").insert(chunk);
    if (error) log(`  provenance insert error: ${error.message}`);
  }
}

// ── Candidate value queue ────────────────────────────────────────────────────

export async function queueCandidateValue(
  supabase: SupabaseClient,
  entry: {
    entity_type: "firm" | "investor";
    entity_id: string;
    field_name: string;
    candidate_value: string;
    current_value: string | null;
    source_platform: string;
    source_url: string | null;
    confidence_score: number;
    reason: string;
    raw_snippet?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("enrichment_candidate_values").insert({
    ...entry,
    current_value: entry.current_value != null ? String(entry.current_value) : null,
  });
  if (error) log(`  candidate queue error: ${error.message}`);
}

// ── Match failure recording ──────────────────────────────────────────────────

export async function recordMatchFailure(
  supabase: SupabaseClient,
  entry: {
    run_id: string;
    entity_type: "firm" | "investor";
    entity_id: string;
    entity_name: string;
    source_platform: string;
    failure_reason: string;
    candidate_names?: string[];
    candidate_urls?: string[];
    screenshot_path?: string;
    html_snippet?: string;
    search_query?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("enrichment_match_failures").insert(entry);
  if (error) log(`  match failure record error: ${error.message}`);
}

// ── Checkpointing ────────────────────────────────────────────────────────────

export interface CheckpointState {
  run_id: string;
  source_platform: string;
  entity_type: "firm" | "investor";
  last_entity_id: string;
  last_entity_name: string;
  records_processed: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
}

export async function saveCheckpoint(
  supabase: SupabaseClient,
  state: CheckpointState,
): Promise<void> {
  const { error } = await supabase.from("enrichment_scrape_checkpoints").upsert(
    {
      ...state,
      status: "in_progress",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "run_id" }
  );
  // upsert on run_id may not work since it's not unique — use insert
  if (error) {
    // Fallback: just insert
    await supabase.from("enrichment_scrape_checkpoints").insert({
      ...state,
      status: "in_progress",
      updated_at: new Date().toISOString(),
    });
  }
}

export async function loadCheckpoint(
  supabase: SupabaseClient,
  runId: string,
  source: string,
  entityType: "firm" | "investor",
): Promise<CheckpointState | null> {
  const { data } = await supabase
    .from("enrichment_scrape_checkpoints")
    .select("*")
    .eq("run_id", runId)
    .eq("source_platform", source)
    .eq("entity_type", entityType)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as CheckpointState | null;
}

// ── Run tracking ─────────────────────────────────────────────────────────────

export async function createRun(
  supabase: SupabaseClient,
  runId: string,
  mode: "dry_run" | "production",
  sources: string[],
): Promise<void> {
  await supabase.from("enrichment_scrape_runs").insert({
    run_id: runId,
    mode,
    sources,
    status: "running",
  });
}

export async function finalizeRun(
  supabase: SupabaseClient,
  runId: string,
  summary: Record<string, any>,
): Promise<void> {
  await supabase
    .from("enrichment_scrape_runs")
    .update({
      status: summary.errors > 0 ? "completed" : "completed",
      finished_at: new Date().toISOString(),
      firms_processed: summary.firmsProcessed || 0,
      investors_processed: summary.investorsProcessed || 0,
      firms_updated: summary.firmsUpdated || 0,
      investors_updated: summary.investorsUpdated || 0,
      fields_updated: summary.fieldsUpdated || 0,
      fields_queued_review: summary.fieldsQueuedReview || 0,
      duplicates_avoided: summary.duplicatesAvoided || 0,
      errors: summary.errors || 0,
      summary,
    })
    .eq("run_id", runId);
}

// ── Batch DB operations ──────────────────────────────────────────────────────

export async function batchUpdateFirms(
  supabase: SupabaseClient,
  updates: Array<{ id: string; patch: Record<string, any> }>,
  dryRun: boolean,
): Promise<{ success: number; failed: number }> {
  if (dryRun) {
    for (const u of updates) log(`  [DRY RUN] would update firm ${u.id}: ${JSON.stringify(u.patch)}`);
    return { success: updates.length, failed: 0 };
  }

  let success = 0;
  let failed = 0;
  // Batch in groups of 20 (Supabase REST limit considerations)
  for (const u of updates) {
    try {
      const { error } = await supabase
        .from("firm_records")
        .update({ ...u.patch, updated_at: new Date().toISOString() })
        .eq("id", u.id);
      if (error) {
        log(`  firm update error ${u.id}: ${error.message}`);
        failed++;
      } else {
        success++;
      }
    } catch (err: any) {
      log(`  firm update exception ${u.id}: ${err.message}`);
      failed++;
    }
  }
  return { success, failed };
}

export async function batchUpdateInvestors(
  supabase: SupabaseClient,
  updates: Array<{ id: string; patch: Record<string, any> }>,
  dryRun: boolean,
): Promise<{ success: number; failed: number }> {
  if (dryRun) {
    for (const u of updates) log(`  [DRY RUN] would update investor ${u.id}: ${JSON.stringify(u.patch)}`);
    return { success: updates.length, failed: 0 };
  }

  let success = 0;
  let failed = 0;
  for (const u of updates) {
    try {
      const { error } = await supabase
        .from("firm_investors")
        .update({ ...u.patch, updated_at: new Date().toISOString() })
        .eq("id", u.id);
      if (error) {
        log(`  investor update error ${u.id}: ${error.message}`);
        failed++;
      } else {
        success++;
      }
    } catch (err: any) {
      log(`  investor update exception ${u.id}: ${err.message}`);
      failed++;
    }
  }
  return { success, failed };
}

// ── Fetch incomplete records ─────────────────────────────────────────────────

/** Firm fields that indicate incomplete data when null/empty */
const FIRM_GAP_FIELDS = [
  "description", "website_url", "hq_city", "hq_country", "founded_year",
  "aum", "total_investments", "total_exits", "linkedin_url", "logo_url",
  "thesis_verticals", "total_headcount", "check_size_min", "check_size_max",
  "deals_last_12m", "avg_deal_size",
];

export async function fetchIncompleteFirms(
  supabase: SupabaseClient,
  limit = 500,
  afterId?: string,
): Promise<any[]> {
  let query = supabase
    .from("firm_records")
    .select("*")
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (afterId) query = query.gt("id", afterId);

  const { data, error } = await query;
  if (error) throw new Error(`fetchIncompleteFirms: ${error.message}`);

  // Filter to only records missing key fields
  return (data || []).filter(r => {
    let missingCount = 0;
    for (const f of FIRM_GAP_FIELDS) {
      if (isEmptyOrWeak((r as any)[f])) missingCount++;
    }
    return missingCount >= 3; // at least 3 missing fields
  });
}

export async function fetchAllFirms(
  supabase: SupabaseClient,
  limit = 2000,
  afterId?: string,
): Promise<any[]> {
  let query = supabase
    .from("firm_records")
    .select("*")
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(limit);
  if (afterId) query = query.gt("id", afterId);
  const { data, error } = await query;
  if (error) throw new Error(`fetchAllFirms: ${error.message}`);
  return data || [];
}

export async function fetchIncompleteInvestors(
  supabase: SupabaseClient,
  limit = 500,
  afterId?: string,
): Promise<any[]> {
  let query = supabase
    .from("firm_investors")
    .select("*")
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (afterId) query = query.gt("id", afterId);
  const { data, error } = await query;
  if (error) throw new Error(`fetchIncompleteInvestors: ${error.message}`);

  const INV_GAP = ["title", "bio", "linkedin_url", "city", "country", "avatar_url", "email"];
  return (data || []).filter(r => {
    let missing = 0;
    for (const f of INV_GAP) {
      if (isEmptyOrWeak((r as any)[f])) missing++;
    }
    return missing >= 2;
  });
}

export async function fetchAllInvestors(
  supabase: SupabaseClient,
  limit = 5000,
  afterId?: string,
): Promise<any[]> {
  let query = supabase
    .from("firm_investors")
    .select("*")
    .is("deleted_at", null)
    .order("id", { ascending: true })
    .limit(limit);
  if (afterId) query = query.gt("id", afterId);
  const { data, error } = await query;
  if (error) throw new Error(`fetchAllInvestors: ${error.message}`);
  return data || [];
}

// ── Screenshot / evidence capture ────────────────────────────────────────────

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export const EVIDENCE_DIR = join(process.cwd(), "data", "enrichment-evidence");

export function evidencePath(runId: string, source: string, entityId: string, ext: string): string {
  const dir = join(EVIDENCE_DIR, runId, source);
  ensureDir(dir);
  return join(dir, `${entityId}.${ext}`);
}

// ── Generate run ID ──────────────────────────────────────────────────────────

export function generateRunId(): string {
  const now = new Date();
  return `enrich-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
}

// ── Summary generation ───────────────────────────────────────────────────────

export interface SourceStats {
  firmsSearched: number;
  firmsMatched: number;
  firmsUpdated: number;
  firmsNotFound: number;
  investorsSearched: number;
  investorsMatched: number;
  investorsUpdated: number;
  investorsNotFound: number;
  fieldsUpdated: number;
  fieldsQueuedReview: number;
  errors: number;
  fieldsByType: Record<string, number>;
}

export function emptyStats(): SourceStats {
  return {
    firmsSearched: 0, firmsMatched: 0, firmsUpdated: 0, firmsNotFound: 0,
    investorsSearched: 0, investorsMatched: 0, investorsUpdated: 0, investorsNotFound: 0,
    fieldsUpdated: 0, fieldsQueuedReview: 0, errors: 0, fieldsByType: {},
  };
}

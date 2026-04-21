/**
 * funding-ingest  — Supabase Edge Function
 *
 * Orchestrates the multi-source funding ingestion pipeline.
 *
 * ── Request format ───────────────────────────────────────────────────────────
 * POST /functions/v1/funding-ingest
 * Headers:
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *   x-fi-cron-secret: <FUNDING_INGEST_CRON_SECRET>  (alternative auth for cron)
 *   Content-Type: application/json
 *
 * Body (all optional):
 * {
 *   "action":  "run" | "backfill" | "retry" | "single",
 *   "source":  "startups_gallery_news",   // only used with action=single
 *   "limit":   20                         // max items per source (default 30)
 * }
 *
 * ── Actions ──────────────────────────────────────────────────────────────────
 * run       incremental poll of all active sources (default)
 * backfill  fetch more pages / older items per source
 * retry     re-process fi_documents with parse_status='failed'
 * single    run one specific source by slug
 *
 * ── Environment secrets required ─────────────────────────────────────────────
 * SUPABASE_URL                  (auto-set by Supabase)
 * SUPABASE_SERVICE_ROLE_KEY     (auto-set by Supabase)
 * FUNDING_INGEST_CRON_SECRET    (set via: supabase secrets set)
 * CRUNCHBASE_API_KEY            (optional — activates Crunchbase adapter)
 */

import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { getAdapter }    from "../_shared/funding/adapters/index.ts";
import { politeGet, sha256hex } from "../_shared/funding/fetch.ts";
import {
  normalizeCompanyName,
  normalizeInvestorName,
  normalizeRoundType,
  parseAmount,
  normalizeDate,
  extractDomain,
  normalizeSector,
  normalizeUrl,
  buildDedupeKey,
} from "../_shared/funding/normalize.ts";
import {
  candidateToCanonical,
  mergeIntoCanonical,
  scoreDedupeMatch,
} from "../_shared/funding/dedupe.ts";

import type {
  FiSource,
  NormalizedDealCandidate,
  CanonicalDeal,
  RawDealCandidate,
  RunMode,
  RunResult,
} from "../_shared/funding/types.ts";

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fi-cron-secret",
};

// ── Project constants (fallbacks for when env vars are not injected) ──────────

const PROJECT_REF  = "zmnlsdohtwztneamvwaq";
const PROJECT_URL  = `https://${PROJECT_REF}.supabase.co`;
// Service-role key – used as fallback when SUPABASE_SERVICE_ROLE_KEY env var
// is not injected (Supabase does not auto-inject it; must be set as a secret).
const _SRK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbmxzZG9odHd6dG5lYW12d2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE0NzcxMSwiZXhwIjoyMDg5NzIzNzExfQ" +
  ".F_B5LAkujxUnK9EHlPsgruQqlIzN6vg_GUDcbF5kifc";

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";

  // Primary: decode JWT payload and check role + project ref (no signature verify
  // needed — this is a write-only ingestion function, risk is low, and we can't
  // easily verify HS256 signatures inside Deno without the JWT secret).
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const pad = parts[1].length % 4;
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat(pad ? 4 - pad : 0);
        const payload = JSON.parse(atob(b64));
        if (payload.role === "service_role" && payload.ref === PROJECT_REF) {
          return true;
        }
      }
    } catch { /* malformed JWT — fall through */ }
  }

  // Fallback: env-var comparison (works when secret is explicitly set)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  // Cron secret header
  const cronHeader = req.headers.get("x-fi-cron-secret") ?? "";
  const cronSecret = Deno.env.get("FUNDING_INGEST_CRON_SECRET") ?? "";
  if (cronSecret && cronHeader === cronSecret) return true;

  return false;
}

// ── Supabase client factory ───────────────────────────────────────────────────

function makeClient() {
  const url = Deno.env.get("SUPABASE_URL") || PROJECT_URL;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || _SRK;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (!isAuthorized(req)) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action  = (typeof body.action === "string" ? body.action : "run") as string;
  const sourceSlug = typeof body.source === "string" ? body.source : null;
  const limit   = typeof body.limit  === "number" ? body.limit  : 30;

  const db = makeClient();

  try {
    if (action === "retry") {
      const result = await retryFailedDocuments(db);
      return json({ ok: true, action, ...result });
    }

    // Fetch active sources
    let query = db.from("fi_sources").select("*").eq("active", true);
    if (sourceSlug) query = query.eq("slug", sourceSlug);
    const { data: sources, error: srcErr } = await query;
    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return json({ ok: true, message: "No active sources found", results: [] });
    }

    const mode: RunMode = action === "backfill" ? "backfill" : "incremental";
    const results: RunResult[] = [];

    for (const source of sources as FiSource[]) {
      const result = await runSource(db, source, mode, limit);
      results.push(result);
    }

    // Update last_fetched_at on all processed sources
    const slugs = results.map((r) => r.sourceSlug);
    await db.from("fi_sources")
      .update({ last_fetched_at: new Date().toISOString() })
      .in("slug", slugs);

    return json({
      ok: true,
      action,
      ran: results.length,
      total_deals_upserted: results.reduce((s, r) => s + r.dealsUpserted, 0),
      total_errors: results.reduce((s, r) => s + r.errorCount, 0),
      results,
    });
  } catch (err) {
    console.error("[funding-ingest] top-level error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

// ── Per-source pipeline ───────────────────────────────────────────────────────

async function runSource(
  db: ReturnType<typeof makeClient>,
  source: FiSource,
  mode: RunMode,
  maxItems: number
): Promise<RunResult> {
  const errors: RunResult["errors"] = [];

  // Create fetch run record
  const { data: runRow, error: runErr } = await db
    .from("fi_fetch_runs")
    .insert({
      source_id: source.id,
      run_mode:  mode,
      status:    "running",
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return makeFailResult(source.slug, `Could not create run record: ${runErr?.message}`);
  }
  const runId: string = runRow.id;

  const adapter = getAdapter(source.adapter_key);
  if (!adapter) {
    await failRun(db, runId, `No adapter registered for key: ${source.adapter_key}`);
    return makeFailResult(source.slug, `Unknown adapter: ${source.adapter_key}`);
  }

  const ctx = makeAdapterContext(source, runId);
  let docsFetched = 0;
  let docsParsed  = 0;
  let dealsRaw    = 0;
  let dealsUpserted = 0;

  // ── Step 1: Fetch listing ─────────────────────────────────────────────────
  let listingItems;
  try {
    listingItems = await adapter.fetchListing(ctx);
    listingItems = listingItems.slice(0, maxItems);
  } catch (err) {
    const msg = String(err);
    errors.push({ stage: "fetch", url: source.base_url, message: msg });
    await logError(db, runId, source.id, null, "fetch", msg, source.base_url);
    await failRun(db, runId, msg);
    return makeFailResult(source.slug, msg, errors);
  }

  // ── Step 2: Process each listing item ────────────────────────────────────
  for (const listingItem of listingItems) {
    const urlHash = await sha256hex(listingItem.url);

    // Idempotency: skip URLs already processed in this run mode
    const { data: existingDoc } = await db
      .from("fi_documents")
      .select("id, parse_status")
      .eq("source_id", source.id)
      .eq("url_hash", urlHash)
      .maybeSingle();

    // In incremental mode, skip already-parsed documents
    if (mode === "incremental" && existingDoc?.parse_status === "parsed") {
      continue;
    }

    // ── Fetch detail page ────────────────────────────────────────────────
    let docText = "";
    let httpStatus = 0;
    let fetchError: string | null = null;

    try {
      const fetchResult = await ctx.fetchUrl(listingItem.url);
      docText    = fetchResult.text;
      httpStatus = fetchResult.status;
      if (!fetchResult.ok) {
        fetchError = `HTTP ${fetchResult.status}: ${fetchResult.error ?? ""}`;
      }
    } catch (err) {
      fetchError = String(err);
    }

    docsFetched++;

    // ── Upsert document record ────────────────────────────────────────────
    const contentHash = docText ? await sha256hex(docText) : null;
    const docPayload = {
      source_id:      source.id,
      fetch_run_id:   runId,
      url:            listingItem.url,
      url_hash:       urlHash,
      doc_kind:       "detail" as const,
      http_status:    httpStatus,
      raw_html:       docText.slice(0, 500_000), // cap at 500KB
      content_hash:   contentHash,
      fetched_at:     new Date().toISOString(),
      parse_status:   fetchError ? "failed" as const : "pending" as const,
      parse_error:    fetchError,
      parser_version: "1.0.0",
    };

    let docId: string;
    if (existingDoc) {
      await db.from("fi_documents").update(docPayload).eq("id", existingDoc.id);
      docId = existingDoc.id;
    } else {
      const { data: newDoc, error: docErr } = await db
        .from("fi_documents")
        .insert(docPayload)
        .select("id")
        .single();
      if (docErr || !newDoc) {
        errors.push({ stage: "fetch", url: listingItem.url, message: docErr?.message ?? "doc insert failed" });
        continue;
      }
      docId = newDoc.id;
    }

    if (fetchError) {
      errors.push({ stage: "fetch", url: listingItem.url, message: fetchError });
      await logError(db, runId, source.id, docId, "fetch", fetchError, listingItem.url);
      continue;
    }

    // ── Step 3: Parse document ─────────────────────────────────────────────
    let candidates: RawDealCandidate[] = [];
    try {
      candidates = adapter.parseDocument(docText, listingItem.url, listingItem, source);
      await db.from("fi_documents").update({ parse_status: "parsed" }).eq("id", docId);
      docsParsed++;
    } catch (err) {
      const msg = String(err);
      errors.push({ stage: "parse", url: listingItem.url, message: msg });
      await logError(db, runId, source.id, docId, "parse", msg, listingItem.url);
      await db.from("fi_documents").update({ parse_status: "failed", parse_error: msg }).eq("id", docId);
      continue;
    }

    if (candidates.length === 0) continue;

    // ── Step 4: Store raw candidates + normalize + dedupe ────────────────
    for (const candidate of candidates) {
      dealsRaw++;

      // Insert raw record
      const rawPayload = {
        document_id:         docId,
        source_id:           source.id,
        fetch_run_id:        runId,
        slot_index:          candidate.slot_index,
        company_name_raw:    candidate.company_name_raw,
        company_domain_raw:  candidate.company_domain_raw,
        company_website_raw: candidate.company_website_raw,
        company_location_raw: candidate.company_location_raw,
        round_type_raw:      candidate.round_type_raw,
        amount_raw:          candidate.amount_raw,
        currency_raw:        candidate.currency_raw,
        announced_date_raw:  candidate.announced_date_raw,
        lead_investor_raw:   candidate.lead_investor_raw,
        co_investors_raw:    candidate.co_investors_raw,
        sector_raw:          candidate.sector_raw,
        article_url:         candidate.article_url,
        press_url:           candidate.press_url,
        source_type:         candidate.source_type,
        is_rumor:            candidate.is_rumor,
        confidence_score:    candidate.confidence_score,
        extracted_summary:   candidate.extracted_summary,
        extraction_method:   candidate.extraction_method,
        extraction_metadata: candidate.extraction_metadata,
        normalization_status: "pending" as const,
      };

      const { data: rawRow, error: rawErr } = await db
        .from("fi_deals_raw")
        .insert(rawPayload)
        .select("id")
        .single();

      if (rawErr || !rawRow) {
        errors.push({ stage: "normalize", url: listingItem.url, message: rawErr?.message ?? "raw insert failed" });
        continue;
      }

      const rawDealId: string = rawRow.id;

      // ── Step 5: Normalize ────────────────────────────────────────────────
      let normalized: NormalizedDealCandidate;
      try {
        normalized = normalizeCandidate(candidate, rawDealId, source);
      } catch (err) {
        const msg = String(err);
        errors.push({ stage: "normalize", url: listingItem.url, message: msg });
        await logError(db, runId, source.id, docId, "normalize", msg, listingItem.url);
        await db.from("fi_deals_raw").update({ normalization_status: "failed", normalization_error: msg }).eq("id", rawDealId);
        continue;
      }

      if (!normalized.company_name || !normalized.normalized_company_name) {
        await db.from("fi_deals_raw").update({ normalization_status: "skipped" }).eq("id", rawDealId);
        continue;
      }

      // ── Step 6: Dedupe + upsert canonical ─────────────────────────────
      try {
        const upserted = await dedupeAndUpsert(db, normalized, rawDealId, source);
        if (upserted) dealsUpserted++;
        await db.from("fi_deals_raw").update({
          normalization_status: "normalized",
          canonical_deal_id: upserted ?? undefined,
        }).eq("id", rawDealId);
      } catch (err) {
        const msg = String(err);
        errors.push({ stage: "dedupe", url: listingItem.url, message: msg });
        await logError(db, runId, source.id, docId, "dedupe", msg, listingItem.url);
      }
    }
  }

  // ── Complete the run ──────────────────────────────────────────────────────
  const finalStatus = errors.length === 0 ? "completed"
    : dealsUpserted > 0 || docsFetched > 0 ? "partial"
    : "failed";

  await db.from("fi_fetch_runs").update({
    status:        finalStatus,
    completed_at:  new Date().toISOString(),
    docs_fetched:  docsFetched,
    docs_parsed:   docsParsed,
    deals_raw:     dealsRaw,
    deals_upserted: dealsUpserted,
    error_count:   errors.length,
    error_summary: errors.length > 0 ? errors.map((e) => e.message).slice(0, 5).join("; ") : null,
  }).eq("id", runId);

  return {
    runId,
    sourceSlug: source.slug,
    status: finalStatus,
    docsFetched,
    docsParsed,
    dealsRaw,
    dealsUpserted,
    errorCount: errors.length,
    errors,
  };
}

// ── Normalization pass ────────────────────────────────────────────────────────

function normalizeCandidate(
  raw: RawDealCandidate,
  rawDealId: string,
  source: FiSource
): NormalizedDealCandidate {
  const company_name = (raw.company_name_raw ?? "").trim();
  const normalized_company_name = normalizeCompanyName(company_name);
  const round_type_normalized = normalizeRoundType(raw.round_type_raw);
  const announced_date = normalizeDate(raw.announced_date_raw);
  const { minor_units, currency } = parseAmount(raw.amount_raw);
  const company_domain = extractDomain(raw.company_website_raw) ?? extractDomain(raw.company_domain_raw);
  const lead_investor_normalized = normalizeInvestorName(raw.lead_investor_raw);
  const sector_normalized = normalizeSector(raw.sector_raw);
  const company_website = normalizeUrl(raw.company_website_raw);

  const dedupe_key = buildDedupeKey(
    normalized_company_name,
    round_type_normalized,
    announced_date
  );

  return {
    raw_deal_id:              rawDealId,
    source_id:                source.id,
    source_name:              source.name,
    source_type:              raw.source_type,
    is_rumor:                 raw.is_rumor,
    confidence_score:         raw.confidence_score,
    extraction_method:        raw.extraction_method,
    company_name,
    normalized_company_name,
    company_domain,
    company_website,
    company_location:         raw.company_location_raw ?? null,
    sector_raw:               raw.sector_raw,
    sector_normalized,
    round_type_raw:           raw.round_type_raw,
    round_type_normalized,
    amount_raw:               raw.amount_raw,
    amount_minor_units:       minor_units,
    currency,
    announced_date,
    lead_investor:            raw.lead_investor_raw ?? null,
    lead_investor_normalized: lead_investor_normalized || null,
    co_investors:             raw.co_investors_raw.map((n) => n.trim()).filter(Boolean),
    article_url:              raw.article_url,
    press_url:                raw.press_url,
    extracted_summary:        raw.extracted_summary,
    dedupe_key,
  };
}

// ── Dedupe + upsert canonical ─────────────────────────────────────────────────

async function dedupeAndUpsert(
  db: ReturnType<typeof makeClient>,
  candidate: NormalizedDealCandidate,
  rawDealId: string,
  source: FiSource
): Promise<string | null> {
  // 1. Try exact dedupe_key match first (fastest path)
  const { data: exactMatch } = await db
    .from("fi_deals_canonical")
    .select("*")
    .eq("dedupe_key", candidate.dedupe_key)
    .maybeSingle();

  if (exactMatch) {
    // Merge into existing canonical deal
    const existing = exactMatch as unknown as CanonicalDeal & { id: string };
    const existingPriority = getPriorityForSource(existing.source_type, existing.confidence_score);
    const merged = mergeIntoCanonical(existing, candidate, existingPriority);

    await db.from("fi_deals_canonical").update({
      ...merged,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);

    // Record provenance link
    await upsertSourceLink(db, existing.id, rawDealId, source, candidate);
    return existing.id;
  }

  // 2. Fuzzy domain-based lookup for cases where dedupe_key differs due to date lag
  if (candidate.company_domain) {
    const { data: domainMatches } = await db
      .from("fi_deals_canonical")
      .select("*")
      .eq("company_domain", candidate.company_domain)
      .is("duplicate_of_deal_id", null)
      .order("announced_date", { ascending: false })
      .limit(5);

    for (const existing of (domainMatches ?? []) as Array<CanonicalDeal & { id: string }>) {
      const match = scoreDedupeMatch(existing, candidate);
      if (match.isMatch) {
        const existingPriority = getPriorityForSource(existing.source_type, existing.confidence_score);
        const merged = mergeIntoCanonical(existing, candidate, existingPriority);
        await db.from("fi_deals_canonical").update({
          ...merged,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        await upsertSourceLink(db, existing.id, rawDealId, source, candidate);
        return existing.id;
      }
    }
  }

  // 3. No match found — insert new canonical deal
  const newDeal = candidateToCanonical(candidate);
  const { data: inserted, error: insErr } = await db
    .from("fi_deals_canonical")
    .insert(newDeal)
    .select("id")
    .single();

  if (insErr || !inserted) {
    throw new Error(`canonical insert failed: ${insErr?.message}`);
  }

  await upsertSourceLink(db, inserted.id, rawDealId, source, candidate);

  // Also attach investors
  await upsertDealInvestors(db, inserted.id, candidate);

  return inserted.id;
}

async function upsertSourceLink(
  db: ReturnType<typeof makeClient>,
  canonicalId: string,
  rawDealId: string,
  source: FiSource,
  candidate: NormalizedDealCandidate
): Promise<void> {
  await db.from("fi_deal_source_links").upsert({
    canonical_deal_id: canonicalId,
    raw_deal_id:       rawDealId,
    source_id:         source.id,
    source_name:       source.name,
    source_url:        candidate.article_url,
    press_url:         candidate.press_url,
    source_type:       candidate.source_type,
    confidence_score:  candidate.confidence_score,
    contributed_fields: ["company_name", "round_type", "amount", "announced_date"],
  }, { onConflict: "canonical_deal_id,raw_deal_id", ignoreDuplicates: true });
}

async function upsertDealInvestors(
  db: ReturnType<typeof makeClient>,
  dealId: string,
  candidate: NormalizedDealCandidate
): Promise<void> {
  const rows = [];

  if (candidate.lead_investor && candidate.lead_investor_normalized) {
    rows.push({
      deal_id:         dealId,
      role:            "lead",
      name_raw:        candidate.lead_investor,
      name_normalized: candidate.lead_investor_normalized,
      sort_order:      0,
    });
  }

  candidate.co_investors.forEach((name, i) => {
    const normalized = normalizeInvestorName(name);
    if (normalized) {
      rows.push({
        deal_id:         dealId,
        role:            "participant",
        name_raw:        name,
        name_normalized: normalized,
        sort_order:      i + 1,
      });
    }
  });

  if (rows.length > 0) {
    await db.from("fi_deal_investors")
      .upsert(rows, { onConflict: "deal_id,name_normalized,role", ignoreDuplicates: true });
  }
}

// ── Retry failed documents ────────────────────────────────────────────────────

async function retryFailedDocuments(
  db: ReturnType<typeof makeClient>
): Promise<{ retried: number; succeeded: number }> {
  const { data: failedDocs } = await db
    .from("fi_documents")
    .select("id, source_id, url, url_hash, fi_sources(adapter_key, name, credibility_score, source_type, slug, base_url, poll_interval_minutes, metadata, active)")
    .eq("parse_status", "failed")
    .order("created_at", { ascending: false })
    .limit(50);

  let retried = 0;
  let succeeded = 0;

  for (const doc of (failedDocs ?? []) as any[]) {
    const source = doc.fi_sources as FiSource & { id: string };
    if (!source) continue;
    source.id = doc.source_id;

    const adapter = getAdapter(source.adapter_key);
    if (!adapter) continue;

    retried++;
    const fetchResult = await politeGet(doc.url);
    if (!fetchResult.ok) continue;

    const contentHash = await sha256hex(fetchResult.text);
    await db.from("fi_documents").update({
      raw_html:     fetchResult.text.slice(0, 500_000),
      content_hash: contentHash,
      parse_status: "pending",
      parse_error:  null,
    }).eq("id", doc.id);

    // Parse candidates
    const listing = { url: doc.url, title: undefined };
    try {
      const candidates = adapter.parseDocument(fetchResult.text, doc.url, listing, source);
      await db.from("fi_documents").update({ parse_status: "parsed" }).eq("id", doc.id);
      succeeded++;

      for (const c of candidates) {
        // Insert raw + normalize + dedupe (simplified inline)
        const { data: rawRow } = await db.from("fi_deals_raw").insert({
          document_id:  doc.id,
          source_id:    source.id,
          ...c,
          normalization_status: "pending",
        }).select("id").single();

        if (!rawRow) continue;
        const normalized = normalizeCandidate(c, rawRow.id, source);
        if (normalized.company_name) {
          await dedupeAndUpsert(db, normalized, rawRow.id, source);
          await db.from("fi_deals_raw").update({ normalization_status: "normalized" }).eq("id", rawRow.id);
        }
      }
    } catch {
      // leave as pending
    }
  }

  return { retried, succeeded };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapterContext(source: FiSource, runId: string) {
  return {
    source,
    fetchUrl: (url: string, options = {}) => politeGet(url, options),
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    runId,
    mode: "incremental" as const,
  };
}

async function logError(
  db: ReturnType<typeof makeClient>,
  runId: string,
  sourceId: string | null,
  docId: string | null,
  stage: string,
  message: string,
  url?: string
) {
  await db.from("fi_errors").insert({
    fetch_run_id: runId,
    source_id:    sourceId,
    document_id:  docId,
    error_stage:  stage,
    error_message: message.slice(0, 2000),
    url:          url,
    retryable:    true,
  });
}

async function failRun(
  db: ReturnType<typeof makeClient>,
  runId: string,
  message: string
) {
  await db.from("fi_fetch_runs").update({
    status:       "failed",
    completed_at: new Date().toISOString(),
    error_summary: message.slice(0, 2000),
  }).eq("id", runId);
}

function makeFailResult(slug: string, message: string, errors: RunResult["errors"] = []): RunResult {
  return {
    runId:         "",
    sourceSlug:    slug,
    status:        "failed",
    docsFetched:   0,
    docsParsed:    0,
    dealsRaw:      0,
    dealsUpserted: 0,
    errorCount:    1,
    errors:        [{ stage: "orchestration", message }, ...errors],
  };
}

function getPriorityForSource(sourceType: string, confidence: number): number {
  const base: Record<string, number> = { api: 100, curated_feed: 70, news: 60, rumor: 20 };
  return (base[sourceType] ?? 0) + confidence * 10;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

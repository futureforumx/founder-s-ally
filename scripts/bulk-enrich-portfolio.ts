/**
 * bulk-enrich-portfolio.ts
 * ========================
 * Bulk enriches portfolio companies for VC firms in firm_records.
 *
 * For each firm this script runs two Exa searches:
 *   1. Recent deals  — investments from the last ~12 months  → is_notable = false
 *   2. Notable deals — flagship / well-known portfolio cos   → is_notable = true
 *
 * Gemini Flash 2.0 extracts structured JSON from Exa results.
 * Results are upserted into firm_recent_deals using the unique
 * (firm_id, normalized_company_name) index for idempotency.
 *
 * Usage:
 *   npx tsx scripts/bulk-enrich-portfolio.ts
 *   PORTFOLIO_LIMIT=20 npx tsx scripts/bulk-enrich-portfolio.ts
 *   PORTFOLIO_FIRM_IDS=uuid1,uuid2 npx tsx scripts/bulk-enrich-portfolio.ts
 *   PORTFOLIO_CONCURRENCY=3 npx tsx scripts/bulk-enrich-portfolio.ts
 *   DRY_RUN=1 npx tsx scripts/bulk-enrich-portfolio.ts
 *   PORTFOLIO_SKIP_ENRICHED=false npx tsx scripts/bulk-enrich-portfolio.ts  # re-process all
 *
 * Env (from .env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   EXA_API_KEY
 *   GROQ_API_KEY  (primary LLM — llama-3.3-70b)
 *   GEMINI_API_KEY (fallback)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles.js";
import { appendFileSync, existsSync } from "node:fs";

loadEnvFiles([".env", ".env.local"]);

// ── Config ────────────────────────────────────────────────────────────────────

const e      = (n: string) => (process.env[n] || "").trim();
const eInt   = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool  = (n: string, def = false) => { const val = e(n).toLowerCase(); return val === "1" || val === "true" || val === "yes" ? true : val === "0" || val === "false" || val === "no" ? false : def; };

const SUPABASE_URL      = e("SUPABASE_URL");
const SERVICE_KEY       = e("SUPABASE_SERVICE_ROLE_KEY");
const EXA_KEY           = e("EXA_API_KEY");
const GROQ_KEY          = e("GROQ_API_KEY");
const PERPLEXITY_KEY    = e("PERPLEXITY_API_KEY");
const GEMINI_KEY        = e("GEMINI_API_KEY");
const DRY_RUN           = eBool("DRY_RUN");
const LIMIT             = eInt("PORTFOLIO_LIMIT", 9999);
const CONCURRENCY       = eInt("PORTFOLIO_CONCURRENCY", 2);
const DELAY_MS          = eInt("PORTFOLIO_DELAY_MS", 3000);
const GROQ_RETRY_DELAY  = eInt("PORTFOLIO_GROQ_RETRY_MS", 15000); // backoff on 429
const SKIP_ENRICHED     = eBool("PORTFOLIO_SKIP_ENRICHED", true);  // skip firms enriched in last 30d
const LOG_FILE          = "/tmp/bulk-enrich-portfolio.log";
const FIRM_IDS_FILTER   = e("PORTFOLIO_FIRM_IDS")
  ? e("PORTFOLIO_FIRM_IDS").split(",").map(s => s.trim()).filter(Boolean)
  : null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface FirmRow {
  id: string;
  firm_name: string;
  website_url: string | null;
}

interface PortfolioDeal {
  company_name: string;
  amount: string | null;
  stage: string | null;
  date_announced: string | null;
  is_notable: boolean;
  investment_status: string | null;
}

interface EnrichResult {
  recent_deals: PortfolioDeal[];
  notable_deals: PortfolioDeal[];
}

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

// ── Perplexity: search + extract in one call ──────────────────────────────────

const PERPLEXITY_JSON_PROMPT = `You are a precise VC data extractor. Search for portfolio companies of the given VC firm and return ONLY valid JSON with this exact schema:
{
  "recent_deals": [
    { "company_name": "string", "amount": "string or null", "stage": "string or null", "date_announced": "YYYY-MM-DD or null", "investment_status": "active|exited|acquired|ipo|unknown" }
  ],
  "notable_deals": [
    { "company_name": "string", "amount": "string or null", "stage": "string or null", "date_announced": "YYYY-MM-DD or null", "investment_status": "active|exited|acquired|ipo|unknown" }
  ]
}
Rules:
- recent_deals: investments from the last 12-18 months; up to 10
- notable_deals: flagship/well-known portfolio companies; up to 15
- Do NOT put the same company in both arrays
- Do NOT hallucinate — only include companies you find in your search
- amount: include units e.g. "$5M" — null if unknown
- stage: "Pre-Seed","Seed","Series A","Series B","Series C","Growth" or sector — null if unknown
- Return empty arrays if nothing found`;

async function enrichWithPerplexity(
  firmName: string,
  domain: string | null
): Promise<EnrichResult | null> {
  if (!PERPLEXITY_KEY) return null;
  const domainHint = domain ? ` (${domain})` : "";
  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: PERPLEXITY_JSON_PROMPT },
          {
            role: "user",
            content: `Find the portfolio companies (recent deals and notable/flagship investments) for the VC firm "${firmName}"${domainHint}. Search their website, Crunchbase, LinkedIn, and news. Return structured JSON.`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (resp.status === 429) {
      log(`[Perplexity] Rate limited for ${firmName}`);
      return null;
    }
    if (!resp.ok) {
      log(`[Perplexity] HTTP ${resp.status} for ${firmName}`);
      return null;
    }

    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;

    // Extract JSON block from the response text
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ||
                      text.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch?.[1] ?? text;
    const parsed = JSON.parse(jsonStr.trim()) as { recent_deals?: any[]; notable_deals?: any[] };
    return {
      recent_deals: mapDeals(parsed.recent_deals, false),
      notable_deals: mapDeals(parsed.notable_deals, true),
    };
  } catch (err) {
    log(`[Perplexity] Error for ${firmName}: ${(err as Error).message}`);
    return null;
  }
}

// ── Exa Search ────────────────────────────────────────────────────────────────

async function exaSearch(query: string): Promise<string> {
  if (!EXA_KEY) return "";
  try {
    const resp = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 5,
        contents: {
          text: { maxCharacters: 2000 },
          highlights: {
            query,
            highlightsPerUrl: 4,
            numSentences: 3,
          },
        },
      }),
    });
    if (!resp.ok) {
      log(`[Exa] HTTP ${resp.status} for query: ${query.slice(0, 60)}`);
      return "";
    }
    const data = await resp.json() as { results?: Array<{ title?: string; highlights?: string[]; text?: string }> };
    return (data.results ?? []).map((r, i) => {
      const hlText = (r.highlights ?? []).join(" ");
      const body   = r.text ? r.text.slice(0, 1200) : "";
      return `[Source ${i + 1}] ${r.title ?? ""}\n${hlText}\n${body}`;
    }).join("\n\n---\n\n");
  } catch (err) {
    log(`[Exa] Error: ${(err as Error).message}`);
    return "";
  }
}

// ── LLM Extraction (Groq primary, Gemini fallback) ───────────────────────────

const SYSTEM_PROMPT = `You are a precise VC data extractor. Given research text about a venture capital firm, extract portfolio company investments. Return ONLY valid JSON with this exact schema:
{
  "recent_deals": [
    { "company_name": "string", "amount": "string or null", "stage": "string or null", "date_announced": "YYYY-MM-DD or null", "investment_status": "active|exited|acquired|ipo|unknown" }
  ],
  "notable_deals": [
    { "company_name": "string", "amount": "string or null", "stage": "string or null", "date_announced": "YYYY-MM-DD or null", "investment_status": "active|exited|acquired|ipo|unknown" }
  ]
}
Rules:
- recent_deals: investments made in the last 12-18 months; extract up to 10
- notable_deals: flagship/well-known portfolio companies that define the firm's brand; extract up to 15
- Do NOT duplicate companies across both arrays — put each company in only one array
- Do NOT hallucinate. Only include companies explicitly mentioned in the text
- amount: include units e.g. "$5M", "$25M Series A" — null if unknown
- stage: "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth", or sector if stage unknown
- If no investments found, return empty arrays`;

function mapDeals(
  arr: Array<{ company_name: string; amount?: string | null; stage?: string | null; date_announced?: string | null; investment_status?: string | null }> | undefined,
  notable: boolean
): PortfolioDeal[] {
  return (arr ?? [])
    .filter(d => d.company_name?.trim())
    .map(d => ({
      company_name: d.company_name.trim(),
      amount: d.amount?.trim() || null,
      stage: d.stage?.trim() || null,
      date_announced: d.date_announced?.trim() || null,
      is_notable: notable,
      investment_status: d.investment_status?.trim() || null,
    }));
}

async function extractWithGroq(
  firmName: string,
  combined: string,
  retries = 2
): Promise<EnrichResult | null> {
  if (!GROQ_KEY) return null;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extract portfolio company data for the VC firm "${firmName}" from this research:\n\n${combined}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });
    if (resp.status === 429 && retries > 0) {
      log(`[Groq] Rate limited for ${firmName} — waiting ${GROQ_RETRY_DELAY}ms then retrying (${retries} left)`);
      await new Promise(r => setTimeout(r, GROQ_RETRY_DELAY));
      return extractWithGroq(firmName, combined, retries - 1);
    }
    if (!resp.ok) {
      const body = await resp.text();
      log(`[Groq] HTTP ${resp.status} for ${firmName}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    const parsed = JSON.parse(text) as { recent_deals?: any[]; notable_deals?: any[] };
    return {
      recent_deals: mapDeals(parsed.recent_deals, false),
      notable_deals: mapDeals(parsed.notable_deals, true),
    };
  } catch (err) {
    log(`[Groq] Parse error for ${firmName}: ${(err as Error).message}`);
    return null;
  }
}

async function extractWithGemini(
  firmName: string,
  combined: string
): Promise<EnrichResult | null> {
  if (!GEMINI_KEY) return null;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: `Extract portfolio company data for the VC firm "${firmName}" from this research:\n\n${combined}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      }
    );
    if (!resp.ok) { log(`[Gemini] HTTP ${resp.status} for ${firmName}`); return null; }
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as { recent_deals?: any[]; notable_deals?: any[] };
    return {
      recent_deals: mapDeals(parsed.recent_deals, false),
      notable_deals: mapDeals(parsed.notable_deals, true),
    };
  } catch (err) {
    log(`[Gemini] Parse error for ${firmName}: ${(err as Error).message}`);
    return null;
  }
}

async function extractDeals(
  firmName: string,
  recentText: string,
  notableText: string
): Promise<EnrichResult | null> {
  const combined = [
    recentText ? `=== RECENT DEAL SCOUTING ===\n${recentText}` : "",
    notableText ? `=== NOTABLE PORTFOLIO RESEARCH ===\n${notableText}` : "",
  ].filter(Boolean).join("\n\n");

  if (!combined.trim()) return null;

  // Try Groq first, fall back to Gemini
  return (await extractWithGroq(firmName, combined)) ??
         (await extractWithGemini(firmName, combined));
}

// ── Supabase Upsert ───────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

async function upsertDeals(
  supabase: SupabaseClient,
  firmId: string,
  firmName: string,
  deals: PortfolioDeal[]
): Promise<{ inserted: number; updated: number }> {
  if (deals.length === 0) return { inserted: 0, updated: 0 };
  if (DRY_RUN) {
    log(`[DRY_RUN] Would upsert ${deals.length} deals for ${firmName}`);
    return { inserted: deals.length, updated: 0 };
  }

  // Deduplicate by normalized_company_name — keep the is_notable=true version if duplicated
  const seen = new Map<string, PortfolioDeal>();
  for (const d of deals) {
    const key = normalize(d.company_name);
    const existing = seen.get(key);
    if (!existing || d.is_notable) seen.set(key, d);
  }
  const deduped = Array.from(seen.values());

  // Deduplicate by normalized_company_name — keep the is_notable=true version if duplicated
  const seen = new Map<string, PortfolioDeal>();
  for (const d of deals) {
    const key = normalize(d.company_name);
    const existing = seen.get(key);
    if (!existing || d.is_notable) seen.set(key, d);
  }
  const deduped = Array.from(seen.values());

  const rows = deduped.map(d => ({
    firm_id: firmId,
    company_name: d.company_name,
    normalized_company_name: normalize(d.company_name),
    amount: d.amount,
    stage: d.stage,
    date_announced: d.date_announced,
    is_notable: d.is_notable,
    investment_status: d.investment_status ?? "unknown",
    source_name: "exa_gemini_bulk",
    updated_at: new Date().toISOString(),
  }));

  // The unique index is partial (WHERE normalized_company_name IS NOT NULL),
  // which Supabase client's onConflict doesn't support. Use delete+insert instead,
  // matching what the enrich-pipeline edge function does.
  const { error: delErr } = await supabase
    .from("firm_recent_deals")
    .delete()
    .eq("firm_id", firmId);

  if (delErr) {
    log(`[Upsert] Delete error for ${firmName}: ${delErr.message}`);
    return { inserted: 0, updated: 0 };
  }

  const { error: insErr, count } = await supabase
    .from("firm_recent_deals")
    .insert(rows)
    .select("id", { count: "exact", head: true });

  if (insErr) {
    log(`[Upsert] Insert error for ${firmName}: ${insErr.message}`);
    return { inserted: 0, updated: 0 };
  }

  return { inserted: count ?? deduped.length, updated: 0 };
}

async function markEnriched(supabase: SupabaseClient, firmId: string): Promise<void> {
  if (DRY_RUN) return;
  await supabase
    .from("firm_records")
    .update({ last_enriched_at: new Date().toISOString() })
    .eq("id", firmId);
}

// ── Core per-firm enrichment ──────────────────────────────────────────────────

async function enrichFirm(
  supabase: SupabaseClient,
  firm: FirmRow,
  idx: number,
  total: number
): Promise<{ status: "success" | "no_data" | "error"; deals: number }> {
  const tag = `[${idx + 1}/${total}] ${firm.firm_name}`;
  log(`${tag} — starting`);

  try {
    const domain = firm.website_url
      ? firm.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0]
      : null;
    const domainHint = domain ? ` (${domain})` : "";

    // Path A: Perplexity (search + extract in one call — preferred when key available)
    let result: EnrichResult | null = null;
    if (PERPLEXITY_KEY) {
      result = await enrichWithPerplexity(firm.firm_name, domain);
    }

    // Path B: Exa + Groq/Gemini (fallback when Perplexity unavailable or failed)
    if (!result) {
      const [recentText, notableText] = await Promise.all([
        exaSearch(
          `Recent startup investments seed round Series A funded by ${firm.firm_name}${domainHint} 2024 2025`
        ),
        exaSearch(
          `${firm.firm_name}${domainHint} portfolio companies notable investments best companies backed`
        ),
      ]);

      if (!recentText && !notableText) {
        log(`${tag} — no Exa results`);
        await markEnriched(supabase, firm.id);
        return { status: "no_data", deals: 0 };
      }

      result = await extractDeals(firm.firm_name, recentText, notableText);
    }

    if (!result) {
      log(`${tag} — Gemini returned nothing`);
      await markEnriched(supabase, firm.id);
      return { status: "no_data", deals: 0 };
    }

    const allDeals = [...result.recent_deals, ...result.notable_deals];

    if (allDeals.length === 0) {
      log(`${tag} — 0 deals extracted`);
      await markEnriched(supabase, firm.id);
      return { status: "no_data", deals: 0 };
    }

    const { inserted } = await upsertDeals(supabase, firm.id, firm.firm_name, allDeals);
    await markEnriched(supabase, firm.id);

    log(`${tag} — ✅ ${result.recent_deals.length} recent + ${result.notable_deals.length} notable (${inserted} upserted)`);
    return { status: "success", deals: allDeals.length };
  } catch (err) {
    log(`${tag} — ❌ ${(err as Error).message}`);
    return { status: "error", deals: 0 };
  }
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<void>
): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
      if (DELAY_MS > 0 && idx < items.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Validate env
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }
  if (!EXA_KEY) {
    console.error("❌ EXA_API_KEY is required");
    process.exit(1);
  }
  if (!GROQ_KEY && !GEMINI_KEY && !PERPLEXITY_KEY) {
    console.error("❌ GROQ_API_KEY, GEMINI_API_KEY, or PERPLEXITY_API_KEY is required");
    process.exit(1);
  }
  const llm = PERPLEXITY_KEY ? "Perplexity sonar-pro" : GROQ_KEY ? "Groq llama-3.3-70b" : "Gemini 2.0 Flash";
  log(`LLM: ${llm}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  log("=" .repeat(60));
  log(`Bulk Portfolio Enrichment — start`);
  log(`DRY_RUN=${DRY_RUN}  LIMIT=${LIMIT}  CONCURRENCY=${CONCURRENCY}  SKIP_ENRICHED=${SKIP_ENRICHED}`);
  log("=".repeat(60));

  // Fetch firms to enrich — exclude individual investors, target real VC/fund entities
  const baseFilter = (q: ReturnType<typeof supabase.from>) =>
    (q as any)
      .is("deleted_at", null)
      .not("firm_name", "ilike", "%(Individual)%")
      .not("firm_name", "ilike", "%(Angel)%")
      .order("last_enriched_at", { ascending: true, nullsFirst: true });

  let query: ReturnType<typeof supabase.from>;
  if (FIRM_IDS_FILTER) {
    query = supabase
      .from("firm_records")
      .select("id, firm_name, website_url")
      .in("id", FIRM_IDS_FILTER);
  } else if (SKIP_ENRICHED) {
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    query = baseFilter(
      supabase
        .from("firm_records")
        .select("id, firm_name, website_url")
    )
      .or(`last_enriched_at.is.null,last_enriched_at.lt.${staleDate}`)
      .limit(LIMIT);
  } else {
    query = baseFilter(
      supabase
        .from("firm_records")
        .select("id, firm_name, website_url")
    ).limit(LIMIT);
  }

  const { data: firms, error } = await query;
  if (error) {
    log(`❌ Failed to fetch firms: ${error.message}`);
    process.exit(1);
  }
  if (!firms || firms.length === 0) {
    log("✅ No firms to enrich — all up to date.");
    return;
  }

  log(`Found ${firms.length} firms to enrich`);

  const stats = { success: 0, no_data: 0, error: 0, total_deals: 0 };

  await runWithConcurrency(firms as FirmRow[], CONCURRENCY, async (firm, idx) => {
    const result = await enrichFirm(supabase, firm, idx, firms.length);
    stats[result.status]++;
    stats.total_deals += result.deals;
  });

  log("=".repeat(60));
  log(`Done: ${stats.success} enriched, ${stats.no_data} no_data, ${stats.error} errors`);
  log(`Total portfolio companies upserted: ${stats.total_deals}`);
  log(`Log file: ${LOG_FILE}`);
  log("=".repeat(60));
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

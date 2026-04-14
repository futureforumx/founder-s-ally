/**
 * enrich-portfolio-from-firm-websites.ts
 * =======================================
 * Enriches the `investormatch_vc_firms.portfolio` JSONB column by:
 *
 *  Phase 1 — Discovery (per firm):
 *    Fetches the firm's website and portfolio sub-pages, then uses an AI
 *    model (Claude → Groq → Gemini cascade) to extract a list of portfolio
 *    companies with name, website, stage, date, sector, and description.
 *    Falls back to Exa web-search when direct scraping returns too little.
 *
 *  Phase 2 — Enrichment (per company):
 *    For every discovered company that has a website URL, calls the
 *    Brandfetch v2 API to fill logo_url, description, sector, and social
 *    links.  Exa is used when the portfolio page doesn't include a website
 *    and Brandfetch needs a domain.
 *
 *  Phase 3 — Persist:
 *    Writes the enriched portfolio array back to `investormatch_vc_firms`
 *    and stamps `enriched_at`.
 *
 * Usage:
 *   npx tsx scripts/enrich-portfolio-from-firm-websites.ts
 *   LIMIT=50 npx tsx scripts/enrich-portfolio-from-firm-websites.ts
 *   FIRM_IDS=uuid1,uuid2 npx tsx scripts/enrich-portfolio-from-firm-websites.ts
 *   CONCURRENCY=3 npx tsx scripts/enrich-portfolio-from-firm-websites.ts
 *   DRY_RUN=1 npx tsx scripts/enrich-portfolio-from-firm-websites.ts
 *   SKIP_ENRICHED=false npx tsx scripts/enrich-portfolio-from-firm-websites.ts
 *   PLAYWRIGHT=1 npx tsx scripts/enrich-portfolio-from-firm-websites.ts  # JS-heavy sites
 *
 * Required env (from .env / .env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY   (primary AI — claude-3-5-haiku-20241022)
 *   BRANDFETCH_API_KEY  (company logos + descriptions)
 *
 * Optional env:
 *   EXA_API_KEY         (website discovery fallback)
 *   GROQ_API_KEY        (AI fallback if Anthropic unavailable)
 *   GEMINI_API_KEY      (AI fallback if Groq unavailable)
 */

import { appendFileSync } from "node:fs";
import { loadEnvFiles } from "./lib/loadEnvFiles.js";

loadEnvFiles([".env", ".env.local"]);

// ── Config ────────────────────────────────────────────────────────────────────

const e    = (n: string, fb = "") => (process.env[n] ?? "").trim() || fb;
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string, def = false) => {
  const val = e(n).toLowerCase();
  return ["1","true","yes"].includes(val) ? true : ["0","false","no"].includes(val) ? false : def;
};

const SUPABASE_URL   = e("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY    = e("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_KEY  = e("ANTHROPIC_API_KEY");
const GROQ_KEY       = e("GROQ_API_KEY");
const GEMINI_KEY     = e("GEMINI_API_KEY");
const BF_KEY         = e("BRANDFETCH_API_KEY");
const EXA_KEY        = e("EXA_API_KEY");

const DRY_RUN        = eBool("DRY_RUN");
const LIMIT          = eInt("LIMIT", 9_999);
const CONCURRENCY    = eInt("CONCURRENCY", 2);
const DELAY_MS       = eInt("DELAY_MS", 2_000);
const SKIP_ENRICHED  = eBool("SKIP_ENRICHED", true);
const USE_PLAYWRIGHT = eBool("PLAYWRIGHT");
const FETCH_TIMEOUT  = eInt("FETCH_TIMEOUT_MS", 12_000);
const LOG_FILE       = "/tmp/enrich-portfolio-websites.log";

const FIRM_IDS_FILTER = e("FIRM_IDS")
  ? e("FIRM_IDS").split(",").map(s => s.trim()).filter(Boolean)
  : null;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
if (!ANTHROPIC_KEY && !GROQ_KEY && !GEMINI_KEY) {
  console.error("❌  At least one of ANTHROPIC_API_KEY / GROQ_API_KEY / GEMINI_API_KEY is required");
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FirmRow {
  id: string;
  name: string;
  website_url: string;
  portfolio_count: number;
  sector_tags: string[] | null;
}

interface PortfolioCompany {
  name: string;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  sector: string | null;
  stage: string | null;
  date_announced: string | null;
  investment_status: string | null;
  hq_city: string | null;
  hq_country: string | null;
  employee_count: number | null;
  founded_year: number | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  enrichment_source: string;
}

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Domain helpers ─────────────────────────────────────────────────────────────

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.includes("://") ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (!url.startsWith("http")) url = `https://${url}`;
  try { return new URL(url).href; } catch { return url; }
}

// ── HTML → Text ────────────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  // Remove script/style blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Preserve line breaks for structural tags
  text = text
    .replace(/<\/(p|div|li|h[1-6]|section|article|header|footer|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");

  // Collapse whitespace
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Website fetching ───────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

async function fetchPage(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function fetchPagePlaywright(url: string): Promise<string | null> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: BROWSER_HEADERS["User-Agent"],
        locale: "en-US",
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(2_000); // let JS render
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch (err) {
    log(`[Playwright] Error for ${url}: ${(err as Error).message}`);
    return null;
  }
}

/** Try the base URL and common portfolio sub-paths. Returns the best page text found. */
async function fetchPortfolioText(baseUrl: string): Promise<{ url: string; text: string } | null> {
  const base = baseUrl.replace(/\/$/, "");
  const candidates = [
    base,
    `${base}/portfolio`,
    `${base}/companies`,
    `${base}/investments`,
    `${base}/portfolio-companies`,
    `${base}/our-portfolio`,
    `${base}/startups`,
    `${base}/backed-companies`,
    `${base}/investments/portfolio`,
  ];

  let best: { url: string; text: string } | null = null;

  for (const url of candidates) {
    const fetchFn = USE_PLAYWRIGHT ? fetchPagePlaywright : fetchPage;
    const html = await fetchFn(url);
    if (!html) continue;

    const text = htmlToText(html);

    // Heuristic: page must mention at least some portfolio-like keywords
    const portfolioSignals = [
      /portfolio/i, /invest/i, /compan/i, /startup/i, /backed/i,
      /founded/i, /series/i, /seed/i, /funded/i,
    ];
    const signalCount = portfolioSignals.filter(r => r.test(text)).length;
    if (signalCount < 2) continue;

    // Prefer longer content (more companies)
    if (!best || text.length > best.text.length) {
      best = { url, text: text.slice(0, 30_000) }; // cap at 30k chars for LLM
    }

    // If we found a dedicated portfolio sub-page, no need to check further
    if (url !== base) break;
  }

  return best;
}

// ── AI extraction ──────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a precise VC portfolio data extractor. Given webpage text from a VC firm's website, extract portfolio company information. Return ONLY valid JSON matching this exact schema — no markdown fences, no extra text:

{
  "companies": [
    {
      "name": "string",
      "website": "full URL or null",
      "description": "1-2 sentence description or null",
      "sector": "primary industry vertical or null",
      "stage": "Pre-Seed|Seed|Series A|Series B|Series C|Growth|null",
      "date_announced": "YYYY or YYYY-MM-DD or null",
      "investment_status": "active|exited|acquired|ipo|unknown"
    }
  ]
}

Rules:
- Only include companies explicitly listed as portfolio/invested companies
- Do NOT hallucinate companies not present in the text
- website: include the full URL if shown; do not guess domains
- Extract up to 60 companies; ignore duplicates
- If no companies found, return {"companies": []}`;

async function extractWithClaude(firmName: string, text: string): Promise<PortfolioCompany[] | null> {
  if (!ANTHROPIC_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: EXTRACT_SYSTEM,
        messages: [{
          role: "user",
          content: `Extract portfolio companies from this ${firmName} website content:\n\n${text}`,
        }],
      }),
    });
    if (!res.ok) { log(`[Claude] HTTP ${res.status}`); return null; }
    const data = await res.json() as { content?: Array<{ text?: string }> };
    const raw = data.content?.[0]?.text ?? "";
    return parseExtractedCompanies(raw);
  } catch (err) {
    log(`[Claude] Error: ${(err as Error).message}`);
    return null;
  }
}

async function extractWithGroq(firmName: string, text: string): Promise<PortfolioCompany[] | null> {
  if (!GROQ_KEY) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: `Extract portfolio companies for "${firmName}":\n\n${text}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) { log(`[Groq] HTTP ${res.status}`); return null; }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return parseExtractedCompanies(data.choices?.[0]?.message?.content ?? "");
  } catch (err) {
    log(`[Groq] Error: ${(err as Error).message}`);
    return null;
  }
}

async function extractWithGemini(firmName: string, text: string): Promise<PortfolioCompany[] | null> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: EXTRACT_SYSTEM }] },
          contents: [{ parts: [{ text: `Extract portfolio companies for "${firmName}":\n\n${text}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      }
    );
    if (!res.ok) { log(`[Gemini] HTTP ${res.status}`); return null; }
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return parseExtractedCompanies(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
  } catch (err) {
    log(`[Gemini] Error: ${(err as Error).message}`);
    return null;
  }
}

function parseExtractedCompanies(raw: string): PortfolioCompany[] | null {
  try {
    const match = raw.match(/(\{[\s\S]*\})/);
    const json = match ? match[1] : raw;
    const parsed = JSON.parse(json) as { companies?: Array<{
      name?: string; website?: string | null; description?: string | null;
      sector?: string | null; stage?: string | null; date_announced?: string | null;
      investment_status?: string | null;
    }> };
    const companies = parsed.companies ?? [];
    return companies
      .filter(c => c.name?.trim())
      .map(c => ({
        name: c.name!.trim(),
        website: c.website?.trim() || null,
        description: c.description?.trim() || null,
        logo_url: null,
        sector: c.sector?.trim() || null,
        stage: c.stage?.trim() || null,
        date_announced: c.date_announced?.trim() || null,
        investment_status: c.investment_status?.trim() || "unknown",
        hq_city: null,
        hq_country: null,
        employee_count: null,
        founded_year: null,
        linkedin_url: null,
        twitter_url: null,
        enrichment_source: "website_scrape",
      }));
  } catch {
    return null;
  }
}

async function extractCompanies(firmName: string, text: string): Promise<PortfolioCompany[]> {
  const result =
    (await extractWithClaude(firmName, text)) ??
    (await extractWithGroq(firmName, text)) ??
    (await extractWithGemini(firmName, text));
  return result ?? [];
}

// ── Exa: find company website ─────────────────────────────────────────────────

async function findCompanyWebsite(companyName: string): Promise<string | null> {
  if (!EXA_KEY) return null;
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${companyName} startup company official website`,
        type: "auto",
        numResults: 3,
        contents: { text: { maxCharacters: 200 } },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { results?: Array<{ url?: string; title?: string }> };
    const first = (data.results ?? []).find(r => {
      if (!r.url) return false;
      const u = r.url.toLowerCase();
      // Exclude Wikipedia, Crunchbase, LinkedIn, news sites
      return !u.includes("wikipedia") && !u.includes("crunchbase") &&
             !u.includes("linkedin") && !u.includes("techcrunch") &&
             !u.includes("venturebeat") && !u.includes("forbes");
    });
    return first?.url ?? null;
  } catch { return null; }
}

// ── Brandfetch enrichment ─────────────────────────────────────────────────────

interface BrandData {
  description?: string | null;
  longDescription?: string | null;
  logos?: Array<{ theme?: string; formats?: Array<{ format?: string; src?: string; width?: number }> }>;
  links?: Array<{ name?: string; url?: string }>;
  company?: {
    employees?: number | null;
    foundedYear?: number | null;
    city?: string | null;
    country?: string | null;
    kind?: string | null;
    industries?: Array<{ name?: string }>;
  };
}

function pickBestLogoUrl(logos: BrandData["logos"]): string | null {
  if (!logos?.length) return null;
  for (const theme of ["light", "icon", "dark"]) {
    const group = logos.find(l => l.theme === theme);
    if (!group?.formats?.length) continue;
    const svg = group.formats.find(f => f.format === "svg" && f.src);
    if (svg?.src) return svg.src;
    const pngs = group.formats
      .filter(f => f.format === "png" && f.src)
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    if (pngs[0]?.src) return pngs[0].src;
  }
  return null;
}

async function enrichWithBrandfetch(company: PortfolioCompany): Promise<PortfolioCompany> {
  if (!BF_KEY) return company;

  let domain = extractDomain(company.website);

  // If we have no website, try to find one via Exa
  if (!domain && EXA_KEY) {
    const found = await findCompanyWebsite(company.name);
    if (found) {
      company = { ...company, website: found };
      domain = extractDomain(found);
    }
  }

  if (!domain) return company;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${BF_KEY}`, Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) return company;
    const brand = await res.json() as BrandData;

    const logoUrl = pickBestLogoUrl(brand.logos) ?? company.logo_url;

    const description = (brand.description || brand.longDescription || company.description)?.trim() || null;

    const links = brand.links ?? [];
    const linkedin = links.find(l => l.name?.toLowerCase() === "linkedin")?.url ?? company.linkedin_url ?? null;
    const twitter  = links.find(l => l.name?.toLowerCase() === "twitter")?.url ?? company.twitter_url ?? null;

    const co = brand.company;
    const sector = company.sector ??
      co?.industries?.map(i => i.name).filter(Boolean).join(", ") ??
      co?.kind ?? null;

    return {
      ...company,
      logo_url: logoUrl,
      description,
      sector,
      hq_city: company.hq_city ?? co?.city ?? null,
      hq_country: company.hq_country ?? co?.country ?? null,
      employee_count: company.employee_count ?? co?.employees ?? null,
      founded_year: company.founded_year ?? co?.foundedYear ?? null,
      linkedin_url: linkedin,
      twitter_url: twitter,
      enrichment_source: "website_scrape+brandfetch",
    };
  } catch { return company; }
}

// ── Exa fallback discovery ─────────────────────────────────────────────────────

async function discoverViaExa(
  firmName: string,
  domain: string | null
): Promise<PortfolioCompany[]> {
  if (!EXA_KEY) return [];
  const domainHint = domain ? ` (${domain})` : "";
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${firmName}${domainHint} portfolio companies investments startups backed`,
        type: "auto",
        numResults: 5,
        contents: { text: { maxCharacters: 3_000 }, highlights: { highlightsPerUrl: 5, numSentences: 3 } },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ title?: string; text?: string; highlights?: string[] }> };
    const combined = (data.results ?? [])
      .map((r, i) => `[Source ${i + 1}] ${r.title ?? ""}\n${(r.highlights ?? []).join(" ")}\n${r.text ?? ""}`)
      .join("\n\n---\n\n")
      .slice(0, 20_000);
    if (!combined.trim()) return [];
    return await extractCompanies(firmName, combined);
  } catch { return []; }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function fetchFirms(): Promise<FirmRow[]> {
  const params = new URLSearchParams({
    select: "id,name,website_url,portfolio_count,sector_tags",
    website_url: "not.is.null",
    order: "enriched_at.asc.nullsfirst",
    limit: String(LIMIT),
  });

  if (SKIP_ENRICHED) {
    const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    params.set("or", `(portfolio_enriched_at.is.null,portfolio_enriched_at.lt.${stale})`);
  }

  if (FIRM_IDS_FILTER) {
    params.delete("website_url");
    params.delete("or");
    params.set("id", `in.(${FIRM_IDS_FILTER.join(",")})`);
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/investormatch_vc_firms?${params}`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) throw new Error(`Failed to fetch firms: ${res.status} ${await res.text()}`);
  return res.json();
}

async function persistPortfolio(
  firmId: string,
  firmName: string,
  companies: PortfolioCompany[]
): Promise<void> {
  if (DRY_RUN) {
    log(`  [DRY] Would write ${companies.length} companies for ${firmName}`);
    return;
  }
  const now = new Date().toISOString();
  const body = JSON.stringify({
    portfolio: companies,
    portfolio_enriched_at: now,
    portfolio_source: companies[0]?.enrichment_source?.split("+")[0] ?? "website_scrape",
    enriched_at: now,
    updated_at: now,
  });
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/investormatch_vc_firms?id=eq.${firmId}`,
    { method: "PATCH", headers: SB_HEADERS, body }
  );
  if (!res.ok) {
    log(`  ✗ Persist error for ${firmName}: ${res.status} ${await res.text()}`);
  }
}

// ── Core per-firm enrichment ──────────────────────────────────────────────────

async function enrichFirm(
  firm: FirmRow,
  idx: number,
  total: number
): Promise<{ status: "ok" | "no_data" | "error"; count: number }> {
  const tag = `[${idx + 1}/${total}] ${firm.name}`;
  log(`${tag} — start (${firm.website_url})`);

  try {
    const domain = extractDomain(firm.website_url);

    // Phase 1: Discovery — scrape website first, fall back to Exa
    let companies: PortfolioCompany[] = [];

    const fetched = await fetchPortfolioText(firm.website_url);
    if (fetched && fetched.text.length > 200) {
      log(`  Scraped ${fetched.url} — ${fetched.text.length} chars`);
      companies = await extractCompanies(firm.name, fetched.text);
      log(`  AI extracted ${companies.length} companies from website`);
    }

    // Fall back to Exa if scraping yielded nothing useful
    if (companies.length === 0 && EXA_KEY) {
      log(`  Falling back to Exa search`);
      companies = await discoverViaExa(firm.name, domain);
      log(`  Exa extracted ${companies.length} companies`);
    }

    if (companies.length === 0) {
      log(`${tag} — no companies found`);
      await persistPortfolio(firm.id, firm.name, []);
      return { status: "no_data", count: 0 };
    }

    // Phase 2: Enrich each company with Brandfetch
    if (BF_KEY) {
      const enriched: PortfolioCompany[] = [];
      for (const co of companies) {
        const e = await enrichWithBrandfetch(co);
        enriched.push(e);
        // Throttle to avoid BF rate limits
        await sleep(300);
      }
      companies = enriched;
      const logoCount = companies.filter(c => c.logo_url).length;
      const descCount = companies.filter(c => c.description).length;
      log(`  Enriched: ${logoCount}/${companies.length} logos, ${descCount}/${companies.length} descriptions`);
    }

    // Phase 3: Persist
    await persistPortfolio(firm.id, firm.name, companies);
    log(`${tag} — ✅ ${companies.length} companies written`);
    return { status: "ok", count: companies.length };
  } catch (err) {
    log(`${tag} — ❌ ${(err as Error).message}`);
    return { status: "error", count: 0 };
  }
}

// ── Concurrency ────────────────────────────────────────────────────────────────

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<void>
): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
      if (DELAY_MS > 0 && idx < items.length) await sleep(DELAY_MS);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const ai = ANTHROPIC_KEY ? "Claude Haiku" : GROQ_KEY ? "Groq llama-3.3-70b" : "Gemini 2.0 Flash";
  const bf = BF_KEY ? "Brandfetch ON" : "Brandfetch OFF (no key)";
  const ex = EXA_KEY ? "Exa ON" : "Exa OFF (no key)";

  log("=".repeat(60));
  log("Portfolio enrichment from firm websites");
  log(`AI: ${ai}  |  ${bf}  |  ${ex}`);
  log(`DRY_RUN=${DRY_RUN}  LIMIT=${LIMIT}  CONCURRENCY=${CONCURRENCY}  PLAYWRIGHT=${USE_PLAYWRIGHT}`);
  log("=".repeat(60));

  const firms = await fetchFirms() as FirmRow[];
  if (!firms.length) { log("✅ No firms to enrich"); return; }
  log(`Fetched ${firms.length} firms to process`);

  const stats = { ok: 0, no_data: 0, error: 0, total_companies: 0 };

  await runPool(firms, CONCURRENCY, async (firm, idx) => {
    const r = await enrichFirm(firm, idx, firms.length);
    stats[r.status]++;
    stats.total_companies += r.count;
  });

  log("=".repeat(60));
  log(`Done: ${stats.ok} enriched, ${stats.no_data} no_data, ${stats.error} errors`);
  log(`Total portfolio companies written: ${stats.total_companies}`);
  log(`Log: ${LOG_FILE}`);
  log("=".repeat(60));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });

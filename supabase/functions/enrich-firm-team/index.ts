/**
 * enrich-firm-team — Supabase Edge Function
 *
 * Scrapes a VC firm's team / people page, extracts individual investor
 * profiles using Gemini, then upserts the data into:
 *   • vc_people  — individual investor records (linked to vc_firms row)
 *   • vc_signals — BLOG_POST signals for thought-leadership articles
 *
 * Request body:
 *   { firmId: string }           — required
 *
 * Enrichment pipeline:
 *   1. Firecrawl  — scrapes the team page (JS-rendered, clean markdown)
 *   2. Gemini     — extracts structured investor list from the markdown
 *   3. EXA        — per-investor neural search to fill missing social links,
 *                   thought-leadership articles, and investment themes
 *   4. Supabase   — upserts vc_people + vc_signals (BLOG_POST per article)
 *
 * Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FIRECRAWL_API_KEY            — Firecrawl scraping (primary)
 *   JINA_API_KEY                 — Jina Reader scraping fallback
 *   LOVABLE_API_KEY              — Lovable AI gateway (Tier 1 AI)
 *   GROQ_API_KEY                 — Groq fast inference (Tier 2 AI)
 *   GEMINI_API_KEY               — Google Gemini direct REST (Tier 3 AI)
 *   EXA_API_KEY                  — EXA neural search (optional but recommended)
 *
 * Response:
 *   { added, updated, signalsAdded, exaEnriched, errors }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
    "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Article {
  title: string;
  url: string;
  published_at?: string;
  platform?: "medium" | "substack" | "linkedin" | "twitter" | "company_blog" | "other";
  summary?: string;
}

interface ExtractedPerson {
  first_name: string;
  last_name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
  email?: string;
  linkedin_url?: string;
  x_url?: string;
  medium_url?: string;
  substack_url?: string;
  investment_themes?: string[];
  articles?: Article[];
  portfolio_companies?: string[];
}

interface ExtractionResult {
  investors: ExtractedPerson[];
}

// ---------------------------------------------------------------------------
// Step 1: Discover the team page URL
// ---------------------------------------------------------------------------

const TEAM_PAGE_SUFFIXES = [
  "/team",
  "/people",
  "/about/team",
  "/about/people",
  "/about-us/team",
  "/our-team",
  "/who-we-are",
  "/partners",
  "/portfolio-team",
  "/about",
];

async function discoverTeamPageUrl(websiteUrl: string): Promise<string | null> {
  const base = websiteUrl.replace(/\/$/, "");

  // First, scrape the homepage and look for a team/people link
  try {
    const homepageMd = await firecrawlScrape(base);
    // Look for links that match team-page patterns
    const patterns = [
      /https?:\/\/[^\s)]+(?:\/team|\/people|\/our-team|\/partners|\/who-we-are)[^\s)]*/gi,
      /\[(?:Team|People|Our Team|Partners|About|Who We Are)\]\(([^)]+)\)/gi,
    ];

    for (const pattern of patterns) {
      const matches = [...(homepageMd.matchAll(pattern) ?? [])];
      if (matches.length > 0) {
        let href = matches[0][1] ?? matches[0][0];
        if (href && !href.startsWith("http")) {
          href = `${base}${href.startsWith("/") ? "" : "/"}${href}`;
        }
        if (href) return href;
      }
    }
  } catch {
    // fall through to suffix guessing
  }

  // Fall back to common suffixes — check each with a HEAD request
  for (const suffix of TEAM_PAGE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    try {
      const r = await fetch(candidate, { method: "HEAD", redirect: "follow" });
      if (r.ok) return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 2: Scrape — Firecrawl → Jina Reader → raw fetch waterfall
// ---------------------------------------------------------------------------

async function jinaFetch(url: string): Promise<string | null> {
  const key = Deno.env.get("JINA_API_KEY");
  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Return-Format": "markdown",
    "X-Timeout": "25",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;

  try {
    const r = await fetch(jinaUrl, { headers, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const text = await r.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function rawFetch(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VEKTA-TeamEnrich/1.0)",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Strip tags for a rough plaintext representation
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
               .replace(/<[^>]+>/g, " ")
               .replace(/\s{2,}/g, " ")
               .trim();
  } catch {
    return null;
  }
}

async function firecrawlScrape(url: string): Promise<string> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

  // Tier 1: Firecrawl
  if (FIRECRAWL_API_KEY) {
    const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 30000,
      }),
    });

    if (r.ok) {
      const data = await r.json();
      const md = (data.data?.markdown ?? data.markdown ?? "") as string;
      if (md.trim()) return md;
    }
  }

  // Tier 2: Jina Reader
  const jinaMd = await jinaFetch(url);
  if (jinaMd) return jinaMd;

  // Tier 3: Raw fetch (plain HTML → text)
  const rawText = await rawFetch(url);
  if (rawText) return rawText;

  throw new Error(`All scraping methods failed for ${url}`);
}

// ---------------------------------------------------------------------------
// Step 3: Extract structured data with Gemini via Lovable AI gateway
// ---------------------------------------------------------------------------

/** Build shared extraction prompt */
function buildExtractionPrompt(firmName: string, markdown: string, teamPageUrl: string): string {
  return `You are a data analyst specialising in venture capital.

I have scraped the team/people page for "${firmName}" from: ${teamPageUrl}

Your job is to extract EVERY individual investor, partner, principal, associate, or team member you can identify from the content below.

For each person, extract all available fields. Only include data that is explicitly present in the content — do not invent or assume anything.

Key extraction rules:
- investment_themes: capture any specific verticals, sectors, or thesis areas mentioned for this person (e.g. "B2B SaaS", "Climate Tech", "Web3")
- articles: capture links to blog posts, essays, Substack posts, or Medium articles authored by this person
- portfolio_companies: any companies they personally invested in or are noted with
- For social links, accept full URLs or handles (e.g. "@username" or "linkedin.com/in/...")
- avatar_url: only include if there is a direct image URL in the content

Return a JSON object with this exact shape:
{
  "investors": [
    {
      "first_name": "string",
      "last_name": "string",
      "title": "string or null",
      "bio": "string or null",
      "avatar_url": "string or null",
      "email": "string or null",
      "linkedin_url": "string or null",
      "x_url": "string or null",
      "medium_url": "string or null",
      "substack_url": "string or null",
      "investment_themes": ["string"],
      "articles": [
        {
          "title": "string",
          "url": "string",
          "published_at": "YYYY-MM-DD or null",
          "platform": "medium|substack|linkedin|twitter|company_blog|other",
          "summary": "string or null"
        }
      ],
      "portfolio_companies": ["string"]
    }
  ]
}

--- PAGE CONTENT ---
${markdown.slice(0, 60000)}`;
}

/** Try Groq as a fast fallback */
async function extractViaGroq(prompt: string): Promise<ExtractedPerson[]> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return [];

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a VC data analyst. Always respond with valid JSON only — no markdown fences.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 8192,
    }),
  });

  if (!r.ok) return [];
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    return (JSON.parse(raw) as ExtractionResult).investors ?? [];
  } catch {
    return [];
  }
}

/** Try Gemini direct REST as another fallback */
async function extractViaGeminiDirect(prompt: string): Promise<ExtractedPerson[]> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return [];

  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    }
  );

  if (!r.ok) return [];
  const data = await r.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    return (JSON.parse(raw) as ExtractionResult).investors ?? [];
  } catch {
    return [];
  }
}

async function extractInvestorsWithGemini(
  firmName: string,
  markdown: string,
  teamPageUrl: string
): Promise<ExtractedPerson[]> {
  const prompt = buildExtractionPrompt(firmName, markdown, teamPageUrl);

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    // No Lovable key — try Groq then Gemini direct
    const groqResult = await extractViaGroq(prompt);
    if (groqResult.length > 0) return groqResult;
    return extractViaGeminiDirect(prompt);
  }

  // Tier 1: Lovable AI gateway
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (r.ok) {
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as ExtractionResult;
      if ((parsed.investors ?? []).length > 0) return parsed.investors!;
    } catch {
      // fall through to next tier
    }
  }

  // Tier 2: Groq (fast fallback)
  const groqFallback = await extractViaGroq(prompt);
  if (groqFallback.length > 0) return groqFallback;

  // Tier 3: Gemini direct REST
  return extractViaGeminiDirect(prompt);
}

// ---------------------------------------------------------------------------
// Step 4: Multi-source investor enrichment waterfall
// Sources: EXA · SerpWow · LinkUp (search) + Lusha · Exporium (contact lookup)
// ---------------------------------------------------------------------------

interface EnrichSearchResult {
  url: string;
  title: string;
  snippet?: string;
  publishedDate?: string;
}

/** EXA neural search */
async function edgeSearchExa(queries: string[]): Promise<EnrichSearchResult[]> {
  const key = Deno.env.get("EXA_API_KEY");
  if (!key) return [];
  const out: EnrichSearchResult[] = [];
  for (const query of queries) {
    try {
      const r = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ query, type: "neural", numResults: 5, contents: { text: { maxCharacters: 1500 } } }),
      });
      if (!r.ok) continue;
      const data = await r.json() as { results?: Array<{ url: string; title: string; text?: string; publishedDate?: string }> };
      out.push(...(data.results ?? []).map((x) => ({ url: x.url, title: x.title, snippet: x.text, publishedDate: x.publishedDate })));
    } catch { continue; }
  }
  return out;
}

/** SerpWow Google search */
async function edgeSearchSerpWow(query: string): Promise<EnrichSearchResult[]> {
  const key = Deno.env.get("SERPWOW_API_KEY") ?? Deno.env.get("SERP_WOW_API_KEY") ?? Deno.env.get("SERPWOW_API");
  if (!key) return [];
  try {
    const params = new URLSearchParams({ q: query, api_key: key, engine: "google", num: "10", output: "json" });
    const r = await fetch(`https://api.serpwow.com/live/search?${params}`);
    if (!r.ok) return [];
    const data = await r.json() as { organic_results?: Array<{ link: string; title: string; snippet?: string }> };
    return (data.organic_results ?? []).map((o) => ({ url: o.link, title: o.title, snippet: o.snippet }));
  } catch { return []; }
}

/** LinkUp deep professional search */
async function edgeSearchLinkUp(query: string): Promise<EnrichSearchResult[]> {
  const key = Deno.env.get("LINKUP_API_KEY") ?? Deno.env.get("LINKUP_API");
  if (!key) return [];
  try {
    const r = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, depth: "standard", outputType: "searchResults" }),
    });
    if (!r.ok) return [];
    const data = await r.json() as { results?: Array<{ url: string; name?: string; title?: string; content?: string }> };
    return (data.results ?? []).map((o) => ({ url: o.url, title: o.title ?? o.name ?? "", snippet: o.content }));
  } catch { return []; }
}

/** People Data Labs — returns email, LinkedIn, X and other social data */
async function edgePdlLookup(
  firstName: string, lastName: string, firmName: string, linkedinUrl?: string
): Promise<Partial<ExtractedPerson>> {
  const key = Deno.env.get("PEOPLE_DATA_LABS_API_KEY") ?? Deno.env.get("PDL_API_KEY") ?? Deno.env.get("PEOPLEDATALABS_API_KEY");
  if (!key) return {};
  try {
    const payload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      name: `${firstName} ${lastName}`,
      company: firmName,
    };
    if (linkedinUrl) payload.profile = linkedinUrl;

    const r = await fetch("https://api.peopledatalabs.com/v5/person/enrich", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return {};
    const data = await r.json() as {
      data?: {
        emails?: Array<{ address: string }>;
        linkedin_url?: string;
        twitter_url?: string;
        profiles?: Array<{ url: string; network: string }>;
      };
      status?: number;
    };
    if (data.status && data.status !== 200) return {};
    const d = data.data ?? (data as typeof data.data);
    if (!d) return {};

    const result: Partial<ExtractedPerson> = {};
    const emailAddr = d.emails?.[0]?.address;
    if (emailAddr) result.email = emailAddr;
    if (d.linkedin_url) result.linkedin_url = d.linkedin_url;
    if (d.twitter_url) result.x_url = d.twitter_url;
    for (const p of d.profiles ?? []) {
      const u = p.url?.toLowerCase() ?? "";
      if (!result.linkedin_url && u.includes("linkedin.com")) result.linkedin_url = p.url;
      if (!result.x_url && (u.includes("twitter.com") || u.includes("x.com"))) result.x_url = p.url;
    }
    return result;
  } catch { return {}; }
}

/** Lusha contact lookup by name + company */
async function edgeLushaLookup(
  firstName: string, lastName: string, firmName: string, linkedinUrl?: string
): Promise<{ email?: string; linkedin_url?: string }> {
  const key = Deno.env.get("LUSHA_API_KEY") ?? Deno.env.get("LUSHA_API");
  if (!key) return {};
  try {
    const params = new URLSearchParams({ firstName, lastName, company: firmName });
    if (linkedinUrl) params.set("linkedInUrl", linkedinUrl);
    const r = await fetch(`https://api.lusha.com/person?${params}`, { headers: { api_key: key } });
    if (!r.ok) return {};
    const data = await r.json() as {
      emailAddresses?: Array<{ email: string }>;
      email?: string;
      linkedIn?: string;
      linkedInUrl?: string;
    };
    const email = data.emailAddresses?.[0]?.email ?? data.email;
    const linkedin_url = data.linkedIn ?? data.linkedInUrl;
    return { ...(email ? { email } : {}), ...(linkedin_url ? { linkedin_url } : {}) };
  } catch { return {}; }
}

/** Exporium — configurable enrichment endpoint */
async function edgeExporiuEnrich(
  firstName: string, lastName: string, firmName: string, extra?: Record<string, string>
): Promise<Partial<ExtractedPerson>> {
  const key = Deno.env.get("EXPORIUM_API_KEY");
  const url = Deno.env.get("EXPORIUM_API_URL");
  if (!key || !url) return {};
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, company: firmName, ...(extra ?? {}) }),
    });
    if (!r.ok) return {};
    const data = await r.json() as Record<string, unknown>;
    const pick = (k: string) => (typeof data[k] === "string" ? data[k] as string : undefined);
    return {
      ...(pick("email") ? { email: pick("email") } : {}),
      ...(pick("linkedin_url") ? { linkedin_url: pick("linkedin_url") } : {}),
      ...(pick("x_url") ? { x_url: pick("x_url") } : {}),
      ...(pick("medium_url") ? { medium_url: pick("medium_url") } : {}),
      ...(pick("substack_url") ? { substack_url: pick("substack_url") } : {}),
    };
  } catch { return {}; }
}

/** Apply a list of search results to fill social links, articles, and themes */
function edgeApplySearchResults(
  person: ExtractedPerson,
  enriched: Partial<ExtractedPerson>,
  results: EnrichSearchResult[]
): void {
  for (const res of results) {
    const u = res.url.toLowerCase();
    if (!person.linkedin_url && !enriched.linkedin_url && u.includes("linkedin.com/in/")) enriched.linkedin_url = res.url;
    if (!person.x_url && !enriched.x_url && (u.includes("twitter.com/") || u.includes("x.com/")) && !u.includes("/status/")) enriched.x_url = res.url;
    if (!person.medium_url && !enriched.medium_url && u.includes("medium.com/@")) enriched.medium_url = res.url.split("/").slice(0, 4).join("/");
    if (!person.substack_url && !enriched.substack_url && u.includes("substack.com") && !u.includes("/p/")) enriched.substack_url = res.url.split("/p/")[0];
  }

  const newArticles: Article[] = [...(person.articles ?? [])];
  const existingUrls = new Set(newArticles.map((a) => a.url));
  for (const res of results) {
    const u = res.url.toLowerCase();
    const isArticle =
      (u.includes("medium.com") && u.includes("/p/")) ||
      (u.includes("substack.com") && u.includes("/p/")) ||
      u.includes("linkedin.com/pulse/");
    if (!isArticle || existingUrls.has(res.url)) continue;
    existingUrls.add(res.url);
    const platform: Article["platform"] = u.includes("medium.com") ? "medium" : u.includes("substack.com") ? "substack" : u.includes("linkedin.com") ? "linkedin" : "other";
    newArticles.push({ title: res.title || "Untitled", url: res.url, published_at: res.publishedDate?.slice(0, 10), platform, summary: res.snippet?.slice(0, 300) });
  }
  if (newArticles.length > (person.articles?.length ?? 0)) enriched.articles = newArticles;

  if (!person.investment_themes?.length && !enriched.investment_themes?.length) {
    const corpus = results.map((r) => r.snippet ?? "").join(" ");
    const themePatterns: Array<[RegExp, string]> = [
      [/\bai\b|artificial intelligence|machine learning/i, "AI / ML"],
      [/\bfintech|payments|insurtech/i, "Fintech"],
      [/\bdeveloper tools?|devtools|infrastructure/i, "Developer Tools"],
      [/\bhealth(?:tech)?|biotech|medtech|digital health/i, "Health / Bio"],
      [/\bclimate|energy|clean ?tech|sustainability/i, "Climate / Clean Tech"],
      [/\benterprise|b2b\b|saas\b/i, "Enterprise / B2B"],
      [/\bconsumer|marketplace|d2c\b/i, "Consumer / Marketplace"],
      [/\bcyber|security\b/i, "Cybersecurity"],
      [/\bweb3|crypto|blockchain|defi\b/i, "Web3 / Crypto"],
      [/\brobotic|autonomous|hardware\b/i, "Robotics / Hardware"],
    ];
    const themes = themePatterns.filter(([re]) => re.test(corpus)).map(([, label]) => label);
    if (themes.length > 0) enriched.investment_themes = themes;
  }
}

async function exaEnrichPerson(
  person: ExtractedPerson,
  firmName: string
): Promise<Partial<ExtractedPerson>> {
  const fullName = `${person.first_name} ${person.last_name}`;
  const enriched: Partial<ExtractedPerson> = {};

  const baseQuery = `"${fullName}" "${firmName}" venture capital investor`;
  const articleQuery = !person.articles?.length
    ? `"${fullName}" site:medium.com OR site:substack.com`
    : null;
  const queries = [baseQuery, ...(articleQuery ? [articleQuery] : [])];

  // Run all search providers concurrently
  const [exaResults, serpResults, linkupResults] = await Promise.all([
    edgeSearchExa(queries),
    edgeSearchSerpWow(baseQuery),
    edgeSearchLinkUp(baseQuery),
  ]);

  const allResults = [...exaResults, ...serpResults, ...linkupResults];
  if (allResults.length > 0) edgeApplySearchResults(person, enriched, allResults);

  // Contact lookup providers (PDL + Lusha + Exporium) — run concurrently
  const currentLinkedin = enriched.linkedin_url ?? person.linkedin_url ?? undefined;
  const [pdl, lusha, exporium] = await Promise.all([
    edgePdlLookup(person.first_name, person.last_name, firmName, currentLinkedin),
    edgeLushaLookup(person.first_name, person.last_name, firmName, currentLinkedin),
    edgeExporiuEnrich(person.first_name, person.last_name, firmName,
      person.linkedin_url ? { linkedinUrl: person.linkedin_url } : undefined),
  ]);

  // Fill gaps only — priority: Exporium > Lusha > PDL
  for (const src of [pdl, lusha, exporium]) {
    if (!person.email && !enriched.email && src.email) enriched.email = src.email;
    if (!person.linkedin_url && !enriched.linkedin_url && src.linkedin_url) enriched.linkedin_url = src.linkedin_url;
    if (!person.x_url && !enriched.x_url && src.x_url) enriched.x_url = src.x_url;
    if (!person.medium_url && !enriched.medium_url && src.medium_url) enriched.medium_url = src.medium_url;
    if (!person.substack_url && !enriched.substack_url && src.substack_url) enriched.substack_url = src.substack_url;
  }

  return enriched;
}

/**
 * Run full enrichment (EXA + SerpWow + LinkUp + Lusha + Exporium) concurrently
 * across all extracted investors. Max 4 at a time to respect rate limits.
 */
async function exaEnrichAllPeople(
  people: ExtractedPerson[],
  firmName: string
): Promise<ExtractedPerson[]> {
  const hasAnyKey =
    Deno.env.get("EXA_API_KEY") || Deno.env.get("SERPWOW_API_KEY") ||
    Deno.env.get("LINKUP_API_KEY") || Deno.env.get("PDL_API_KEY") ||
    Deno.env.get("PEOPLE_DATA_LABS_API_KEY") || Deno.env.get("LUSHA_API_KEY") ||
    Deno.env.get("EXPORIUM_API_KEY");
  if (!hasAnyKey) {
    console.log("[enrich-firm-team] No enrichment provider keys set — skipping investor enrichment");
    return people;
  }

  console.log(`[enrich-firm-team] Enriching ${people.length} investors (EXA + SerpWow + LinkUp + PDL + Lusha + Exporium)...`);

  const CONCURRENCY = 4;
  const enriched = [...people];

  for (let i = 0; i < people.length; i += CONCURRENCY) {
    const batch = people.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((p) => exaEnrichPerson(p, firmName).catch(() => ({} as Partial<ExtractedPerson>)))
    );

    for (let j = 0; j < batch.length; j++) {
      const patch = results[j];
      if (!patch || Object.keys(patch).length === 0) continue;
      enriched[i + j] = { ...enriched[i + j], ...patch };
    }
  }

  return enriched;
}

// ---------------------------------------------------------------------------
// Step 5: Upsert investors into vc_people
// ---------------------------------------------------------------------------

function normalizeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  url = url.trim();
  if (!url) return null;
  if (!url.startsWith("http")) url = `https://${url}`;
  return url;
}

function mapPlatform(url: string): Article["platform"] {
  const u = url.toLowerCase();
  if (u.includes("medium.com")) return "medium";
  if (u.includes("substack.com")) return "substack";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  return "company_blog";
}

async function upsertPeople(
  supabase: ReturnType<typeof createClient>,
  firmId: string,
  people: ExtractedPerson[]
): Promise<{ added: number; updated: number; signalsAdded: number; errors: string[] }> {
  let added = 0;
  let updated = 0;
  let signalsAdded = 0;
  const errors: string[] = [];

  for (const p of people) {
    if (!p.first_name || !p.last_name) {
      errors.push(`Skipped person with missing name: ${JSON.stringify(p).slice(0, 80)}`);
      continue;
    }

    try {
      // Check if this person already exists for this firm
      const { data: existing } = await supabase
        .from("vc_people")
        .select("id, articles")
        .eq("firm_id", firmId)
        .ilike("first_name", p.first_name.trim())
        .ilike("last_name", p.last_name.trim())
        .is("deleted_at", null)
        .maybeSingle();

      // Merge articles — keep existing ones not duplicated
      const existingArticles: Article[] = (existing?.articles as Article[]) ?? [];
      const newArticles: Article[] = (p.articles ?? []).filter(
        (a) => a.url && !existingArticles.some((e) => e.url === a.url)
      );
      const mergedArticles = [...existingArticles, ...newArticles];

      const personPayload = {
        firm_id: firmId,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        title: p.title ?? null,
        bio: p.bio ?? null,
        avatar_url: normalizeUrl(p.avatar_url),
        email: p.email ?? null,
        linkedin_url: normalizeUrl(p.linkedin_url),
        x_url: normalizeUrl(p.x_url),
        medium_url: normalizeUrl(p.medium_url),
        substack_url: normalizeUrl(p.substack_url),
        investment_themes: p.investment_themes ?? [],
        articles: mergedArticles.length > 0 ? mergedArticles : null,
        team_page_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from("vc_people")
          .update(personPayload)
          .eq("id", existing.id);
        updated++;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("vc_people")
          .insert(personPayload)
          .select("id")
          .single();

        if (insertErr) {
          errors.push(`Insert failed for ${p.first_name} ${p.last_name}: ${insertErr.message}`);
          continue;
        }
        added++;

        // Use the new person's id for signal creation below
        existing && (existing.id = inserted?.id ?? null);
      }

      // Fetch the person id for signal creation
      const personId = existing?.id ?? (
        await supabase
          .from("vc_people")
          .select("id")
          .eq("firm_id", firmId)
          .ilike("first_name", p.first_name.trim())
          .ilike("last_name", p.last_name.trim())
          .is("deleted_at", null)
          .maybeSingle()
      ).data?.id;

      // Upsert VCSignal BLOG_POST for each article
      for (const article of newArticles) {
        if (!article.url || !article.title) continue;

        const platform = article.platform ?? mapPlatform(article.url);
        const signalPayload = {
          firm_id: firmId,
          person_id: personId ?? null,
          signal_type: "BLOG_POST",
          title: article.title.slice(0, 500),
          url: article.url,
          description: article.summary ?? null,
          signal_date: article.published_at ? new Date(article.published_at).toISOString() : null,
          source_type: "OTHER",
          metadata: { platform, author: `${p.first_name} ${p.last_name}` },
        };

        // Upsert on url uniqueness within firm
        const { data: existingSig } = await supabase
          .from("vc_signals")
          .select("id")
          .eq("firm_id", firmId)
          .eq("url", article.url)
          .is("deleted_at", null)
          .maybeSingle();

        if (!existingSig) {
          const { error: sigErr } = await supabase.from("vc_signals").insert(signalPayload);
          if (sigErr) {
            errors.push(`Signal insert failed: ${sigErr.message}`);
          } else {
            signalsAdded++;
          }
        }
      }
    } catch (err) {
      errors.push(`Error processing ${p.first_name} ${p.last_name}: ${(err as Error).message}`);
    }
  }

  return { added, updated, signalsAdded, errors };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase env vars not configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const { firmId } = body as { firmId?: string };

    if (!firmId) {
      return json({ error: "firmId is required" }, 400);
    }

    // Fetch firm
    const { data: firm, error: firmErr } = await supabase
      .from("vc_firms")
      .select("id, firm_name, website_url")
      .eq("id", firmId)
      .is("deleted_at", null)
      .single();

    if (firmErr || !firm) {
      return json({ error: `Firm not found: ${firmErr?.message ?? "unknown"}` }, 404);
    }

    if (!firm.website_url) {
      return json({ error: "Firm has no website_url — cannot discover team page" }, 422);
    }

    console.log(`[enrich-firm-team] Processing firm: ${firm.firm_name} (${firm.id})`);

    // Discover team page
    console.log(`[enrich-firm-team] Discovering team page for ${firm.website_url}`);
    const teamPageUrl = await discoverTeamPageUrl(firm.website_url);

    if (!teamPageUrl) {
      return json({ error: "Could not discover team page URL for this firm" }, 422);
    }

    console.log(`[enrich-firm-team] Team page found: ${teamPageUrl}`);

    // Scrape the page
    let markdown: string;
    try {
      markdown = await firecrawlScrape(teamPageUrl);
    } catch (e) {
      return json({ error: `Scrape failed: ${(e as Error).message}` }, 502);
    }

    if (!markdown || markdown.trim().length < 100) {
      return json({ error: "Scraped page content is too short to extract investor data" }, 422);
    }

    console.log(`[enrich-firm-team] Scraped ${markdown.length} chars — extracting investors...`);

    // Step 3: Extract investors with Gemini
    let investors: ExtractedPerson[];
    try {
      investors = await extractInvestorsWithGemini(firm.firm_name, markdown, teamPageUrl);
    } catch (e) {
      return json({ error: `AI extraction failed: ${(e as Error).message}` }, 502);
    }

    console.log(`[enrich-firm-team] Extracted ${investors.length} investors from team page`);

    // Step 4: EXA per-investor enrichment — fills gaps (social links, articles, themes)
    // Runs concurrently; gracefully skips if EXA_API_KEY is not set
    const enrichedInvestors = await exaEnrichAllPeople(investors, firm.firm_name);

    console.log(`[enrich-firm-team] EXA enrichment complete — upserting to DB...`);

    // Step 5: Upsert to DB
    const result = await upsertPeople(supabase, firmId, enrichedInvestors);

    console.log(`[enrich-firm-team] Done: +${result.added} added, ~${result.updated} updated, ${result.signalsAdded} signals`);

    return json({
      firmId,
      firmName: firm.firm_name,
      teamPageUrl,
      investorsFound: enrichedInvestors.length,
      exaEnriched: Deno.env.get("EXA_API_KEY") ? true : false,
      ...result,
    });
  } catch (e) {
    console.error("[enrich-firm-team] Unexpected error:", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});

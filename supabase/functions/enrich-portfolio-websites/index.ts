import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ---------------------------------------------------------------------------
// enrich-portfolio-websites  v6
// ---------------------------------------------------------------------------
// Fetches VC firm portfolio pages, extracts companies via HTML parsing
// (no AI key required) + optional AI enrichment when LOVABLE_API_KEY,
// OPENAI_API_KEY, or GROQ_API_KEY is set as a Supabase secret.
//
// pg_cron fires this every minute via net.http_post with {"batch_size":15}.
// Each invocation marks a batch of firms immediately (prevents double-processing)
// then runs extraction in the background via EdgeRuntime.waitUntil.
//
// POST body (all optional):
//   batch_size        number  (default 15, max 30)
//   dry_run           bool    (default false)
//   re_enrich         bool    (default false) — re-process 'attempted' firms
//   lovable_api_key / openai_api_key / groq_api_key — override secrets
//   brandfetch_api_key                             — override secret
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SB_HEADERS   = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

const PORTFOLIO_PATHS = [
  '', '/portfolio', '/companies', '/investments',
  '/portfolio-companies', '/our-portfolio', '/startups',
  '/backed-companies', '/our-companies', '/investments/portfolio',
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Words — checked per-word (any word in text matches → skip)
const NAV_WORDS = new Set([
  'home','about','team','contact','blog','news','careers','investors',
  'press','login','signup','portfolio','companies','twitter',
  'linkedin','facebook','instagram','youtube','medium','github','crunchbase',
  'menu','search','close','subscribe','newsletter','privacy','terms','policy',
  'cookies','legal','jobs','lp','logout','signin','register','donate',
  'support','help','docs','documentation','api','demo','pricing','features',
  'solutions','services','platform','products','resources','events',
  'webinar','whitepaper','sitemap','accessibility','copyright','disclaimer','rss',
]);

// First-word action verbs — if a multi-word phrase STARTS with one of these it's a CTA
const CTA_FIRST_WORDS = new Set([
  'find','visit','join','get','apply','pitch','report','hire','invest',
  'sponsor','follow','share','sign','create','start','submit','request',
  'download','watch','explore','discover','connect','read','view','see',
  'learn','build','launch','book','schedule','register','claim','unlock',
  'access','try','use','go','click','enter','check','meet','talk','ask',
]);

// Platforms / URL shorteners that are never portfolio company homepages
const NOISE_DOMAINS = new Set([
  // URL shorteners
  'bit.ly','t.co','tinyurl.com','ow.ly','short.io','rb.gy','buff.ly',
  'dlvr.it','lnkd.in','goo.gl','trib.al','ift.tt','j.mp','tiny.cc',
  // Form / survey platforms
  'google.com','forms.gle','typeform.com','tally.so','airtable.com','jotform.com',
  // Newsletter / no-code platforms
  'beehiiv.com','substack.com','mailchimp.com','convertkit.com','ghost.io',
  'webflow.io','squarespace.com','wix.com','weebly.com','carrd.co',
  // Deal rooms / investor portals
  'intralinks.com','stacker.app','irwin.app',
  // Coworking / space platforms
  'officernd.com','nexudus.com','coworker.com','deskpass.com',
  // Productivity / meeting
  'notion.so','coda.io','calendly.com','loom.com','zoom.us',
  'meet.google.com','drive.google.com','docs.google.com',
  // Storage
  'box.com','dropbox.com','sharepoint.com',
  // Media / news
  'techcrunch.com','venturebeat.com','forbes.com','bloomberg.com','wsj.com',
  'businessinsider.com','inc.com','entrepreneur.com',
  // Databases
  'crunchbase.com','pitchbook.com','angellist.com','angel.co',
  'producthunt.com','f6s.com','sbir.gov','sec.gov',
]);

// Subdomain prefixes that indicate utility pages
const NAV_SUBDOMAINS = new Set([
  'jobs','careers','legal','privacy','press','docs','support','help',
  'status','signup','login','auth','mail','email','blog','cdn',
  'api','static','assets','images','img','news','media',
]);

// ── HTML helpers ──────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.includes('://') ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}

function extractHostname(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.includes('://') ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.toLowerCase();
  } catch { return null; }
}

/** true if ANY word in text is a nav/utility word */
function hasNavWord(text: string): boolean {
  const words = text.toLowerCase().split(/[\s\-_&|/\\,;:]+/);
  return words.some(w => NAV_WORDS.has(w.replace(/[^a-z]/g, '')));
}

/** true if the URL should be skipped */
function isNoiseUrl(url: string, firmDomain: string): boolean {
  const domain = extractDomain(url);
  if (!domain) return true;
  if (domain === firmDomain || domain.endsWith('.' + firmDomain)) return true;
  if (NOISE_DOMAINS.has(domain)) return true;
  if (/(twitter\.com|x\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|crunchbase\.com|angel\.co|medium\.com|github\.com|glassdoor\.com|wellfound\.com)/.test(domain)) return true;
  const hostname = extractHostname(url) ?? '';
  const sub = hostname.split('.')[0];
  if (NAV_SUBDOMAINS.has(sub)) return true;
  return false;
}

/** true if the name looks like a CTA phrase rather than a company name */
function isCTAPhrase(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length > 1 && CTA_FIRST_WORDS.has(words[0].toLowerCase())) return true;
  // Tagline pattern: "X for Y" (e.g. "CRM for Media", "Platform for Founders")
  if (/\bfor\b/i.test(text) && words.length >= 3) return true;
  // All-caps multi-word (e.g. "INVESTOR PORTAL", "FUND LP LOGIN")
  if (words.length > 1 && text === text.toUpperCase()) return true;
  return false;
}

// ── Smart HTML portfolio extractor ────────────────────────────────────────

function extractCompaniesFromHTML(html: string, firmUrl: string): any[] {
  const firmDomain = extractDomain(firmUrl) ?? '';
  const companies = new Map<string, string | null>(); // name → website

  // Strategy 1: External links with short anchor text
  const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{2,80}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const url = m[1];
    const rawText = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!rawText || rawText.length < 2 || rawText.length > 60) continue;
    if (isNoiseUrl(url, firmDomain)) continue;
    if (hasNavWord(rawText)) continue;
    if (isCTAPhrase(rawText)) continue;
    const words = rawText.split(/\s+/);
    if (words.length > 5) continue;
    if (/^[a-z]/.test(rawText) && words.length > 2) continue;
    if (!companies.has(rawText)) companies.set(rawText, url);
  }

  // Strategy 2: alt text of images inside <a> tags (logos)
  const imgLinkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+alt="([^"]{2,60})"[\s\S]*?<\/a>/gi;
  while ((m = imgLinkRe.exec(html)) !== null) {
    const url = m[1];
    const alt = m[2].replace(/\b(logo|icon|image|img)\b/gi, '').trim();
    if (!alt || alt.length < 2) continue;
    if (isNoiseUrl(url, firmDomain)) continue;
    if (hasNavWord(alt)) continue;
    if (isCTAPhrase(alt)) continue;
    if (!companies.has(alt)) companies.set(alt, url);
  }

  // Strategy 3: headings inside portfolio-related containers
  const sectionRe = /<(?:section|div|article)[^>]+(?:class|id)="[^"]*(?:portfolio|compan|invest|startup|backed)[^"]*"[^>]*>([\s\S]{0,8000}?)<\/(?:section|div|article)>/gi;
  while ((m = sectionRe.exec(html)) !== null) {
    const sectionHtml = m[1];
    const headRe = /<h[1-6][^>]*>([\s\S]{2,60}?)<\/h[1-6]>/gi;
    let hm: RegExpExecArray | null;
    while ((hm = headRe.exec(sectionHtml)) !== null) {
      const text = hm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 2 || text.length > 60) continue;
      if (hasNavWord(text)) continue;
      if (isCTAPhrase(text)) continue;
      if (!companies.has(text)) companies.set(text, null);
    }
  }

  const results: any[] = [];
  for (const [name, website] of companies.entries()) {
    if (/^[\d\s\W]+$/.test(name)) continue;
    if (/^https?:\/\//.test(name)) continue;
    if (/^[A-Z]{2,}$/.test(name) && name.length <= 6) continue;
    results.push({
      name,
      website: website ?? null,
      description: null, logo_url: null, sector: null, stage: null,
      date_announced: null, investment_status: 'active',
      hq_city: null, hq_country: null, employee_count: null, founded_year: null,
      linkedin_url: null, twitter_url: null,
      enrichment_source: 'website_scrape',
    });
    if (results.length >= 80) break;
  }
  return results;
}

// ── AI extraction (optional, used when key is available) ──────────────────

const AI_SYSTEM = `You are a precise VC portfolio data extractor. From VC website text extract portfolio companies. Return ONLY valid JSON:
{"companies":[{"name":"string","website":"URL or null","description":"1-2 sentences or null","sector":"industry or null","stage":"Pre-Seed|Seed|Series A|Series B|Series C|Growth|null","date_announced":"YYYY or null","investment_status":"active|exited|acquired|ipo|unknown"}]}
Rules: only companies explicitly listed; no hallucination; max 60; return {"companies":[]} if none found.`;

async function extractWithAI(firmName: string, text: string, aiKey: string, aiBaseUrl: string, aiModel: string): Promise<any[]> {
  try {
    const res = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: AI_SYSTEM },
          { role: 'user', content: `Extract portfolio companies from this ${firmName} website content:\n\n${text.slice(0,28000)}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/({[\s\S]*})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : raw) as { companies?: any[] };
    return (parsed.companies ?? []).filter((c: any) => c.name?.trim()).map((c: any) => ({
      name: c.name.trim(), website: c.website?.trim() || null,
      description: c.description?.trim() || null, logo_url: null,
      sector: c.sector?.trim() || null, stage: c.stage?.trim() || null,
      date_announced: c.date_announced?.trim() || null,
      investment_status: c.investment_status?.trim() || 'unknown',
      hq_city: null, hq_country: null, employee_count: null, founded_year: null,
      linkedin_url: null, twitter_url: null,
      enrichment_source: 'website_scrape+ai',
    }));
  } catch (e) { console.error('AI error:', e); return []; }
}

// ── Fetch portfolio page ───────────────────────────────────────────────────

async function fetchPortfolioPage(baseUrl: string): Promise<{ url: string; html: string; text: string } | null> {
  const base = baseUrl.replace(/\/$/, '');
  let best: { url: string; html: string; text: string } | null = null;

  for (const path of PORTFOLIO_PATHS) {
    const url = base + path;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(12_000),
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('text/html')) continue;
      const html = await res.text();
      const text = htmlToText(html).slice(0, 32_000);
      const hits = [/portfolio/i, /invest/i, /compan/i, /startup/i, /backed/i, /seed/i, /series/i, /fund/i]
        .filter(r => r.test(text)).length;
      if (hits < 2) continue;
      if (!best || text.length > best.text.length) best = { url, html, text };
      if (path !== '') break;
    } catch { continue; }
  }
  return best;
}

// ── Brandfetch enrichment ─────────────────────────────────────────────────

function pickBestLogo(logos: any[]): string | null {
  if (!logos?.length) return null;
  for (const theme of ['light', 'icon', 'dark']) {
    const g = logos.find((l: any) => l.theme === theme);
    if (!g?.formats?.length) continue;
    const svg = g.formats.find((f: any) => f.format === 'svg' && f.src);
    if (svg?.src) return svg.src;
    const pngs = g.formats.filter((f: any) => f.format === 'png' && f.src).sort((a: any,b: any) => (b.width??0)-(a.width??0));
    if (pngs[0]?.src) return pngs[0].src;
  }
  return null;
}

async function enrichWithBrandfetch(co: any, bfKey: string): Promise<any> {
  const domain = extractDomain(co.website);
  if (!domain) return co;
  try {
    const res = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      headers: { Authorization: `Bearer ${bfKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return co;
    const b = await res.json() as any;
    const links = b.links ?? [];
    return {
      ...co,
      logo_url: pickBestLogo(b.logos) ?? co.logo_url,
      description: (b.description || b.longDescription || co.description)?.trim() || null,
      sector: co.sector ?? b.company?.industries?.map((i: any) => i.name).filter(Boolean).join(', ') ?? null,
      hq_city: co.hq_city ?? b.company?.city ?? null,
      hq_country: co.hq_country ?? b.company?.country ?? null,
      employee_count: co.employee_count ?? b.company?.employees ?? null,
      founded_year: co.founded_year ?? b.company?.foundedYear ?? null,
      linkedin_url: co.linkedin_url ?? links.find((l: any) => l.name?.toLowerCase() === 'linkedin')?.url ?? null,
      twitter_url: co.twitter_url ?? links.find((l: any) => l.name?.toLowerCase() === 'twitter')?.url ?? null,
      enrichment_source: 'website_scrape+brandfetch',
    };
  } catch { return co; }
}

// ── Main ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const lovableKey = body.lovable_api_key ?? Deno.env.get('LOVABLE_API_KEY') ?? '';
  const openaiKey  = body.openai_api_key  ?? Deno.env.get('OPENAI_API_KEY')  ?? '';
  const groqKey    = body.groq_api_key    ?? Deno.env.get('GROQ_API_KEY')    ?? '';
  const bfKey      = body.brandfetch_api_key ?? Deno.env.get('BRANDFETCH_API_KEY') ?? '';
  const batchSize  = Math.min(body.batch_size ?? 15, 30);
  const dryRun     = body.dry_run ?? false;
  const reEnrich   = body.re_enrich ?? false;

  let aiKey = '', aiBaseUrl = '', aiModel = '';
  if (lovableKey) {
    aiKey = lovableKey; aiBaseUrl = 'https://ai.gateway.lovable.dev/v1'; aiModel = 'google/gemini-2.0-flash-exp';
  } else if (openaiKey) {
    aiKey = openaiKey; aiBaseUrl = 'https://api.openai.com/v1'; aiModel = 'gpt-4o-mini';
  } else if (groqKey) {
    aiKey = groqKey; aiBaseUrl = 'https://api.groq.com/openai/v1'; aiModel = 'llama-3.3-70b-versatile';
  }
  console.log(`v6 batch=${batchSize} ai=${aiKey ? aiModel : 'html_only'}`);

  const filterQs = reEnrich
    ? `portfolio_source=in.(attempted,website_scrape_html)&website_url=not.is.null`
    : `portfolio_enriched_at=is.null&website_url=not.is.null`;

  const params = new URLSearchParams({
    select: 'id,name,website_url,portfolio_count',
    order: 'portfolio_count.desc.nullslast',
    limit: String(batchSize),
  });
  const firmsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/investormatch_vc_firms?${filterQs}&${params}`,
    { headers: SB_HEADERS }
  );
  if (!firmsRes.ok) {
    return new Response(JSON.stringify({ error: 'DB fetch failed', detail: await firmsRes.text() }), { status: 500 });
  }
  const firms: any[] = await firmsRes.json();

  if (firms.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: 'All firms processed!', processed: 0 }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const stats = { processed: firms.length, enriched: 0, no_data: 0, errors: 0, total_companies: 0 };

  // Mark immediately to prevent double-processing by concurrent cron invocations
  if (!dryRun) {
    const now = new Date().toISOString();
    await fetch(`${SUPABASE_URL}/rest/v1/investormatch_vc_firms?id=in.(${firms.map((f: any) => f.id).join(',')})`, {
      method: 'PATCH',
      headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ portfolio_enriched_at: now }),
    });
  }

  EdgeRuntime.waitUntil((async () => {
    for (const firm of firms) {
      try {
        let companies: any[] = [];
        const page = await fetchPortfolioPage(firm.website_url);
        if (page) {
          if (aiKey) {
            companies = await extractWithAI(firm.name, page.text, aiKey, aiBaseUrl, aiModel);
            if (companies.length === 0) companies = extractCompaniesFromHTML(page.html, firm.website_url);
          } else {
            companies = extractCompaniesFromHTML(page.html, firm.website_url);
          }
          console.log(`${firm.name}: ${page.url} → ${companies.length} companies`);
        } else {
          console.log(`${firm.name}: no portfolio page`);
        }

        if (companies.length > 0 && bfKey) {
          const enriched: any[] = [];
          for (const co of companies) enriched.push(await enrichWithBrandfetch(co, bfKey));
          companies = enriched;
        }

        if (!dryRun) {
          const now = new Date().toISOString();
          await fetch(`${SUPABASE_URL}/rest/v1/investormatch_vc_firms?id=eq.${firm.id}`, {
            method: 'PATCH',
            headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
            body: JSON.stringify({
              portfolio: companies,
              portfolio_enriched_at: now,
              portfolio_source: companies.length > 0
                ? (aiKey ? 'website_scrape+ai' : 'website_scrape_html')
                : 'attempted',
              updated_at: now,
            }),
          });
        }

        if (companies.length > 0) { stats.enriched++; } else { stats.no_data++; }
        stats.total_companies += companies.length;
      } catch (err: any) {
        console.error(`Error: ${firm.name}:`, err);
        stats.errors++;
      }
    }
    console.log('Batch done:', JSON.stringify(stats));
  })());

  return new Response(
    JSON.stringify({ ok: true, batch: firms.map((f: any) => f.name), dry_run: dryRun, ai_mode: aiKey ? aiModel : 'html_only', ...stats }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
});

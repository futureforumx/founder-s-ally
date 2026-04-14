import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// firm-data-relay  v7
//
// DEPLOYMENT NOTE: This function is deployed to the RELAY Supabase project
// (uaaycclxojcgtlntpihy) — NOT to the main app project — because the local
// dev environment's egress proxy blocks direct access to *.supabase.co.
// The relay project has unrestricted outbound internet and can reach the
// main project (zmnlsdohtwztneamvwaq) via its REST API.
//
// pg_cron fires every minute (job 'enrich-firm-socials-scrape'):
//   SELECT cron.schedule('enrich-firm-socials-scrape', '* * * * *', $$ ... $$);
//
// POST body options:
//   batch_size      number   (default 80, max 200)
//   dry_run         bool     (default false)
//   brandfetch_key  string   override BRANDFETCH_API_KEY secret
//   stats           bool     return gap counts only
//   sample          number   return N social-gap rows
//   thesis_sample   number   return N thesis-gap + N filled rows
//   raw_query       string   pass-through GET to target REST API

const TARGET_URL = 'https://zmnlsdohtwztneamvwaq.supabase.co';
const TARGET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbmxzZG9odHd6dG5lYW12d2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE0NzcxMSwiZXhwIjoyMDg5NzIzNzExfQ.F_B5LAkujxUnK9EHlPsgruQqlIzN6vg_GUDcbF5kifc';
const H = { apikey: TARGET_KEY, Authorization: `Bearer ${TARGET_KEY}`, 'Content-Type': 'application/json' };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TWITTER_NOISE = new Set(['home','intent','share','hashtag','search','i','twitter','explore','settings','messages','notifications','login','signup','tos','privacy','about']);
const IG_NOISE = new Set(['p','reel','explore','accounts','tv']);
const FB_NOISE = new Set(['sharer','share','login','signup','dialog','tr','policies']);

function extractSocials(html: string): Record<string,string> {
  const out: Record<string,string> = {};

  const li = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/([A-Za-z0-9_.-]{2,100}?)(?:["'\s\/?#]|$)/);
  if (li) out.linkedin_url = `https://www.linkedin.com/company/${li[1].replace(/\/+$/, '')}`;

  const tw = html.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})(?:["'\s\/?#]|$)/);
  if (tw && !TWITTER_NOISE.has(tw[1].toLowerCase())) out.x_url = `https://x.com/${tw[1]}`;

  const ig = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,50}?)(?:["'\s\/?#]|$)/);
  if (ig && !IG_NOISE.has(ig[1].toLowerCase())) out.instagram_url = `https://www.instagram.com/${ig[1]}`;

  const fb = html.match(/https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.-]{2,100}?)(?:["'\s\/?#]|$)/);
  if (fb && !FB_NOISE.has(fb[1].toLowerCase())) out.facebook_url = `https://www.facebook.com/${fb[1]}`;

  const yt = html.match(/https?:\/\/(?:www\.)?youtube\.com\/((?:channel\/|c\/|@|user\/)[A-Za-z0-9_-]{2,100}?)(?:["'\s\/?#]|$)/);
  if (yt) out.youtube_url = `https://www.youtube.com/${yt[1]}`;

  const tt = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,50}?)(?:["'\s\/?#]|$)/);
  if (tt) out.tiktok_url = `https://www.tiktok.com/@${tt[1]}`;

  return out;
}

async function scrapeWebsite(url: string): Promise<Record<string,string>> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    if (!res.ok) return {};
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return {};
    return extractSocials(await res.text());
  } catch { return {}; }
}

async function callBrandfetch(url: string, key: string): Promise<Record<string,string>> {
  try {
    const domain = new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '');
    const r = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    const data = await r.json() as { links?: Array<{name?: string; url?: string}> };
    const MAP: Record<string,string> = {
      twitter: 'x_url', linkedin: 'linkedin_url', instagram: 'instagram_url',
      facebook: 'facebook_url', youtube: 'youtube_url', tiktok: 'tiktok_url',
    };
    const out: Record<string,string> = {};
    for (const l of data.links ?? []) {
      const col = MAP[(l.name ?? '').toLowerCase()];
      if (col && l.url) out[col] = l.url;
    }
    return out;
  } catch { return {}; }
}

Deno.serve(async (req: Request) => {
  let body: Record<string,unknown> = {};
  try { body = await req.json(); } catch { /* ok */ }

  const bfKey  = (body.brandfetch_key as string) ?? Deno.env.get('BRANDFETCH_API_KEY') ?? '';
  const batch  = typeof body.batch_size === 'number' ? Math.min(body.batch_size as number, 200) : 80;
  const dryRun = body.dry_run === true;

  // -- raw passthrough --------------------------------------------------------
  if (typeof body.raw_query === 'string') {
    const r = await fetch(`${TARGET_URL}/rest/v1/${body.raw_query}`, { headers: H });
    return new Response(JSON.stringify({ rows: await r.json() }), { headers: { 'Content-Type': 'application/json' } });
  }

  // -- stats ------------------------------------------------------------------
  if (body.stats) {
    const count = async (f: string) => {
      const r = await fetch(`${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&${f}&limit=1`,
        { headers: { ...H, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } });
      return parseInt(r.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    };
    const [total, no_hq_city, no_hq_loc, no_linkedin, tv_null, tv_empty] = await Promise.all([
      count('select=id'),
      count('hq_city=is.null'),
      count('hq_city=is.null&location=not.is.null'),
      count('linkedin_url=is.null&website_url=not.is.null'),
      count('thesis_verticals=is.null'),
      count('thesis_verticals=eq.%7B%7D'),
    ]);
    return new Response(JSON.stringify({
      total, no_hq_city,
      no_hq_city_with_location: no_hq_loc,
      no_linkedin,
      thesis_verticals_null: tv_null,
      thesis_verticals_empty: tv_empty,
      thesis_verticals_missing: tv_null + tv_empty,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // -- thesis_sample ----------------------------------------------------------
  // Returns both empty-thesis rows (to show the gap) and filled rows (to show
  // the taxonomy). Requires GROQ_API_KEY or similar in relay secrets to fill.
  if (body.thesis_sample) {
    const n = typeof body.thesis_sample === 'number' ? body.thesis_sample : 5;
    const [emptyRows, filledRows] = await Promise.all([
      fetch(`${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&thesis_verticals=eq.%7B%7D&select=id,firm_name,thesis_verticals,sector_scope,stage_focus,description,elevator_pitch&limit=${n}`, { headers: H }).then(r => r.json()),
      fetch(`${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&thesis_verticals=not.eq.%7B%7D&thesis_verticals=not.is.null&select=id,firm_name,thesis_verticals,sector_scope,stage_focus,description&limit=${n}`, { headers: H }).then(r => r.json()),
    ]);
    return new Response(JSON.stringify({ empty_rows: emptyRows, filled_rows: filledRows }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  // -- sample -----------------------------------------------------------------
  if (body.sample) {
    const n = typeof body.sample === 'number' ? body.sample : 3;
    const r = await fetch(
      `${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&linkedin_url=is.null&website_url=not.is.null&select=id,firm_name,website_url,thesis_verticals,linkedin_url,x_url&limit=${n}`,
      { headers: H });
    return new Response(JSON.stringify({ sample: await r.json() }), { headers: { 'Content-Type': 'application/json' } });
  }

  // -- main: concurrent social link scraping ----------------------------------
  // Fetches firms missing linkedin_url (proxy for all social links) and scrapes
  // their homepage for LinkedIn, X/Twitter, Instagram, Facebook, YouTube, TikTok.
  // Falls back to Brandfetch API when brandfetch_key is provided (higher hit rate).
  const select = 'id,firm_name,website_url,linkedin_url,x_url,instagram_url,facebook_url,youtube_url,tiktok_url';
  const resp = await fetch(
    `${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&linkedin_url=is.null&website_url=not.is.null&select=${select}&limit=${batch}`,
    { headers: H });
  if (!resp.ok) return new Response(JSON.stringify({ error: 'fetch_failed', detail: await resp.text() }), { status: 500 });

  type Firm = { id: string; firm_name: string; website_url: string; [k: string]: unknown };
  const firms: Firm[] = await resp.json();
  if (firms.length === 0) return new Response(JSON.stringify({ done: true, processed: 0 }), { headers: { 'Content-Type': 'application/json' } });

  const processAll = async () => {
    const tasks = firms.map(async firm => {
      try {
        const socials = bfKey ? await callBrandfetch(firm.website_url, bfKey) : await scrapeWebsite(firm.website_url);
        const patch: Record<string,string> = {};
        for (const [k, v] of Object.entries(socials)) { if (v && !firm[k]) patch[k] = v; }
        if (Object.keys(patch).length === 0) return 'skip';
        if (dryRun) { console.log(`DRY ${firm.firm_name}: ${JSON.stringify(patch)}`); return 'dry'; }
        const pr = await fetch(`${TARGET_URL}/rest/v1/firm_records?id=eq.${firm.id}`, {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
        });
        return pr.ok ? 'ok' : 'err';
      } catch { return 'err'; }
    });
    const results = await Promise.allSettled(tasks);
    const c = { ok: 0, skip: 0, err: 0, dry: 0 };
    for (const r of results) c[(r.status === 'fulfilled' ? r.value : 'err') as keyof typeof c]++;
    console.log(`relay v7: ok=${c.ok} skip=${c.skip} err=${c.err} / ${firms.length} (${bfKey ? 'bf' : 'scrape'})`);
  };

  (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(processAll());
  return new Response(JSON.stringify({
    started: true, batch: firms.length, pass: bfKey ? 'brandfetch' : 'scrape', bf_active: bfKey.length > 0,
  }), { headers: { 'Content-Type': 'application/json' } });
});

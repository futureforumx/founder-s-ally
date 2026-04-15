import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// firm-data-relay v8 (deployed as v9)
// Pass A (default):       HTML scrape -> social links (linkedin_url, x_url, etc.)
// Pass B (pass=thesis):   xAI Grok   -> thesis_verticals classification
//
// DEPLOYMENT NOTE: Deployed to RELAY project (uaaycclxojcgtlntpihy).
// Writes all data to main project (zmnlsdohtwztneamvwaq) via REST API.
//
// Cron jobs in uaaycclxojcgtlntpihy:
//   Job 6 (enrich-firm-socials-scrape): every minute, pass A, batch=80
//   Job 7 (enrich-firm-thesis):         every minute, pass B, batch=25

const TARGET_URL = 'https://zmnlsdohtwztneamvwaq.supabase.co';
const TARGET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbmxzZG9odHd6dG5lYW12d2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE0NzcxMSwiZXhwIjoyMDg5NzIzNzExfQ.F_B5LAkujxUnK9EHlPsgruQqlIzN6vg_GUDcbF5kifc';
const H = { apikey: TARGET_KEY, Authorization: `Bearer ${TARGET_KEY}`, 'Content-Type': 'application/json' };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const XAI_KEY = Deno.env.get('XAI_API_KEY') ?? '';

// --- helpers ---------------------------------------------------------------

const TWITTER_NOISE = new Set(['home','intent','share','hashtag','search','i','twitter','explore','settings','messages','notifications','login','signup','tos','privacy','about']);
const IG_NOISE = new Set(['p','reel','explore','accounts','tv']);
const FB_NOISE = new Set(['sharer','share','login','signup','dialog','tr','policies']);

function extractSocials(html: string): Record<string,string> {
  const out: Record<string,string> = {};
  const li = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/([A-Za-z0-9_.-]{2,100}?)(?:["'\s\/?#]|$)/);
  if (li) out.linkedin_url = `https://www.linkedin.com/company/${li[1].replace(/\/+$/,'')}`;
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

async function fetchHtml(url: string, timeout = 10_000): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(timeout), redirect: 'follow',
    });
    if (!r.ok) return '';
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return '';
    return await r.text();
  } catch { return ''; }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .replace(/\s+/g, ' ').trim()
    .slice(0, 3000);
}

async function callBrandfetch(url: string, key: string): Promise<Record<string,string>> {
  try {
    const domain = new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./,'');
    const r = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    const data = await r.json() as { links?: Array<{name?: string; url?: string}> };
    const MAP: Record<string,string> = { twitter:'x_url', linkedin:'linkedin_url', instagram:'instagram_url', facebook:'facebook_url', youtube:'youtube_url', tiktok:'tiktok_url' };
    const out: Record<string,string> = {};
    for (const l of data.links ?? []) { const col = MAP[(l.name ?? '').toLowerCase()]; if (col && l.url) out[col] = l.url; }
    return out;
  } catch { return {}; }
}

async function classifyThesisWithGrok(firmName: string, context: string): Promise<string[]> {
  try {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${XAI_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a venture capital analyst. Given information about a VC firm, identify their investment thesis verticals. Return ONLY a JSON array of 1-5 concise strings. Use standard categories like: FinTech, BioTech, Enterprise SaaS, Consumer Internet, Web3/Crypto, Digital Health, CleanTech, EdTech, PropTech, Cybersecurity, AI/ML, Gaming, Mobility/Transportation, B2B Software, D2C, Deep Tech, HealthTech, InsurTech, MarketTech, Media & Entertainment, SpaceTech. Also include geographic focus if clear (e.g. "New York City", "Southeast Asia") and investor type if notable (e.g. "Angel, Scout, and Solo-Capitalists"). If truly unknown return [].'
          },
          {
            role: 'user',
            content: `Firm: ${firmName}\n\n${context.slice(0, 2500)}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });
    if (!r.ok) { console.error(`xAI error: ${r.status} ${await r.text()}`); return []; }
    const data = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    // parse: could be {"verticals":[...]} or [...] directly
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s: unknown) => typeof s === 'string' && s.trim()).slice(0, 8);
    for (const key of ['verticals','sectors','thesis_verticals','categories','tags','data','result','items']) {
      if (Array.isArray(parsed[key])) return parsed[key].filter((s: unknown) => typeof s === 'string' && s.trim()).slice(0, 8);
    }
    return [];
  } catch (e) { console.error('Grok error:', e); return []; }
}

// --- handler ---------------------------------------------------------------

Deno.serve(async (req: Request) => {
  let body: Record<string,unknown> = {};
  try { body = await req.json(); } catch { /* ok */ }

  const bfKey  = (body.brandfetch_key as string) ?? Deno.env.get('BRANDFETCH_API_KEY') ?? '';
  const batch  = typeof body.batch_size === 'number' ? Math.min(body.batch_size as number, 200) : 80;
  const dryRun = body.dry_run === true;

  // -- raw passthrough -------------------------------------------------------
  if (typeof body.raw_query === 'string') {
    const r = await fetch(`${TARGET_URL}/rest/v1/${body.raw_query}`, { headers: H });
    return new Response(JSON.stringify({ rows: await r.json() }), { headers: { 'Content-Type': 'application/json' } });
  }

  // -- stats -----------------------------------------------------------------
  if (body.stats) {
    const count = async (f: string) => {
      const r = await fetch(`${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&${f}&limit=1`,
        { headers: { ...H, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } });
      return parseInt(r.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    };
    const [total, no_hq_city, no_linkedin, tv_null, tv_empty] = await Promise.all([
      count('select=id'), count('hq_city=is.null'),
      count('linkedin_url=is.null&website_url=not.is.null'),
      count('thesis_verticals=is.null'), count('thesis_verticals=eq.%7B%7D'),
    ]);
    return new Response(JSON.stringify({
      total, no_hq_city, no_linkedin,
      thesis_verticals_missing: tv_null + tv_empty,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // -- PASS B: thesis_verticals enrichment via xAI --------------------------
  if (body.pass === 'thesis') {
    const thisBatch = typeof body.batch_size === 'number' ? Math.min(body.batch_size as number, 50) : 25;
    // Prefer firms that have a website to scrape
    const rows = await fetch(
      `${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&thesis_verticals=eq.%7B%7D&select=id,firm_name,website_url,description,elevator_pitch,stage_focus&website_url=not.is.null&limit=${thisBatch}`,
      { headers: H }
    );
    if (!rows.ok) return new Response(JSON.stringify({ error: await rows.text() }), { status: 500 });
    type ThesisFirm = { id: string; firm_name: string; website_url: string | null; description: string | null; elevator_pitch: string | null; stage_focus: string[] | null };
    const firms: ThesisFirm[] = await rows.json();

    if (firms.length === 0) {
      // Fall back: firms with no website but still have empty thesis
      const rows2 = await fetch(
        `${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&thesis_verticals=eq.%7B%7D&select=id,firm_name,website_url,description,elevator_pitch,stage_focus&limit=${thisBatch}`,
        { headers: H }
      );
      const firms2: ThesisFirm[] = await rows2.json();
      if (firms2.length === 0) return new Response(JSON.stringify({ done: true, processed: 0, pass: 'thesis' }), { headers: { 'Content-Type': 'application/json' } });
      firms.push(...firms2);
    }

    const processThesis = async () => {
      const tasks = firms.map(async firm => {
        try {
          // Build context from existing fields
          const parts: string[] = [];
          if (firm.description && !firm.description.includes('is an institutional venture capital firm investing at the')) {
            parts.push(firm.description);
          }
          if (firm.elevator_pitch && firm.elevator_pitch !== firm.description) parts.push(firm.elevator_pitch);
          if (firm.stage_focus?.length) parts.push(`Stage focus: ${firm.stage_focus.join(', ')}`);

          // Scrape website for richer context
          if (firm.website_url) {
            const html = await fetchHtml(firm.website_url);
            if (html) {
              const text = htmlToText(html);
              parts.push(text);
            }
          }

          const context = parts.join('\n\n');
          const verticals = await classifyThesisWithGrok(firm.firm_name, context);

          if (verticals.length === 0) {
            // Mark as attempted with null so it leaves the empty-array pool
            if (!dryRun) {
              await fetch(`${TARGET_URL}/rest/v1/firm_records?id=eq.${firm.id}`, {
                method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
                body: JSON.stringify({ thesis_verticals: null }),
              });
            }
            return 'no_data';
          }

          if (dryRun) { console.log(`DRY ${firm.firm_name}: ${JSON.stringify(verticals)}`); return 'dry'; }

          const pr = await fetch(`${TARGET_URL}/rest/v1/firm_records?id=eq.${firm.id}`, {
            method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
            body: JSON.stringify({ thesis_verticals: verticals }),
          });
          if (!pr.ok) { console.error(`PATCH thesis ${firm.firm_name}: ${pr.status}`); return 'err'; }
          console.log(`thesis: ${firm.firm_name} -> ${JSON.stringify(verticals)}`);
          return 'ok';
        } catch (e) { console.error(`thesis err ${firm.firm_name}:`, e); return 'err'; }
      });
      const results = await Promise.allSettled(tasks);
      const c = { ok: 0, no_data: 0, err: 0, dry: 0 };
      for (const r of results) c[(r.status === 'fulfilled' ? r.value : 'err') as keyof typeof c]++;
      console.log(`relay v8 thesis: ok=${c.ok} no_data=${c.no_data} err=${c.err} / ${firms.length}`);
    };

    (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(processThesis());
    return new Response(JSON.stringify({ started: true, batch: firms.length, pass: 'thesis' }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  // -- PASS A: social links scraping (default) -------------------------------
  const select = 'id,firm_name,website_url,linkedin_url,x_url,instagram_url,facebook_url,youtube_url,tiktok_url';
  const resp = await fetch(
    `${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&linkedin_url=is.null&website_url=not.is.null&select=${select}&limit=${batch}`,
    { headers: H });
  if (!resp.ok) return new Response(JSON.stringify({ error: 'fetch_failed', detail: await resp.text() }), { status: 500 });

  type Firm = { id: string; firm_name: string; website_url: string; [k: string]: unknown };
  const firms: Firm[] = await resp.json();
  if (firms.length === 0) return new Response(JSON.stringify({ done: true, pass: 'social' }), { headers: { 'Content-Type': 'application/json' } });

  const processSocial = async () => {
    const tasks = firms.map(async firm => {
      try {
        const socials = bfKey ? await callBrandfetch(firm.website_url, bfKey) : extractSocials(await fetchHtml(firm.website_url));
        const patch: Record<string,string> = {};
        for (const [k, v] of Object.entries(socials)) { if (v && !firm[k]) patch[k] = v; }
        if (Object.keys(patch).length === 0) return 'skip';
        if (dryRun) { console.log(`DRY social ${firm.firm_name}: ${JSON.stringify(patch)}`); return 'dry'; }
        const pr = await fetch(`${TARGET_URL}/rest/v1/firm_records?id=eq.${firm.id}`, {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
        });
        return pr.ok ? 'ok' : 'err';
      } catch { return 'err'; }
    });
    const results = await Promise.allSettled(tasks);
    const c = { ok: 0, skip: 0, err: 0, dry: 0 };
    for (const r of results) c[(r.status === 'fulfilled' ? r.value : 'err') as keyof typeof c]++;
    console.log(`relay v8 social: ok=${c.ok} skip=${c.skip} err=${c.err} / ${firms.length} (${bfKey ? 'bf' : 'scrape'})`);
  };

  (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(processSocial());
  return new Response(JSON.stringify({ started: true, batch: firms.length, pass: 'social', bf_active: bfKey.length > 0 }),
    { headers: { 'Content-Type': 'application/json' } });
});

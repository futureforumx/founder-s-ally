import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// firm-data-relay  v5
//
// DEPLOYMENT NOTE: This function is deployed to the RELAY Supabase project
// (uaaycclxojcgtlntpihy) — NOT to the main app project — because the local
// dev environment's egress proxy blocks direct access to *.supabase.co.
// The relay project has unrestricted outbound internet and can reach the
// main project (zmnlsdohtwztneamvwaq) via its REST API.
//
// Triggered every minute via pg_cron in the relay project:
//   SELECT cron.schedule('enrich-firm-socials-scrape', '* * * * *', $$ ... $$);
//
// Pass A (brandfetch_key present): Brandfetch API → social links
// Pass B (no key):                 HTML scrape firm website → social links
//
// POST body options:
//   batch_size     number  (default 80, max 200)
//   dry_run        bool    (default false)
//   brandfetch_key string  (override BRANDFETCH_API_KEY secret)
//   stats          bool    return counts only
//   sample         number  return N raw rows

const TARGET_URL = 'https://zmnlsdohtwztneamvwaq.supabase.co';
const TARGET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbmxzZG9odHd6dG5lYW12d2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE0NzcxMSwiZXhwIjoyMDg5NzIzNzExfQ.F_B5LAkujxUnK9EHlPsgruQqlIzN6vg_GUDcbF5kifc';
const H = { apikey: TARGET_KEY, Authorization: `Bearer ${TARGET_KEY}`, 'Content-Type': 'application/json' };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Social link extraction ────────────────────────────────────────────────────
const SOCIAL_PATTERNS: Array<{col: string; re: RegExp; clean: (m: RegExpMatchArray) => string}> = [
  {
    col: 'linkedin_url',
    re: /https?:\/\/(?:www\.)?linkedin\.com\/company\/([A-Za-z0-9_.-]{2,100}?)(?:["'\s\/\?#]|$)/g,
    clean: m => `https://www.linkedin.com/company/${m[1].replace(/\/$/, '')}`,
  },
  {
    col: 'x_url',
    re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})(?:["'\s\/\?#]|$)/g,
    clean: m => {
      const noise = new Set(['home','intent','share','hashtag','search','i','twitter','explore',
        'settings','messages','notifications','login','signup','tos','privacy','about']);
      return noise.has(m[1].toLowerCase()) ? '' : `https://x.com/${m[1]}`;
    },
  },
  {
    col: 'instagram_url',
    re: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,50}?)(?:["'\s\/\?#]|$)/g,
    clean: m => ['p','reel','explore','accounts','tv'].includes(m[1].toLowerCase()) ? '' :
      `https://www.instagram.com/${m[1]}`,
  },
  {
    col: 'facebook_url',
    re: /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.\-]{2,100}?)(?:["'\s\/\?#]|$)/g,
    clean: m => ['sharer','share','login','signup','dialog','tr','policies'].includes(m[1].toLowerCase()) ? '' :
      `https://www.facebook.com/${m[1]}`,
  },
  {
    col: 'youtube_url',
    re: /https?:\/\/(?:www\.)?youtube\.com\/((?:channel\/|c\/|@|user\/)[A-Za-z0-9_\-]{2,100}?)(?:["'\s\/\?#]|$)/g,
    clean: m => `https://www.youtube.com/${m[1]}`,
  },
  {
    col: 'tiktok_url',
    re: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,50}?)(?:["'\s\/\?#]|$)/g,
    clean: m => `https://www.tiktok.com/@${m[1]}`,
  },
];

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
    const html = await res.text();
    const out: Record<string,string> = {};
    for (const { col, re, clean } of SOCIAL_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpMatchArray | null;
      while ((m = re.exec(html)) !== null) {
        const val = clean(m);
        if (val) { out[col] = val; break; }
      }
    }
    return out;
  } catch { return {}; }
}

async function callBrandfetch(url: string, key: string): Promise<Record<string,string>> {
  try {
    const domain = new URL(url.includes('://')?url:`https://${url}`).hostname.replace(/^www\./,'');
    const r = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`,{
      headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},
      signal:AbortSignal.timeout(8000)});
    if (!r.ok) return {};
    const data = await r.json() as {links?:Array<{name?:string;url?:string}>};
    const MAP: Record<string,string> = {
      twitter:'x_url',linkedin:'linkedin_url',instagram:'instagram_url',
      facebook:'facebook_url',youtube:'youtube_url',tiktok:'tiktok_url'
    };
    const out: Record<string,string> = {};
    for (const l of data.links??[]) { const col=MAP[(l.name??'').toLowerCase()]; if(col&&l.url) out[col]=l.url; }
    return out;
  } catch { return {}; }
}

Deno.serve(async (req: Request) => {
  let body: Record<string,unknown> = {};
  try { body = await req.json(); } catch { /* ok */ }

  const bfKey  = (body.brandfetch_key as string) ?? Deno.env.get('BRANDFETCH_API_KEY') ?? '';
  const batch  = typeof body.batch_size==='number' ? Math.min(body.batch_size as number, 200) : 80;
  const dryRun = body.dry_run === true;

  // ── stats ────────────────────────────────────────────────────────────────────
  if (body.stats) {
    const count = async (f: string) => {
      const r = await fetch(`${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&${f}&limit=1`,
        {headers:{...H,Prefer:'count=exact','Range-Unit':'items',Range:'0-0'}});
      return r.headers.get('content-range')?.split('/')[1] ?? '?';
    };
    return new Response(JSON.stringify({
      total:                    await count('select=id'),
      no_hq_city:               await count('hq_city=is.null'),
      no_hq_city_with_location: await count('hq_city=is.null&location=not.is.null'),
      no_linkedin:              await count('linkedin_url=is.null&website_url=not.is.null'),
      no_thesis_verticals:      await count('thesis_verticals=is.null'),
    }),{headers:{'Content-Type':'application/json'}});
  }

  // ── sample ───────────────────────────────────────────────────────────────────
  if (body.sample) {
    const n = typeof body.sample==='number' ? body.sample : 3;
    const r = await fetch(
      `${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&linkedin_url=is.null&website_url=not.is.null&select=id,firm_name,website_url,linkedin_url,x_url&limit=${n}`,
      {headers:H});
    return new Response(JSON.stringify({sample:await r.json()}),{headers:{'Content-Type':'application/json'}});
  }

  // ── fetch batch ───────────────────────────────────────────────────────────────
  const select = 'id,firm_name,website_url,linkedin_url,x_url,instagram_url,facebook_url,youtube_url,tiktok_url';
  const resp = await fetch(
    `${TARGET_URL}/rest/v1/firm_records?deleted_at=is.null&linkedin_url=is.null&website_url=not.is.null&select=${select}&limit=${batch}`,
    {headers:H});
  if (!resp.ok) {
    return new Response(JSON.stringify({error:'fetch_failed',detail:await resp.text()}),{status:500});
  }
  type Firm = {id:string;firm_name:string;website_url:string;[k:string]:unknown};
  const firms: Firm[] = await resp.json();
  if (firms.length===0) {
    return new Response(JSON.stringify({done:true,processed:0}),{headers:{'Content-Type':'application/json'}});
  }

  // ── concurrent enrichment (all firms in parallel) ────────────────────────────
  const processAll = async () => {
    const tasks = firms.map(async firm => {
      try {
        const socials = bfKey
          ? await callBrandfetch(firm.website_url, bfKey)
          : await scrapeWebsite(firm.website_url);

        // Only keep fields not already set
        const patch: Record<string,string> = {};
        for (const [k,v] of Object.entries(socials)) {
          if (v && !firm[k]) patch[k] = v;
        }
        if (Object.keys(patch).length === 0) return 'skip';
        if (dryRun) { console.log(`DRY ${firm.firm_name}: ${JSON.stringify(patch)}`); return 'dry'; }

        const pr = await fetch(`${TARGET_URL}/rest/v1/firm_records?id=eq.${firm.id}`,{
          method:'PATCH', headers:{...H,Prefer:'return=minimal'}, body:JSON.stringify(patch)});
        if (!pr.ok) { console.error(`PATCH ${firm.firm_name}: ${pr.status}`); return 'err'; }
        return 'ok';
      } catch(e) { console.error(`${firm.firm_name}:`, e); return 'err'; }
    });

    const results = await Promise.allSettled(tasks);
    const counts = {ok:0,skip:0,err:0,dry:0};
    for (const r of results) {
      const v = r.status==='fulfilled' ? r.value : 'err';
      counts[v as keyof typeof counts]++;
    }
    console.log(`relay v5: ok=${counts.ok} skip=${counts.skip} err=${counts.err} dry=${counts.dry} / ${firms.length} (${bfKey?'brandfetch':'scrape'})`);
  };

  (globalThis as unknown as {EdgeRuntime?:{waitUntil:(p:Promise<unknown>)=>void}}).EdgeRuntime?.waitUntil(processAll());
  return new Response(JSON.stringify({
    started: true, batch: firms.length,
    pass: bfKey ? 'brandfetch' : 'scrape',
    bf_active: bfKey.length > 0,
  }),{headers:{'Content-Type':'application/json'}});
});

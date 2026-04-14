/**
 * fill-firm-missing-data.ts
 *
 * Fills in missing HQ/location, social links, and sector focuses (thesis_verticals)
 * for firm_records rows that have a website_url but are missing any of these fields.
 *
 * Three enrichment passes per firm (each only runs when that data is missing):
 *   1. NinjaPear REST API  → hq_city, hq_state, hq_country, hq_zip_code, hq_region
 *                            + best-effort: industry tags → thesis_verticals
 *   2. Brandfetch v2 API   → linkedin_url, x_url, instagram_url, facebook_url,
 *                            youtube_url, tiktok_url
 *   3. Exa search + Groq   → thesis_verticals (only when still empty after pass 1)
 *
 * Only fills fields that are currently null/empty (unless FILL_FORCE=1).
 * Respects canonical_hq_locked via augmentFirmRecordsPatchWithFetch.
 *
 * Usage:
 *   npx tsx scripts/fill-firm-missing-data.ts
 *   FILL_DRY_RUN=1          npx tsx scripts/fill-firm-missing-data.ts
 *   FILL_FORCE=1            npx tsx scripts/fill-firm-missing-data.ts
 *   FILL_MAX=200            npx tsx scripts/fill-firm-missing-data.ts
 *   FILL_CONCURRENCY=4      npx tsx scripts/fill-firm-missing-data.ts
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional API keys (each pass gracefully skips if key is absent):
 *   NINJAPEAR_API_KEY     — pass 1 (HQ + industry)
 *   BRANDFETCH_API_KEY    — pass 2 (social links)
 *   EXA_API_KEY           — pass 3 input (search context for Groq)
 *   GROQ_API_KEY          — pass 3 extraction (thesis_verticals)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { augmentFirmRecordsPatchWithFetch } from "./lib/firmRecordsCanonicalHqPolicy";

// ── Env loader ────────────────────────────────────────────────────────────────

function loadEnv(): void {
  for (const name of [".env", ".env.local", ".env.enrichment"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined && process.env[m[1]] !== "") continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

// ── Config ────────────────────────────────────────────────────────────────────

const e    = (n: string, fb = "") => (process.env[n] || "").trim() || fb;
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1", "true", "yes"].includes(e(n).toLowerCase());

const SUPABASE_URL  = e("SUPABASE_URL", e("VITE_SUPABASE_URL")).replace(/\/$/, "");
const SERVICE_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const NP_KEY        = e("NINJAPEAR_API_KEY");
const BF_KEY        = e("BRANDFETCH_API_KEY");
const EXA_KEY       = e("EXA_API_KEY", e("EXA_AI_API_KEY"));
const GROQ_KEY      = e("GROQ_API_KEY");

const DRY_RUN     = eBool("FILL_DRY_RUN");
const FORCE       = eBool("FILL_FORCE");
const MAX         = eInt("FILL_MAX", 999_999);
const CONCURRENCY = eInt("FILL_CONCURRENCY", 3);
const TIMEOUT_MS  = 12_000;

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set");
if (!SERVICE_KEY)  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

// ── Supabase helpers ──────────────────────────────────────────────────────────

const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function withTimeout(url: string, opts: RequestInit, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function sbGet<T>(select: string, filter = ""): Promise<T[]> {
  const res = await withTimeout(
    `${SUPABASE_URL}/rest/v1/firm_records?select=${select}&deleted_at=is.null${filter}&limit=50000`,
    { headers: SB_HEADERS },
  );
  if (!res.ok) throw new Error(`GET firm_records: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(id: string, rawPatch: Record<string, unknown>): Promise<void> {
  if (Object.keys(rawPatch).length === 0) return;

  // Run HQ fields through canonical lock policy
  const patch = await augmentFirmRecordsPatchWithFetch(
    SUPABASE_URL,
    SB_HEADERS,
    id,
    rawPatch,
    "fill_firm_missing_data",
  );

  if (Object.keys(patch).length === 0) return;
  if (DRY_RUN) { console.log(`    [DRY] PATCH ${id}:`, Object.keys(patch).join(", ")); return; }

  const res = await withTimeout(`${SUPABASE_URL}/rest/v1/firm_records?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.warn(`    ✗ PATCH ${id}: ${res.status} ${await res.text()}`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.includes("://") ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

const US_STATE_TO_REGION: Record<string, string> = {
  WA:"West",OR:"West",CA:"West",NV:"West",HI:"West",AK:"West",
  ID:"West",MT:"West",WY:"West",CO:"West",UT:"West",
  NY:"East",NJ:"East",CT:"East",MA:"East",RI:"East",NH:"East",
  VT:"East",ME:"East",PA:"East",DE:"East",MD:"East",DC:"East",
  TX:"South",OK:"South",AR:"South",LA:"South",MS:"South",
  AL:"South",TN:"South",KY:"South",WV:"South",VA:"South",
  NC:"South",SC:"South",GA:"South",FL:"South",
  OH:"Midwest",MI:"Midwest",IN:"Midwest",IL:"Midwest",WI:"Midwest",
  MN:"Midwest",IA:"Midwest",MO:"Midwest",ND:"Midwest",SD:"Midwest",
  NE:"Midwest",KS:"Midwest",
};

function deriveRegion(state: string | null | undefined): string | null {
  if (!state) return null;
  return US_STATE_TO_REGION[state.toUpperCase()] ?? null;
}

// ── Pass 1: NinjaPear → HQ + best-effort industry tags ───────────────────────

interface NpHq {
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  hq_zip_code?: string | null;
  hq_region?: string | null;
}

interface NpResult extends NpHq {
  thesis_verticals?: string[];
  linkedin_url?: string | null;
  x_url?: string | null;
}

async function enrichFromNinjaPear(websiteUrl: string): Promise<NpResult> {
  if (!NP_KEY) return {};
  const domain = extractDomain(websiteUrl);
  if (!domain) return {};
  try {
    const res = await withTimeout(
      `https://api.ninjapear.com/v1/company?website=${encodeURIComponent(domain)}`,
      { headers: { Authorization: `Bearer ${NP_KEY}` } },
      8_000,
    );
    if (!res.ok) return {};
    const data = await res.json() as Record<string, unknown>;
    const c = (data.company ?? data) as Record<string, unknown>;

    const out: NpResult = {
      hq_city:     strOrNull(c.hq_city ?? c.city),
      hq_state:    strOrNull(c.hq_state ?? c.state),
      hq_country:  strOrNull(c.hq_country ?? c.country),
      hq_zip_code: strOrNull(c.hq_zip ?? c.zip_code ?? c.postal_code),
    };

    // Derive region if we got a state
    if (out.hq_state) out.hq_region = deriveRegion(out.hq_state);

    // Best-effort: map industry data → thesis_verticals
    const tags: string[] = [];
    for (const field of ["industries", "specialties", "tags", "keywords"]) {
      const v = c[field];
      if (Array.isArray(v)) tags.push(...v.filter((x): x is string => typeof x === "string" && x.trim().length > 0));
    }
    const single = strOrNull(c.industry ?? c.category ?? c.sector);
    if (single) tags.push(single);
    if (tags.length) out.thesis_verticals = [...new Set(tags.map(t => t.trim()).filter(Boolean))].slice(0, 12);

    // Best-effort: social links sometimes in NP response
    out.linkedin_url = strOrNull(c.linkedin_url ?? c.linkedin);
    out.x_url        = strOrNull(c.x_url ?? c.twitter_url ?? c.twitter);

    return out;
  } catch { return {}; }
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

// ── Pass 2: Brandfetch → social links ────────────────────────────────────────

const BF_LINK_MAP: Record<string, string> = {
  twitter: "x_url", linkedin: "linkedin_url", instagram: "instagram_url",
  facebook: "facebook_url", youtube: "youtube_url", tiktok: "tiktok_url",
};

interface BfResult {
  linkedin_url?: string | null;
  x_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  youtube_url?: string | null;
  tiktok_url?: string | null;
}

async function enrichFromBrandfetch(websiteUrl: string): Promise<BfResult> {
  if (!BF_KEY) return {};
  const domain = extractDomain(websiteUrl);
  if (!domain) return {};
  try {
    const res = await withTimeout(`https://api.brandfetch.io/v2/brands/${domain}`, {
      headers: { Authorization: `Bearer ${BF_KEY}`, Accept: "application/json" },
    });
    if (res.status === 404 || res.status === 422) return {};
    if (!res.ok) return {};
    const brand = await res.json() as Record<string, unknown>;
    const links = Array.isArray(brand.links) ? brand.links as { name?: string; url?: string }[] : [];
    const out: BfResult = {};
    for (const link of links) {
      const col = BF_LINK_MAP[(link.name || "").toLowerCase()];
      if (col && link.url) (out as any)[col] = link.url;
    }
    return out;
  } catch { return {}; }
}

// ── Pass 3: Exa search + Groq → thesis_verticals ─────────────────────────────

async function searchExaForFirm(firmName: string, domain: string | null): Promise<string> {
  if (!EXA_KEY) return "";
  const domainHint = domain ? ` site:${domain}` : "";
  try {
    const res = await withTimeout("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${firmName} venture capital investment thesis sectors verticals focus areas${domainHint}`,
        type: "auto",
        numResults: 4,
        contents: { text: { maxCharacters: 2500 } },
      }),
    });
    if (!res.ok) return "";
    const data = await res.json() as { results?: { title: string; url: string; text?: string }[] };
    return (data.results ?? [])
      .map(r => `[${r.title}] (${r.url})\n${(r.text || "").slice(0, 2000)}`)
      .join("\n\n---\n\n");
  } catch { return ""; }
}

const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama3-8b-8192"];

async function extractThesisVerticalsWithGroq(
  firmName: string,
  context: string,
): Promise<string[] | null> {
  if (!GROQ_KEY || !context) return null;
  const prompt = `You are extracting investment sector focuses for a VC firm.

Firm: "${firmName}"

Based on the research below, list the specific sectors/verticals this firm invests in.
Return ONLY a valid JSON array of strings, e.g. ["Fintech", "SaaS", "AI/ML", "Healthcare"].
Use null if you cannot determine any sectors with confidence.
Max 10 items. Be specific (e.g. "Climate Tech" not "Technology").

Research:
${context.slice(0, 8_000)}`;

  for (const model of GROQ_MODELS) {
    try {
      const res = await withTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Extract structured VC firm data. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      }, 20_000);
      if (!res.ok) continue;
      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      const raw = data?.choices?.[0]?.message?.content;
      if (!raw) continue;

      // Handle both {"thesis_verticals": [...]} and bare [...]
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { continue; }

      if (Array.isArray(parsed)) {
        const clean = parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map(s => s.trim()).slice(0, 10);
        if (clean.length) return clean;
      } else if (parsed && typeof parsed === "object") {
        for (const key of Object.keys(parsed as object)) {
          const val = (parsed as Record<string, unknown>)[key];
          if (Array.isArray(val)) {
            const clean = val.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
              .map(s => s.trim()).slice(0, 10);
            if (clean.length) return clean;
          }
        }
      }
    } catch { continue; }
  }
  return null;
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function next(): Promise<void> {
    while (i < tasks.length) { const idx = i++; results[idx] = await tasks[idx](); }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

// ── Process one firm ──────────────────────────────────────────────────────────

type FirmRow = {
  id: string;
  firm_name: string;
  website_url: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  hq_region: string | null;
  hq_zip_code: string | null;
  thesis_verticals: string[] | null;
  linkedin_url: string | null;
  x_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
};

type Result = "enriched" | "skipped" | "no_data" | "failed";

async function processFirm(firm: FirmRow, idx: number, total: number): Promise<Result> {
  const pfx = `[${String(idx + 1).padStart(5)}/${total}]`;
  const label = firm.firm_name.slice(0, 45).padEnd(45);

  if (!firm.website_url) {
    console.log(`${pfx} — ${label} no website`);
    return "skipped";
  }

  const domain = extractDomain(firm.website_url);

  // Determine what's missing
  const needsHq      = FORCE || !firm.hq_city || !firm.hq_state || !firm.hq_country;
  const needsSocials = FORCE || !firm.linkedin_url || !firm.x_url;
  const needsSectors = FORCE || !firm.thesis_verticals?.length;

  if (!needsHq && !needsSocials && !needsSectors) {
    console.log(`${pfx} — ${label} complete`);
    return "skipped";
  }

  const patch: Record<string, unknown> = {};

  try {
    // ── Pass 1: NinjaPear (HQ + optional industry tags) ──────────────────────
    if ((needsHq || needsSectors) && NP_KEY) {
      const np = await enrichFromNinjaPear(firm.website_url);

      if (needsHq) {
        if (np.hq_city     && (!firm.hq_city     || FORCE)) patch.hq_city     = np.hq_city;
        if (np.hq_state    && (!firm.hq_state    || FORCE)) patch.hq_state    = np.hq_state;
        if (np.hq_country  && (!firm.hq_country  || FORCE)) patch.hq_country  = np.hq_country;
        if (np.hq_zip_code && (!firm.hq_zip_code || FORCE)) patch.hq_zip_code = np.hq_zip_code;
        // Derive region from new or existing state
        const state = (patch.hq_state ?? firm.hq_state) as string | null;
        if (state && (!firm.hq_region || FORCE)) {
          const r = deriveRegion(state);
          if (r) patch.hq_region = r;
        }
      }

      if (needsSectors && np.thesis_verticals?.length) {
        patch.thesis_verticals = np.thesis_verticals;
      }

      // Opportunistic social links from NinjaPear
      if (needsSocials) {
        if (np.linkedin_url && (!firm.linkedin_url || FORCE)) patch.linkedin_url = np.linkedin_url;
        if (np.x_url        && (!firm.x_url        || FORCE)) patch.x_url        = np.x_url;
      }
    }

    // ── Pass 2: Brandfetch (social links) ────────────────────────────────────
    const stillNeedsSocials = needsSocials && (!patch.linkedin_url || !patch.x_url ||
      !firm.instagram_url || !firm.facebook_url || !firm.youtube_url || !firm.tiktok_url);

    if (stillNeedsSocials && BF_KEY) {
      const bf = await enrichFromBrandfetch(firm.website_url);
      const SOCIAL_COLS = ["linkedin_url", "x_url", "instagram_url", "facebook_url", "youtube_url", "tiktok_url"] as const;
      for (const col of SOCIAL_COLS) {
        if (bf[col] && (!(firm as any)[col] || FORCE) && !patch[col]) {
          patch[col] = bf[col];
        }
      }
    }

    // ── Pass 3: Exa + Groq (thesis_verticals fallback) ───────────────────────
    if (needsSectors && !patch.thesis_verticals && (EXA_KEY || GROQ_KEY)) {
      const context = await searchExaForFirm(firm.firm_name, domain);
      if (context) {
        const verticals = await extractThesisVerticalsWithGroq(firm.firm_name, context);
        if (verticals?.length) patch.thesis_verticals = verticals;
      }
    }

    if (Object.keys(patch).length === 0) {
      console.log(`${pfx} ○ ${label} no new data`);
      return "no_data";
    }

    patch.last_enriched_at = new Date().toISOString();
    await sbPatch(firm.id, patch);

    const filled = Object.keys(patch).filter(k => k !== "last_enriched_at").join(", ");
    console.log(`${pfx} ✓ ${label} → ${filled}`);
    return "enriched";

  } catch (err) {
    console.error(`${pfx} ✗ ${label} →`, err instanceof Error ? err.message : err);
    return "failed";
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  Fill Firm Missing Data  ${DRY_RUN ? "(DRY RUN) " : ""}${FORCE ? "(FORCE) " : ""}`);
  console.log(`  Passes: ${[NP_KEY && "NinjaPear", BF_KEY && "Brandfetch", (EXA_KEY || GROQ_KEY) && "Exa+Groq"].filter(Boolean).join(" · ") || "none — set at least one API key"}`);
  console.log(`  Concurrency: ${CONCURRENCY}  |  Max: ${MAX}`);
  console.log(`${"═".repeat(70)}\n`);

  if (!NP_KEY && !BF_KEY && !EXA_KEY && !GROQ_KEY) {
    console.error("❌  No enrichment API keys set. Need at least one of:");
    console.error("    NINJAPEAR_API_KEY, BRANDFETCH_API_KEY, EXA_API_KEY, GROQ_API_KEY");
    process.exit(1);
  }

  const cols = [
    "id", "firm_name", "website_url",
    "hq_city", "hq_state", "hq_country", "hq_region", "hq_zip_code",
    "thesis_verticals",
    "linkedin_url", "x_url", "instagram_url", "facebook_url", "youtube_url", "tiktok_url",
  ].join(",");

  // Fetch firms that have a website but are missing at least one target field
  const filter = FORCE
    ? "&website_url=not.is.null"
    : "&website_url=not.is.null&or=(hq_city.is.null,hq_state.is.null,hq_country.is.null,thesis_verticals.eq.{},thesis_verticals.is.null,linkedin_url.is.null,x_url.is.null)";

  console.log("📡  Fetching firms from Supabase…");
  const firms = await sbGet<FirmRow>(cols, filter);
  const todo  = firms.slice(0, MAX);

  console.log(`📊  ${firms.length} firms with gaps (processing up to ${todo.length})\n`);

  if (todo.length === 0) {
    console.log("✅  Nothing to do.\n");
    return;
  }

  const stats = { enriched: 0, skipped: 0, no_data: 0, failed: 0 };
  const tasks = todo.map((firm, i) => async () => {
    const result = await processFirm(firm, i, todo.length);
    stats[result]++;
  });

  await pool(tasks, CONCURRENCY);

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ✅  Done — enriched: ${stats.enriched}  no_data: ${stats.no_data}  skipped: ${stats.skipped}  failed: ${stats.failed}`);
  console.log(`${"═".repeat(70)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

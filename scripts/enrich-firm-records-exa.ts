/**
 * Enrich firm_records HQ + AUM using the Exa search API (structured deep search),
 * then PATCH Supabase firm_records (service role).
 *
 * Prerequisites:
 *   EXA_API_KEY — from https://dashboard.exa.ai/api-keys (never commit)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or DATABASE_URL-only not supported here; uses REST)
 *
 * Usage:
 *   EXA_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/enrich-firm-records-exa.ts
 *   ENRICH_MAX=25 DRY_RUN=1 npx tsx scripts/enrich-firm-records-exa.ts
 *   ENRICH_FORCE=1 ENRICH_MAX=500 npx tsx scripts/enrich-firm-records-exa.ts
 *
 * Optional HQ governance columns (migration `20260414120000_firm_records_canonical_hq_governance.sql`):
 *   ENRICH_PATCH_CANONICAL_HQ=1 — sets canonical_hq_source / canonical_hq_set_at when HQ fields update.
 */

import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EXA_API_KEY = process.env.EXA_API_KEY || "";
const EXA_SEARCH_TYPE = (process.env.EXA_SEARCH_TYPE || "deep").trim();
const ENRICH_MAX = Math.max(1, Math.min(5000, Number(process.env.ENRICH_MAX ?? "80") || 80));
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const ENRICH_FORCE = process.env.ENRICH_FORCE === "1" || process.env.ENRICH_FORCE === "true";
const DELAY_MS = Math.max(0, Number(process.env.EXA_DELAY_MS ?? "900") || 900);
const PATCH_CANONICAL =
  process.env.ENRICH_PATCH_CANONICAL_HQ === "1" || process.env.ENRICH_PATCH_CANONICAL_HQ === "true";
const ONLY_IDS = (process.env.ENRICH_FIRM_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HEADERS_SB = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

type ExaStructured = {
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  /** Total firm AUM in USD when publicly stated */
  aum_usd?: number | null;
  /** high | medium | low */
  aum_confidence?: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchWithTimeout(url: string, opts: RequestInit, ms = 120000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function formatUsdDisplay(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function buildLocationLine(city: string | null | undefined, state: string | null | undefined): string | null {
  const c = city?.trim();
  const s = state?.trim();
  if (c && s) {
    const st = /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : s;
    return `${c}, ${st}`;
  }
  if (c) return c;
  return null;
}

async function exaExtractStructured(firmName: string): Promise<ExaStructured | null> {
  const outputSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      hq_city: { type: ["string", "null"], description: "Headquarters city" },
      hq_state: {
        type: ["string", "null"],
        description: "US state as 2-letter code when applicable; else region/state name",
      },
      hq_country: { type: ["string", "null"], description: "Country (e.g. United States, UK)" },
      aum_usd: {
        type: ["number", "null"],
        description: "Total firm assets under management in USD if explicitly stated in sources",
      },
      aum_confidence: {
        type: ["string", "null"],
        enum: ["high", "medium", "low", "unknown", null],
      },
    },
    required: ["hq_city", "hq_state", "hq_country", "aum_usd", "aum_confidence"],
  };

  const body: Record<string, unknown> = {
    query: `${firmName} venture capital firm headquarters office location city state country total assets under management AUM USD`,
    type: EXA_SEARCH_TYPE,
    numResults: 8,
    contents: {
      highlights: { maxCharacters: 6000 },
      text: { maxCharacters: 8000 },
    },
    systemPrompt:
      "Extract only facts attributed to credible sources in the results. Use null for any field you cannot support with the retrieved content. For US offices, hq_state must be a 2-letter USPS code when the HQ is in the US. aum_usd must be a number in US dollars (not millions shorthand) only if sources state or clearly imply total firm AUM; otherwise null and set aum_confidence to low or unknown.",
    outputSchema,
  };

  const res = await fetchWithTimeout("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": EXA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error(`[exa] HTTP ${res.status} for "${firmName}": ${t.slice(0, 500)}`);
    return null;
  }

  const json = (await res.json()) as {
    output?: { content?: unknown };
  };

  const content = json.output?.content;
  if (!content || typeof content !== "object") {
    console.warn(`[exa] No structured output for "${firmName}"`);
    return null;
  }

  return content as ExaStructured;
}

type FirmRow = {
  id: string;
  firm_name: string;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  aum: string | null;
  aum_usd: number | null;
};

async function fetchFirms(): Promise<FirmRow[]> {
  const params = new URLSearchParams();
  /** Omit optional governance columns — not all databases have migrated yet (canonical_hq_locked etc.). */
  params.set("select", "id,firm_name,hq_city,hq_state,hq_country,aum,aum_usd");
  params.set("deleted_at", "is.null");
  params.set("order", "updated_at.asc");
  params.set("limit", String(ENRICH_MAX + 50));

  if (ONLY_IDS.length) {
    params.set("id", `in.(${ONLY_IDS.join(",")})`);
  }

  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/firm_records?${params}`, {
    headers: HEADERS_SB,
  });
  if (!res.ok) throw new Error(`GET firm_records ${res.status}: ${await res.text()}`);
  let rows = (await res.json()) as FirmRow[];

  if (!ENRICH_FORCE && ONLY_IDS.length === 0) {
    rows = rows.filter((r) => {
      const missingHq = !r.hq_city?.trim() || !r.hq_state?.trim();
      const missingAum = r.aum_usd == null && !(r.aum?.trim());
      return missingHq || missingAum;
    });
  }

  return rows.slice(0, ENRICH_MAX);
}

async function patchFirm(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/firm_records?id=eq.${id}`, {
    method: "PATCH",
    headers: HEADERS_SB,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH firm_records ${id}: ${res.status} ${await res.text()}`);
}

async function main() {
  if (!EXA_API_KEY) {
    console.error("Missing EXA_API_KEY (set in environment or .env.local).");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  console.log(`[enrich-exa] Supabase: ${SUPABASE_URL}`);
  console.log(
    `[enrich-exa] EXA_SEARCH_TYPE=${EXA_SEARCH_TYPE} ENRICH_MAX=${ENRICH_MAX} DRY_RUN=${DRY_RUN} ENRICH_FORCE=${ENRICH_FORCE} ENRICH_PATCH_CANONICAL_HQ=${PATCH_CANONICAL}`,
  );

  const firms = await fetchFirms();
  console.log(`[enrich-exa] Processing ${firms.length} firm(s)`);

  let ok = 0;
  let skip = 0;

  for (let i = 0; i < firms.length; i++) {
    const firm = firms[i];
    const label = `[${i + 1}/${firms.length}] ${firm.firm_name}`;
    const extracted = await exaExtractStructured(firm.firm_name);
    if (!extracted) {
      skip++;
      await sleep(DELAY_MS);
      continue;
    }

    const city = extracted.hq_city?.trim() || null;
    const state = extracted.hq_state?.trim() || null;
    const country = extracted.hq_country?.trim() || null;
    let aumUsd: number | null =
      extracted.aum_usd != null && Number.isFinite(extracted.aum_usd) && extracted.aum_usd > 0
        ? extracted.aum_usd
        : null;
    const location = buildLocationLine(city, state);

    const patch: Record<string, unknown> = {
      last_enriched_at: new Date().toISOString(),
    };

    const hqTouched = Boolean(city || state || country || location);

    if (city) patch.hq_city = city;
    if (state) {
      patch.hq_state = /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : state;
    }
    if (country) patch.hq_country = country;
    if (location) patch.location = location;

    if (aumUsd != null) {
      patch.aum_usd = aumUsd;
      patch.aum = formatUsdDisplay(aumUsd);
    }

    const hasUpdates = Object.keys(patch).some((k) => k !== "last_enriched_at");
    if (!hasUpdates) {
      console.log(`${label} → no actionable fields`);
      skip++;
      await sleep(DELAY_MS);
      continue;
    }

    if (PATCH_CANONICAL && hqTouched) {
      patch.canonical_hq_source = "exa_enrichment";
      patch.canonical_hq_set_at = new Date().toISOString();
    }

    if (DRY_RUN) {
      console.log(`${label} DRY_RUN patch`, patch);
    } else {
      await patchFirm(firm.id, patch);
      console.log(`${label} → updated`);
      ok++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`[enrich-exa] Done. updated=${ok} skipped=${skip} dryRun=${DRY_RUN}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

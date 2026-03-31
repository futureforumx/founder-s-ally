/**
 * enrich-firm-websites — Supabase Edge Function
 *
 * Finds and populates website_url for firm_records using:
 *   1. Exa AI search (primary) — searches for "[firm name] venture capital website"
 *   2. Domain inference (fallback) — tries common patterns like firmname.com, firmname.vc
 *
 * Request body:
 *   { batchSize?: number, firmId?: string, forceRefresh?: boolean }
 *
 * Zero remote imports — Deno.serve() + raw fetch to Supabase REST API.
 */

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

async function supabaseSelect(table: string, select: string, filters: string = ""): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? "&" + filters : ""}`;
  const r = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!r.ok) throw new Error(`SELECT ${table} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function supabaseUpdate(table: string, id: string, data: Record<string, unknown>): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`UPDATE ${table} ${id} failed: ${r.status} ${await r.text()}`);
}

// ---------------------------------------------------------------------------
// Exa AI Search — find the official website for a VC firm
// ---------------------------------------------------------------------------

interface ExaResult {
  title: string;
  url: string;
  text?: string;
}

async function searchViaExa(firmName: string, apiKey: string): Promise<ExaResult[]> {
  const query = `${firmName} venture capital official website`;
  const resp = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 5,
      contents: {
        text: { maxCharacters: 300 },
      },
    }),
  });

  if (!resp.ok) {
    console.error(`  Exa search failed: ${resp.status}`);
    return [];
  }

  const data = await resp.json();
  return Array.isArray(data?.results) ? data.results : [];
}

// ---------------------------------------------------------------------------
// URL validation and scoring
// ---------------------------------------------------------------------------

/** Known VC/fund domain TLDs and patterns */
const VC_TLDS = [".vc", ".ventures", ".capital"];
const NOISE_DOMAINS = [
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com",
  "crunchbase.com", "pitchbook.com", "dealroom.co", "wellfound.com", "angellist.com",
  "wikipedia.org", "bloomberg.com", "reuters.com", "techcrunch.com", "forbes.com",
  "prnewswire.com", "businesswire.com", "sec.gov", "youtube.com", "medium.com",
  "google.com", "bing.com", "yahoo.com", "reddit.com", "github.com",
];

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeForComparison(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/capital$/, "")
    .replace(/ventures$/, "")
    .replace(/partners$/, "")
    .replace(/fund$/, "")
    .replace(/group$/, "")
    .replace(/management$/, "")
    .replace(/investments?$/, "");
}

function scoreResult(firmName: string, result: ExaResult): number {
  const domain = extractDomain(result.url);
  if (!domain) return 0;

  // Discard noise domains
  if (NOISE_DOMAINS.some(nd => domain.includes(nd))) return 0;

  let score = 10; // base score for being a valid result

  const normFirm = normalizeForComparison(firmName);
  const normDomain = domain.replace(/\./g, "").replace(/^www/, "");

  // Strong signal: domain contains normalized firm name
  if (normDomain.includes(normFirm) || normFirm.includes(normDomain.split(".")[0])) {
    score += 50;
  }

  // VC-specific TLDs
  if (VC_TLDS.some(tld => domain.endsWith(tld))) {
    score += 20;
  }

  // Title contains firm name
  const normTitle = result.title?.toLowerCase() || "";
  if (normTitle.includes(firmName.toLowerCase())) {
    score += 15;
  }

  // Text/description mentions venture, capital, invest
  const text = (result.text || "").toLowerCase();
  if (text.includes("venture") || text.includes("capital") || text.includes("invest") || text.includes("fund")) {
    score += 10;
  }

  // Short domain (likely a main website, not a subpage)
  if (domain.split(".").length <= 2) {
    score += 5;
  }

  return score;
}

function pickBestUrl(firmName: string, results: ExaResult[]): string | null {
  if (results.length === 0) return null;

  const scored = results
    .map(r => ({ url: r.url, domain: extractDomain(r.url), score: scoreResult(firmName, r) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  // Must have a minimum confidence
  if (scored[0].score < 25) return null;

  // Return the root domain URL, not a subpage
  try {
    const u = new URL(scored[0].url);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return scored[0].url;
  }
}

// ---------------------------------------------------------------------------
// Domain inference fallback — try common VC domain patterns
// ---------------------------------------------------------------------------

async function tryInferDomain(firmName: string): Promise<string | null> {
  // Generate slugified name variants
  const slug = firmName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "")
    .replace(/capital$/, "")
    .replace(/ventures$/, "")
    .replace(/partners$/, "")
    .replace(/fund$/, "")
    .replace(/management$/, "");

  const slugDash = firmName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-");

  const candidates = [
    `https://${slug}.com`,
    `https://${slug}.vc`,
    `https://${slug}.co`,
    `https://www.${slug}.com`,
    `https://${slug}vc.com`,
    `https://${slug}capital.com`,
    `https://${slugDash}.com`,
  ];

  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        // Verify it's a real website (not a domain parking page)
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("text/html")) {
          const finalUrl = resp.url || url;
          const u = new URL(finalUrl);
          return `${u.protocol}//${u.hostname}`;
        }
      }
    } catch { /* skip */ }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validate URL is reachable
// ---------------------------------------------------------------------------

async function validateUrl(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize ?? 25, 100);
    const firmId: string | null = body.firmId ?? null;
    const forceRefresh: boolean = body.forceRefresh ?? false;

    console.log(`enrich-firm-websites: batchSize=${batchSize}, firmId=${firmId ?? "all"}, forceRefresh=${forceRefresh}`);

    // Fetch firms needing website_url
    let filters = "deleted_at=is.null&order=firm_name.asc&limit=" + batchSize;
    if (!forceRefresh) filters += "&or=(website_url.is.null,website_url.eq.)";
    if (firmId) filters += `&id=eq.${firmId}`;

    const firms = await supabaseSelect(
      "firm_records",
      "id,firm_name,website_url,firm_type,hq_city,hq_state",
      filters
    );

    if (!firms || firms.length === 0) {
      return json({ message: "No firms need website enrichment", updated: 0, processed: 0 });
    }

    console.log(`Found ${firms.length} firms needing website URLs`);

    const EXA_KEY = Deno.env.get("EXA_AI_KEY");
    if (!EXA_KEY) {
      return json({ error: "EXA_AI_KEY not configured" }, 500);
    }

    let updated = 0, exaFound = 0, inferredFound = 0, failed = 0;
    const errors: string[] = [];
    const results: { firm: string; url: string | null; source: string }[] = [];

    for (const firm of firms) {
      console.log(`\n--- ${firm.firm_name} ---`);

      try {
        // Step 1: Search via Exa
        const exaResults = await searchViaExa(firm.firm_name, EXA_KEY);
        let bestUrl = pickBestUrl(firm.firm_name, exaResults);
        let source = "exa";

        if (bestUrl) {
          console.log(`  Exa found: ${bestUrl} (from ${exaResults.length} results)`);
        }

        // Step 2: If Exa didn't find a confident match, try domain inference
        if (!bestUrl) {
          bestUrl = await tryInferDomain(firm.firm_name);
          source = "inferred";
          if (bestUrl) {
            console.log(`  Inferred domain: ${bestUrl}`);
          }
        }

        if (bestUrl) {
          // Validate the URL is reachable
          const valid = await validateUrl(bestUrl);
          if (valid) {
            await supabaseUpdate("firm_records", firm.id, {
              website_url: bestUrl,
              last_enriched_at: new Date().toISOString(),
            });
            updated++;
            if (source === "exa") exaFound++;
            else inferredFound++;
            results.push({ firm: firm.firm_name, url: bestUrl, source });
            console.log(`  ✓ Updated: ${bestUrl} [${source}]`);
          } else {
            console.log(`  ✗ URL not reachable: ${bestUrl}`);
            failed++;
            results.push({ firm: firm.firm_name, url: null, source: "unreachable" });
          }
        } else {
          failed++;
          results.push({ firm: firm.firm_name, url: null, source: "not_found" });
          console.log(`  ✗ No website found`);
        }

        // Rate limit: small delay between Exa requests
        await new Promise(r => setTimeout(r, 300));
      } catch (e: any) {
        errors.push(`${firm.firm_name}: ${e.message}`);
        failed++;
      }
    }

    const summary = {
      processed: firms.length,
      updated,
      sources: { exa_search: exaFound, domain_inference: inferredFound },
      failed,
      errors: errors.slice(0, 10),
      sample_results: results.slice(0, 20),
    };

    console.log(`\n=== Done ===`, JSON.stringify({ processed: firms.length, updated, failed }));
    return json(summary);
  } catch (e) {
    console.error("enrich-firm-websites error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

/**
 * Adapter: Crunchbase API (stub)
 *
 * This adapter uses the official Crunchbase Basic/Pro API.
 * It does NOT scrape authenticated/protected Crunchbase pages.
 *
 * ── HOW TO ACTIVATE ──────────────────────────────────────────────────────────
 * 1. Obtain an API key from: https://data.crunchbase.com/docs/crunchbase-basic
 * 2. Set the secret in your Supabase project:
 *      supabase secrets set CRUNCHBASE_API_KEY=<your-key>
 * 3. The adapter will automatically activate on the next run.
 *
 * ── API ENDPOINT USED ────────────────────────────────────────────────────────
 * GET https://api.crunchbase.com/api/v4/searches/funding_rounds
 *   ?user_key=<key>&field_ids=...&query=...
 *
 * See: https://data.crunchbase.com/reference/post_searches-funding-rounds
 *
 * ── TODO: when activating ────────────────────────────────────────────────────
 * - Implement pagination (after_id cursor)
 * - Map Crunchbase field names to RawDealCandidate fields
 * - Handle rate limits (200 req/min on Basic)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  SourceAdapter,
  AdapterContext,
  ListingItem,
  RawDealCandidate,
  FiSource,
} from "../types.ts";

const CB_API_BASE = "https://api.crunchbase.com/api/v4";

// Field IDs we request from the Crunchbase API
const FIELD_IDS = [
  "announced_on",
  "investment_type",
  "money_raised",
  "money_raised_currency_code",
  "num_investors",
  "lead_investor_identifiers",
  "investor_identifiers",
  "funded_organization_identifier",
  "funded_organization_categories",
  "funded_organization_location_identifiers",
  "short_description",
].join(",");

// ── Listing fetcher ──────────────────────────────────────────────────────────

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const apiKey = Deno.env.get("CRUNCHBASE_API_KEY");

  if (!apiKey) {
    // Stub mode: no API key configured — return empty without error
    console.info(
      "[crunchbase_adapter] CRUNCHBASE_API_KEY not set. Skipping. " +
      "Set this secret to activate Crunchbase ingestion."
    );
    return [];
  }

  // Search for recent funding rounds (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const body = {
    field_ids: FIELD_IDS.split(","),
    query: [
      {
        type: "predicate",
        field_id: "announced_on",
        operator_id: "gte",
        values: [thirtyDaysAgo],
      },
    ],
    sort: [{ field_id: "announced_on", sort_value: "desc" }],
    limit: 100,
  };

  const result = await ctx.fetchUrl(
    `${CB_API_BASE}/searches/funding_rounds?user_key=${encodeURIComponent(apiKey)}`,
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  // TODO: The Crunchbase search endpoint is a POST; politeGet only does GET.
  // When activating this adapter, switch to a POST implementation or extend fetch.ts.
  // For now, we log a clear TODO and return empty.
  console.info(
    "[crunchbase_adapter] TODO: Implement POST request to Crunchbase API. " +
    "Current fetch utility only supports GET. See fetch.ts for extension point."
  );
  console.info("[crunchbase_adapter] Requested body would be:", JSON.stringify(body));

  if (!result.ok) {
    throw new Error(`Crunchbase API error: ${result.status} ${result.error ?? ""}`);
  }

  // TODO: Parse result.text as JSON and map to ListingItem[]
  // Expected shape: { entities: Array<{ properties: { ... } }> }
  return [];
}

// ── Document parser ──────────────────────────────────────────────────────────

function parseDocument(
  _html: string,
  url: string,
  listingItem: ListingItem,
  source: FiSource
): RawDealCandidate[] {
  // TODO: Crunchbase API returns structured JSON, not HTML.
  // Map the JSON payload to RawDealCandidate here once fetchListing returns data.
  // The listingItem.snippet will contain the serialized JSON from the API response.
  console.info("[crunchbase_adapter] parseDocument called — stub, no output.");
  return [];
}

export const CrunchbaseAdapter: SourceAdapter = {
  key: "crunchbase_api",
  fetchListing,
  parseDocument,
};

/**
 * ── FIELD MAPPING REFERENCE (for when you implement the parser) ──────────────
 *
 * Crunchbase field          → RawDealCandidate field
 * ─────────────────────────────────────────────────
 * announced_on              → announced_date_raw
 * investment_type           → round_type_raw
 * money_raised.value        → amount_raw / amount_minor_units
 * money_raised_currency_code → currency_raw
 * lead_investor_identifiers[0].value → lead_investor_raw
 * investor_identifiers[].value       → co_investors_raw
 * funded_organization_identifier.value → company_name_raw
 * funded_organization_identifier.permalink → company_domain_raw (via CB url)
 * funded_organization_categories[0].value → sector_raw
 * funded_organization_location_identifiers[0].value → company_location_raw
 * short_description         → extracted_summary
 * permalink (canonical)     → article_url
 */

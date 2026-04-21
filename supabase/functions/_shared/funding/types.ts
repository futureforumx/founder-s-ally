/**
 * Shared TypeScript types for the funding-ingestion pipeline.
 * All Edge Functions and adapters import from here.
 */

// ── Source types ─────────────────────────────────────────────────────────────

export type SourceType = "news" | "curated_feed" | "rumor" | "api";
export type ExtractionMethod = "html_parse" | "rss" | "api" | "llm";
export type RunMode = "incremental" | "backfill" | "retry";
export type InvestorRole = "lead" | "participant" | "existing" | "unknown";

/** Normalized round type taxonomy */
export type RoundTypeNormalized =
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c"
  | "series_d"
  | "series_e"
  | "growth"
  | "strategic"
  | "debt"
  | "grant"
  | "unknown"
  | "other";

// ── Source configuration (mirrors fi_sources row) ───────────────────────────

export interface FiSource {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  adapter_key: string;
  source_type: SourceType;
  credibility_score: number;
  active: boolean;
  poll_interval_minutes: number;
  metadata: Record<string, unknown>;
}

// ── Raw adapter output ───────────────────────────────────────────────────────

/**
 * What each source adapter returns: a list of discovered article/deal URLs
 * from the listing page, optionally with metadata already extracted.
 */
export interface ListingItem {
  /** Canonical URL of the article/deal detail page */
  url: string;
  /** Short title extracted from the listing */
  title?: string;
  /** ISO date string if visible in the listing */
  published_date?: string;
  /** Snippet or teaser text */
  snippet?: string;
  /** Whether this looks like a rumor (VC Stack-specific) */
  is_rumor?: boolean;
}

/**
 * Parsed deal candidate extracted from a single document.
 * One document may yield multiple candidates (slot_index 0, 1, …).
 */
export interface RawDealCandidate {
  slot_index: number;
  company_name_raw: string | null;
  company_domain_raw: string | null;
  company_website_raw: string | null;
  company_location_raw: string | null;
  round_type_raw: string | null;
  amount_raw: string | null;
  currency_raw: string | null;
  announced_date_raw: string | null;
  lead_investor_raw: string | null;
  co_investors_raw: string[];
  sector_raw: string | null;
  article_url: string;
  press_url: string | null;
  source_type: SourceType;
  is_rumor: boolean;
  confidence_score: number;
  extracted_summary: string | null;
  extraction_method: ExtractionMethod;
  extraction_metadata: Record<string, unknown>;
}

// ── Normalized candidate (after normalization pass) ──────────────────────────

export interface NormalizedDealCandidate {
  // From raw
  raw_deal_id: string;
  source_id: string;
  source_name: string;
  source_type: SourceType;
  is_rumor: boolean;
  confidence_score: number;
  extraction_method: ExtractionMethod;

  // Company
  company_name: string;
  normalized_company_name: string;
  company_domain: string | null;
  company_website: string | null;
  company_location: string | null;

  // Sector
  sector_raw: string | null;
  sector_normalized: string | null;

  // Round
  round_type_raw: string | null;
  round_type_normalized: RoundTypeNormalized;

  // Amount
  amount_raw: string | null;
  amount_minor_units: number | null;
  currency: string;

  // Date
  announced_date: string | null; // ISO date YYYY-MM-DD

  // Investors
  lead_investor: string | null;
  lead_investor_normalized: string | null;
  co_investors: string[];

  // Content
  article_url: string;
  press_url: string | null;
  extracted_summary: string | null;

  // Dedupe
  dedupe_key: string;
}

// ── Canonical deal shape (mirrors fi_deals_canonical row) ───────────────────

export interface CanonicalDeal {
  id?: string;
  company_name: string;
  normalized_company_name: string;
  company_domain: string | null;
  company_website: string | null;
  company_linkedin_url: string | null;
  company_location: string | null;
  sector_raw: string | null;
  sector_normalized: string | null;
  round_type_raw: string | null;
  round_type_normalized: string;
  amount_raw: string | null;
  amount_minor_units: number | null;
  currency: string;
  announced_date: string | null;
  lead_investor: string | null;
  lead_investor_normalized: string | null;
  co_investors: string[];
  primary_source_name: string;
  primary_source_url: string | null;
  primary_press_url: string | null;
  source_type: SourceType;
  is_rumor: boolean;
  confidence_score: number;
  source_count: number;
  extracted_summary: string | null;
  extraction_method: ExtractionMethod;
  dedupe_key: string;
}

// ── Adapter interface ────────────────────────────────────────────────────────

export interface AdapterContext {
  source: FiSource;
  /** Polite fetch wrapper with retry + rate-limiting */
  fetchUrl: (url: string, options?: FetchOptions) => Promise<FetchResult>;
  /** Supabase admin client for idempotency checks */
  supabaseUrl: string;
  supabaseKey: string;
  runId: string;
  mode: RunMode;
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  url: string;
  error?: string;
}

// ── Adapter function signature ───────────────────────────────────────────────

/**
 * Each adapter exports a function matching this signature.
 * It should return an array of listing items discovered from the source's
 * listing / feed page.  Detail-page fetching is done by the pipeline.
 */
export type SourceListingAdapter = (
  ctx: AdapterContext
) => Promise<ListingItem[]>;

/**
 * Each adapter also exports a parser that takes a fetched document
 * (HTML string or JSON string) and extracts deal candidates.
 */
export type SourceDocumentParser = (
  html: string,
  url: string,
  listingItem: ListingItem,
  source: FiSource
) => RawDealCandidate[];

export interface SourceAdapter {
  key: string;
  fetchListing: SourceListingAdapter;
  parseDocument: SourceDocumentParser;
}

// ── Pipeline run result ──────────────────────────────────────────────────────

export interface RunResult {
  runId: string;
  sourceSlug: string;
  status: "completed" | "failed" | "partial";
  docsFetched: number;
  docsParsed: number;
  dealsRaw: number;
  dealsUpserted: number;
  errorCount: number;
  errors: Array<{ stage: string; url?: string; message: string }>;
}

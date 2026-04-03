import type {
  AdapterConfig,
  AdapterResult,
  IAdapter,
  NormalizedPerson,
  NormalizedRole,
  SourceRecord,
} from "@founder-intel/types";
import * as cheerio from "cheerio";
import { HttpClient } from "../base/http.client";
import { checkRobotsTxt } from "../base/adapter.interface";
import { slugify } from "../registry";

// ─── YC People Adapter ────────────────────────────────────────────────────────
// Standalone adapter for YC founders. Two-step access path:
//
//   Step 1 — slugs:  Query YCCompany_production Algolia index (the public index
//            accessible with the key embedded in YC's frontend) to enumerate
//            company slugs, paginating via the `batch` facet to bypass the
//            default 1,000-result Algolia cap.
//
//   Step 2 — people: For each slug, GET https://www.ycombinator.com/companies/{slug}
//            and parse the Inertia.js `data-page` JSON embedded in the HTML.
//            The `props.company.founders` array contains full name, title,
//            linkedin_url, twitter_url, avatar_url, bio, and YC-internal id.
//
// This replaces the previous broken approach that targeted `ycdc_companies`
// (a different internal index requiring a different API key). The corrected
// approach uses only the same key the yc-companies adapter uses and only
// publicly-accessible HTML pages.
//
// Key properties:
//   - Returns organizations: [] — yc-companies handles those
//   - Returns people + roles + person SourceRecords
//   - Deduplicates founders that appear in multiple companies
//   - Rate-limited to 500ms between requests; Cheerio for HTML parse
//   - robots.txt checked before run

const YC_ALGOLIA_BASE =
  "https://45bwzj1sgc-dsn.algolia.net/1/indexes/YCCompany_production/query";
const YC_COMPANY_BASE = "https://www.ycombinator.com/companies";
const HITS_PER_BATCH_PAGE = 200;

// ─── Inertia page founder shape (what YC company pages actually return) ───────
interface InertiaFounder {
  id?: number;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  linkedin_url?: string;
  twitter_url?: string;
  avatar_url?: string;
  bio?: string;
}

interface InertiaPageProps {
  company?: {
    founders?: InertiaFounder[];
    name?: string;
    slug?: string;
    website?: string;
  };
}

interface AlgoliaSlugHit {
  objectID: string;
  slug: string;
  website?: string;
  batch?: string;
}

interface AlgoliaFacetResponse {
  facets?: { batch?: Record<string, number> };
}

interface AlgoliaHitsResponse {
  hits: AlgoliaSlugHit[];
  nbPages: number;
  nbHits: number;
}

export class YcPeopleAdapter implements IAdapter {
  readonly name = "yc-people";
  readonly version = "2.0.0";
  readonly complianceNote =
    "Extracts founder profiles by: (1) enumerating company slugs via YC's public " +
    "YCCompany_production Algolia index using the read-only key embedded in their frontend, " +
    "then (2) fetching individual company pages and parsing the Inertia.js data-page JSON. " +
    "No founders field is requested from Algolia — only slug + website are fetched. " +
    "Page scraping targets publicly accessible HTML. robots.txt is checked. Rate limited.";

  private readonly http: HttpClient;
  private readonly algoliaAppId: string;
  private readonly algoliaSearchKey: string;
  private _enabled: boolean;

  constructor() {
    this.algoliaAppId = process.env.YC_ALGOLIA_APP_ID ?? "45BWZJ1SGC";
    this.algoliaSearchKey = process.env.YC_ALGOLIA_SEARCH_KEY ?? "";
    this._enabled = process.env.YC_ENABLED !== "false";
    this.http = new HttpClient({
      rateLimitMs: Number(process.env.YC_RATE_LIMIT_MS ?? 500),
      retries: 3,
      retryDelayMs: 2_000,
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  async checkRobotsTxt(): Promise<boolean> {
    return checkRobotsTxt("https://www.ycombinator.com");
  }

  async run(config?: AdapterConfig): Promise<AdapterResult> {
    if (!this.enabled) {
      console.log(`[${this.name}] Adapter disabled — skipping`);
      return { organizations: [], people: [], roles: [], sourceRecords: [] };
    }

    if (!this.algoliaSearchKey) {
      throw new Error(
        `[${this.name}] YC_ALGOLIA_SEARCH_KEY is not set. ` +
          "Extract it from window.AlgoliaOpts on ycombinator.com and set the env var."
      );
    }

    const robotsOk = await this.checkRobotsTxt();
    if (!robotsOk) {
      console.warn(`[${this.name}] robots.txt disallows crawling — aborting`);
      return { organizations: [], people: [], roles: [], sourceRecords: [] };
    }

    const people: NormalizedPerson[] = [];
    const roles: NormalizedRole[] = [];
    const sourceRecords: SourceRecord[] = [];
    const seenPersonDedupeKeys = new Set<string>();

    // ── Step 1: enumerate slugs from YCCompany_production via batch facets ────
    const slugs = await this.fetchAllSlugs(config);
    console.log(`[${this.name}] Fetched ${slugs.length} company slugs`);

    // ── Step 2: for each slug, scrape company page for founders ──────────────
    let companiesProcessed = 0;
    let foundersTotal = 0;
    let scrapeErrors = 0;

    const maxCompanies = config?.maxPages !== undefined
      ? config.maxPages * HITS_PER_BATCH_PAGE  // reuse maxPages as company cap
      : slugs.length;

    for (const { slug, website } of slugs.slice(0, maxCompanies)) {
      try {
        const founders = await this.fetchFoundersForCompany(slug);
        if (!founders.length) {
          companiesProcessed++;
          continue;
        }

        const orgDedupeKey = website
          ? extractDomain(website) ?? `yc:${slug}`
          : `yc:${slug}`;
        const companySourceUrl = `${YC_COMPANY_BASE}/${slug}`;

        for (const founder of founders) {
          try {
            const { person, role, record } = this.normalizeFounder(
              founder,
              orgDedupeKey,
              companySourceUrl
            );

            if (!seenPersonDedupeKeys.has(person.dedupeKey)) {
              seenPersonDedupeKeys.add(person.dedupeKey);
              people.push(person);
              sourceRecords.push(record);
              foundersTotal++;
            }

            // Always push the role — a person may found multiple companies
            roles.push(role);
          } catch (err) {
            console.error(
              `[${this.name}] Failed to normalize founder in ${slug}:`,
              err
            );
          }
        }

        companiesProcessed++;

        if (companiesProcessed % 100 === 0) {
          console.log(
            `[${this.name}] Progress: ${companiesProcessed}/${Math.min(maxCompanies, slugs.length)} companies, ` +
              `${foundersTotal} founders extracted`
          );
        }
      } catch (err) {
        scrapeErrors++;
        console.error(`[${this.name}] Failed to scrape ${slug}:`, err);
      }
    }

    console.log(
      `[${this.name}] Done — ${companiesProcessed} companies scraped, ` +
        `${foundersTotal} unique founders, ${scrapeErrors} errors`
    );

    return { organizations: [], people, roles, sourceRecords };
  }

  // ─── Private: enumerate slugs via Algolia batch facets ────────────────────

  private async fetchAllSlugs(
    config?: AdapterConfig
  ): Promise<Array<{ slug: string; website?: string }>> {
    const headers = this.algoliaHeaders();

    // First: get all batch names via facet query
    const facetBody = {
      query: "",
      hitsPerPage: 0,
      facets: ["batch"],
      attributesToRetrieve: [],
      attributesToHighlight: [],
    };

    const facetRes = await this.http.post<AlgoliaFacetResponse>(
      YC_ALGOLIA_BASE,
      facetBody,
      headers
    );

    const batches = Object.keys(facetRes.facets?.batch ?? {});
    if (!batches.length) {
      throw new Error(`[${this.name}] No batch facets returned — check Algolia key`);
    }

    console.log(`[${this.name}] Found ${batches.length} YC batches`);

    const slugs: Array<{ slug: string; website?: string }> = [];
    const maxBatches = config?.maxPages !== undefined ? Math.ceil(config.maxPages / 2) : batches.length;

    for (const batch of batches.slice(0, maxBatches)) {
      let page = 0;
      let totalPages = 1;

      while (page < totalPages) {
        const body = {
          query: "",
          hitsPerPage: HITS_PER_BATCH_PAGE,
          page,
          filters: `batch:"${batch}"`,
          attributesToRetrieve: ["objectID", "slug", "website"],
          attributesToHighlight: [],
        };

        const res = await this.http.post<AlgoliaHitsResponse>(
          YC_ALGOLIA_BASE,
          body,
          headers
        );

        totalPages = res.nbPages;

        for (const hit of res.hits) {
          if (hit.slug) {
            slugs.push({ slug: hit.slug, website: hit.website });
          }
        }

        page++;
      }
    }

    return slugs;
  }

  // ─── Private: scrape a single company page for founders ───────────────────

  private async fetchFoundersForCompany(slug: string): Promise<InertiaFounder[]> {
    const url = `${YC_COMPANY_BASE}/${slug}`;
    const html = await this.http.getText(url, {
      Accept: "text/html,application/xhtml+xml",
    });

    const $ = cheerio.load(html);
    const dataPageAttr = $("[data-page]").attr("data-page");

    if (!dataPageAttr) {
      // Company page might not have the Inertia data-page element
      // (e.g. stealth companies, retired pages) — not an error
      return [];
    }

    let props: InertiaPageProps;
    try {
      const parsed = JSON.parse(dataPageAttr) as { props?: InertiaPageProps };
      props = parsed.props ?? {};
    } catch {
      console.warn(`[${this.name}] Failed to parse data-page JSON for ${slug}`);
      return [];
    }

    return props.company?.founders ?? [];
  }

  // ─── Private: normalize InertiaFounder → typed output ────────────────────

  private normalizeFounder(
    founder: InertiaFounder,
    orgDedupeKey: string,
    sourceUrl: string
  ): { person: NormalizedPerson; role: NormalizedRole; record: SourceRecord } {
    // Inertia uses snake_case; YcFounderRaw (Algolia) uses camelCase — handle both
    const fullName =
      founder.full_name ??
      [founder.first_name, founder.last_name].filter(Boolean).join(" ") ??
      "Unknown";

    const linkedinUrl = founder.linkedin_url
      ? normalizeLinkedinUrl(founder.linkedin_url)
      : undefined;

    const personDedupeKey = linkedinUrl ?? `yc-person:${slugify(fullName)}`;

    const person: NormalizedPerson = {
      dedupeKey: personDedupeKey,
      canonicalName: fullName,
      firstName: founder.first_name,
      lastName: founder.last_name,
      linkedinUrl,
      twitterUrl: founder.twitter_url ?? undefined,
      avatarUrl: founder.avatar_url ?? undefined,
      bio: founder.bio ?? undefined,
      ycId: founder.id ? String(founder.id) : undefined,
    };

    const role: NormalizedRole = {
      personDedupeKey,
      orgDedupeKey,
      title: founder.title ?? "Founder",
      roleType: inferRoleType(founder.title),
      functionType: inferFunctionType(founder.title),
      isCurrent: true,
    };

    const record: SourceRecord = {
      sourceAdapter: this.name,
      sourceUrl,
      sourceId: founder.id ? `founder:${founder.id}` : undefined,
      rawPayload: founder as unknown as Record<string, unknown>,
      entityType: "person",
      entityDedupeKey: personDedupeKey,
    };

    return { person, role, record };
  }

  private algoliaHeaders(): Record<string, string> {
    return {
      "X-Algolia-Application-Id": this.algoliaAppId,
      "X-Algolia-API-Key": this.algoliaSearchKey,
    };
  }
}

// ─── Module-private helpers ───────────────────────────────────────────────────

function extractDomain(raw: string): string | undefined {
  try {
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function normalizeLinkedinUrl(raw: string): string {
  const clean = raw.trim().replace(/\/$/, "");
  if (clean.startsWith("http")) return clean;
  return `https://www.linkedin.com/in/${clean.replace(/^linkedin\.com\/in\//, "")}`;
}

function inferRoleType(title?: string): NormalizedRole["roleType"] {
  if (!title) return "founder";
  const t = title.toLowerCase();
  if (t.includes("ceo")) return "ceo";
  if (t.includes("cto")) return "cto";
  if (t.includes("coo")) return "coo";
  if (t.includes("co-founder") || t.includes("cofounder")) return "cofounder";
  return "founder";
}

function inferFunctionType(title?: string): NormalizedRole["functionType"] {
  if (!title) return "general_management";
  const t = title.toLowerCase();
  if (t.includes("tech") || t.includes("engineer") || t.includes("cto"))
    return "engineering";
  if (t.includes("product")) return "product";
  if (t.includes("design")) return "design";
  if (t.includes("sales")) return "sales";
  if (t.includes("market")) return "marketing";
  if (t.includes("ops") || t.includes("operat")) return "operations";
  if (t.includes("finance") || t.includes("cfo")) return "finance";
  return "general_management";
}

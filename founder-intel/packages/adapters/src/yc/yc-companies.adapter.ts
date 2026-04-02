import type {
  AdapterConfig,
  AdapterResult,
  IAdapter,
  NormalizedOrganization,
  NormalizedPerson,
  NormalizedRole,
  SourceRecord,
} from "@founder-intel/types";
import { HttpClient } from "../base/http.client";
import { checkRobotsTxt } from "../base/adapter.interface";
import { normalizeUrl, extractDomain, slugify, inferCompanyStatus, inferStageProxy } from "../registry";
import type { YcAlgoliaHit, YcAlgoliaResponse, YcFounderRaw } from "./yc.types";

// ─── YC Companies Adapter ─────────────────────────────────────────────────────
// Uses YC's public Algolia search API (read-only key embedded in their frontend)
// Respects robots.txt and applies rate limiting.
// YC is the highest-trust source — all raw data is preserved verbatim.

const YC_ALGOLIA_BASE = "https://45bwzj1sgc-dsn.algolia.net/1/indexes/ycdc_companies/query";
const HITS_PER_PAGE = 100;

export class YcCompaniesAdapter implements IAdapter {
  readonly name = "yc-companies";
  readonly version = "1.0.0";
  readonly complianceNote =
    "Uses YC's public Algolia search API. The search key is a read-only key embedded in " +
    "YC's public-facing frontend bundle. Robots.txt is checked before each run. " +
    "Rate limited to 500ms between requests.";

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
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  async checkRobotsTxt(): Promise<boolean> {
    return checkRobotsTxt("https://www.ycombinator.com");
  }

  async run(_config?: AdapterConfig): Promise<AdapterResult> {
    if (!this.enabled) {
      console.log(`[${this.name}] Adapter disabled — skipping`);
      return { organizations: [], people: [], roles: [], sourceRecords: [] };
    }

    const robotsOk = await this.checkRobotsTxt();
    if (!robotsOk) {
      console.warn(`[${this.name}] robots.txt disallows crawling — aborting`);
      return { organizations: [], people: [], roles: [], sourceRecords: [] };
    }

    const organizations: NormalizedOrganization[] = [];
    const people: NormalizedPerson[] = [];
    const roles: NormalizedRole[] = [];
    const sourceRecords: SourceRecord[] = [];

    let page = 0;
    let totalPages = 1;
    let totalFetched = 0;

    console.log(`[${this.name}] Starting ingestion…`);

    while (page < totalPages) {
      const response = await this.fetchPage(page);
      totalPages = response.nbPages;
      totalFetched += response.hits.length;

      console.log(`[${this.name}] Page ${page + 1}/${totalPages} — ${response.hits.length} hits`);

      for (const hit of response.hits) {
        try {
          const { org, personList, roleList, records } = this.normalizeHit(hit);
          organizations.push(org);
          people.push(...personList);
          roles.push(...roleList);
          sourceRecords.push(...records);
        } catch (err) {
          console.error(`[${this.name}] Failed to normalize hit ${hit.objectID}:`, err);
        }
      }
      page++;
    }

    console.log(
      `[${this.name}] Done — ${totalFetched} companies, ` +
        `${people.length} founders, ${roles.length} roles`
    );

    return { organizations, people, roles, sourceRecords };
  }

  private async fetchPage(page: number): Promise<YcAlgoliaResponse> {
    const headers: Record<string, string> = {
      "X-Algolia-Application-Id": this.algoliaAppId,
    };
    if (this.algoliaSearchKey) {
      headers["X-Algolia-API-Key"] = this.algoliaSearchKey;
    }

    const body = {
      query: "",
      hitsPerPage: HITS_PER_PAGE,
      page,
      attributesToRetrieve: [
        "objectID",
        "id",
        "name",
        "slug",
        "website",
        "smallLogoUrl",
        "oneLiner",
        "longDescription",
        "teamSize",
        "url",
        "batch",
        "status",
        "industries",
        "subverticals",
        "tags",
        "allLocations",
        "isHiring",
        "nonprofit",
        "topCompany",
        "founders",
      ],
      attributesToHighlight: [],
    };

    return this.http.post<YcAlgoliaResponse>(YC_ALGOLIA_BASE, body, headers);
  }

  // ─── Hit → Normalized ─────────────────────────────────────────────────────

  private normalizeHit(hit: YcAlgoliaHit): {
    org: NormalizedOrganization;
    personList: NormalizedPerson[];
    roleList: NormalizedRole[];
    records: SourceRecord[];
  } {
    const domain = hit.website ? extractDomain(hit.website) : undefined;
    const dedupeKey = domain ?? `yc:${hit.slug}`;
    const sourceUrl = `https://www.ycombinator.com/companies/${hit.slug}`;

    // ─── Organization ────────────────────────────────────────────────────────
    const rawJson = { ...hit } as Record<string, unknown>;
    const org: NormalizedOrganization = {
      dedupeKey,
      canonicalName: hit.name,
      domain,
      website: hit.website ? normalizeUrl(hit.website) : undefined,
      description: hit.oneLiner ?? hit.longDescription,
      logoUrl: hit.smallLogoUrl,
      industry: hit.industries?.[0],
      location: hit.allLocations,
      employeeCount: hit.teamSize,
      tags: [...(hit.tags ?? []), ...(hit.subverticals ?? []), ...(hit.industries ?? [])],
      status: inferCompanyStatus(hit.status),
      stageProxy: inferStageProxy(hit),
      isYcBacked: true,
      ycBatch: hit.batch,
      ycId: String(hit.id ?? hit.objectID),
      ycRawJson: rawJson,
    };

    // ─── Source record for org ───────────────────────────────────────────────
    const orgSourceRecord: SourceRecord = {
      sourceAdapter: this.name,
      sourceUrl,
      sourceId: String(hit.objectID),
      rawPayload: rawJson,
      entityType: "organization",
    };

    // ─── Founders → People + Roles ───────────────────────────────────────────
    const personList: NormalizedPerson[] = [];
    const roleList: NormalizedRole[] = [];
    const records: SourceRecord[] = [orgSourceRecord];

    for (const founder of hit.founders ?? []) {
      const { person, role, record } = this.normalizeFounder(
        founder,
        dedupeKey,
        sourceUrl
      );
      personList.push(person);
      roleList.push(role);
      records.push(record);
    }

    return { org, personList, roleList, records };
  }

  private normalizeFounder(
    founder: YcFounderRaw,
    orgDedupeKey: string,
    sourceUrl: string
  ): { person: NormalizedPerson; role: NormalizedRole; record: SourceRecord } {
    const fullName =
      founder.name ??
      [founder.firstName, founder.lastName].filter(Boolean).join(" ");

    const linkedinUrl = founder.linkedInUrl
      ? normalizeLinkedinUrl(founder.linkedInUrl)
      : undefined;
    const personDedupeKey =
      linkedinUrl ?? `yc-person:${slugify(fullName)}`;

    const person: NormalizedPerson = {
      dedupeKey: personDedupeKey,
      canonicalName: fullName,
      firstName: founder.firstName,
      lastName: founder.lastName,
      linkedinUrl,
      twitterUrl: founder.twitterUrl ?? undefined,
      avatarUrl: founder.avatarUrl ?? undefined,
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
    };

    return { person, role, record };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (t.includes("tech") || t.includes("engineer") || t.includes("cto")) return "engineering";
  if (t.includes("product")) return "product";
  if (t.includes("design")) return "design";
  if (t.includes("sales")) return "sales";
  if (t.includes("market")) return "marketing";
  if (t.includes("ops") || t.includes("operat")) return "operations";
  if (t.includes("finance") || t.includes("cfo")) return "finance";
  return "general_management";
}

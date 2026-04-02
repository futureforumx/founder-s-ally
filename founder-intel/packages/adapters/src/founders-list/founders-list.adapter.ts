import type {
  AdapterConfig,
  AdapterResult,
  IAdapter,
  NormalizedOrganization,
  NormalizedPerson,
  NormalizedRole,
  SourceRecord,
} from "@founder-intel/types";
import * as cheerio from "cheerio";
import { HttpClient } from "../base/http.client";
import { checkRobotsTxt } from "../base/adapter.interface";
import { extractDomain, normalizeLinkedinCompanyUrl, slugify } from "../registry";

// ─── FoundersList Adapter ─────────────────────────────────────────────────────
// Scrapes cofounders listings from founderslist.com
// Extracts: name, expertise, looking-for, location, LinkedIn

const BASE_URL = "https://founderslist.com";
const COFOUNDERS_PATH = "/co-founders";

export class FoundersListAdapter implements IAdapter {
  readonly name = "founders-list";
  readonly version = "1.0.0";
  readonly complianceNote =
    "Scrapes public cofounder listing pages from founderslist.com. " +
    "Checks robots.txt before each run. Rate limited to 1000ms between requests. " +
    "Only extracts publicly visible profile data.";

  private readonly http: HttpClient;
  private _enabled: boolean;

  constructor() {
    this._enabled = process.env.FOUNDERS_LIST_ENABLED !== "false";
    this.http = new HttpClient({
      rateLimitMs: Number(process.env.FOUNDERS_LIST_RATE_LIMIT_MS ?? 1000),
      retries: 2,
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  async checkRobotsTxt(): Promise<boolean> {
    return checkRobotsTxt(BASE_URL);
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

    let page = 1;
    let hasMore = true;

    console.log(`[${this.name}] Starting ingestion…`);

    while (hasMore) {
      try {
        const pageUrl = `${BASE_URL}${COFOUNDERS_PATH}?page=${page}`;
        const html = await this.http.getText(pageUrl);
        const profiles = this.parsePage(html, pageUrl);

        if (profiles.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`[${this.name}] Page ${page} — ${profiles.length} profiles`);

        for (const profile of profiles) {
          const { person, org, role, record } = this.normalizeProfile(profile);
          people.push(person);
          if (org) organizations.push(org);
          if (role) roles.push(role);
          sourceRecords.push(record);
        }

        // Stop if fewer results than expected (last page)
        if (profiles.length < 20) hasMore = false;
        page++;
      } catch (err) {
        console.error(`[${this.name}] Error fetching page ${page}:`, err);
        hasMore = false;
      }
    }

    console.log(
      `[${this.name}] Done — ${people.length} founders, ${organizations.length} companies`
    );

    return { organizations, people, roles, sourceRecords };
  }

  // ─── HTML parsing ──────────────────────────────────────────────────────────

  private parsePage(html: string, _pageUrl: string): FoundersListProfile[] {
    const $ = cheerio.load(html);
    const profiles: FoundersListProfile[] = [];

    // FoundersList uses card-based layout — adapt selectors as needed
    $(".cofounder-card, .founder-card, [data-testid='cofounder-card'], .profile-card").each(
      (_i, el) => {
        const card = $(el);
        const profile = this.extractCardData(card, $);
        if (profile) profiles.push(profile);
      }
    );

    // Fallback: look for profile links if card selectors miss
    if (profiles.length === 0) {
      $("article, .listing-item, .member-card").each((_i, el) => {
        const card = $(el);
        const profile = this.extractCardData(card, $);
        if (profile) profiles.push(profile);
      });
    }

    return profiles;
  }

  private extractCardData(
    card: cheerio.Cheerio<cheerio.Element>,
    $: cheerio.CheerioAPI
  ): FoundersListProfile | null {
    const name =
      card.find(".name, h2, h3, [class*='name']").first().text().trim() ||
      card.find("a[href*='/profile/']").first().text().trim();

    if (!name) return null;

    const profileUrl =
      card.find("a[href*='/profile/']").first().attr("href") ??
      card.find("a[href*='/founders/']").first().attr("href");

    const fullProfileUrl = profileUrl
      ? profileUrl.startsWith("http")
        ? profileUrl
        : `${BASE_URL}${profileUrl}`
      : undefined;

    const skills: string[] = [];
    card.find(".skill, .tag, .expertise-tag, [class*='skill'], [class*='tag']").each(
      (_i, el) => {
        const text = $(el).text().trim();
        if (text) skills.push(text);
      }
    );

    return {
      name,
      profileUrl: fullProfileUrl,
      location:
        card.find(".location, [class*='location']").first().text().trim() || undefined,
      expertise: skills,
      bio:
        card.find(".bio, .description, p").first().text().trim() || undefined,
      linkedinUrl:
        card.find("a[href*='linkedin.com']").first().attr("href") || undefined,
      companyName:
        card.find(".company, [class*='company']").first().text().trim() || undefined,
      companyWebsite:
        card.find("a[href*='company']").first().attr("href") ||
        card.find("[class*='company'] a").first().attr("href") ||
        undefined,
      role:
        card.find(".role, .title, [class*='title']").first().text().trim() || undefined,
    };
  }

  // ─── Profile → Normalized ─────────────────────────────────────────────────

  private normalizeProfile(profile: FoundersListProfile): {
    person: NormalizedPerson;
    org?: NormalizedOrganization;
    role?: NormalizedRole;
    record: SourceRecord;
  } {
    const linkedinUrl = profile.linkedinUrl
      ? normalizePersonLinkedin(profile.linkedinUrl)
      : undefined;
    const personDedupeKey = linkedinUrl ?? `fl:${slugify(profile.name)}`;

    const nameParts = profile.name.split(" ");
    const person: NormalizedPerson = {
      dedupeKey: personDedupeKey,
      canonicalName: profile.name,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(" ") || undefined,
      linkedinUrl,
      bio: profile.bio,
      location: profile.location,
      expertise: profile.expertise,
    };

    const record: SourceRecord = {
      sourceAdapter: this.name,
      sourceUrl: profile.profileUrl ?? `${BASE_URL}/co-founders`,
      sourceId: profile.profileUrl ?? personDedupeKey,
      rawPayload: profile as unknown as Record<string, unknown>,
      entityType: "person",
    };

    let org: NormalizedOrganization | undefined;
    let role: NormalizedRole | undefined;

    if (profile.companyName) {
      const companyDomain = profile.companyWebsite
        ? extractDomain(profile.companyWebsite)
        : undefined;
      const orgDedupeKey = companyDomain ?? `fl-co:${slugify(profile.companyName)}`;

      org = {
        dedupeKey: orgDedupeKey,
        canonicalName: profile.companyName,
        domain: companyDomain,
        website: profile.companyWebsite,
      };

      role = {
        personDedupeKey,
        orgDedupeKey,
        title: profile.role ?? "Founder",
        roleType: "founder",
        isCurrent: true,
      };
    }

    return { person, org, role, record };
  }
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface FoundersListProfile {
  name: string;
  profileUrl?: string;
  location?: string;
  expertise: string[];
  bio?: string;
  linkedinUrl?: string;
  companyName?: string;
  companyWebsite?: string;
  role?: string;
}

function normalizePersonLinkedin(raw: string): string {
  const clean = raw.trim().replace(/\/$/, "");
  const match = clean.match(/linkedin\.com\/in\/([^/?]+)/);
  if (match) return `https://www.linkedin.com/in/${match[1]}`;
  if (clean.startsWith("http")) return clean;
  return `https://www.linkedin.com/in/${clean}`;
}

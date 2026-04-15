/**
 * adapters/website.ts
 * ====================
 * Official firm website adapter. Highest-priority source for description,
 * elevator pitch, socials, contact info, blog URL.
 *
 * Strategy:
 *   1. Visit the homepage.
 *   2. Crawl /about, /team, /thesis, /portfolio, /contact (best-effort).
 *   3. Extract JSON-LD + og:description + visible text.
 *   4. Scan outbound links for LinkedIn, X, Crunchbase, Medium, Substack.
 *   5. Extract email from contact page.
 *
 * No auth required.
 */

import type { SourceAdapter, FirmSeed, AdapterContext, AdapterResult, ExtractedProfile, ProvenanceEntry } from "../types";
import { jsonLd, meta, pageText, linksMatching, firstHref, firstText } from "../browser/selectors";
import { extractDomain, normalizeUrl, classifyUrl } from "../parsers/url-parser";
import { parseGeo } from "../parsers/geo-parser";
import { baseConfidence } from "../scoring";

const SUB_PATHS = ["/about", "/about-us", "/team", "/people", "/thesis", "/portfolio", "/contact", "/invest", "/our-story"];
const EMAIL_RX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export const websiteAdapter: SourceAdapter = {
  name: "website",
  requires_auth: false,
  base_confidence: baseConfidence("website"),

  async discoverFirmUrl(firm: FirmSeed) {
    if (firm.website_url) return normalizeUrl(firm.website_url);
    if (firm.domain)      return `https://${firm.domain.replace(/^https?:\/\//, "")}`;
    return null;
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("website");
    const profile: ExtractedProfile = {};
    const provenance: ProvenanceEntry[] = [];
    let rawText = "";

    try {
      await ctx.throttle("website");
      const baseUrl = normalizeUrl(url);
      if (!baseUrl) return null;

      // Homepage
      const ok = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).then(() => true).catch(() => false);
      if (!ok) return null;

      // Core extraction
      profile.description    = (await meta(page, "og:description")) ?? (await meta(page, "description")) ?? undefined;
      profile.logo_url       = (await meta(page, "og:image")) ?? undefined;
      profile.website_url    = baseUrl;
      rawText += await pageText(page);

      // JSON-LD (often has Organization schema with foundedDate, address, socials)
      const ldBlocks = await jsonLd(page);
      for (const block of ldBlocks) {
        const type = block["@type"];
        if (type === "Organization" || type === "Corporation" || (Array.isArray(type) && type.includes("Organization"))) {
          if (!profile.description && typeof block.description === "string") profile.description = block.description;
          if (typeof block.foundingDate === "string") {
            const yr = block.foundingDate.match(/\d{4}/)?.[0];
            if (yr) profile.founded_year = parseInt(yr, 10);
          }
          if (typeof block.email === "string") profile.email = block.email;
          if (typeof block.telephone === "string") profile.phone = block.telephone;
          if (typeof block.logo === "string") profile.logo_url = block.logo;
          const address = block.address as Record<string, unknown> | undefined;
          if (address) {
            if (typeof address.addressLocality === "string") profile.hq_city = address.addressLocality;
            if (typeof address.addressRegion === "string")   profile.hq_state = address.addressRegion;
            if (typeof address.addressCountry === "string")  profile.hq_country = address.addressCountry;
          }
          const sameAs = Array.isArray(block.sameAs) ? block.sameAs as string[] : [];
          for (const link of sameAs) {
            const kind = classifyUrl(link);
            if (kind === "linkedin")   profile.linkedin_url = link;
            if (kind === "x")          profile.x_url = link;
            if (kind === "crunchbase") profile.crunchbase_url = link;
            if (kind === "medium")     profile.medium_url = link;
            if (kind === "substack")   profile.substack_url = link;
          }
        }
      }

      // Outbound social links scan
      const linkedinLinks   = await linksMatching(page, /linkedin\.com\/(company|in)\//i);
      const xLinks          = await linksMatching(page, /(twitter\.com|x\.com)\/[^\/]+$/i);
      const crunchbaseLinks = await linksMatching(page, /crunchbase\.com\/organization\//i);
      const mediumLinks     = await linksMatching(page, /medium\.com\/@?[^\/]+$/i);
      const substackLinks   = await linksMatching(page, /\.substack\.com\/?$/i);
      const blogLinks       = await linksMatching(page, /\/(blog|posts|articles|newsletter)\b/i);

      if (!profile.linkedin_url && linkedinLinks.length)     profile.linkedin_url   = linkedinLinks[0];
      if (!profile.x_url && xLinks.length)                    profile.x_url          = xLinks[0];
      if (!profile.crunchbase_url && crunchbaseLinks.length) profile.crunchbase_url = crunchbaseLinks[0];
      if (!profile.medium_url && mediumLinks.length)         profile.medium_url     = mediumLinks[0];
      if (!profile.substack_url && substackLinks.length)     profile.substack_url   = substackLinks[0];
      if (!profile.blog_url && blogLinks.length)             profile.blog_url       = blogLinks[0];

      // Crawl subpages (best-effort — many firms use SPAs or no subpages)
      for (const path of SUB_PATHS) {
        try {
          const subUrl = new URL(path, baseUrl).toString();
          const gotIt = await page.goto(subUrl, { waitUntil: "domcontentloaded", timeout: 12000 }).then(() => true).catch(() => false);
          if (!gotIt) continue;
          const subText = await pageText(page);
          rawText += "\n\n" + subText;

          // Email on contact page
          if (!profile.email && /contact/.test(path)) {
            const emails = subText.match(EMAIL_RX);
            if (emails?.length) profile.email = emails.find(e => !/sentry|example|test/.test(e));
          }

          // Location on about page
          if (!profile.hq_city && /about/.test(path)) {
            // Look for "Based in X" or "HQ: X" patterns
            const locMatch = subText.match(/\b(?:based in|hq[\s:]+|headquarters[\s:]+in\s+)([A-Z][A-Za-z\s,]+?)(?:\.|,|\n)/i);
            if (locMatch) {
              const g = parseGeo(locMatch[1]);
              if (g) {
                profile.hq_city = profile.hq_city ?? g.city;
                profile.hq_state = profile.hq_state ?? g.state;
                profile.hq_country = profile.hq_country ?? g.country;
                profile.hq_region = profile.hq_region ?? g.region;
              }
            }
          }

          await ctx.throttle("website");
        } catch { /* skip failed subpage */ }
      }

      profile.raw_text = rawText.slice(0, 50_000);

      // Build provenance entries for fields we actually populated
      const now = new Date();
      for (const [field, value] of Object.entries(profile)) {
        if (value == null || field === "raw_text" || field === "raw_payload") continue;
        provenance.push({
          field_name: field,
          source_name: "website",
          source_url: baseUrl,
          value,
          confidence: baseConfidence("website"),
          extracted_at: now,
        });
      }

      return {
        source: "website",
        source_url: baseUrl,
        discovered: !firm.website_url,
        profile,
        provenance,
        match_confidence: 0.95, // if we got here from the firm's own website, very high confidence
      };
    } catch (e) {
      ctx.logger.warn("website.extract.failed", { firm: firm.firm_name, url, err: (e as Error).message });
      return null;
    } finally {
      await ctx.releasePage("website", page);
    }
  },
};

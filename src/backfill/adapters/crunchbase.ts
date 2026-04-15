/**
 * adapters/crunchbase.ts
 * =======================
 * Crunchbase organization profile adapter. Public pages expose description,
 * website, founded date, HQ, social links, and category tags via JSON-LD.
 *
 * Some detail tabs are gated behind Crunchbase Pro — we read what's on the
 * public overview page (/organization/{slug}) which is visible without auth.
 *
 * TODO[selector]: Crunchbase frequently A/B tests layout. If selectors break,
 * tune the JSON-LD parser first; it's most stable.
 */

import type { SourceAdapter, FirmSeed, AdapterContext, ExtractedProfile, ProvenanceEntry } from "../types";
import { jsonLd, meta, pageText, firstText, linksMatching } from "../browser/selectors";
import { extractDomain, normalizeUrl, classifyUrl } from "../parsers/url-parser";
import { parseGeo } from "../parsers/geo-parser";
import { matchScore, baseConfidence, normalize } from "../scoring";

const CB_SEARCH_URL = (q: string) => `https://www.crunchbase.com/search/organizations/field/organizations/name/${encodeURIComponent(q)}`;

export const crunchbaseAdapter: SourceAdapter = {
  name: "crunchbase",
  requires_auth: false,
  base_confidence: baseConfidence("crunchbase"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.crunchbase) return firm.known_urls.crunchbase;
    if (firm.crunchbase_url) return normalizeUrl(firm.crunchbase_url);

    const page = await ctx.getPage("crunchbase");
    try {
      await ctx.throttle("crunchbase");
      const q = firm.firm_name.trim();
      const url = CB_SEARCH_URL(q);
      const gotIt = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).then(() => true).catch(() => false);
      if (!gotIt) return null;

      // Find the first result link to /organization/{slug}
      const candidates = await page.locator('a[href*="/organization/"]').evaluateAll((els) =>
        els.slice(0, 10).map((e) => ({ href: (e as HTMLAnchorElement).href, text: (e as HTMLAnchorElement).textContent?.trim() ?? "" })),
      );

      const expectedDomain = extractDomain(firm.website_url ?? firm.domain ?? null);
      let best: { href: string; score: number } | null = null;
      for (const c of candidates) {
        const score = matchScore({
          expectedName: firm.firm_name,
          foundName: c.text,
          expectedDomain,
        });
        if (!best || score > best.score) best = { href: c.href, score };
      }
      if (!best || best.score < 0.55) return null;
      return normalizeUrl(best.href);
    } catch { return null; }
    finally { await ctx.releasePage("crunchbase", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("crunchbase");
    const profile: ExtractedProfile = { crunchbase_url: url };
    const provenance: ProvenanceEntry[] = [];

    try {
      await ctx.throttle("crunchbase");
      const ok = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true).catch(() => false);
      if (!ok) return null;

      // JSON-LD is the most reliable extractor
      const ld = await jsonLd(page);
      for (const block of ld) {
        const t = block["@type"];
        if (t === "Organization" || (Array.isArray(t) && t.includes("Organization"))) {
          if (typeof block.name === "string") profile.raw_payload = { ...profile.raw_payload, cb_name: block.name };
          if (typeof block.description === "string") profile.description = block.description;
          if (typeof block.url === "string") profile.website_url = normalizeUrl(block.url) ?? undefined;
          if (typeof block.foundingDate === "string") {
            const yr = block.foundingDate.match(/\d{4}/)?.[0];
            if (yr) profile.founded_year = parseInt(yr, 10);
          }
          if (typeof block.logo === "string") profile.logo_url = block.logo;
          const addr = block.address as Record<string, unknown> | undefined;
          if (addr) {
            if (typeof addr.addressLocality === "string") profile.hq_city = addr.addressLocality;
            if (typeof addr.addressRegion === "string")   profile.hq_state = addr.addressRegion;
            if (typeof addr.addressCountry === "string")  profile.hq_country = addr.addressCountry;
          }
          const sameAs = Array.isArray(block.sameAs) ? (block.sameAs as string[]) : [];
          for (const link of sameAs) {
            const kind = classifyUrl(link);
            if (kind === "linkedin") profile.linkedin_url ??= link;
            if (kind === "x")        profile.x_url ??= link;
          }
        }
      }

      // Fallback: meta tags
      profile.description ??= (await meta(page, "og:description")) ?? undefined;
      profile.logo_url    ??= (await meta(page, "og:image")) ?? undefined;

      // Fallback: location string near "Headquarters Location"
      if (!profile.hq_city) {
        const locText = await firstText(page, [
          'mat-chip:has-text("Headquarters")',
          '[data-test="location"]',
          '.location-string',
        ]);
        if (locText) {
          const g = parseGeo(locText);
          if (g) {
            profile.hq_city = profile.hq_city ?? g.city;
            profile.hq_state = profile.hq_state ?? g.state;
            profile.hq_country = profile.hq_country ?? g.country;
            profile.hq_region = profile.hq_region ?? g.region;
          }
        }
      }

      // Category/industry tags — free-text, passed to classifier downstream
      const chips = await page.locator('[data-test="industries"] a, chips-display a, .category-groups-chip').allTextContents().catch(() => []);
      if (chips.length) profile.sectors = [...new Set(chips.map(c => c.trim()).filter(Boolean))].slice(0, 10);

      profile.raw_text = await pageText(page);

      // Match confidence based on page name vs expected
      const pageTitle = (await meta(page, "og:title")) || (await page.title());
      const mc = matchScore({
        expectedName: firm.firm_name,
        foundName: pageTitle,
        expectedDomain: extractDomain(firm.website_url ?? null),
        foundDomain: extractDomain(profile.website_url ?? null),
      });

      // Build provenance for all populated fields
      const now = new Date();
      for (const [field, value] of Object.entries(profile)) {
        if (value == null || field === "raw_text" || field === "raw_payload") continue;
        provenance.push({
          field_name: field,
          source_name: "crunchbase",
          source_url: url,
          value,
          confidence: baseConfidence("crunchbase") * Math.max(0.7, mc),
          extracted_at: now,
        });
      }

      return {
        source: "crunchbase",
        source_url: url,
        discovered: !firm.crunchbase_url,
        profile,
        provenance,
        match_confidence: mc,
      };
    } catch (e) {
      ctx.logger.warn("crunchbase.extract.failed", { firm: firm.firm_name, err: (e as Error).message });
      return null;
    } finally {
      await ctx.releasePage("crunchbase", page);
    }
  },
};

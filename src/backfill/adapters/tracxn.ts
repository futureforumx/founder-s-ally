/**
 * adapters/tracxn.ts
 * ===================
 * Tracxn investor profile adapter.
 *
 * Tracxn's /a/investors/{slug} pages contain description, HQ, sectors, stages,
 * geographies, portfolio companies. Most overview data is visible without
 * paid auth; deep detail requires a session.
 *
 * TODO[selector]: Tracxn's React layout uses hashed class names. Prefer data
 * attributes + text-based locators. Selectors below may need tuning.
 */

import type { SourceAdapter, FirmSeed, AdapterContext, ExtractedProfile, ProvenanceEntry } from "../types";
import { firstText, allText, pageText, meta } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { parseGeo } from "../parsers/geo-parser";
import { matchScore, baseConfidence } from "../scoring";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const tracxnAdapter: SourceAdapter = {
  name: "tracxn",
  requires_auth: true,
  base_confidence: baseConfidence("tracxn"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.tracxn) return firm.known_urls.tracxn;

    const page = await ctx.getPage("tracxn");
    try {
      await ctx.throttle("tracxn");

      // Tracxn internal search endpoint
      const results = await page.evaluate(async (name) => {
        try {
          const r = await fetch(`https://tracxn.com/api/3.0/search/investors?q=${encodeURIComponent(name)}&limit=5`, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          return r.ok ? await r.json() : null;
        } catch { return null; }
      }, firm.firm_name);

      const hits = (results?.result ?? results?.hits ?? results?.results ?? []) as Array<Record<string, unknown>>;
      const expectedDomain = extractDomain(firm.website_url ?? firm.domain ?? null);

      let best: { slug: string; score: number } | null = null;
      for (const h of hits.slice(0, 5)) {
        const slug = (h.slug ?? h.id ?? h.profileSlug) as string | undefined;
        if (!slug) continue;
        const score = matchScore({
          expectedName: firm.firm_name,
          foundName: (h.name ?? h.displayName) as string | undefined,
          expectedDomain,
          foundDomain: (h.domain ?? h.website) as string | undefined,
        });
        if (!best || score > best.score) best = { slug, score };
      }

      if (!best || best.score < 0.6) {
        // Fallback: try direct slug
        const direct = `https://tracxn.com/a/investors/${slugify(firm.firm_name)}`;
        const ok = await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 15000 }).then(() => page.url().includes("/a/investors/")).catch(() => false);
        return ok ? direct : null;
      }
      return `https://tracxn.com/a/investors/${best.slug}`;
    } catch { return null; }
    finally { await ctx.releasePage("tracxn", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("tracxn");
    const profile: ExtractedProfile = { tracxn_url: url };
    const provenance: ProvenanceEntry[] = [];

    try {
      await ctx.throttle("tracxn");
      const ok = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true).catch(() => false);
      if (!ok) return null;

      profile.description = await firstText(page, [
        '[data-testid="about-description"]',
        '[data-testid="description"]',
        '.about-text',
        '.investor-description',
        'section[aria-label*="About"] p',
      ]) ?? undefined;

      // HQ
      const locText = await firstText(page, [
        '[data-testid="headquarters"]',
        'dt:has-text("Headquarters") + dd',
        'span:has-text("Based in") + span',
      ]);
      if (locText) {
        const g = parseGeo(locText);
        if (g) { profile.hq_city = g.city; profile.hq_state = g.state; profile.hq_country = g.country; profile.hq_region = g.region; }
      }

      // Founded year
      const foundedText = await firstText(page, [
        '[data-testid="founded-year"]',
        'dt:has-text("Founded") + dd',
      ]);
      if (foundedText) {
        const yr = foundedText.match(/\d{4}/)?.[0];
        if (yr) profile.founded_year = parseInt(yr, 10);
      }

      // Website
      const siteHref = await page.locator('a[data-testid="website"], a[data-testid="firm-website"]').first().getAttribute("href").catch(() => null);
      if (siteHref) profile.website_url = normalizeUrl(siteHref) ?? undefined;

      // Sectors / stages / geographies
      const sectors = await allText(page, [
        '[data-testid="sectors"] li',
        '[data-testid="sector-tag"]',
        '.sectors-list li',
      ]);
      if (sectors.length) profile.sectors = sectors.slice(0, 15);

      const stages = await allText(page, [
        '[data-testid="stages"] li',
        '[data-testid="stage-focus"]',
        '.stages-list li',
      ]);
      if (stages.length) profile.stages = stages.slice(0, 8);

      const geos = await allText(page, [
        '[data-testid="geographies"] li',
        '[data-testid="geo-focus"]',
        '.geographies-list li',
      ]);
      if (geos.length) profile.geographies = geos.slice(0, 12);

      // Portfolio companies
      const portfolio = await allText(page, [
        '[data-testid="portfolio-company-name"]',
        '.portfolio-row .company-name',
      ]);
      if (portfolio.length) profile.raw_payload = { portfolio_top: portfolio.slice(0, 30) };

      profile.raw_text = await pageText(page);

      const title = (await meta(page, "og:title")) || (await page.title());
      const mc = matchScore({
        expectedName: firm.firm_name,
        foundName: title?.replace(/\s*-\s*Tracxn.*$/, "") ?? null,
        expectedDomain: extractDomain(firm.website_url ?? null),
        foundDomain: extractDomain(profile.website_url ?? null),
      });

      const now = new Date();
      for (const [field, value] of Object.entries(profile)) {
        if (value == null || field === "raw_text" || field === "raw_payload") continue;
        provenance.push({
          field_name: field, source_name: "tracxn", source_url: url, value,
          confidence: baseConfidence("tracxn") * Math.max(0.7, mc), extracted_at: now,
        });
      }

      return { source: "tracxn", source_url: url, discovered: !firm.known_urls?.tracxn, profile, provenance, match_confidence: mc };
    } catch (e) {
      ctx.logger.warn("tracxn.extract.failed", { firm: firm.firm_name, err: (e as Error).message });
      return null;
    } finally {
      await ctx.releasePage("tracxn", page);
    }
  },
};

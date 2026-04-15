/**
 * adapters/cbinsights.ts
 * =======================
 * CB Insights investor profile adapter.
 *
 * Requires authenticated session (storageState at data/sessions/cbinsights.json).
 * Uses the in-page search endpoint to match firm → investor profile ID,
 * then reads the overview tab for description, HQ, founded year, socials, tags.
 *
 * TODO[selector]: CB Insights occasionally rotates anti-scrape class names.
 * Prefer data-test hooks; fall back to ARIA labels; last resort: headings.
 */

import type { SourceAdapter, FirmSeed, AdapterContext, ExtractedProfile, ProvenanceEntry } from "../types";
import { firstText, meta, pageText, allText } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { parseGeo } from "../parsers/geo-parser";
import { parseCheckSize } from "../parsers/check-size-parser";
import { matchScore, baseConfidence, normalize } from "../scoring";

const CBI = "https://app.cbinsights.com";

export const cbinsightsAdapter: SourceAdapter = {
  name: "cbinsights",
  requires_auth: true,
  base_confidence: baseConfidence("cbinsights"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.cbinsights) return firm.known_urls.cbinsights;

    const page = await ctx.getPage("cbinsights");
    try {
      await ctx.throttle("cbinsights");

      // In-page live search (requires auth cookies from storageState)
      const results = await page.evaluate(async (name) => {
        try {
          const r = await fetch(`/api/search/live?q=${encodeURIComponent(name)}&type=investor&limit=5`, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          return r.ok ? await r.json() : null;
        } catch { return null; }
      }, firm.firm_name);

      const hits = (results?.results ?? results?.hits ?? []) as Array<Record<string, unknown>>;
      if (!hits.length) return null;

      const expectedDomain = extractDomain(firm.website_url ?? firm.domain ?? null);
      let best: { id: string; score: number } | null = null;
      for (const h of hits.slice(0, 5)) {
        const foundDomain = (h.domain ?? h.website) as string | undefined;
        const score = matchScore({
          expectedName: firm.firm_name,
          foundName: (h.name ?? h.displayName) as string | undefined,
          expectedDomain,
          foundDomain,
        });
        const id = (h.id ?? h.entityId ?? h.orgId) as string | undefined;
        if (id && (!best || score > best.score)) best = { id, score };
      }
      if (!best || best.score < 0.55) return null;
      return `${CBI}/profiles/i/${best.id}`;
    } catch { return null; }
    finally { await ctx.releasePage("cbinsights", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("cbinsights");
    const profile: ExtractedProfile = { cb_insights_url: url };
    const provenance: ProvenanceEntry[] = [];

    try {
      await ctx.throttle("cbinsights");
      const ok = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true).catch(() => false);
      if (!ok) return null;

      // Overview tab description
      profile.description = await firstText(page, [
        '[data-test="description"]',
        '.about-description',
        '.firm-description',
        '[data-testid="about"] p',
        '#overview p',
      ]) ?? undefined;

      // Elevator pitch (shorter blurb)
      profile.elevator_pitch = await firstText(page, ['[data-test="tagline"]', '.tagline', '[data-testid="elevator-pitch"]']) ?? undefined;

      // Website
      const siteHref = await page.locator('a[data-test="website"], a[data-testid="website"], a.website-link')
        .first().getAttribute("href").catch(() => null);
      if (siteHref) profile.website_url = normalizeUrl(siteHref) ?? undefined;

      // LinkedIn / X
      const lnkHref = await page.locator('a[href*="linkedin.com/company/"], a[href*="linkedin.com/in/"]')
        .first().getAttribute("href").catch(() => null);
      if (lnkHref) profile.linkedin_url = lnkHref;

      const xHref = await page.locator('a[href*="twitter.com/"], a[href*="x.com/"]')
        .first().getAttribute("href").catch(() => null);
      if (xHref) profile.x_url = xHref;

      // HQ
      const loc = await firstText(page, [
        '[data-test="headquarters"]',
        '[data-testid="headquarters"]',
        'dt:has-text("Headquarters") + dd',
        '.hq-location',
      ]);
      if (loc) {
        const g = parseGeo(loc);
        if (g) {
          profile.hq_city = g.city;
          profile.hq_state = g.state;
          profile.hq_country = g.country;
          profile.hq_region = g.region;
        }
      }

      // Founded year
      const foundedText = await firstText(page, [
        '[data-test="founded"]',
        'dt:has-text("Founded") + dd',
        'dt:has-text("Founded Year") + dd',
      ]);
      if (foundedText) {
        const yr = foundedText.match(/\d{4}/)?.[0];
        if (yr) profile.founded_year = parseInt(yr, 10);
      }

      // AUM / total funds
      const aumText = await firstText(page, [
        '[data-test="aum"]',
        '[data-test="totalFunds"]',
        'dt:has-text("AUM") + dd',
        'dt:has-text("Total Funds") + dd',
      ]);
      if (aumText) profile.aum = aumText;

      // Investor type (passes to structure classifier)
      const investorType = await firstText(page, [
        '[data-test="investor-type"]',
        'dt:has-text("Investor Type") + dd',
      ]);
      profile.raw_payload = { ...(profile.raw_payload ?? {}), investor_type: investorType ?? undefined };

      // Check size range
      const checkText = await firstText(page, [
        '[data-test="check-size"]',
        'dt:has-text("Check Size") + dd',
        'dt:has-text("Typical Investment") + dd',
      ]);
      if (checkText) {
        const cs = parseCheckSize(checkText);
        if (cs.min) profile.min_check_size = cs.min;
        if (cs.max) profile.max_check_size = cs.max;
      }

      // Sectors / industries / tags (free-text)
      const sectors = await allText(page, [
        '[data-test="industries"] chip, [data-test="industries"] span',
        '[data-test="sectors"] chip, [data-test="sectors"] span',
        '.chip-pill',
      ]);
      if (sectors.length) profile.sectors = sectors.slice(0, 12);

      // Stage tags
      const stages = await allText(page, [
        '[data-test="stages"] chip, [data-test="stages"] span',
        'dt:has-text("Stage") + dd span',
      ]);
      if (stages.length) profile.stages = stages.slice(0, 8);

      // Portfolio company names (overview shows top companies)
      const portfolio = await allText(page, [
        '[data-test="portfolio-company-name"]',
        '.portfolio-company-card .company-name',
        '[data-testid="portfolio-item"] .name',
      ]);
      if (portfolio.length) profile.raw_payload = { ...profile.raw_payload, portfolio_top: portfolio.slice(0, 20) };

      profile.raw_text = await pageText(page);

      // Match confidence
      const title = (await meta(page, "og:title")) || (await page.title());
      const mc = matchScore({
        expectedName: firm.firm_name,
        foundName: title?.replace(/\s*-\s*CB Insights.*$/, "") ?? null,
        expectedDomain: extractDomain(firm.website_url ?? null),
        foundDomain: extractDomain(profile.website_url ?? null),
      });

      // Provenance
      const now = new Date();
      for (const [field, value] of Object.entries(profile)) {
        if (value == null || field === "raw_text" || field === "raw_payload") continue;
        provenance.push({
          field_name: field,
          source_name: "cbinsights",
          source_url: url,
          value,
          confidence: baseConfidence("cbinsights") * Math.max(0.7, mc),
          extracted_at: now,
        });
      }

      return { source: "cbinsights", source_url: url, discovered: !firm.known_urls?.cbinsights, profile, provenance, match_confidence: mc };
    } catch (e) {
      ctx.logger.warn("cbinsights.extract.failed", { firm: firm.firm_name, err: (e as Error).message });
      return null;
    } finally {
      await ctx.releasePage("cbinsights", page);
    }
  },
};

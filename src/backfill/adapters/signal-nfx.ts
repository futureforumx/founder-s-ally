/**
 * adapters/signal-nfx.ts
 * =======================
 * Signal NFX firm profile adapter. Uses saved storageState for auth.
 *
 * URL pattern: https://signal.nfx.com/investors/{slug}
 *
 * TODO[selector]: NFX ships new dashboard versions periodically. Prefer
 * text-based locators + "Sweet Spot" / "Investment Range" labels.
 */

import type { SourceAdapter, FirmSeed, AdapterContext, ExtractedProfile, ProvenanceEntry } from "../types";
import { firstText, allText, pageText, meta } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { parseCheckSize } from "../parsers/check-size-parser";
import { parseGeo } from "../parsers/geo-parser";
import { matchScore, baseConfidence } from "../scoring";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const signalNfxAdapter: SourceAdapter = {
  name: "signal_nfx",
  requires_auth: true,
  base_confidence: baseConfidence("signal_nfx"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.signal_nfx) return firm.known_urls.signal_nfx;

    const page = await ctx.getPage("signal_nfx");
    try {
      await ctx.throttle("signal_nfx");

      // Try direct slug first — very reliable when slug matches firm name
      const slug = slugify(firm.firm_name);
      const direct = `https://signal.nfx.com/investors/${slug}`;
      const ok = await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 15000 })
        .then(() => !page.url().includes("/search") && !page.url().includes("/login"))
        .catch(() => false);
      if (ok) return direct;

      // Fallback — use site search
      const searchUrl = `https://signal.nfx.com/search?q=${encodeURIComponent(firm.firm_name)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      const first = await page.locator('a[href*="/investors/"]').first().getAttribute("href").catch(() => null);
      if (first) return normalizeUrl(new URL(first, "https://signal.nfx.com").toString());
      return null;
    } catch { return null; }
    finally { await ctx.releasePage("signal_nfx", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("signal_nfx");
    const profile: ExtractedProfile = { signal_nfx_url: url };
    const provenance: ProvenanceEntry[] = [];

    try {
      await ctx.throttle("signal_nfx");
      const ok = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true).catch(() => false);
      if (!ok) return null;

      profile.description = await firstText(page, [
        '[data-testid="thesis"]',
        '.thesis-text',
        '.about-text',
        'section:has-text("About") p',
      ]) ?? undefined;

      // Website
      const siteHref = await page.locator('a[data-testid="firm-website"], a.firm-website, a:has-text("Website")').first().getAttribute("href").catch(() => null);
      if (siteHref) profile.website_url = normalizeUrl(siteHref) ?? undefined;

      // Sectors
      const sectors = await allText(page, [
        '[data-testid="sector-tag"]',
        '.focus-sector',
        'section:has-text("Focus Areas") li',
      ]);
      if (sectors.length) profile.sectors = sectors.slice(0, 15);

      // Stages
      const stages = await allText(page, [
        '[data-testid="stage-tag"]',
        '.investment-stage',
        'section:has-text("Stages") li',
      ]);
      if (stages.length) profile.stages = stages.slice(0, 8);

      // Geographies
      const geos = await allText(page, [
        '[data-testid="geo-tag"]',
        '.geo-tag',
        'section:has-text("Geographies") li',
        'section:has-text("Geography") li',
      ]);
      if (geos.length) profile.geographies = geos.slice(0, 10);

      // Check sizes
      const checkText = await firstText(page, [
        '[data-testid="check-size"]',
        'span:has-text("Investment Range") + span',
        'span:has-text("Sweet Spot") + span',
        '.investment-range',
      ]);
      if (checkText) {
        const cs = parseCheckSize(checkText);
        if (cs.min) profile.min_check_size = cs.min;
        if (cs.max) profile.max_check_size = cs.max;
      }

      // Fund size → AUM
      const aumText = await firstText(page, [
        '[data-testid="fund-size"]',
        'span:has-text("Fund Size") + span',
        'span:has-text("Current Fund Size") + span',
      ]);
      if (aumText) profile.aum = aumText;

      // HQ
      const locText = await firstText(page, [
        '[data-testid="location"]',
        '.firm-location',
        'span:has-text("Based in") + span',
      ]);
      if (locText) {
        const g = parseGeo(locText);
        if (g) {
          profile.hq_city = g.city;
          profile.hq_state = g.state;
          profile.hq_country = g.country;
          profile.hq_region = g.region;
        }
      }

      // Past investments → raw_payload
      const portfolio = await allText(page, ['[data-testid="investment-company"]', '.past-investment-name']);
      if (portfolio.length) profile.raw_payload = { ...(profile.raw_payload ?? {}), past_investments: portfolio.slice(0, 50) };

      profile.raw_text = await pageText(page);

      const title = (await meta(page, "og:title")) || (await page.title());
      const mc = matchScore({
        expectedName: firm.firm_name,
        foundName: title?.replace(/\s*\|\s*Signal.*/i, "") ?? null,
        expectedDomain: extractDomain(firm.website_url ?? null),
        foundDomain: extractDomain(profile.website_url ?? null),
      });

      const now = new Date();
      for (const [field, value] of Object.entries(profile)) {
        if (value == null || field === "raw_text" || field === "raw_payload") continue;
        provenance.push({
          field_name: field, source_name: "signal_nfx", source_url: url, value,
          confidence: baseConfidence("signal_nfx") * Math.max(0.7, mc), extracted_at: now,
        });
      }

      return { source: "signal_nfx", source_url: url, discovered: !firm.known_urls?.signal_nfx, profile, provenance, match_confidence: mc };
    } catch (e) {
      ctx.logger.warn("signal_nfx.extract.failed", { firm: firm.firm_name, err: (e as Error).message });
      return null;
    } finally {
      await ctx.releasePage("signal_nfx", page);
    }
  },
};

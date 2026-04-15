/**
 * adapters/openvc.ts
 * ===================
 * OpenVC public firm directory. Excellent source for cold-outreach fields:
 * open submission policy, stage focus, geographic focus, check size.
 *
 * URL pattern: https://openvc.app/investors/{slug}  (public, no auth)
 */

import type { SourceAdapter, FirmSeed, AdapterContext, ExtractedProfile, ProvenanceEntry } from "../types";
import { firstText, allText, pageText, meta } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { parseCheckSize } from "../parsers/check-size-parser";
import { parseGeo, parseGeoFocus } from "../parsers/geo-parser";
import { matchScore, baseConfidence } from "../scoring";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const openvcAdapter: SourceAdapter = {
  name: "openvc",
  requires_auth: false,
  base_confidence: baseConfidence("openvc"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.openvc) return firm.known_urls.openvc;
    if (firm.website_url && classifyUrlHost(firm.website_url) === "openvc") return firm.website_url;

    const page = await ctx.getPage("openvc");
    try {
      await ctx.throttle("openvc");
      const slug = slugify(firm.firm_name);
      const direct = `https://openvc.app/investors/${slug}`;
      const ok = await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 15000 })
        .then(() => !page.url().includes("/404") && !page.url().includes("/not-found"))
        .catch(() => false);
      if (ok) return direct;

      // Search
      const search = `https://openvc.app/search?q=${encodeURIComponent(firm.firm_name)}`;
      await page.goto(search, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      const first = await page.locator('a[href*="/investors/"]').first().getAttribute("href").catch(() => null);
      if (first) return new URL(first, "https://openvc.app").toString();
      return null;
    } catch { return null; }
    finally { await ctx.releasePage("openvc", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("openvc");
    const profile: ExtractedProfile = { openvc_url: url };
    const provenance: ProvenanceEntry[] = [];

    try {
      await ctx.throttle("openvc");
      const ok = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).then(() => true).catch(() => false);
      if (!ok) return null;

      profile.description = await firstText(page, [
        '[data-field="description"]',
        '.investor-description',
        'section:has-text("About") p',
        'meta[name="description"]', // fallback
      ]) ?? (await meta(page, "og:description")) ?? undefined;

      // Stage focus
      const stages = await allText(page, [
        '[data-field="stages"] li',
        '[data-field="stage"] span',
        '.stage-tag',
        'dt:has-text("Stage") + dd li',
      ]);
      if (stages.length) profile.stages = stages.slice(0, 8);

      // Geo focus
      const geos = await allText(page, [
        '[data-field="geographies"] li',
        '[data-field="geo"] span',
        '.geo-tag',
        'dt:has-text("Geography") + dd li',
      ]);
      if (geos.length) {
        profile.geographies = geos.slice(0, 10);
        profile.geo_focus = parseGeoFocus(geos);
      }

      // Check size
      const checkText = await firstText(page, [
        '[data-field="check_size"]',
        'dt:has-text("Check Size") + dd',
        'dt:has-text("Ticket Size") + dd',
      ]);
      if (checkText) {
        const cs = parseCheckSize(checkText);
        if (cs.min) profile.min_check_size = cs.min;
        if (cs.max) profile.max_check_size = cs.max;
      }

      // Lead/follow
      const leadText = await firstText(page, ['dt:has-text("Lead") + dd', '[data-field="lead"]']);
      if (leadText) {
        const lt = leadText.toLowerCase();
        if (lt.includes("co-lead") || lt.includes("co lead")) profile.lead_or_follow = "co_lead";
        else if (lt.includes("lead"))                          profile.lead_or_follow = "lead";
        else if (lt.includes("follow"))                        profile.lead_or_follow = "follow_on";
        else                                                    profile.lead_or_follow = "flexible";
      }

      // Website
      const siteHref = await page.locator('a[data-field="website"], a[rel="noopener"]:has-text("Website")').first().getAttribute("href").catch(() => null);
      if (siteHref) profile.website_url = normalizeUrl(siteHref) ?? undefined;

      // Sectors
      const sectors = await allText(page, [
        '[data-field="sectors"] li',
        'dt:has-text("Sectors") + dd li',
        '.sector-chip',
      ]);
      if (sectors.length) profile.sectors = sectors.slice(0, 15);

      // Email (OpenVC often shows submission email)
      const pageTxt = await pageText(page);
      const emails = pageTxt.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
      if (emails) profile.email = emails.find(e => !/noreply|sentry|example/.test(e));

      profile.raw_text = pageTxt;

      const title = (await meta(page, "og:title")) || (await page.title());
      const mc = matchScore({
        expectedName: firm.firm_name,
        foundName: title?.replace(/\s*-\s*OpenVC.*$/, "") ?? null,
        expectedDomain: extractDomain(firm.website_url ?? null),
        foundDomain: extractDomain(profile.website_url ?? null),
      });

      const now = new Date();
      for (const [field, value] of Object.entries(profile)) {
        if (value == null || field === "raw_text" || field === "raw_payload") continue;
        provenance.push({
          field_name: field, source_name: "openvc", source_url: url, value,
          confidence: baseConfidence("openvc") * Math.max(0.7, mc), extracted_at: now,
        });
      }

      return { source: "openvc", source_url: url, discovered: !firm.known_urls?.openvc, profile, provenance, match_confidence: mc };
    } catch (e) {
      ctx.logger.warn("openvc.extract.failed", { firm: firm.firm_name, err: (e as Error).message });
      return null;
    } finally {
      await ctx.releasePage("openvc", page);
    }
  },
};

function classifyUrlHost(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; } catch { return null; }
}

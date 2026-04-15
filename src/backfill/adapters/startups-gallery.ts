/**
 * adapters/startups-gallery.ts
 * =============================
 * Startups.gallery firm directory — curated VC list with filter tags.
 * TODO[selector]: Selector set needs tuning after first live run.
 */
import type { SourceAdapter } from "../types";
import { firstText, allText, pageText, meta } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { matchScore, baseConfidence } from "../scoring";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const startupsGalleryAdapter: SourceAdapter = {
  name: "startups_gallery",
  requires_auth: false,
  base_confidence: baseConfidence("startups_gallery"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.startups_gallery) return firm.known_urls.startups_gallery;
    const page = await ctx.getPage("startups_gallery");
    try {
      await ctx.throttle("startups_gallery");
      const direct = `https://startups.gallery/vcs/${slugify(firm.firm_name)}`;
      const ok = await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 15000 })
        .then(() => !page.url().includes("404")).catch(() => false);
      if (ok) return direct;
      await page.goto(`https://startups.gallery/vcs?q=${encodeURIComponent(firm.firm_name)}`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      const first = await page.locator('a[href*="/vcs/"]').first().getAttribute("href").catch(() => null);
      return first ? new URL(first, "https://startups.gallery").toString() : null;
    } finally { await ctx.releasePage("startups_gallery", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("startups_gallery");
    try {
      await ctx.throttle("startups_gallery");
      if (!(await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).then(() => true).catch(() => false))) return null;

      const profile: any = { startups_gallery_url: url };
      profile.description = await firstText(page, ['.vc-description', 'section:has-text("About") p']) ?? (await meta(page, "og:description")) ?? undefined;
      const siteHref = await page.locator('a:has-text("Website")').first().getAttribute("href").catch(() => null);
      if (siteHref) profile.website_url = normalizeUrl(siteHref) ?? undefined;
      const stages = await allText(page, ['.stage-tag', '[data-field="stage"]']);
      if (stages.length) profile.stages = stages.slice(0, 8);
      const sectors = await allText(page, ['.sector-tag', '[data-field="sector"]']);
      if (sectors.length) profile.sectors = sectors.slice(0, 15);
      profile.raw_text = await pageText(page);

      const mc = matchScore({ expectedName: firm.firm_name, foundName: await page.title(), expectedDomain: extractDomain(firm.website_url ?? null), foundDomain: extractDomain(profile.website_url ?? null) });
      const now = new Date();
      const provenance = Object.entries(profile)
        .filter(([k, v]) => v != null && k !== "raw_text" && k !== "raw_payload")
        .map(([field, value]) => ({ field_name: field, source_name: "startups_gallery" as const, source_url: url, value, confidence: baseConfidence("startups_gallery") * Math.max(0.7, mc), extracted_at: now }));

      return { source: "startups_gallery", source_url: url, discovered: !firm.known_urls?.startups_gallery, profile, provenance, match_confidence: mc };
    } catch (e) { ctx.logger.warn("startups_gallery.extract.failed", { firm: firm.firm_name, err: (e as Error).message }); return null; }
    finally { await ctx.releasePage("startups_gallery", page); }
  },
};

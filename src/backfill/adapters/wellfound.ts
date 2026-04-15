/**
 * adapters/wellfound.ts
 * ======================
 * Wellfound (ex-AngelList Talent) firm/VC pages. Heavy bot protection —
 * almost always needs a saved authenticated session.
 * TODO[selector]: Wellfound ships new layouts frequently; tune selectors.
 */
import type { SourceAdapter } from "../types";
import { firstText, pageText, meta, allText } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { matchScore, baseConfidence } from "../scoring";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const wellfoundAdapter: SourceAdapter = {
  name: "wellfound",
  requires_auth: true,
  base_confidence: baseConfidence("wellfound"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.wellfound) return firm.known_urls.wellfound;
    const page = await ctx.getPage("wellfound");
    try {
      await ctx.throttle("wellfound");
      const direct = `https://wellfound.com/company/${slugify(firm.firm_name)}`;
      const ok = await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 15000 }).then(() => !page.url().includes("404")).catch(() => false);
      return ok ? direct : null;
    } finally { await ctx.releasePage("wellfound", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("wellfound");
    try {
      await ctx.throttle("wellfound");
      if (!(await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true).catch(() => false))) return null;
      const profile: any = { wellfound_url: url };
      profile.description = await firstText(page, ['[data-test="description"]', '.company-description']) ?? (await meta(page, "og:description")) ?? undefined;
      const siteHref = await page.locator('a[data-test="website"], a:has-text("Visit Website")').first().getAttribute("href").catch(() => null);
      if (siteHref) profile.website_url = normalizeUrl(siteHref) ?? undefined;
      const sectors = await allText(page, ['[data-test="market"]', '.market-tag']);
      if (sectors.length) profile.sectors = sectors.slice(0, 12);
      profile.raw_text = await pageText(page);
      const mc = matchScore({ expectedName: firm.firm_name, foundName: await page.title(), expectedDomain: extractDomain(firm.website_url ?? null), foundDomain: extractDomain(profile.website_url ?? null) });
      const now = new Date();
      const provenance = Object.entries(profile)
        .filter(([k, v]) => v != null && k !== "raw_text" && k !== "raw_payload")
        .map(([field, value]) => ({ field_name: field, source_name: "wellfound" as const, source_url: url, value, confidence: baseConfidence("wellfound") * Math.max(0.7, mc), extracted_at: now }));
      return { source: "wellfound", source_url: url, discovered: !firm.known_urls?.wellfound, profile, provenance, match_confidence: mc };
    } catch (e) { ctx.logger.warn("wellfound.extract.failed", { firm: firm.firm_name, err: (e as Error).message }); return null; }
    finally { await ctx.releasePage("wellfound", page); }
  },
};

/**
 * adapters/angellist.ts
 * ======================
 * AngelList investor pages. Similar to Wellfound — heavy bot protection,
 * needs an authenticated session.
 * TODO[selector]: Confirm current angel.co path structure.
 */
import type { SourceAdapter } from "../types";
import { firstText, pageText, meta, allText } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { matchScore, baseConfidence } from "../scoring";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const angellistAdapter: SourceAdapter = {
  name: "angellist",
  requires_auth: true,
  base_confidence: baseConfidence("angellist"),

  async discoverFirmUrl(firm, ctx) {
    if (firm.known_urls?.angellist) return firm.known_urls.angellist;
    const page = await ctx.getPage("angellist");
    try {
      await ctx.throttle("angellist");
      const direct = `https://angel.co/company/${slugify(firm.firm_name)}`;
      const ok = await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 15000 }).then(() => !page.url().includes("404")).catch(() => false);
      return ok ? direct : null;
    } finally { await ctx.releasePage("angellist", page); }
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("angellist");
    try {
      await ctx.throttle("angellist");
      if (!(await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).then(() => true).catch(() => false))) return null;
      const profile: any = { angellist_url: url };
      profile.description = await firstText(page, ['.about', '.company-description']) ?? (await meta(page, "og:description")) ?? undefined;
      const siteHref = await page.locator('a:has-text("Website")').first().getAttribute("href").catch(() => null);
      if (siteHref) profile.website_url = normalizeUrl(siteHref) ?? undefined;
      const sectors = await allText(page, ['.industry-tag', '.market']);
      if (sectors.length) profile.sectors = sectors.slice(0, 10);
      profile.raw_text = await pageText(page);
      const mc = matchScore({ expectedName: firm.firm_name, foundName: await page.title(), expectedDomain: extractDomain(firm.website_url ?? null), foundDomain: extractDomain(profile.website_url ?? null) });
      const now = new Date();
      const provenance = Object.entries(profile)
        .filter(([k, v]) => v != null && k !== "raw_text" && k !== "raw_payload")
        .map(([field, value]) => ({ field_name: field, source_name: "angellist" as const, source_url: url, value, confidence: baseConfidence("angellist") * Math.max(0.7, mc), extracted_at: now }));
      return { source: "angellist", source_url: url, discovered: !firm.known_urls?.angellist, profile, provenance, match_confidence: mc };
    } catch (e) { ctx.logger.warn("angellist.extract.failed", { firm: firm.firm_name, err: (e as Error).message }); return null; }
    finally { await ctx.releasePage("angellist", page); }
  },
};

/**
 * adapters/substack.ts
 * =====================
 * Substack publication adapter — tagline + blog_url. Public.
 */
import type { SourceAdapter } from "../types";
import { firstText, pageText, meta } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { matchScore, baseConfidence } from "../scoring";

export const substackAdapter: SourceAdapter = {
  name: "substack",
  requires_auth: false,
  base_confidence: baseConfidence("substack"),

  async discoverFirmUrl(firm) {
    if (firm.known_urls?.substack) return firm.known_urls.substack;
    return null;
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("substack");
    try {
      await ctx.throttle("substack");
      if (!(await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).then(() => true).catch(() => false))) return null;
      const profile: any = { substack_url: url, blog_url: url };
      profile.elevator_pitch = (await meta(page, "og:description")) ?? (await firstText(page, ['.pub-description', '.subtitle', '.bio'])) ?? undefined;
      profile.raw_text = await pageText(page);
      const mc = matchScore({ expectedName: firm.firm_name, foundName: await page.title(), expectedDomain: extractDomain(firm.website_url ?? null), foundDomain: extractDomain(url) });
      const now = new Date();
      const provenance = Object.entries(profile)
        .filter(([k, v]) => v != null && k !== "raw_text" && k !== "raw_payload")
        .map(([field, value]) => ({ field_name: field, source_name: "substack" as const, source_url: url, value, confidence: baseConfidence("substack") * Math.max(0.7, mc), extracted_at: now }));
      return { source: "substack", source_url: url, discovered: !firm.known_urls?.substack, profile, provenance, match_confidence: mc };
    } catch (e) { ctx.logger.warn("substack.extract.failed", { firm: firm.firm_name, err: (e as Error).message }); return null; }
    finally { await ctx.releasePage("substack", page); }
  },
};

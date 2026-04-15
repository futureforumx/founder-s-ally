/**
 * adapters/medium.ts
 * ===================
 * Medium publication/profile adapter — extracts tagline/description + blog
 * link. No auth required. Used mostly for elevator_pitch when firm voice is
 * on Medium.
 */
import type { SourceAdapter } from "../types";
import { firstText, pageText, meta, linksMatching } from "../browser/selectors";
import { extractDomain, normalizeUrl } from "../parsers/url-parser";
import { matchScore, baseConfidence } from "../scoring";

export const mediumAdapter: SourceAdapter = {
  name: "medium",
  requires_auth: false,
  base_confidence: baseConfidence("medium"),

  async discoverFirmUrl(firm) {
    if (firm.known_urls?.medium) return firm.known_urls.medium;
    if (firm.website_url) {
      // Medium is usually linked from the firm website; handled by website adapter.
      return null;
    }
    return null;
  },

  async extractFirmProfile(url, firm, ctx) {
    const page = await ctx.getPage("medium");
    try {
      await ctx.throttle("medium");
      if (!(await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).then(() => true).catch(() => false))) return null;
      const profile: any = { medium_url: url, blog_url: url };
      profile.elevator_pitch = (await meta(page, "og:description")) ?? (await firstText(page, ['.pw-publication-description', '.bio'])) ?? undefined;
      profile.raw_text = await pageText(page);
      const mc = matchScore({ expectedName: firm.firm_name, foundName: await page.title(), expectedDomain: extractDomain(firm.website_url ?? null), foundDomain: extractDomain(url) });
      const now = new Date();
      const provenance = Object.entries(profile)
        .filter(([k, v]) => v != null && k !== "raw_text" && k !== "raw_payload")
        .map(([field, value]) => ({ field_name: field, source_name: "medium" as const, source_url: url, value, confidence: baseConfidence("medium") * Math.max(0.7, mc), extracted_at: now }));
      return { source: "medium", source_url: url, discovered: !firm.known_urls?.medium, profile, provenance, match_confidence: mc };
    } catch (e) { ctx.logger.warn("medium.extract.failed", { firm: firm.firm_name, err: (e as Error).message }); return null; }
    finally { await ctx.releasePage("medium", page); }
  },
};

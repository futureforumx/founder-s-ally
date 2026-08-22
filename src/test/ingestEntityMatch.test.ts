import { describe, expect, it } from "vitest";
import {
  fundingSourceQualityTier,
  fundAnnouncementQualityTier,
  incomingOutranksExisting,
  mergeSupplementaryUrls,
  normalizeEntityNameForMatch,
  pickPreferredField,
  scoreDealIdentityMatch,
  scoreFundIdentityMatch,
  shouldSkipLlmForMatch,
} from "@/lib/ingestEntityMatch";
import { scoreIncomingAgainstDeal } from "../../scripts/funding-ingest/dedupe";
import { computeCandidateClusterKey } from "@/lib/vc-funds/candidates";
import type { ExtractedFundAnnouncement } from "@/lib/vc-funds/types";

describe("source quality tiers", () => {
  it("ranks startups.gallery above TechCrunch/AlleyWatch and GeekWire/PR", () => {
    expect(fundingSourceQualityTier("STARTUPS_GALLERY_NEWS")).toBe(1);
    expect(fundingSourceQualityTier("TECHCRUNCH_VENTURE")).toBe(2);
    expect(fundingSourceQualityTier("ALLEYWATCH_FUNDING")).toBe(2);
    expect(fundingSourceQualityTier("GEEKWIRE_FUNDINGS")).toBe(3);
    expect(incomingOutranksExisting(1, 2)).toBe(true);
    expect(incomingOutranksExisting(3, 1)).toBe(false);
  });

  it("treats official and structured fund sources as tier 1 and PR/GeekWire as tier 3", () => {
    expect(fundAnnouncementQualityTier({ sourceType: "official_website" })).toBe(1);
    expect(fundAnnouncementQualityTier({ sourceType: "structured_provider" })).toBe(1);
    expect(
      fundAnnouncementQualityTier({
        sourceType: "news_article",
        metadata: { source_feed_key: "TECHCRUNCH_VENTURE" },
      }),
    ).toBe(2);
    expect(
      fundAnnouncementQualityTier({
        sourceType: "press_release",
        sourcePublisher: "PR Newswire",
        metadata: { source_feed_key: "PRNEWSWIRE_VENTURE_CAPITAL" },
      }),
    ).toBe(3);
  });

  it("skips LLM when a better or equal source already extracted the entity", () => {
    expect(shouldSkipLlmForMatch(1, 2)).toBe(true);
    expect(shouldSkipLlmForMatch(2, 2)).toBe(true);
    expect(shouldSkipLlmForMatch(3, 1)).toBe(false);
  });
});

describe("normalized deal matching", () => {
  it("collapses Inc/LLC suffixes and treats gallery + TechCrunch as one deal", () => {
    expect(normalizeEntityNameForMatch("Astromech Inc.")).toBe("astromech");
    expect(normalizeEntityNameForMatch("Astromech LLC")).toBe("astromech");

    const gallery = {
      companyName: "Astromech Inc.",
      roundTypeNormalized: "Seed",
      amountMinorUnits: 2_000_000_000,
      announcedDate: "2026-08-21",
    };
    const techcrunch = {
      companyName: "Astromech",
      roundTypeNormalized: "Seed",
      amountMinorUnits: 2_000_000_000,
      announcedDate: "2026-08-20",
    };
    const match = scoreDealIdentityMatch(gallery, techcrunch);
    expect(match.isMatch).toBe(true);
    expect(match.reasons).toContain("normalized_name");
    expect(match.reasons).toContain("amount_similar");
  });

  it("does not collapse different rounds for the same company", () => {
    const seed = scoreIncomingAgainstDeal(
      {
        company_name: "Astromech",
        round_type_normalized: "Seed",
        amount_minor_units: 2_000_000_000,
        announced_date: "2026-08-21",
      },
      {
        company_name: "Astromech",
        round_type_normalized: "Series A",
        amount_minor_units: 2_000_000_000,
        announced_date: "2026-08-21",
      },
    );
    expect(seed.isMatch).toBe(false);
  });

  it("prefers Tier 1 structured fields and appends lower-tier press URLs", () => {
    expect(pickPreferredField("$18M", "$20M", true)).toBe("$20M");
    expect(pickPreferredField("$20M", "$18M", false)).toBe("$20M");
    expect(pickPreferredField(null, "https://techcrunch.com/story", false)).toBe("https://techcrunch.com/story");
    expect(mergeSupplementaryUrls(["https://startups.gallery/news"], ["https://techcrunch.com/astromech"])).toEqual([
      "https://startups.gallery/news",
      "https://techcrunch.com/astromech",
    ]);
  });
});

describe("normalized fund matching", () => {
  it("clusters TechCrunch and AlleyWatch coverage of the same Fund II", () => {
    const techcrunch: ExtractedFundAnnouncement = {
      firmName: "Foo Capital LLC",
      fundName: "Foo Capital Fund II",
      fundLabel: "Foo Capital Fund II",
      fundSize: 200_000_000,
      announcedDate: "2026-08-01",
      sourceUrl: "https://techcrunch.com/foo-fund-ii",
      sourceType: "news_article",
      confidence: 0.7,
      metadata: { source_feed_key: "TECHCRUNCH_VENTURE" },
    };
    const alleywatch: ExtractedFundAnnouncement = {
      ...techcrunch,
      firmName: "Foo Capital",
      fundSize: 210_000_000,
      announcedDate: "2026-08-03",
      sourceUrl: "https://www.alleywatch.com/foo-fund-ii",
      metadata: { source_feed_key: "ALLEYWATCH_FUNDING" },
    };

    const match = scoreFundIdentityMatch(
      {
        firmName: techcrunch.firmName,
        fundLabel: techcrunch.fundName,
        sequenceNumber: 2,
        sizeUsd: techcrunch.fundSize,
        announcedDate: techcrunch.announcedDate,
      },
      {
        firmName: alleywatch.firmName,
        fundLabel: alleywatch.fundName,
        sequenceNumber: 2,
        sizeUsd: alleywatch.fundSize,
        announcedDate: alleywatch.announcedDate,
      },
    );
    expect(match.isMatch).toBe(true);
    expect(computeCandidateClusterKey(techcrunch, "firm-1")).toBe(computeCandidateClusterKey(alleywatch, "firm-1"));
  });
});

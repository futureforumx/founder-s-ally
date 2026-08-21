import { describe, expect, it } from "vitest";
import {
  isTrustedSourceFeed,
  isTrustedStructuredSource,
  scoreCandidateCapitalEvent,
  statusFromCandidateScore,
  toCandidateDraft,
} from "@/lib/vc-funds/candidates";
import type { ExtractedFundAnnouncement, FirmRecordLookup } from "@/lib/vc-funds/types";

const firm: FirmRecordLookup = {
  id: "firm-1",
  firm_name: "Foo Capital",
};

function announcement(overrides: Partial<ExtractedFundAnnouncement> = {}): ExtractedFundAnnouncement {
  return {
    firmName: "Foo Capital",
    fundName: "Foo Capital Fund I",
    fundLabel: "Foo Capital Fund I",
    fundSize: 150_000_000,
    announcedDate: "2026-08-01",
    sourceUrl: "https://docs.google.com/spreadsheets/d/example",
    sourceTitle: "Foo Capital Fund I from shared fund sheet",
    sourcePublisher: "Shai Goldman New Funds Sheet",
    sourceType: "structured_provider",
    rawText: "$150M · 8/1/2026",
    confidence: 0.72,
    metadata: {
      detection_mode: "structured_source_listing",
      source_feed_key: "SHAI_GOLDMAN_NEW_FUNDS_SHEET",
    },
    ...overrides,
  };
}

describe("trusted Fresh Capital sources", () => {
  it("treats the Shai Goldman sheet as a trusted structured source", () => {
    const item = announcement();
    expect(isTrustedStructuredSource(item)).toBe(true);
    expect(isTrustedSourceFeed(item)).toBe(false);
  });

  it("treats PR Newswire listings as a trusted source feed", () => {
    const item = announcement({
      sourcePublisher: "PR Newswire",
      sourceType: "news_article",
      metadata: {
        detection_mode: "source_feed_listing",
        source_feed_key: "PRNEWSWIRE_VENTURE_CAPITAL",
      },
    });
    expect(isTrustedSourceFeed(item)).toBe(true);
    expect(isTrustedStructuredSource(item)).toBe(false);
  });

  it("does not trust an unmatched blog post", () => {
    const item = announcement({
      sourcePublisher: "Random Blog",
      sourceType: "news_article",
      metadata: {
        detection_mode: "source_feed_listing",
        source_feed_key: "RANDOM_BLOG",
      },
    });
    expect(isTrustedSourceFeed(item)).toBe(false);
    expect(isTrustedStructuredSource(item)).toBe(false);
  });

  it("auto-verifies a matched Shai Goldman fund row so it can promote", () => {
    const item = announcement();
    const score = scoreCandidateCapitalEvent({
      item,
      firm,
      firmMatchConfidence: 0.95,
    });
    expect(score).toBeGreaterThanOrEqual(0.9);
    expect(statusFromCandidateScore(score)).toBe("verified");
    expect(toCandidateDraft({ item, firm, firmMatchConfidence: 0.95 }).status).toBe("verified");
  });

  it("still boosts Everything Startups leftovers as structured", () => {
    const item = announcement({
      sourcePublisher: "Everything Startups",
      metadata: {
        detection_mode: "structured_source_listing",
        source_feed_key: "EVERYTHING_STARTUPS_NEW_VC_FUNDS",
      },
    });
    expect(isTrustedStructuredSource(item)).toBe(true);
  });
});

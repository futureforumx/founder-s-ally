import { describe, expect, it } from "vitest";
import {
  averageSessionMinutes,
  classifyNavSection,
  estimateSessionMinutesFromActivity,
  FALLBACK_AVG_SESSION_BY_RANGE,
  FALLBACK_AVG_SESSION_MINUTES,
  FALLBACK_AVG_SESSION_SPARK,
  FALLBACK_INVESTOR_REVIEW_RATINGS,
  FALLBACK_INVESTOR_REVIEW_STATS,
  FALLBACK_NAV_SECTION_STATS,
  formatSessionMinutes,
  formatShare,
  resolveAvgSessionMinutes,
  resolveAvgSessionSpark,
  resolveTotalSearches,
  resolveInvestorReviewRatings,
  resolveInvestorReviewStats,
  resolveNavSectionStats,
  starFromReviewPayload,
  resolveTopInvestorPeople,
  resolveTopInvestorRecords,
  withShare,
} from "@/components/admin/engagementAnalytics";

describe("withShare", () => {
  it("ranks by volume and computes share of total", () => {
    expect(withShare([
      { name: "Market Intel", count: 10 },
      { name: "AI Intelligence & Search", count: 30 },
      { name: "Fresh Capital Tracker", count: 10 },
    ])).toEqual([
      { name: "AI Intelligence & Search", count: 30, percentage: 60 },
      { name: "Fresh Capital Tracker", count: 10, percentage: 20 },
      { name: "Market Intel", count: 10, percentage: 20 },
    ]);
  });
});

describe("resolveNavSectionStats", () => {
  it("uses mock fallback when the payload field is missing", () => {
    expect(resolveNavSectionStats(undefined)).toEqual(FALLBACK_NAV_SECTION_STATS);
  });

  it("keeps an empty live payload so the card can show an empty state", () => {
    expect(resolveNavSectionStats([])).toEqual([]);
  });
});

describe("resolveInvestorReviewStats", () => {
  it("uses mock fallback when the payload field is missing", () => {
    expect(resolveInvestorReviewStats(undefined)).toEqual(FALLBACK_INVESTOR_REVIEW_STATS);
  });

  it("keeps an empty live payload so the card can show an empty state", () => {
    expect(resolveInvestorReviewStats([])).toEqual([]);
  });
});

describe("resolveInvestorReviewRatings", () => {
  it("uses the ratings fallback when the payload field is missing", () => {
    expect(resolveInvestorReviewRatings(undefined)).toEqual(FALLBACK_INVESTOR_REVIEW_RATINGS);
  });

  it("keeps an empty live payload so the card can show an empty state", () => {
    expect(resolveInvestorReviewRatings([])).toEqual([]);
  });

  it("keeps a 5-to-1 star order", () => {
    expect(resolveInvestorReviewRatings([
      { name: "3 stars", count: 9, percentage: 0 },
      { name: "5 stars", count: 2, percentage: 0 },
    ]).map((row) => row.name)).toEqual(["5 stars", "4 stars", "3 stars", "2 stars", "1 star"]);
  });
});

describe("starFromReviewPayload", () => {
  it("prefers the work-with-them rating, then the 1-10 overall", () => {
    expect(starFromReviewPayload({
      star_ratings: { answers: { work_with_them_rating: "Great", overall_interaction: "2" } },
    })).toBe(5);
    expect(starFromReviewPayload({
      star_ratings: { answers: { overall_interaction: "7" } },
    })).toBe(4);
  });
});

describe("resolveTopInvestorRecords", () => {
  it("caps the leaderboard at five firms", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      id: `firm-${index}`,
      name: `Firm ${index}`,
      stage: "Seed",
      views: 10 - index,
      outboundClicks: 1,
    }));

    expect(resolveTopInvestorRecords(rows)).toHaveLength(5);
    expect(resolveTopInvestorRecords(rows)[0]?.name).toBe("Firm 0");
  });
});

describe("resolveTopInvestorPeople", () => {
  it("uses the people fallback when the payload field is missing", () => {
    expect(resolveTopInvestorPeople(undefined)[0]?.name).toBe("Roelof Botha");
  });

  it("keeps an empty live payload so the card can show an empty state", () => {
    expect(resolveTopInvestorPeople([])).toEqual([]);
  });
});

describe("classifyNavSection", () => {
  it("maps outbound click types onto the four nav sections", () => {
    expect(classifyNavSection("funding_article", "fresh_funds")).toBe("Fresh Capital Tracker");
    expect(classifyNavSection("firm_website", null)).toBe("Firm Records Directory");
    expect(classifyNavSection("search", "intelligence")).toBe("AI Intelligence & Search");
    expect(classifyNavSection("company_website", "market")).toBe("Market Intel");
    expect(classifyNavSection(null, null)).toBeNull();
  });
});

describe("formatShare", () => {
  it("keeps whole percents tight and tenths when needed", () => {
    expect(formatShare(20)).toBe("20%");
    expect(formatShare(26.666)).toBe("26.7%");
  });
});

describe("resolveAvgSessionMinutes", () => {
  it("uses the typed fallback when the KPI is missing", () => {
    expect(resolveAvgSessionMinutes(undefined)).toBe(FALLBACK_AVG_SESSION_MINUTES);
  });

  it("keeps a live zero so the card does not invent time", () => {
    expect(resolveAvgSessionMinutes(0)).toBe(0);
  });

  it("changes with the selected timeline when live session data is missing", () => {
    expect(resolveAvgSessionMinutes(undefined, { range: "1d" })).toBe(FALLBACK_AVG_SESSION_BY_RANGE["1d"]);
    expect(resolveAvgSessionMinutes(undefined, { range: "30d" })).toBe(FALLBACK_AVG_SESSION_BY_RANGE["30d"]);
    expect(resolveAvgSessionMinutes(undefined, {
      grain: "day",
      series: [
        { clicks: 4, interactions: 6 },
        { clicks: 1, interactions: 2 },
      ],
    })).not.toBe(resolveAvgSessionMinutes(undefined, {
      grain: "week",
      series: [
        { clicks: 4, interactions: 6 },
        { clicks: 1, interactions: 2 },
      ],
    }));
  });
});

describe("estimateSessionMinutesFromActivity", () => {
  it("returns zero when the window has no activity", () => {
    expect(estimateSessionMinutesFromActivity(0, 0, 7)).toBe(0);
  });

  it("moves with event density in the selected window", () => {
    expect(estimateSessionMinutesFromActivity(8, 12, 1)).toBeGreaterThan(
      estimateSessionMinutesFromActivity(8, 12, 30),
    );
  });
});

describe("resolveAvgSessionSpark", () => {
  it("uses the typed fallback when the spark is missing", () => {
    expect(resolveAvgSessionSpark(undefined)).toEqual(FALLBACK_AVG_SESSION_SPARK);
  });

  it("hides a short live spark", () => {
    expect(resolveAvgSessionSpark([])).toEqual([]);
  });
});

describe("resolveTotalSearches", () => {
  it("uses live counts when the KPI is present", () => {
    expect(resolveTotalSearches(11)).toBe(11);
    expect(resolveTotalSearches(0)).toBe(0);
  });

  it("stays at zero when search events have not been recorded yet", () => {
    expect(resolveTotalSearches(undefined)).toBe(0);
  });
});

describe("averageSessionMinutes", () => {
  it("splits visits when the gap is longer than 30 minutes", () => {
    expect(averageSessionMinutes([
      { userId: "a", at: "2026-10-01T10:00:00.000Z" },
      { userId: "a", at: "2026-10-01T10:08:00.000Z" },
      { userId: "a", at: "2026-10-01T12:00:00.000Z" },
    ])).toBe(6);
  });

  it("formats minutes to one decimal place", () => {
    expect(formatSessionMinutes(8.6)).toBe("8.6");
  });
});

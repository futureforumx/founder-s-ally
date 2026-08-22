import { describe, expect, it } from "vitest";
import { uniqueCompaniesByLatestRound } from "@/lib/trendingCompanies";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";

function round(partial: Partial<RecentFundingRound> & Pick<RecentFundingRound, "id" | "companyName">): RecentFundingRound {
  return {
    websiteUrl: "",
    sector: "AI",
    roundKind: "Seed",
    amountLabel: "$1M",
    announcedAt: "2026-08-01",
    leadInvestor: "Unknown",
    coInvestors: [],
    sourceUrl: "",
    ...partial,
  };
}

describe("uniqueCompaniesByLatestRound", () => {
  it("keeps the first (latest) row per company name", () => {
    const rows = [
      round({ id: "a-new", companyName: "Aligned Marketplace", amountLabel: "$16M" }),
      round({ id: "b", companyName: "Astromech", amountLabel: "$20M" }),
      round({ id: "a-old", companyName: "aligned marketplace", amountLabel: "$4M" }),
    ];
    const unique = uniqueCompaniesByLatestRound(rows);
    expect(unique.map((r) => r.id)).toEqual(["a-new", "b"]);
    expect(unique[0]?.amountLabel).toBe("$16M");
  });

  it("skips blank company names", () => {
    expect(uniqueCompaniesByLatestRound([round({ id: "x", companyName: "  " })])).toEqual([]);
  });
});

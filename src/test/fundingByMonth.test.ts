import { describe, expect, it } from "vitest";
import { fundingByMonth, monthOverMonthTotalChange } from "@/lib/fundingByMonth";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";

function round(
  partial: Partial<RecentFundingRound> & Pick<RecentFundingRound, "id" | "announcedAt" | "amountLabel" | "roundKind">,
): RecentFundingRound {
  return {
    companyName: "Co",
    websiteUrl: "",
    sector: "AI",
    leadInvestor: "Lead",
    coInvestors: [],
    sourceUrl: "",
    ...partial,
  };
}

describe("fundingByMonth", () => {
  it("sums disclosed USD into the last six UTC months by stage", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const rows = [
      round({ id: "s", announcedAt: "2026-08-10", amountLabel: "$10M", roundKind: "Seed" }),
      round({ id: "a", announcedAt: "2026-08-11", amountLabel: "$40M", roundKind: "Series A" }),
      round({ id: "g", announcedAt: "2026-07-02", amountLabel: "$100M", roundKind: "Series B" }),
      round({ id: "skip", announcedAt: "2026-01-01", amountLabel: "$5M", roundKind: "Seed" }),
      round({ id: "undisclosed", announcedAt: "2026-08-12", amountLabel: "—", roundKind: "Seed" }),
    ];
    const months = fundingByMonth(rows, now, 6);
    expect(months.map((m) => m.month)).toEqual(["March", "April", "May", "June", "July", "August"]);
    const august = months[5];
    expect(august?.seed).toBe(10_000_000);
    expect(august?.seriesA).toBe(40_000_000);
    expect(august?.total).toBe(50_000_000);
    expect(months[4]?.growth).toBe(100_000_000);
    expect(months[0]?.total).toBe(0);
  });
});

describe("monthOverMonthTotalChange", () => {
  it("reports an increase versus the prior month", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const months = fundingByMonth(
      [
        round({ id: "j", announcedAt: "2026-07-01", amountLabel: "$100M", roundKind: "Seed" }),
        round({ id: "a", announcedAt: "2026-08-01", amountLabel: "$150M", roundKind: "Seed" }),
      ],
      now,
      2,
    );
    expect(monthOverMonthTotalChange(months)).toEqual({ percent: 50, direction: "up" });
  });
});

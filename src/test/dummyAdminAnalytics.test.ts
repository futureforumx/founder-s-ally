import { describe, expect, it } from "vitest";
import { loadDemoAnalyticsPayload } from "@/pages/test-admin/dummyAnalytics";

describe("loadDemoAnalyticsPayload", () => {
  it("builds a populated all-time analytics payload", () => {
    const payload = loadDemoAnalyticsPayload({ range: "all" });
    const searches = payload.kpis.find((kpi) => kpi.key === "searches")?.value ?? 0;
    const clicks = payload.kpis.find((kpi) => kpi.key === "clicks")?.value ?? 0;

    expect(payload.series.length).toBeGreaterThan(20);
    expect(searches).toBeGreaterThan(1_000);
    expect(clicks).toBeGreaterThan(searches);
    expect(payload.topInvestorRecords).toHaveLength(5);
    expect(payload.investorReviewRatings?.some((row) => row.count > 0)).toBe(true);
  });

  it("shrinks with a shorter timeline", () => {
    const week = loadDemoAnalyticsPayload({ range: "7d" });
    const all = loadDemoAnalyticsPayload({ range: "all" });
    const weekActive = week.kpis.find((kpi) => kpi.key === "active")?.value ?? 0;
    const allActive = all.kpis.find((kpi) => kpi.key === "active")?.value ?? 0;

    expect(week.grain).toBe("day");
    expect(week.series).toHaveLength(7);
    expect(weekActive).toBeLessThan(allActive);
  });
});

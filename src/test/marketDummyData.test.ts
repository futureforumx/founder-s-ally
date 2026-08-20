import { describe, expect, it } from "vitest";
import { buildMarketDummySnapshot, formatUsdCompact } from "@/components/data-room/marketDummyData";

describe("marketDummyData", () => {
  it("formats compact USD amounts", () => {
    expect(formatUsdCompact(12_400_000_000)).toBe("$12.4B");
    expect(formatUsdCompact(18_500_000)).toBe("$18.5M");
  });

  it("returns a stable snapshot for the same sector", () => {
    const a = buildMarketDummySnapshot("Artificial Intelligence", "Seed", ["Vertical AI Agents"]);
    const b = buildMarketDummySnapshot("Artificial Intelligence", "Seed", ["Vertical AI Agents"]);
    expect(a.totalFunding).toBe(b.totalFunding);
    expect(a.investors.map((i) => i.name)).toEqual(b.investors.map((i) => i.name));
    expect(a.recentDeals).toHaveLength(6);
    expect(a.recommendations).toHaveLength(3);
    expect(a.activity).toHaveLength(8);
  });

  it("varies totals across sectors", () => {
    const ai = buildMarketDummySnapshot("Artificial Intelligence", "Seed", []);
    const fin = buildMarketDummySnapshot("Fintech", "Seed", []);
    expect(ai.totalFunding).not.toBe(fin.totalFunding);
  });
});

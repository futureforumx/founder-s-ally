import { describe, expect, it } from "vitest";
import { totalRaisedFromFundingRounds } from "@/lib/totalRaisedFromFundingRounds";

describe("total raised from funding rounds", () => {
  it("sums stored USD amounts and ignores rounds with no money raised", () => {
    expect(totalRaisedFromFundingRounds([
      { amount_usd: 2_500_000 },
      { amount_usd: 10_000_000 },
      { amount_usd: null },
    ])).toBe(12_500_000);
  });

  it("stays null when every amount is empty", () => {
    expect(totalRaisedFromFundingRounds(null)).toBeNull();
    expect(totalRaisedFromFundingRounds([])).toBeNull();
    expect(totalRaisedFromFundingRounds([{ amount_usd: null }, { amount_usd: null }])).toBeNull();
  });
});

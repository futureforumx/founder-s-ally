import { describe, expect, it } from "vitest";
import { stripRedundantFirmPrefixFromFundName } from "@/lib/fundNameNormalizer";

describe("stripRedundantFirmPrefixFromFundName", () => {
  it("collapses duplicated firm branding and possessive", () => {
    expect(
      stripRedundantFirmPrefixFromFundName(
        "Ring Capital",
        "RING CAPITAL'S RING CAPITAL ALTITUDE II",
      ),
    ).toBe("ALTITUDE II");
  });

  it("strips a single leading firm prefix", () => {
    expect(stripRedundantFirmPrefixFromFundName("Acme Ventures", "Acme Ventures Seed Fund III")).toBe("Seed Fund III");
  });

  it("strips only matching leading firm tokens when the rest of the firm name does not appear", () => {
    expect(
      stripRedundantFirmPrefixFromFundName(
        "Sequoia Capital",
        "Sequoia Expansion Strategy Fund",
      ),
    ).toBe("Expansion Strategy Fund");
  });

  it("optional leading The before firm name", () => {
    expect(
      stripRedundantFirmPrefixFromFundName("Ring Capital", "The Ring Capital Altitude II"),
    ).toBe("Altitude II");
  });

  it("does not return empty when the fund name is only the firm", () => {
    expect(stripRedundantFirmPrefixFromFundName("Solo GP", "Solo GP")).toBe("Solo GP");
  });

  it("leaves unrelated names unchanged", () => {
    expect(stripRedundantFirmPrefixFromFundName("Other Firm", "Sequoia Fund XVI")).toBe("Sequoia Fund XVI");
  });
});

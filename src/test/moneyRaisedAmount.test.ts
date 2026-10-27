import { describe, expect, it } from "vitest";
import {
  formatMoneyRaisedDollars,
  moneyRaisedEntryFromUsd,
  sanitizeMoneyRaisedInput,
  usdFromMoneyRaisedEntry,
} from "@/lib/moneyRaisedAmount";

describe("money raised K/M entry", () => {
  it("stores thousands and millions as whole USD", () => {
    expect(usdFromMoneyRaisedEntry("500", "K")).toBe(500_000);
    expect(usdFromMoneyRaisedEntry("2.5", "M")).toBe(2_500_000);
    expect(usdFromMoneyRaisedEntry("2.50", "M")).toBe(2_500_000);
    expect(usdFromMoneyRaisedEntry("", "M")).toBeNull();
    expect(usdFromMoneyRaisedEntry(".", "K")).toBeNull();
  });

  it("loads a short million figure as M and other thousands as K", () => {
    expect(moneyRaisedEntryFromUsd(2_500_000)).toEqual({ text: "2.5", unit: "M" });
    expect(moneyRaisedEntryFromUsd(1_250_000)).toEqual({ text: "1.25", unit: "M" });
    expect(moneyRaisedEntryFromUsd(1_000_000)).toEqual({ text: "1", unit: "M" });
    expect(moneyRaisedEntryFromUsd(500_000)).toEqual({ text: "500", unit: "K" });
    expect(moneyRaisedEntryFromUsd(1_500)).toEqual({ text: "1.5", unit: "K" });
    expect(moneyRaisedEntryFromUsd(1_234_000)).toEqual({ text: "1234", unit: "K" });
  });

  it("keeps amounts under 1000 as a raw number with K, never a tiny million figure", () => {
    expect(moneyRaisedEntryFromUsd(500)).toEqual({ text: "500", unit: "K" });
    expect(moneyRaisedEntryFromUsd(10)).toEqual({ text: "10", unit: "K" });
    expect(moneyRaisedEntryFromUsd(0)).toEqual({ text: "0", unit: "K" });
    expect(moneyRaisedEntryFromUsd(500).text).not.toBe("0.0005");
    expect(moneyRaisedEntryFromUsd(10).text).not.toBe("0.00001");
  });

  it("defaults an empty amount to millions", () => {
    expect(moneyRaisedEntryFromUsd(null)).toEqual({ text: "", unit: "M" });
    expect(moneyRaisedEntryFromUsd("")).toEqual({ text: "", unit: "M" });
  });

  it("expands a blurred amount to full dollars with commas", () => {
    expect(formatMoneyRaisedDollars(usdFromMoneyRaisedEntry("2", "M"))).toBe("2,000,000");
    expect(formatMoneyRaisedDollars(usdFromMoneyRaisedEntry("2.5", "M"))).toBe("2,500,000");
    expect(formatMoneyRaisedDollars(usdFromMoneyRaisedEntry("500", "K"))).toBe("500,000");
    expect(formatMoneyRaisedDollars(null)).toBe("");
    expect(formatMoneyRaisedDollars(10)).toBe("10");
  });

  it("strips a typed dollar sign and extra decimals separators", () => {
    expect(sanitizeMoneyRaisedInput("$2.5")).toBe("2.5");
    expect(sanitizeMoneyRaisedInput("2..5")).toBe("2.5");
  });
});

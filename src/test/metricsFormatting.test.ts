import { describe, expect, it } from "vitest";
import {
  computeLtvCacRatio,
  computeStickiness,
  formatRatio,
} from "@/components/data-room/metricsFormatting";

describe("computeLtvCacRatio", () => {
  it("divides LTV by CAC", () => {
    expect(computeLtvCacRatio("5,000", "250")).toBe(20);
    expect(formatRatio(20)).toBe("20.0x");
  });

  it("stays empty until both numbers exist", () => {
    expect(computeLtvCacRatio("5,000", "")).toBeNull();
    expect(formatRatio(null)).toBe("—");
  });
});

describe("computeStickiness", () => {
  it("returns DAU / MAU as a percentage", () => {
    expect(computeStickiness("3,200", "12,000")).toBeCloseTo((3200 / 12000) * 100);
  });

  it("stays empty until both DAU and MAU exist", () => {
    expect(computeStickiness("", "12,000")).toBeNull();
    expect(computeStickiness("3,200", "")).toBeNull();
  });
});

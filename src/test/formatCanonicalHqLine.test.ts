import { describe, expect, it } from "vitest";
import {
  formatCanonicalHqLine,
  normalizeHqDisplayLine,
  resolveFirmDisplayLocation,
} from "@/lib/formatCanonicalHqLine";

describe("normalizeHqDisplayLine", () => {
  it("uses City, ST for US addresses and drops the country", () => {
    expect(normalizeHqDisplayLine("New York, NY, US")).toBe("New York, NY");
    expect(normalizeHqDisplayLine("San Francisco, California, United States")).toBe(
      "San Francisco, CA",
    );
    expect(normalizeHqDisplayLine("San Francisco, CA, US")).toBe("San Francisco, CA");
  });

  it("uses City, Country internationally and drops admin regions", () => {
    expect(normalizeHqDisplayLine("London, England, United Kingdom")).toBe("London, UK");
    expect(normalizeHqDisplayLine("Toronto, Ontario, Canada")).toBe("Toronto, Canada");
  });

  it("strips streets and postal codes", () => {
    expect(normalizeHqDisplayLine("123 Market St, San Francisco, CA 94105")).toBe(
      "San Francisco, CA",
    );
  });

  it("does not treat St. Louis as a street", () => {
    expect(normalizeHqDisplayLine("St. Louis, MO")).toBe("St. Louis, MO");
  });

  it("infers US state for known cities and expands abbreviations", () => {
    expect(normalizeHqDisplayLine("burlingame")).toBe("Burlingame, CA");
    expect(normalizeHqDisplayLine("SF, CA")).toBe("San Francisco, CA");
    expect(normalizeHqDisplayLine("Washington")).toBe("Washington, DC");
  });

  it("keeps city-states as a single name", () => {
    expect(normalizeHqDisplayLine("Singapore")).toBe("Singapore");
  });

  it("disambiguates Georgia the country vs Georgia the state", () => {
    expect(normalizeHqDisplayLine("Tbilisi, Georgia")).toBe("Tbilisi, Georgia");
    expect(normalizeHqDisplayLine("Atlanta, Georgia, US")).toBe("Atlanta, GA");
  });
});

describe("formatCanonicalHqLine", () => {
  it("never returns a three-part City, State, Country line", () => {
    expect(formatCanonicalHqLine("San Francisco", "CA", "United States")).toBe(
      "San Francisco, CA",
    );
    expect(formatCanonicalHqLine("London", null, "United Kingdom")).toBe("London, UK");
    expect(formatCanonicalHqLine("Berlin", null, "Germany")).toBe("Berlin, Germany");
  });
});

describe("resolveFirmDisplayLocation", () => {
  it("prefers structured HQ fields over a messy legacy line", () => {
    expect(
      resolveFirmDisplayLocation({
        hq_city: "Menlo Park",
        hq_state: "CA",
        hq_country: "USA",
        legacyLocation: "3000 Sand Hill Road, Menlo Park, CA 94025, United States",
      }),
    ).toBe("Menlo Park, CA");
  });

  it("falls back to normalizing the legacy location", () => {
    expect(
      resolveFirmDisplayLocation({
        legacyLocation: "Paris, France",
      }),
    ).toBe("Paris, France");
  });
});

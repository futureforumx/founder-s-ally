import { describe, expect, it } from "vitest";
import {
  destinationToFeedTab,
  isReservedAppPathSlug,
  normalizePublicPathSlug,
  parseFreshCapitalPublicDestination,
  validateFreshCapitalPublicPathInput,
} from "@/lib/freshCapitalPublicPaths";

describe("freshCapitalPublicPaths", () => {
  it("normalizes slashes, case, and full URLs", () => {
    expect(normalizePublicPathSlug("/fresh-capital")).toBe("fresh-capital");
    expect(normalizePublicPathSlug("Fresh-Capital/")).toBe("fresh-capital");
    expect(normalizePublicPathSlug("https://vekta.so/fresh-capital?x=1")).toBe("fresh-capital");
  });

  it("rejects reserved, nested, and invalid slugs", () => {
    expect(normalizePublicPathSlug("admin/intelligence")).toBeNull();
    expect(normalizePublicPathSlug("/admin")).toBe("admin");
    expect(isReservedAppPathSlug("admin")).toBe(true);
    expect(isReservedAppPathSlug("trending-companies")).toBe(true);
    expect(validateFreshCapitalPublicPathInput("/admin").error).toMatch(/already used/i);
    expect(normalizePublicPathSlug("not a path")).toBeNull();
    expect(normalizePublicPathSlug("")).toBeNull();
  });

  it("maps destinations onto the public feed tabs", () => {
    expect(parseFreshCapitalPublicDestination("latest_funding")).toBe("latest_funding");
    expect(parseFreshCapitalPublicDestination("nope")).toBeNull();
    expect(destinationToFeedTab("new_funds")).toBe("fresh_funds");
    expect(destinationToFeedTab("latest_funding")).toBe("latest_funding");
  });
});

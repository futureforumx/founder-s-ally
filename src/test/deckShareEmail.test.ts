import { describe, expect, it } from "vitest";
import { isAllowedDeckViewerEmail, parseAllowedEmails } from "../../api/_deckShareEmail";

describe("deck share email access", () => {
  it("normalizes and deduplicates semicolon-separated viewing addresses", () => {
    expect(parseAllowedEmails(" Investor@Example.com ; investor@example.com; second@example.org "))
      .toEqual(["investor@example.com", "second@example.org"]);
  });

  it("accepts any valid email when the founder has not set an address list", () => {
    expect(isAllowedDeckViewerEmail("visitor@example.com", [])).toBe(true);
    expect(isAllowedDeckViewerEmail("not-an-email", [])).toBe(false);
  });

  it("matches listed addresses without case sensitivity and rejects others", () => {
    expect(isAllowedDeckViewerEmail("INVESTOR@example.com", ["investor@example.com"])).toBe(true);
    expect(isAllowedDeckViewerEmail("other@example.com", ["investor@example.com"])).toBe(false);
  });

  it("rejects invalid and oversized allowlists", () => {
    expect(() => parseAllowedEmails("not-an-email")).toThrow("Enter valid email addresses");
    expect(() => parseAllowedEmails(Array.from({ length: 51 }, (_, index) => `user${index}@example.com`).join(";")))
      .toThrow("no more than 50");
  });
});

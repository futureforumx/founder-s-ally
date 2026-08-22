import { describe, expect, it } from "vitest";
import { formatOutboundUrl } from "@/lib/utils/formatOutboundUrl";

describe("formatOutboundUrl", () => {
  it("appends vekta attribution params", () => {
    const out = formatOutboundUrl("https://techcrunch.com/2026/08/12/acme-raises/");
    const url = new URL(out);
    expect(url.origin + url.pathname).toBe("https://techcrunch.com/2026/08/12/acme-raises/");
    expect(url.searchParams.get("utm_source")).toBe("vekta.so");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
    expect(url.searchParams.get("utm_campaign")).toBe("latest_funding");
  });

  it("uses a custom campaign and preserves existing query params", () => {
    const out = formatOutboundUrl("https://example.com/deal?id=9", "fresh_funds");
    const url = new URL(out);
    expect(url.searchParams.get("id")).toBe("9");
    expect(url.searchParams.get("utm_campaign")).toBe("fresh_funds");
  });

  it("returns the original string when the URL is invalid", () => {
    expect(formatOutboundUrl("not a url")).toBe("not a url");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCompanyLogoCandidates,
  extractCompanyDomain,
  getPrimaryCompanyLogoUrl,
} from "@/lib/company-logo";

describe("company-logo helpers", () => {
  it("normalizes company domains from bare urls", () => {
    expect(extractCompanyDomain("www.Vekta.so/path")).toBe("vekta.so");
    expect(extractCompanyDomain("https://www.Vekta.so/path?q=1")).toBe("vekta.so");
  });

  it("returns null for invalid website input", () => {
    expect(extractCompanyDomain("")).toBeNull();
    expect(extractCompanyDomain("not a valid url%%%")).toBeNull();
  });

  it("prefers an explicit stored logo before generated fallbacks", () => {
    expect(
      getPrimaryCompanyLogoUrl({
        logoUrl: "https://cdn.example.com/logo.png",
        websiteUrl: "vekta.so",
        size: 128,
      }),
    ).toBe("https://cdn.example.com/logo.png");
  });

  it("builds the fallback chain from the saved website", () => {
    expect(
      buildCompanyLogoCandidates({
        websiteUrl: "https://www.vekta.so",
        size: 64,
      }),
    ).toEqual([
      "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://vekta.so&size=64",
      "https://www.google.com/s2/favicons?domain=vekta.so&sz=64",
      "https://vekta.so/favicon.ico",
    ]);
  });
});

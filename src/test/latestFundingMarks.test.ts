import { describe, expect, it } from "vitest";
import { isLikelyFundingCompanyName } from "@/lib/latestFundingDisplay";
import {
  buildCompanyMarkCandidateUrls,
  firstPartyHostFromUrl,
  guessedHostsFromCompanyName,
  isPressOrSocialHost,
} from "@/lib/latestFundingMarks";

describe("firstPartyHostFromUrl", () => {
  it("uses a company blog host and strips news.", () => {
    expect(firstPartyHostFromUrl("https://groq.com/newsroom/series-a")).toBe("groq.com");
    expect(firstPartyHostFromUrl("https://news.convex.dev/convex-raises-57m/")).toBe("convex.dev");
    expect(firstPartyHostFromUrl("https://lovable.dev/blog/series-c")).toBe("lovable.dev");
  });

  it("ignores press and social hosts", () => {
    expect(firstPartyHostFromUrl("https://techcrunch.com/2026/08/12/blacksmith/")).toBeNull();
    expect(firstPartyHostFromUrl("https://www.linkedin.com/posts/foo")).toBeNull();
    expect(firstPartyHostFromUrl("https://www.businesswire.com/news/home/123")).toBeNull();
    expect(isPressOrSocialHost("techcrunch.com")).toBe(true);
  });
});

describe("guessedHostsFromCompanyName", () => {
  it("builds startup-style domains from the company name", () => {
    expect(guessedHostsFromCompanyName("Astromech")).toEqual([
      "astromech.com",
      "astromech.ai",
      "astromech.io",
      "astromech.co",
      "astromech.dev",
    ]);
    expect(guessedHostsFromCompanyName("Wispr Flow")[0]).toBe("wisprflow.com");
  });
});

describe("buildCompanyMarkCandidateUrls", () => {
  it("waterfalls stored logo → website → first-party source → name guesses", () => {
    const urls = buildCompanyMarkCandidateUrls({
      companyName: "Groq",
      logoUrl: "https://framerusercontent.com/images/groq.webp",
      websiteUrl: "",
      sourceUrl: "https://groq.com/newsroom/series-a",
    });

    expect(urls[0]).toBe("https://framerusercontent.com/images/groq.webp");
    expect(urls).toContain("https://img.logo.dev/groq.com?size=64&format=png&fallback=404");
    expect(urls).toContain("https://www.google.com/s2/favicons?sz=32&domain=groq.com");
    expect(urls.some((u) => u.includes("techcrunch"))).toBe(false);
  });

  it("skips favicon-proxy stored logos so domain fallbacks can run", () => {
    const urls = buildCompanyMarkCandidateUrls({
      companyName: "Convex",
      logoUrl: "https://www.google.com/s2/favicons?domain=convex.dev&sz=32",
      websiteUrl: "https://www.convex.dev",
      sourceUrl: "https://techcrunch.com/convex",
    });
    expect(urls[0]).toBe("https://img.logo.dev/convex.dev?size=64&format=png&fallback=404");
    expect(urls).not.toContain("https://www.google.com/s2/favicons?domain=convex.dev&sz=32");
  });
});

describe("isLikelyFundingCompanyName", () => {
  it("keeps real company names and drops article headlines", () => {
    expect(isLikelyFundingCompanyName("Aligned Marketplace")).toBe(true);
    expect(isLikelyFundingCompanyName("Rillet")).toBe(true);
    expect(isLikelyFundingCompanyName("Will the DOJ’s investigation into a16z spook other VCs?")).toBe(false);
    expect(isLikelyFundingCompanyName("The AlleyWatch Startup Daily Funding Report: 8/19/2026")).toBe(false);
    expect(isLikelyFundingCompanyName("How AI accounting startup Rillet raised $100M and became a unicorn in 48 hours")).toBe(
      false,
    );
  });
});

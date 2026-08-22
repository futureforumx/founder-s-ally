import { describe, expect, it } from "vitest";
import {
  parseStartupsGalleryNewsHtml,
  splitAmountAndRound,
  startupsGalleryArticleUrl,
  startupsGalleryListingTitle,
} from "@/lib/startupsGalleryNews";

const FIXTURE = `
<div data-framer-name="Post">
  <a data-framer-name="Company Name" href="./companies/astromech">
    <p>Astromech</p>
    <img src="https://framerusercontent.com/images/astromech.webp?width=220&amp;height=196" alt="" />
  </a>
  <div data-framer-name="Amount"><p>$20M · Seed</p></div>
  <div data-framer-name="Date"><time datetime="2026-08-21T00:00:00.000Z">Aug 21, 2026</time></div>
  <a data-framer-name="Company Name" href="./investors/peak-6"><p>Peak 6</p></a>
  <a data-framer-name="Source" href="https://techfundingnews.com/astromech-raises-20m-3-8b-valuation-colossal-spinout/">Source</a>
</div>
<div data-framer-name="Post">
  <a data-framer-name="Company Name" href="./companies/atoms"><p>Atoms</p></a>
  <div data-framer-name="Amount"><p>$1.7B · Venture</p></div>
  <div data-framer-name="Date"><time datetime="2026-07-22T00:00:00.000Z">Jul 22, 2026</time></div>
  <a data-framer-name="Company Name" href="./investors/andreessen-horowitz"><p>a16z</p></a>
  <a data-framer-name="Source" href="https://techcrunch.com/2026/07/22/travis-kalanicks-robotics-company-raises-1-7b-led-by-a16z/">Source</a>
</div>
<div data-framer-name="Post">
  <a data-framer-name="Company Name" href="./companies/telli"><p>telli</p></a>
  <div data-framer-name="Amount"><p>$15M · Seed</p></div>
  <div data-framer-name="Date"><time datetime="2026-07-28T00:00:00.000Z">Jul 28, 2026</time></div>
  <a data-framer-name="Company Name" href="./investors/redalpine"><p>redalpine</p></a>
  <a data-framer-name="Source" href="https://www.linkedin.com/posts/finnzurmuehlen_we-just-raised-15m">Source</a>
</div>
`;

describe("splitAmountAndRound", () => {
  it("splits the gallery amount · round cell", () => {
    expect(splitAmountAndRound("$20M · Seed")).toEqual({ amount: "$20M", round: "Seed" });
    expect(splitAmountAndRound("$1.7B · Venture")).toEqual({ amount: "$1.7B", round: "Venture" });
    expect(splitAmountAndRound("$11.5M · Seed")).toEqual({ amount: "$11.5M", round: "Seed" });
  });
});

describe("parseStartupsGalleryNewsHtml", () => {
  it("keeps every table row without a funding-keyword filter", () => {
    const rows = parseStartupsGalleryNewsHtml(FIXTURE);
    expect(rows.map((r) => r.companyName)).toEqual(["Astromech", "Atoms", "telli"]);
    expect(rows[0]).toMatchObject({
      amountRaw: "$20M",
      roundTypeRaw: "Seed",
      leadInvestor: "Peak 6",
      companySlug: "astromech",
      logoUrl: "https://framerusercontent.com/images/astromech.webp?width=220&height=196",
    });
    expect(rows[0]?.announcedAtIso?.startsWith("2026-08-21")).toBe(true);
    expect(startupsGalleryArticleUrl(rows[0]!)).toContain("techfundingnews.com");
    expect(startupsGalleryListingTitle(rows[1]!)).toBe("Atoms raises $1.7B Venture");
  });

  it("does not drop LinkedIn/X source rows or Venture-stage rounds", () => {
    const rows = parseStartupsGalleryNewsHtml(FIXTURE);
    expect(rows[1]?.roundTypeRaw).toBe("Venture");
    expect(rows[2]?.sourceUrl).toContain("linkedin.com");
  });
});

import { describe, expect, it } from "vitest";
import {
  findGalleryCompanyEntry,
  isPlausibleFundingHq,
  pickGalleryCompanyProfile,
  pickGalleryCompanyProfileFromHtml,
  inferHqFromFundingCopy,
  sanitizeCompanyDescription,
  sanitizeFundingHq,
} from "@/lib/galleryCompanyProfile";

const helcim = {
  h1: ["Helcim"],
  p: [
    "Join for free",
    "Backed by",
    "Visit Website",
    "View Jobs",
    "Helcim is a payments company that lets businesses accept credit cards with ease. Discover better payments for your business in Canada & the US.",
    "Calgary, Canada",
    "$20M Series B",
    "Fintech",
    "Remote",
    "1–10",
    "Smarter treasury and banking for startups.",
    "Fintech · Seed · Onsite · Based in London",
  ],
};

const astromech = {
  h1: ["Astromech"],
  p: [
    "Join for free",
    "Navigating the code of life.",
    "Visit Website",
    "Design semantically precise and biologically grounded prompts for large AI models used in genomic inference, synthesis design, and ancestral modeling. Co-founded by the CEO of Colossal Biosciences, Ben Lamm.",
    "San Francisco, United States",
    "$30M Seed",
    "Biotech",
    "Remote",
    "11–50",
  ],
};

describe("pickGalleryCompanyProfile", () => {
  it("reads Helcim sector, HQ, and description from the gallery search index", () => {
    const profile = pickGalleryCompanyProfile(helcim);
    expect(profile.sector).toBe("Fintech");
    expect(profile.hqLine).toBe("Calgary, Canada");
    expect(profile.description).toMatch(/payments company/i);
  });

  it("reads Astromech sector, HQ, and bio instead of the short tagline", () => {
    const profile = pickGalleryCompanyProfile(astromech);
    expect(profile.sector).toBe("Biotech");
    expect(profile.hqLine).toBe("San Francisco, CA");
    expect(profile.description).toMatch(/genomic inference/i);
  });
});

describe("inferHqFromFundingCopy", () => {
  it("reads GeekWire geographic company names", () => {
    expect(inferHqFromFundingCopy("Seattle-area startup Union.ai")).toBe("Seattle, WA");
    expect(inferHqFromFundingCopy("Portland cybersecurity startup Eclypsium")).toBe("Portland, OR");
    expect(inferHqFromFundingCopy("Anduril", "Anduril lands $5B in Seattle")).toBeNull();
  });

  it("maps based-in city phrases", () => {
    expect(inferHqFromFundingCopy("Moove", "Moove is based in Dubai")).toBe("Dubai, UAE");
  });
});

describe("sanitizeFundingHq", () => {
  it("keeps city/country lines and drops article scrapes", () => {
    expect(sanitizeFundingHq("Calgary, Canada")).toBe("Calgary, Canada");
    expect(sanitizeFundingHq("São Paulo, Brazil")).toBe("São Paulo, Brazil");
    expect(isPlausibleFundingHq("from Spokane to Seattle area as retail-returns startup grows team")).toBe(false);
    expect(sanitizeFundingHq("San Francisco CuspAI Frontier AI for breakthrough materials")).toBeNull();
  });
});

describe("sanitizeCompanyDescription", () => {
  it("drops gallery chrome and nav copy", () => {
    expect(sanitizeCompanyDescription("Join for free Astromech Navigating the code of life.")).toBeNull();
    expect(
      sanitizeCompanyDescription(
        "Helcim is a payments company that lets businesses accept credit cards with ease. Discover better payments for your business in Canada & the US.",
      ),
    ).toMatch(/payments company/i);
    expect(
      sanitizeCompanyDescription(
        "Aligned Marketplace Raises $16M to Cut Employer Healthcare Costs Through Independent Primary Care – AlleyWatch Apply To Contribute",
      ),
    ).toBeNull();
  });
});

describe("pickGalleryCompanyProfileFromHtml", () => {
  it("reads sector, HQ, and bio from a Framer company page", () => {
    const html = `
      <title>Callosum | startups.gallery</title>
      <p class="framer-text">Join for free</p>
      <p class="framer-text">Callosum is the Intelligent Systems Company. We believe the next generation of AI won't be defined by any single model or chip, but by intelligent systems in which hardware and software co-evolve.</p>
      <p class="framer-text">London, United Kingdom</p>
      <p class="framer-text">$100M Seed</p>
      <p class="framer-text">AI</p>
    `;
    const profile = pickGalleryCompanyProfileFromHtml(html);
    expect(profile.sector).toBe("AI");
    expect(profile.hqLine).toBe("London, UK");
    expect(profile.description).toMatch(/Intelligent Systems Company/i);
  });

  it("does not take a later similar-company industry as the sector", () => {
    const html = `
      <title>telli | startups.gallery</title>
      <p class="framer-text">telli builds AI for customer-facing operations at companies that care about every conversation.</p>
      <p class="framer-text">Berlin, Germany</p>
      <p class="framer-text">AI</p>
      <p class="framer-text">Explore similar companies to telli</p>
      <p class="framer-text">Aerospace</p>
    `;
    expect(pickGalleryCompanyProfileFromHtml(html).sector).toBe("AI");
  });
});

describe("findGalleryCompanyEntry", () => {
  it("matches Veeda to the veeda-ai slug", () => {
    const companies = new Map([
      ["veeda-ai", { entry: { h1: ["Veeda"], p: ["Fintech"] } }],
    ]);
    expect(findGalleryCompanyEntry(companies, "Veeda")?.entry.h1).toEqual(["Veeda"]);
  });
});

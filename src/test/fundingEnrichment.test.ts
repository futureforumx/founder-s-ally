import { describe, expect, it } from "vitest";
import {
  getLogoFallbackUrl,
  getLogoUrl,
  lookupVcFirmDomain,
  resolveLogoDomain,
} from "@/lib/enrichment/logos";
import {
  FUNDING_SECTOR_TAXONOMY,
  classifyDealSector,
  classifySectorFromKeywords,
  coerceToFundingSector,
  isMissingSector,
  parseSectorModelOutput,
} from "@/lib/enrichment/sectors";

describe("investor logo enrichment", () => {
  it("maps common VC names to canonical domains", () => {
    expect(lookupVcFirmDomain("Sequoia")).toBe("sequoiacap.com");
    expect(lookupVcFirmDomain("General Catalyst")).toBe("generalcatalyst.com");
    expect(lookupVcFirmDomain("Nexus Venture Partners")).toBe("nexusvp.com");
    expect(lookupVcFirmDomain("Stellaris Venture Partners")).toBe("stellarisvp.com");
  });

  it("returns Clearbit as primary and Google s2 as fallback", () => {
    expect(getLogoUrl("nexusvp.com")).toBe("https://logo.clearbit.com/nexusvp.com");
    expect(getLogoFallbackUrl("https://www.stellarisvp.com/team")).toBe(
      "https://www.google.com/s2/favicons?domain=stellarisvp.com&sz=128",
    );
  });

  it("prefers an explicit website, then the name map", () => {
    expect(resolveLogoDomain({ name: "Sequoia", websiteUrl: "https://www.generalcatalyst.com" })).toBe(
      "generalcatalyst.com",
    );
    expect(resolveLogoDomain({ name: "Stellaris Venture Partners" })).toBe("stellarisvp.com");
  });
});

describe("sector auto-classification", () => {
  it("exposes the fixed taxonomy", () => {
    expect(FUNDING_SECTOR_TAXONOMY).toEqual([
      "AI / ML",
      "Fintech",
      "Enterprise SaaS",
      "Health / Bio",
      "Consumer",
      "Crypto / Web3",
      "Climate / Energy",
      "Cybersecurity",
      "Hardware / Deeptech",
      "Developer Tools",
    ]);
  });

  it("treats empty and unknown labels as missing", () => {
    expect(isMissingSector(null)).toBe(true);
    expect(isMissingSector("")).toBe(true);
    expect(isMissingSector("Unknown")).toBe(true);
    expect(isMissingSector("Fintech")).toBe(false);
  });

  it("classifies overlapping deal copy into a single taxonomy label", () => {
    expect(
      classifySectorFromKeywords(
        "LedgerPay",
        "LedgerPay raises $20M for embedded finance",
        "The fintech platform helps merchants with payments infrastructure.",
      ),
    ).toBe("Fintech");
    expect(
      classifySectorFromKeywords(
        "Nexus Labs",
        "Nexus Labs raises seed for generative AI coding agents",
        "The developer tools company ships an AI-native SDK.",
      ),
    ).toBe("Developer Tools");
    expect(coerceToFundingSector("ai")).toBe("AI / ML");
    expect(coerceToFundingSector("Health / Bio")).toBe("Health / Bio");
  });

  it("parses OpenAI output only when it is in the taxonomy", () => {
    expect(parseSectorModelOutput("Climate / Energy")).toBe("Climate / Energy");
    expect(parseSectorModelOutput('"Fintech"')).toBe("Fintech");
    expect(parseSectorModelOutput("Space Tourism")).toBeNull();
  });

  it("fills a missing sector from keywords without calling OpenAI", async () => {
    const result = await classifyDealSector({
      companyName: "Shield",
      headline: "Shield raises Series A for endpoint security",
      articleSummary: "Zero trust cybersecurity for mid-market IT teams.",
      allowOpenAI: false,
    });
    expect(result).toEqual({ sector: "Cybersecurity", method: "keywords" });
  });
});

import { describe, expect, it } from "vitest";
import { buildFirmRecordBackfillPatch, collectIncomingFirmIdentity } from "@/lib/vc-funds/firmBackfill";
import type { CanonicalFundDraft, ExtractedFundAnnouncement } from "@/lib/vc-funds/types";

function announcement(partial: Partial<ExtractedFundAnnouncement> = {}): ExtractedFundAnnouncement {
  return {
    firmName: "Helcim",
    sourceUrl: "https://example.com/helcim-fund",
    sourceType: "structured_provider",
    confidence: 0.8,
    ...partial,
  };
}

const fund: Pick<CanonicalFundDraft, "stageFocus" | "sectorFocus" | "geographyFocus"> = {
  stageFocus: ["Seed"],
  sectorFocus: ["Fintech"],
  geographyFocus: ["San Francisco, CA"],
};

describe("collectIncomingFirmIdentity", () => {
  it("keeps first-party websites and drops press/directory hosts", () => {
    const incoming = collectIncomingFirmIdentity(
      [
        announcement({ firmWebsiteUrl: "https://techcrunch.com/2026/08/21/helcim" }),
        announcement({ firmWebsiteUrl: "https://www.helcim.com" }),
      ],
      fund,
    );
    expect(incoming.websiteUrl).toMatch(/^https:\/\/(www\.)?helcim\.com\/?$/);
  });

  it("parses a city HQ and ignores region-only geography", () => {
    const city = collectIncomingFirmIdentity([announcement({ metadata: { location: "San Francisco, CA" } })], {
      ...fund,
      geographyFocus: [],
    });
    expect(city.hqCity).toBe("San Francisco");
    expect(city.hqState).toBe("California");
    expect(city.hqCountry).toBe("US");

    const region = collectIncomingFirmIdentity([announcement()], {
      ...fund,
      geographyFocus: ["Europe"],
    });
    expect(region.hqCity).toBeNull();
  });
});

describe("buildFirmRecordBackfillPatch", () => {
  it("fills missing logo, website, and HQ without overwriting existing values", () => {
    const incoming = collectIncomingFirmIdentity(
      [
        announcement({
          firmWebsiteUrl: "https://helcim.com",
          metadata: { location: "Calgary, AB, Canada", linkedin_url: "https://linkedin.com/company/helcim" },
        }),
      ],
      fund,
    );

    const filled = buildFirmRecordBackfillPatch({}, incoming);
    expect(filled?.website_url).toBe("https://helcim.com");
    expect(filled?.domain).toBe("helcim.com");
    expect(filled?.logo_url).toContain("helcim.com");
    expect(filled?.hq_city).toBe("Calgary");
    expect(filled?.linkedin_url).toBe("https://linkedin.com/company/helcim");
    expect(filled?.stage_focus).toEqual(["Seed"]);

    const skipped = buildFirmRecordBackfillPatch(
      {
        website_url: "https://existing.com",
        logo_url: "https://existing.com/logo.png",
        hq_city: "Toronto",
        location: "Toronto, ON",
        stage_focus: ["Seed"],
      },
      incoming,
    );
    expect(skipped?.website_url).toBeUndefined();
    expect(skipped?.logo_url).toBeUndefined();
    expect(skipped?.hq_city).toBeUndefined();
  });

  it("does not write HQ when canonical HQ is locked", () => {
    const incoming = collectIncomingFirmIdentity(
      [announcement({ metadata: { location: "San Francisco, CA" } })],
      { ...fund, geographyFocus: [] },
    );
    const patch = buildFirmRecordBackfillPatch({ canonical_hq_locked: true }, incoming);
    expect(patch?.hq_city).toBeUndefined();
    expect(patch?.location).toBeUndefined();
  });
});

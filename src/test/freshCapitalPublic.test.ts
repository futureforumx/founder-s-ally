import { describe, expect, it } from "vitest";
import {
  announcedDateForDisplay,
  announcementUrlForDisplay,
  curatedFirmHqLineForDirectoryName,
  expandFreshCapitalRowsForDisplay,
  firmAumDisplayForInvestorPanel,
  firmMarkCandidateUrls,
  freshCapitalFirmAumUsd,
  freshCapitalFirmLocationLineForDisplay,
  freshCapitalFirmWebsiteLinkSource,
  formatFundSizeUsd,
  fundNameForDisplay,
  geographyFocusForDisplay,
  normalizeGeoFocusDisplayChip,
  parseFreshCapitalFundRow,
  sectorFocusForDisplay,
  stageFocusForDisplay,
} from "@/lib/freshCapitalPublic";

describe("geographyFocusForDisplay", () => {
  it("shows Europe for Credo Ventures (display override)", () => {
    expect(
      geographyFocusForDisplay({
        firm_name: "Credo Ventures",
        geography_focus: ["Global", "North America"],
      }),
    ).toEqual(["Europe"]);
  });
});

describe("normalizeGeoFocusDisplayChip", () => {
  it('maps United States aliases to "U.S."', () => {
    expect(normalizeGeoFocusDisplayChip("United States")).toBe("U.S.");
    expect(normalizeGeoFocusDisplayChip("U.S.")).toBe("U.S.");
    expect(normalizeGeoFocusDisplayChip("United States of America")).toBe("U.S.");
    expect(normalizeGeoFocusDisplayChip("USA")).toBe("U.S.");
    expect(normalizeGeoFocusDisplayChip("  US  ")).toBe("U.S.");
    expect(normalizeGeoFocusDisplayChip("u.s")).toBe("U.S.");
  });

  it('shortens "Global (…)" titles to Global', () => {
    expect(normalizeGeoFocusDisplayChip("Global (ex-China)")).toBe("Global");
  });

  it("preserves non-US geo labels", () => {
    expect(normalizeGeoFocusDisplayChip("Europe")).toBe("Europe");
    expect(normalizeGeoFocusDisplayChip("  Asia Pacific  ")).toBe("Asia Pacific");
  });
});

describe("Hummingbird Ventures display corrections", () => {
  const rowBase = {
    firm_name: "Hummingbird Ventures",
    vc_fund_id: "00000000-0000-4000-8000-000000000001",
    firm_record_id: "00000000-0000-4000-8000-000000000002",
    fund_name: "",
    stage_focus: ["Seed", "Series A"] as string[] | null,
    sector_focus: ["B2B", "SAAS", "CONSUMER"] as string[] | null,
  };

  it('shows Growth Fund I when ingestion used "Hummingbird Ventures V"', () => {
    expect(
      fundNameForDisplay({
        ...rowBase,
        fund_name: "Hummingbird Ventures V",
      }),
    ).toBe("Growth Fund I");
  });

  it("uses Series B + Series C+ stages for that vehicle (growth fund excludes Series A)", () => {
    expect(
      stageFocusForDisplay({
        ...rowBase,
        fund_name: "Hummingbird Ventures V",
        stage_focus: ["Seed", "Series A"],
      }),
    ).toEqual(["Series B", "Series C+"]);
  });

  it("shows March 16, 2026 for announced date on that vehicle", () => {
    expect(
      announcedDateForDisplay({
        ...rowBase,
        fund_name: "Hummingbird Ventures V",
        announced_date: "2026-03-01",
        close_date: null,
      }),
    ).toBe("March 16, 2026");
  });

  it("uses curated theme pills for Growth Fund I", () => {
    expect(
      sectorFocusForDisplay({
        ...rowBase,
        fund_name: "Hummingbird Ventures V",
      }),
    ).toEqual(["AI", "Fintech", "Biotech", "Semiconductors", "Gaming"]);
  });

  it("uses MandA article as announcement source for Growth Fund I", () => {
    expect(
      announcementUrlForDisplay({
        ...rowBase,
        fund_name: "Hummingbird Ventures V",
        announcement_url: "https://example.com/wrong",
      }),
    ).toBe(
      "https://manda.be/articles/hummingbird-ventures-raises-800-million-dollars-to-back-misfit-founders-worldwide/",
    );
  });

  it("shows London, U.K. as HQ line for Hummingbird", () => {
    expect(
      freshCapitalFirmLocationLineForDisplay({
        firm_name: "Hummingbird Ventures",
        firm_location: "Antwerp, Belgium",
      }),
    ).toBe("London, U.K.");
  });

  it("curated firm HQ helper matches investor panel name variants", () => {
    expect(curatedFirmHqLineForDirectoryName(undefined, "Hummingbird Ventures")).toBe("London, U.K.");
    expect(curatedFirmHqLineForDirectoryName("HummingbirdVentures")).toBe("London, U.K.");
  });

  it("uses hummingbird.vc as firm meta website link", () => {
    expect(
      freshCapitalFirmWebsiteLinkSource({
        firm_name: "Hummingbird Ventures",
        firm_website_url: null,
        firm_domain: null,
      }),
    ).toBe("https://hummingbird.vc");
  });

  it("prefers the canonical Kleiner Perkins domain over stale DB URLs", () => {
    expect(
      freshCapitalFirmWebsiteLinkSource({
        firm_name: "Kleiner Perkins",
        firm_website_url: "https://www.kpcb.com",
        firm_domain: "kpcb.com",
      }),
    ).toBe("https://kleinerperkins.com");
  });

  it("shows March 24, 2026 as the announced date for Kleiner Perkins KP22", () => {
    expect(
      announcedDateForDisplay({
        firm_name: "Kleiner Perkins",
        fund_name: "KP22",
        announced_date: "2026-03-01",
        close_date: null,
      }),
    ).toBe("March 24, 2026");
  });

  it("uses $1B firm AUM for Hummingbird meta row", () => {
    expect(formatFundSizeUsd(freshCapitalFirmAumUsd({ firm_name: "Hummingbird Ventures", firm_aum_usd: null }))).toBe(
      "$1.0B",
    );
  });

  it("uses $1.2B firm AUM for Otro Capital meta row when RPC omits aum", () => {
    expect(formatFundSizeUsd(freshCapitalFirmAumUsd({ firm_name: "Otro Capital", firm_aum_usd: null }))).toBe("$1.2B");
  });

  it("uses $4B firm AUM for CRV when RPC omits aum", () => {
    expect(
      formatFundSizeUsd(freshCapitalFirmAumUsd({ firm_name: "CRV (Charles River Ventures)", firm_aum_usd: null })),
    ).toBe("$4.0B");
    expect(firmAumDisplayForInvestorPanel("CRV", null)).toBe("$4.0B");
  });

  it("formats investor panel AUM like Fresh Capital when firm_records.aum is null", () => {
    expect(firmAumDisplayForInvestorPanel("Otro Capital", null)).toBe("$1.2B");
    expect(firmAumDisplayForInvestorPanel("Hummingbird Ventures", null)).toBe("$1.0B");
  });

  it("duplicates Growth Fund I as Fund VI with the requested fields", () => {
    const baseRow = {
      ...rowBase,
      vc_fund_id: "00000000-0000-4000-8000-000000000010",
      fund_name: "Hummingbird Ventures V",
      announced_date: "2026-03-01",
      close_date: null,
      final_size_usd: 600_000_000,
      target_size_usd: 600_000_000,
      geography_focus: ["Europe", "Global"] as string[] | null,
    };

    const expanded = expandFreshCapitalRowsForDisplay([baseRow as any]);
    expect(expanded).toHaveLength(2);

    const dup = expanded[1]!;
    expect(dup.fund_name).toBe("Fund VI");
    expect(dup.final_size_usd).toBe(200_000_000);
    expect(dup.target_size_usd).toBe(200_000_000);
    expect(dup.announced_date).toBe("2026-03-16");
    expect(dup.geography_focus).toEqual(["Europe", "Global"]);
    expect(dup.sector_focus).toEqual(["B2B", "SAAS", "CONSUMER"]);
    expect(dup.stage_focus).toEqual(["Pre-Seed", "Seed", "Series A"]);
  });
});

describe("parseFreshCapitalFundRow", () => {
  it("reads firm meta from camelCase RPC keys (PostgREST edge cases)", () => {
    const row = parseFreshCapitalFundRow({
      vc_fund_id: "00000000-0000-4000-8000-000000000099",
      firm_record_id: "00000000-0000-4000-8000-000000000088",
      firm_name: "Sequoia Capital",
      fund_name: "Sequoia Fund XVI",
      firmLocation: "Menlo Park, CA",
      firmWebsiteUrl: "https://sequoiacap.com",
      firmDomain: "sequoiacap.com",
    });
    expect(row?.firm_location).toBe("Menlo Park, CA");
    expect(row?.firm_website_url).toBe("https://sequoiacap.com");
    expect(row?.firm_domain).toBe("sequoiacap.com");
  });
});

describe("freshCapitalPublic firm mark candidates", () => {
  it("prefers VC Sheet logos before proxy favicon services for known funds", () => {
    const candidates = firmMarkCandidateUrls({
      firm_name: "Andreessen Horowitz",
      firm_domain: "a16z.com",
      firm_logo_url: "https://cdn.example.com/old-logo.png",
    });

    expect(candidates).toEqual([
      "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b180b9b8a6daa57ede490_a16z_logo%20(2).jpeg",
      "https://img.logo.dev/a16z.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=a16z.com",
      "https://img.logo.dev/andreessenhorowitz.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.com",
      "https://img.logo.dev/andreessenhorowitz.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.vc",
      "https://img.logo.dev/andreessenhorowitz.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.ventures",
      "https://img.logo.dev/andreessenhorowitz.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.capital",
    ]);
    expect(candidates).not.toContain("https://cdn.example.com/old-logo.png");
  });

  it("falls back to logo.dev and then Google when no VC Sheet mark is known", () => {
    expect(
      firmMarkCandidateUrls({
        firm_name: "Northline Ventures",
        firm_domain: "northline.vc",
        firm_logo_url: null,
      }),
    ).toEqual([
      "https://img.logo.dev/northline.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.vc",
      "https://img.logo.dev/northlineventures.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.com",
      "https://img.logo.dev/northlineventures.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.vc",
      "https://img.logo.dev/northlineventures.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.ventures",
      "https://img.logo.dev/northlineventures.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.capital",
      "https://img.logo.dev/northline.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.com",
      "https://img.logo.dev/northline.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.ventures",
      "https://img.logo.dev/northline.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.capital",
    ]);
  });

  it("uses Eka's website logo and domain hint for Eka Ventures", () => {
    expect(
      firmMarkCandidateUrls({
        firm_name: "Eka Ventures",
        firm_domain: null,
        firm_logo_url: null,
      }),
    ).toEqual([
      "https://cdn.prod.website-files.com/68fb32edfd991098f5733b6b/690247c9911044cfc16d90e6_Eka_logo_white.svg",
      "https://img.logo.dev/ekavc.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekavc.com",
      "https://img.logo.dev/ekaventures.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.com",
      "https://img.logo.dev/ekaventures.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.vc",
      "https://img.logo.dev/ekaventures.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.ventures",
      "https://img.logo.dev/ekaventures.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.capital",
      "https://img.logo.dev/eka.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.com",
      "https://img.logo.dev/eka.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.vc",
      "https://img.logo.dev/eka.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.ventures",
      "https://img.logo.dev/eka.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.capital",
    ]);
  });
});

describe("Antler US Fund II theme pills", () => {
  it("shows AI, Housing, Biotech, Health when firm is Antler and fund is US Fund II", () => {
    expect(
      sectorFocusForDisplay({
        firm_name: "Antler",
        fund_name: "Antler US Fund II",
        sector_focus: ["AI"],
      }),
    ).toEqual(["AI", "Housing", "Biotech", "Health"]);
  });
});

describe("Andreessen Horowitz American Dynamism Fund themes", () => {
  it("shows curated themes for American Dynamism Fund", () => {
    expect(
      sectorFocusForDisplay({
        firm_name: "Andreessen Horowitz",
        fund_name: "American Dynamism Fund",
        sector_focus: ["Enterprise"],
      }),
    ).toEqual([
      "Aerospace",
      "Defense",
      "Public Safety",
      "Education",
      "Housing",
      "Supply Chain",
      "Industrials",
      "Manufacturing",
    ]);
  });
});

describe("Battery Ventures XV / Thrive Capital X stage labels", () => {
  it('shows fund name as "Thrive X" for Thrive Capital X', () => {
    expect(
      fundNameForDisplay({
        firm_name: "Thrive Capital",
        fund_name: "Thrive Capital X",
      }),
    ).toBe("Thrive X");
  });

  it('shows fund name as "Thrive X" for Fund X on Thrive Capital rows', () => {
    expect(
      fundNameForDisplay({
        firm_name: "Thrive Capital",
        fund_name: "Fund X",
      }),
    ).toBe("Thrive X");
  });

  it('shows fund name as "Thrive X" for stale generic Thrive fund labels', () => {
    expect(
      fundNameForDisplay({
        firm_name: "Thrive Capital",
        fund_name: "Fund",
      }),
    ).toBe("Thrive X");
    expect(
      fundNameForDisplay({
        firm_name: "Thrive Capital",
        fund_name: "Thrive Capital Fund",
      }),
    ).toBe("Thrive X");
  });

  it('maps Growth to "Series C+" for Battery Ventures XV', () => {
    expect(
      stageFocusForDisplay({
        firm_name: "Battery Ventures",
        fund_name: "Battery Ventures XV",
        stage_focus: ["Seed", "Growth", "Series B"],
      }),
    ).toEqual(["Seed", "Series C+", "Series B"]);
  });

  it('maps Growth to "Series C+" for Thrive Capital X (not XI)', () => {
    expect(
      stageFocusForDisplay({
        firm_name: "Thrive Capital",
        fund_name: "Thrive Capital X",
        stage_focus: ["Growth"],
      }),
    ).toEqual(["Series C+"]);
    expect(
      stageFocusForDisplay({
        firm_name: "Thrive Capital",
        fund_name: "Thrive Capital XI",
        stage_focus: ["Growth"],
      }),
    ).toEqual(["Growth"]);
  });
});

describe("Kleiner Perkins KP Select IV display", () => {
  it("shows Series B and Series C+ stages for KP Select IV", () => {
    expect(
      stageFocusForDisplay({
        firm_name: "Kleiner Perkins",
        fund_name: "KP Select IV",
        stage_focus: ["Series B", "Growth"],
      }),
    ).toEqual(["Series B", "Series C+"]);
  });

  it("shows the full curated theme list for KP Select IV", () => {
    expect(
      sectorFocusForDisplay({
        firm_name: "Kleiner Perkins",
        fund_name: "KP Select IV",
        sector_focus: ["AI-Native", "Professional Services", "Healthcare"],
      }),
    ).toEqual([
      "AI-Native",
      "Professional Services",
      "Healthcare",
      "Cybersecurity",
      "Fintech",
        "Enterprise",
        "Transportation",
        "Industrial",
        "Physical AI",
        "Deep Tech",
        "AI Infrastructure",
      ]);
  });
});

describe("Kleiner Perkins KP22 display", () => {
  it("shows the full curated theme list for KP22", () => {
    expect(
      sectorFocusForDisplay({
        firm_name: "Kleiner Perkins",
        fund_name: "Kleiner Perkins KP22",
        sector_focus: ["AI-Native", "Healthcare", "Enterprise"],
      }),
    ).toEqual([
      "AI-Native",
      "Professional Services",
      "Healthcare",
      "Autonomy / Transportation",
      "Cybersecurity",
      "Financial Services",
      "Productivity",
      "Enterprise",
      "Industrial",
      "Physical AI",
    ]);
  });
});

describe("Lux Capital IX themes and AUM", () => {
  it('shows fund label as "Fund IX" on the Fresh Capital grid', () => {
    expect(
      fundNameForDisplay({
        firm_name: "Lux Capital",
        fund_name: "Lux Capital IX",
      }),
    ).toBe("Fund IX");
  });

  it("shows Pre-Seed, Seed, Series A stages for Lux Capital IX", () => {
    expect(
      stageFocusForDisplay({
        firm_name: "Lux Capital",
        fund_name: "Lux Capital IX",
        stage_focus: ["Growth"],
      }),
    ).toEqual(["Pre-Seed", "Seed", "Series A"]);
  });

  it("shows curated themes for Lux Capital IX", () => {
    expect(
      sectorFocusForDisplay({
        firm_name: "Lux Capital",
        fund_name: "Lux Capital IX",
        sector_focus: ["AI"],
      }),
    ).toEqual(["Defense", "Biotech", "Frontier Science", "Transportation", "Robotics", "AI/ML", "Data"]);
  });

  it("uses $7B firm AUM when RPC omits aum", () => {
    expect(formatFundSizeUsd(freshCapitalFirmAumUsd({ firm_name: "Lux Capital", firm_aum_usd: null }))).toBe("$7.0B");
  });
});

describe("Firm AUM display overrides", () => {
  it("uses curated $1.2B for Gradient Ventures when firm_aum_usd is null", () => {
    expect(
      freshCapitalFirmAumUsd({ firm_name: "Gradient Ventures", firm_aum_usd: null }),
    ).toBe(1_200_000_000);
    expect(formatFundSizeUsd(1_200_000_000)).toBe("$1.2B");
  });
});

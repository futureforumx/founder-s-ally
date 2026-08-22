import { describe, expect, it } from "vitest";
import {
  applyLatestFundingTableFilters,
  buildDedupedRoundChoices,
  buildDedupedSectorChoices,
  filterLatestFundingRows,
  formatUsdCompact,
  latestFundingFiltersAreDefault,
  matchesFundingSearch,
  normalizeSectorLabel,
  parseAmountLabelToUsd,
  parseCustomAmountInput,
  roundKindStageBucket,
  sectorLabelsForDisplay,
  titleCaseSectorLabel,
} from "@/lib/latestFundingFilters";
import type { FreshCapitalStageFilter } from "@/lib/freshCapitalPublic";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";

function row(partial: Partial<RecentFundingRound> & Pick<RecentFundingRound, "roundKind" | "sector">): RecentFundingRound {
  return {
    id: "x",
    companyName: "Co",
    websiteUrl: "",
    sector: partial.sector,
    roundKind: partial.roundKind,
    amountLabel: "—",
    announcedAt: "2026-01-01",
    leadInvestor: "Lead",
    coInvestors: [],
    sourceUrl: "https://example.com/a",
    ...partial,
  };
}

describe("roundKindStageBucket", () => {
  it("maps Series A", () => {
    expect(roundKindStageBucket("Series A")).toBe("series_a");
    expect(roundKindStageBucket("series a extension")).toBe("series_a");
  });

  it("maps Series B+ to growth without matching venture debt", () => {
    expect(roundKindStageBucket("Series B")).toBe("growth");
    expect(roundKindStageBucket("Series Z")).toBe("growth");
    expect(roundKindStageBucket("Venture debt")).toBe("other");
  });

  it("maps standalone Venture / venture round to growth", () => {
    expect(roundKindStageBucket("Venture")).toBe("growth");
    expect(roundKindStageBucket("Venture round")).toBe("growth");
  });

  it("does not treat bare corporate as growth", () => {
    expect(roundKindStageBucket("Corporate")).toBe("other");
    expect(roundKindStageBucket("Corporate venture")).toBe("growth");
    expect(roundKindStageBucket("CVC")).toBe("growth");
  });

  it("maps seed ladder", () => {
    expect(roundKindStageBucket("Pre-seed")).toBe("seed");
    expect(roundKindStageBucket("Seed")).toBe("seed");
    expect(roundKindStageBucket("Seed extension")).toBe("seed");
    expect(roundKindStageBucket("Seed+")).toBe("seed");
  });

  it("maps angel and IPO-style labels", () => {
    expect(roundKindStageBucket("Angel")).toBe("seed");
    expect(roundKindStageBucket("IPO")).toBe("growth");
    expect(roundKindStageBucket("Initial public offering")).toBe("growth");
  });

  it("maps common ingest labels that used to sit in other", () => {
    expect(roundKindStageBucket("SAFE")).toBe("seed");
    expect(roundKindStageBucket("Convertible note")).toBe("seed");
    expect(roundKindStageBucket("Bridge round")).toBe("seed");
    expect(roundKindStageBucket("Secondary")).toBe("growth");
    expect(roundKindStageBucket("Follow-on")).toBe("growth");
  });
});

describe("normalizeSectorLabel", () => {
  it("aligns slash spacing for matching", () => {
    expect(normalizeSectorLabel("AI/ML")).toBe(normalizeSectorLabel("AI / ML"));
    expect(normalizeSectorLabel("  Fintech  ")).toBe("fintech");
  });
});

describe("filterLatestFundingRows sector", () => {
  it("matches case-insensitive and collapses whitespace", () => {
    const rows = [
      row({ roundKind: "Seed", sector: "DevTools", id: "1" }),
      row({ roundKind: "Seed", sector: "devtools", id: "2" }),
      row({ roundKind: "Seed", sector: "AI / ML", id: "3" }),
    ];
    const r = filterLatestFundingRows(rows, "all", "devtools");
    expect(r.map((x) => x.id).sort()).toEqual(["1", "2"]);
  });

  it("matches sector filter to clustered canonicals (AI vs AI / ML vs artificial intelligence)", () => {
    const rows = [
      row({ roundKind: "Seed", sector: "AI", id: "1" }),
      row({ roundKind: "Seed", sector: "artificial intelligence", id: "2" }),
      row({ roundKind: "Seed", sector: "Fintech", id: "3" }),
    ];
    const forAi = filterLatestFundingRows(rows, "all", "AI / ML");
    expect(new Set(forAi.map((x) => x.id))).toEqual(new Set(["1", "2"]));
  });

  it("matches any value in a multi-sector deal label", () => {
    const rows = [
      row({ roundKind: "Seed", sector: "AI / ML, Healthcare", id: "1" }),
      row({ roundKind: "Seed", sector: "Fintech", id: "2" }),
    ];
    expect(filterLatestFundingRows(rows, "all", "Healthcare").map((x) => x.id)).toEqual(["1"]);
    expect(filterLatestFundingRows(rows, "all", "AI").map((x) => x.id)).toEqual(["1"]);
  });
});

describe("buildDedupedSectorChoices", () => {
  it("merges near-duplicate labels and returns sorted uniques", () => {
    const out = buildDedupedSectorChoices([
      "AI",
      "ai / ml",
      "Artificial Intelligence",
      "DevTools",
      "developer tools",
      "Fintech",
    ]);
    expect(out).toEqual(["AI", "Developer Tools", "Fintech"].sort((a, b) => a.localeCompare(b)));
  });

  it("splits multi-sector labels before deduping", () => {
    const out = buildDedupedSectorChoices(["AI, Healthcare", "Artificial Intelligence; Fintech"]);
    expect(out).toEqual(["AI", "Fintech", "Healthcare"].sort((a, b) => a.localeCompare(b)));
  });
});

describe("titleCaseSectorLabel", () => {
  it("capitalizes the first letter of each word and keeps known acronyms", () => {
    expect(titleCaseSectorLabel("developer tools")).toBe("Developer Tools");
    expect(titleCaseSectorLabel("FINTECH")).toBe("Fintech");
    expect(titleCaseSectorLabel("enterprise saas")).toBe("Enterprise SaaS");
    expect(titleCaseSectorLabel("ai/ml")).toBe("AI / ML");
    expect(titleCaseSectorLabel("b2b")).toBe("B2B");
  });
});

describe("sectorLabelsForDisplay", () => {
  it("returns display pills for multi-sector strings", () => {
    expect(sectorLabelsForDisplay("AI, artificial intelligence, Health Care")).toEqual(["AI", "Healthcare"]);
  });

  it("maps similar sector names onto one canonical label", () => {
    expect(sectorLabelsForDisplay("artificial intelligence")).toEqual(["AI"]);
    expect(sectorLabelsForDisplay("machine learning")).toEqual(["AI"]);
    expect(sectorLabelsForDisplay("AI / ML")).toEqual(["AI"]);
    expect(sectorLabelsForDisplay("financial technology")).toEqual(["Fintech"]);
    expect(sectorLabelsForDisplay("cyber security")).toEqual(["Cybersecurity"]);
  });

  it("title-cases unmapped sector words", () => {
    expect(sectorLabelsForDisplay("enterprise saas")).toEqual(["Enterprise SaaS"]);
    expect(sectorLabelsForDisplay("CLIMATE / energy")).toEqual(["Climate / Energy"]);
    expect(sectorLabelsForDisplay("e-commerce")).toEqual(["E-Commerce"]);
  });
});

describe("filterLatestFundingRows stage", () => {
  const stages: FreshCapitalStageFilter[] = ["seed", "series_a", "growth"];
  it("filters seed tab", () => {
    const rows = [
      row({ roundKind: "Angel", id: "a" }),
      row({ roundKind: "Seed", id: "s" }),
      row({ roundKind: "Series A", id: "A" }),
    ];
    const r = filterLatestFundingRows(rows, "seed", null);
    expect(new Set(r.map((x) => x.id))).toEqual(new Set(["a", "s"]));
  });

  it.each(stages)("never drops everything when stage is %s if rows match bucket", (stage) => {
    const rows = [
      row({ roundKind: stage === "seed" ? "Seed" : stage === "series_a" ? "Series A" : "Series C", id: "m" }),
    ];
    expect(filterLatestFundingRows(rows, stage, null)).toHaveLength(1);
  });
});

describe("parseAmountLabelToUsd", () => {
  it("parses compact money labels", () => {
    expect(parseAmountLabelToUsd("$45M")).toBe(45_000_000);
    expect(parseAmountLabelToUsd("$8.4M")).toBe(8_400_000);
    expect(parseAmountLabelToUsd("$500K")).toBe(500_000);
    expect(parseAmountLabelToUsd("$1.2B")).toBe(1_200_000_000);
    expect(parseAmountLabelToUsd("—")).toBeNull();
  });
});

describe("formatUsdCompact", () => {
  it("renders compact USD", () => {
    expect(formatUsdCompact(45_000_000)).toBe("$45M");
    expect(formatUsdCompact(8_400_000)).toBe("$8.4M");
  });
});

describe("applyLatestFundingTableFilters", () => {
  const rows = [
    row({ id: "a", roundKind: "Seed", sector: "Fintech", amountLabel: "$6M", announcedAt: "2026-01-01", leadInvestor: "Index Ventures", companyName: "Acme Pay" }),
    row({ id: "b", roundKind: "Series A", sector: "AI / ML", amountLabel: "$45M", announcedAt: "2026-03-01", leadInvestor: "Sequoia", companyName: "Northstar" }),
    row({ id: "c", roundKind: "Series B", sector: "Healthcare", amountLabel: "$80M", announcedAt: "2026-02-01", leadInvestor: "a16z", companyName: "Helix" }),
    row({ id: "d", roundKind: "Seed", sector: "Fintech", amountLabel: "—", announcedAt: "2026-04-01", leadInvestor: "Lightspeed", companyName: "Ledgerly" }),
    row({ id: "e", roundKind: "Seed", sector: "Crypto", amountLabel: "$2M", announcedAt: "2026-01-15", leadInvestor: "Variant", companyName: "Coinly" }),
    row({ id: "f", roundKind: "Growth", sector: "Fintech", amountLabel: "$150M", announcedAt: "2026-01-20", leadInvestor: "Thrive", companyName: "Atlas" }),
  ];
  const base = {
    query: "",
    sectors: [] as string[],
    rounds: [] as string[],
    amountPreset: "all" as const,
    customMinUsd: null as number | null,
    customMaxUsd: null as number | null,
    dateSort: "newest" as const,
  };

  it("defaults to latest-first date sort", () => {
    expect(latestFundingFiltersAreDefault(base)).toBe(true);
    expect(applyLatestFundingTableFilters(rows, base).map((r) => r.id)[0]).toBe("d");
  });

  it("keeps any of several selected sectors", () => {
    const out = applyLatestFundingTableFilters(rows, { ...base, sectors: ["Fintech", "Healthcare"] });
    expect(out.map((r) => r.id).sort()).toEqual(["a", "c", "d", "f"]);
  });

  it("keeps any of several selected rounds", () => {
    const out = applyLatestFundingTableFilters(rows, { ...base, rounds: ["Seed", "Series A"] });
    expect(out.map((r) => r.id).sort()).toEqual(["a", "b", "d", "e"]);
  });

  it("applies amount presets and hides undisclosed unless All Amounts", () => {
    expect(applyLatestFundingTableFilters(rows, { ...base, amountPreset: "under_5m" }).map((r) => r.id)).toEqual(["e"]);
    expect(applyLatestFundingTableFilters(rows, { ...base, amountPreset: "5m_20m" }).map((r) => r.id)).toEqual(["a"]);
    expect(applyLatestFundingTableFilters(rows, { ...base, amountPreset: "20m_100m" }).map((r) => r.id).sort()).toEqual(["b", "c"]);
    expect(applyLatestFundingTableFilters(rows, { ...base, amountPreset: "100m_plus" }).map((r) => r.id)).toEqual(["f"]);
    expect(applyLatestFundingTableFilters(rows, base).map((r) => r.id)).toContain("d");
  });

  it("applies custom min/max in millions", () => {
    expect(parseCustomAmountInput("40")).toBe(40_000_000);
    expect(parseCustomAmountInput("$8.4M")).toBe(8_400_000);
    const out = applyLatestFundingTableFilters(rows, {
      ...base,
      amountPreset: "custom",
      customMinUsd: parseCustomAmountInput("40"),
      customMaxUsd: parseCustomAmountInput("100"),
    });
    expect(out.map((r) => r.id).sort()).toEqual(["b", "c"]);
  });

  it("filters by company or investor search", () => {
    expect(matchesFundingSearch(rows[0], "acme")).toBe(true);
    expect(applyLatestFundingTableFilters(rows, { ...base, query: "sequoia" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyLatestFundingTableFilters(rows, { ...base, query: "fintech" }).map((r) => r.id).sort()).toEqual(["a", "d", "f"]);
  });

  it("sorts announced dates latest or earliest first", () => {
    expect(applyLatestFundingTableFilters(rows, base).map((r) => r.id)).toEqual(["d", "b", "c", "f", "e", "a"]);
    expect(applyLatestFundingTableFilters(rows, { ...base, dateSort: "oldest" }).map((r) => r.id)).toEqual([
      "a",
      "e",
      "f",
      "c",
      "b",
      "d",
    ]);
  });

  it("builds round choices from formatted labels", () => {
    expect(buildDedupedRoundChoices(rows)).toEqual(["Growth", "Seed", "Series A", "Series B"]);
  });
});


import { describe, expect, it } from "vitest";
import {
  buildDedupedSectorChoices,
  filterLatestFundingRows,
  normalizeSectorLabel,
  roundKindStageBucket,
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
    expect(out).toEqual(["AI / ML", "DevTools", "Fintech"].sort((a, b) => a.localeCompare(b)));
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

import { describe, expect, it } from "vitest";
import {
  compareDirectoryEntriesByBestFit,
  computeFirmProfileMatchScoreFromProfile,
  stableDirectoryMatchScore,
} from "@/lib/investorBestFit";

describe("investorBestFit", () => {
  it("prefers an explicit match score over the name fallback", () => {
    expect(stableDirectoryMatchScore("Acme Ventures", 91)).toBe(91);
    expect(computeFirmProfileMatchScoreFromProfile("AI", "Seed", { name: "Acme", _matchScore: 88 })).toBe(88);
  });

  it("scores sector and stage overlap above a name-only fallback", () => {
    const matched = computeFirmProfileMatchScoreFromProfile("AI", "Seed", {
      name: "Zed Capital",
      _sectors: ["AI"],
      _stages: ["Seed"],
    });
    const unmatched = computeFirmProfileMatchScoreFromProfile("AI", "Seed", {
      name: "Zed Capital",
      _sectors: ["Healthcare"],
      _stages: ["Growth"],
    });
    expect(matched).toBeGreaterThan(unmatched);
  });

  it("sorts higher match scores first for best fit", () => {
    const rows = [
      { name: ".406 Ventures", _matchScore: 60 },
      { name: ".The Aventures", _matchScore: 79 },
    ];
    const sorted = [...rows].sort((a, b) => compareDirectoryEntriesByBestFit(a, b));
    expect(sorted.map((row) => row.name)).toEqual([".The Aventures", ".406 Ventures"]);
  });
});

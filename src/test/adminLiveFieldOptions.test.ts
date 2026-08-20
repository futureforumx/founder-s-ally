import { describe, expect, it } from "vitest";
import {
  formatAdminLiveFieldDisplay,
  parseAdminLiveFieldValue,
  recommendAdminLiveField,
} from "@/lib/adminLiveFieldOptions";

describe("admin live field options", () => {
  it("parses score bands and custom numbers", () => {
    expect(parseAdminLiveFieldValue("responsiveness_score", "80")).toEqual({ ok: true, value: 80 });
    expect(parseAdminLiveFieldValue("reputation_score", "")).toEqual({ ok: true, value: null });
    expect(parseAdminLiveFieldValue("reputation_score", "high")).toEqual({ ok: false });
    expect(formatAdminLiveFieldDisplay("responsiveness_score", 80)).toBe("80 — Strong");
  });

  it("maps typed classification aliases to enum values", () => {
    expect(parseAdminLiveFieldValue("sector_classification", "sector focused")).toEqual({
      ok: true,
      value: "sector_focused",
    });
    expect(parseAdminLiveFieldValue("sector_classification", "Generalist")).toEqual({
      ok: true,
      value: "generalist",
    });
    expect(formatAdminLiveFieldDisplay("sector_classification", "multi_sector")).toBe("Multi-sector");
  });

  it("recommends sector classification from thesis verticals", () => {
    expect(
      recommendAdminLiveField("sector_classification", {
        thesis_verticals: ["Climate"],
        description: "We invest exclusively in climate infrastructure.",
      }),
    ).toMatchObject({ value: "sector_focused" });

    expect(
      recommendAdminLiveField("sector_classification", {
        thesis_verticals: ["Fintech", "Health", "Climate", "Consumer", "Devtools", "Crypto", "Edtech"],
        description: "Sector-agnostic early stage fund.",
      }),
    ).toMatchObject({ value: "generalist" });
  });

  it("recommends reputation from sibling scores", () => {
    expect(
      recommendAdminLiveField("reputation_score", {
        founder_reputation_score: 80,
        industry_reputation: 90,
      }),
    ).toEqual({ value: "85", reason: "Based on founder reputation score and industry reputation" });
  });
});

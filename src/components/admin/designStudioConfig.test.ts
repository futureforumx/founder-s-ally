import { describe, expect, it } from "vitest";
import { DESIGN_STUDIO_DEFAULTS, safeIconName, validateDesignStudioConfig } from "./designStudioConfig";

describe("Design Studio configuration", () => {
  it("accepts the seeded editable configuration", () => {
    expect(validateDesignStudioConfig(DESIGN_STUDIO_DEFAULTS)).toBe(true);
  });

  it("accepts safe token and preset changes", () => {
    const next = structuredClone(DESIGN_STUDIO_DEFAULTS);
    next.foundations.colors["--background"] = "#171717";
    next.visualizations[0] = { ...next.visualizations[0], color: "#3355ff", showLegend: true };
    expect(validateDesignStudioConfig(next)).toBe(true);
  });

  it("rejects invalid colors, arbitrary component types, and executable icon values", () => {
    const badColor = structuredClone(DESIGN_STUDIO_DEFAULTS);
    badColor.foundations.colors["--background"] = "url(javascript:alert(1))";
    expect(validateDesignStudioConfig(badColor)).toBe(false);

    const badComponent = structuredClone(DESIGN_STUDIO_DEFAULTS);
    badComponent.componentPresets[0].component = "custom" as "button";
    expect(validateDesignStudioConfig(badComponent)).toBe(false);

    const badIcon = structuredClone(DESIGN_STUDIO_DEFAULTS);
    badIcon.icons.mappings["actions.search"] = "<script>";
    expect(validateDesignStudioConfig(badIcon)).toBe(false);
  });

  it("falls back to an approved icon when a mapping is missing or invalid", () => {
    expect(safeIconName(undefined)).toBe("Sparkles");
    expect(safeIconName("<script>")).toBe("Sparkles");
    expect(safeIconName("Search")).toBe("Search");
  });
});

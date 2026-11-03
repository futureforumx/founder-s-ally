import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG, filterComponentCatalog, PATTERN_CATALOG } from "./designSystemCatalog";

describe("design system catalog", () => {
  it("registers unique component preview groups with source locations", () => {
    const ids = COMPONENT_CATALOG.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(COMPONENT_CATALOG.every((entry) => entry.name && entry.description && entry.source)).toBe(true);
  });

  it("filters component previews by name, variant, and source", () => {
    expect(filterComponentCatalog("switch").map((entry) => entry.id)).toContain("form-controls");
    expect(filterComponentCatalog("dialog").map((entry) => entry.id)).toContain("dialog");
    expect(filterComponentCatalog("AdminIntelligence.tsx").map((entry) => entry.id)).toContain("navigation");
    expect(filterComponentCatalog("no matching component")).toEqual([]);
  });

  it("documents only patterns with an identified in-app source", () => {
    expect(PATTERN_CATALOG.length).toBeGreaterThan(0);
    expect(PATTERN_CATALOG.every((entry) => entry.name && entry.description && entry.source.startsWith("src/"))).toBe(true);
  });
});

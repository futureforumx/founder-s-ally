import { describe, expect, it } from "vitest";
import {
  filterTools,
  getAlternatives,
  getFeaturedTools,
  getToolBySlug,
  getToolsByCategory,
} from "@/features/tools/lib/tools";

describe("tools directory helpers", () => {
  it("looks up tools by slug", () => {
    const tool = getToolBySlug("cline");
    expect(tool?.name).toBe("Cline");
  });

  it("filters by category and search text", () => {
    const results = filterTools({ category: "AI Agents", search: "coding" });
    expect(results.some((tool) => tool.slug === "cline")).toBe(true);
    expect(results.every((tool) => tool.category === "AI Agents")).toBe(true);
  });

  it("returns startup tools for the startup tools category", () => {
    const results = getToolsByCategory("Startup Tools");
    expect(results.some((tool) => tool.slug === "github")).toBe(true);
  });

  it("resolves alternatives against known tools when available", () => {
    const cline = getToolBySlug("cline");
    expect(cline).toBeTruthy();
    const alternatives = getAlternatives(cline!);
    expect(alternatives.some((tool) => tool.slug === "cursor")).toBe(true);
  });

  it("has featured entries for the main library", () => {
    expect(getFeaturedTools().length).toBeGreaterThan(0);
  });
});

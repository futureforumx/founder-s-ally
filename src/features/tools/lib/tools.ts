import { tools } from "@/features/tools/data/tools";
import type { Tool, ToolCategory, ToolFaqItem, ToolFilterState } from "@/features/tools/types";

export const TOOL_CATEGORY_SLUGS: Record<ToolCategory, string> = {
  "AI Agents": "ai-agents",
  "AI Models": "ai-models",
  "AI Skills": "ai-skills",
  "Startup Tools": "startup-tools",
};

export const TOOL_CATEGORY_INTROS: Record<ToolCategory, { title: string; description: string; meta: string }> = {
  "AI Agents": {
    title: "AI Agents Directory",
    description:
      "Explore AI agents for browsing, coding, automation, research, and founder workflows. Compare emerging agent products, categories, and related tools in one place.",
    meta: "Browse AI agents for automation, coding, research, and startup workflows in Vekta's curated directory.",
  },
  "AI Models": {
    title: "AI Models Directory",
    description:
      "Compare large language models, reasoning models, coding models, open-source models, and multimodal model families used across modern startups.",
    meta: "Explore AI models including LLMs, coding models, reasoning models, and open-source model families.",
  },
  "AI Skills": {
    title: "AI Skills Directory",
    description:
      "Browse practical AI skills such as web browsing, code execution, PDF analysis, image generation, and SEO content workflows for teams building with AI.",
    meta: "Discover AI skills for research, productivity, content, coding, automation, and data workflows.",
  },
  "Startup Tools": {
    title: "Startup Tools Directory",
    description:
      "Find startup software across developer tools, design tools, marketing, analytics, finance, legal, recruiting, automation, and founder operations.",
    meta: "Browse startup tools across engineering, design, growth, analytics, finance, legal, recruiting, and operations.",
  },
};

export const DEFAULT_TOOL_FILTERS: ToolFilterState = {
  search: "",
  category: "All",
  subcategory: "All",
  pricing: "All",
  freeTier: "all",
  skillLevel: "All",
  useCase: "All",
  openSource: "all",
  mobileApp: "all",
};

export function getAllTools(): Tool[] {
  return [...tools];
}

export function getToolBySlug(slug: string): Tool | undefined {
  return tools.find((tool) => tool.slug === slug);
}

export function getToolsByCategory(category: ToolCategory): Tool[] {
  return tools.filter((tool) => tool.category === category);
}

export function getToolsBySubcategory(subcategory: string): Tool[] {
  return tools.filter((tool) => tool.subcategory.toLowerCase() === subcategory.toLowerCase());
}

export function getFeaturedTools(): Tool[] {
  return tools.filter((tool) => tool.featured);
}

export function getTrendingTools(): Tool[] {
  return tools.filter((tool) => tool.trending);
}

function matchesBooleanFilter(
  value: boolean | null,
  filter: "all" | "yes" | "no" | "unknown",
) {
  if (filter === "all") return true;
  if (filter === "unknown") return value === null;
  if (filter === "yes") return value === true;
  return value === false;
}

export function filterTools(filters: Partial<ToolFilterState>, source: Tool[] = tools): Tool[] {
  const merged = { ...DEFAULT_TOOL_FILTERS, ...filters };
  const search = merged.search.trim().toLowerCase();

  return source.filter((tool) => {
    if (merged.category !== "All" && tool.category !== merged.category) return false;
    if (merged.subcategory !== "All" && tool.subcategory !== merged.subcategory) return false;
    if (merged.pricing !== "All" && tool.pricing !== merged.pricing) return false;
    if (merged.skillLevel !== "All" && tool.skillLevel !== merged.skillLevel) return false;
    if (merged.useCase !== "All") {
      const haystack = [...tool.useCases, ...tool.bestFor, ...tool.tags].map((value) => value.toLowerCase());
      if (!haystack.some((value) => value.includes(merged.useCase.toLowerCase()))) return false;
    }
    if (!matchesBooleanFilter(tool.freeTier, merged.freeTier)) return false;
    if (!matchesBooleanFilter(tool.openSource, merged.openSource)) return false;
    if (!matchesBooleanFilter(tool.mobileApp, merged.mobileApp)) return false;
    if (!search) return true;

    const text = [
      tool.name,
      tool.category,
      tool.subcategory,
      tool.type,
      tool.shortDescription,
      tool.description,
      ...tool.bestFor,
      ...tool.useCases,
      ...tool.tags,
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(search);
  });
}

export function getRelatedTools(tool: Tool, limit = 4): Tool[] {
  const altSet = new Set(tool.alternatives.map((value) => value.toLowerCase()));
  return tools
    .filter((candidate) => candidate.slug !== tool.slug)
    .map((candidate) => {
      let score = 0;
      if (candidate.category === tool.category) score += 5;
      if (candidate.subcategory === tool.subcategory) score += 4;
      if (candidate.featured) score += 1;
      if (candidate.trending) score += 1;
      if (altSet.has(candidate.name.toLowerCase())) score += 3;

      const sharedTags = candidate.tags.filter((tag) => tool.tags.includes(tag)).length;
      score += sharedTags * 2;

      const sharedUseCases = candidate.useCases.filter((useCase) => tool.useCases.includes(useCase)).length;
      score += sharedUseCases;

      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function getAlternatives(tool: Tool): Tool[] {
  const targets = new Set(tool.alternatives.map((value) => value.toLowerCase()));
  return tools.filter((candidate) => targets.has(candidate.name.toLowerCase()));
}

export function getCategoryFromSlug(slug: string): ToolCategory | null {
  return (Object.entries(TOOL_CATEGORY_SLUGS).find(([, value]) => value === slug)?.[0] as ToolCategory | undefined) ?? null;
}

export function getCategoryHref(category: ToolCategory): string {
  return `/tools/${TOOL_CATEGORY_SLUGS[category]}`;
}

export function titleCaseBoolean(value: boolean | null, truthy: string, falsy: string, unknown: string) {
  if (value === true) return truthy;
  if (value === false) return falsy;
  return unknown;
}

export function uniqueValues(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function getFilterOptions(source: Tool[] = tools) {
  return {
    subcategories: uniqueValues(source.map((tool) => tool.subcategory)),
    pricing: uniqueValues(source.map((tool) => tool.pricing)),
    useCases: uniqueValues(source.flatMap((tool) => [...tool.useCases, ...tool.bestFor, ...tool.tags])),
  };
}

export function getRecentlyAddedTools(limit = 8): Tool[] {
  return tools.slice(-limit).reverse();
}

export function getPopularCategoryStats() {
  return Object.entries(
    tools.reduce<Record<string, number>>((acc, tool) => {
      acc[tool.subcategory] = (acc[tool.subcategory] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([subcategory, count]) => ({ subcategory, count }));
}

export function buildToolFaq(tool: Tool): ToolFaqItem[] {
  return [
    {
      question: `What is ${tool.name} best for?`,
      answer: `${tool.name} is best for ${tool.bestFor.join(", ").toLowerCase()}.`,
    },
    {
      question: `Does ${tool.name} have a free tier or open-source option?`,
      answer: `${tool.name} lists free tier status as ${titleCaseBoolean(tool.freeTier, "available", "not available", "unknown")} and open-source status as ${titleCaseBoolean(tool.openSource, "open source", "closed source", "unknown")}.`,
    },
    {
      question: `How should startups evaluate ${tool.name}?`,
      answer: `Teams should compare ${tool.name} by category fit, workflow coverage, pricing model, required skill level, and how well it supports use cases like ${tool.useCases.slice(0, 3).join(", ").toLowerCase()}.`,
    },
  ];
}

export function buildCategoryFaq(category: ToolCategory): ToolFaqItem[] {
  const label = category.toLowerCase();
  return [
    {
      question: `What belongs in the ${category} category?`,
      answer: `This section covers tools in the ${label} category and groups them by subcategory so founders can compare products by workflow and buyer intent.`,
    },
    {
      question: `How should I compare ${label}?`,
      answer: `Compare tools by use case, required skill level, pricing model, whether a free tier exists, and how closely each product matches your team workflow.`,
    },
    {
      question: `Why does Vekta organize ${label} into subcategories?`,
      answer: `Subcategories make the directory more useful for search and faster for buyers who want to narrow from a broad category into a specific job to be done.`,
    },
  ];
}

export type DesignStudioConfig = {
  foundations: { colors: Record<string, string>; radius: string; spacing: string; density: "comfortable" | "compact"; fontFamily: string };
  icons: { library: "lucide"; size: number; strokeWidth: number; color: string; mappings: Record<string, string> };
  componentPresets: Array<{ id: string; name: string; component: "button" | "badge" | "card"; variant: string; size: string; radius: string; padding: string }>;
  visualizations: Array<{ id: string; name: string; type: "line" | "bar" | "area" | "pie" | "donut" | "kpi"; title: string; color: string; showGrid: boolean; showLegend: boolean; xAxisKey: "name" | "value" | "secondary"; yAxisKey: "value" | "secondary"; xAxisLabel: string; yAxisLabel: string; showTooltip: boolean; showLabels: boolean }>;
  patterns: Array<{ id: string; name: string; template: "page-header" | "search-filters" | "metric-grid" | "empty-state"; density: "comfortable" | "compact" }>;
  motion: { durationMs: number; easing: "ease" | "ease-in-out" | "linear"; intensity: "subtle" | "standard" | "reduced"; reducedMotion: boolean };
};

export const DESIGN_STUDIO_DEFAULTS: DesignStudioConfig = {
  foundations: {
    colors: { "--background": "#0a0a0a", "--foreground": "#fafafa", "--card": "#111111", "--primary": "#fafafa", "--primary-foreground": "#090909", "--muted-foreground": "#a1a1aa", "--border": "#292929", "--success": "#29e3a6", "--warning": "#f4bf50", "--destructive": "#ef4444", "--info": "#60a5fa" },
    radius: "12px", spacing: "16px", density: "comfortable", fontFamily: "Geist",
  },
  icons: { library: "lucide", size: 16, strokeWidth: 2, color: "--muted-foreground", mappings: { "navigation.investors": "Users", "navigation.companies": "Building2", "actions.search": "Search", "actions.track": "Bookmark", "actions.download": "Download", "status.success": "CircleCheck", "status.warning": "TriangleAlert" } },
  componentPresets: [
    { id: "button.primary", name: "Primary button", component: "button", variant: "default", size: "default", radius: "md", padding: "default" },
    { id: "button.secondary", name: "Secondary button", component: "button", variant: "secondary", size: "default", radius: "md", padding: "default" },
    { id: "badge.success", name: "Success badge", component: "badge", variant: "success", size: "default", radius: "md", padding: "default" },
    { id: "card.metric", name: "Metric card", component: "card", variant: "default", size: "default", radius: "lg", padding: "comfortable" },
  ],
  visualizations: [
    { id: "investor-fit-distribution", name: "Investor fit distribution", type: "bar", title: "Investor fit score", color: "#29e3a6", showGrid: true, showLegend: false, xAxisKey: "name", yAxisKey: "value", xAxisLabel: "Month", yAxisLabel: "Score", showTooltip: true, showLabels: false },
    { id: "fundraising-activity", name: "Fundraising activity", type: "area", title: "Funding activity", color: "#8b72f8", showGrid: true, showLegend: true, xAxisKey: "name", yAxisKey: "value", xAxisLabel: "Month", yAxisLabel: "Activity", showTooltip: true, showLabels: false },
  ],
  patterns: [
    { id: "page-header", name: "Page header", template: "page-header", density: "comfortable" },
    { id: "search-filters", name: "Search and filters", template: "search-filters", density: "comfortable" },
    { id: "metric-grid", name: "Metric dashboard", template: "metric-grid", density: "comfortable" },
    { id: "empty-state", name: "Empty state", template: "empty-state", density: "comfortable" },
  ],
  motion: { durationMs: 200, easing: "ease-in-out", intensity: "standard", reducedMotion: true },
};

const colorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const iconNames = new Set(["Activity", "ArrowDownToLine", "ArrowRight", "Bookmark", "Building2", "ChartNoAxesCombined", "Check", "CircleCheck", "Clock3", "Download", "Eye", "Globe", "HeartHandshake", "Layers3", "Lightbulb", "Search", "Settings2", "Sparkles", "TriangleAlert", "Users", "Wallet"]);
const safe = (value: unknown, max = 300) => typeof value === "string" && value.length <= max && !/[<>;]/.test(value);

export function validateDesignStudioConfig(input: unknown): input is DesignStudioConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const config = input as Partial<DesignStudioConfig>;
  if (!config.foundations || !config.icons || !Array.isArray(config.componentPresets) || !Array.isArray(config.visualizations) || !Array.isArray(config.patterns) || !config.motion) return false;
  const foundations = config.foundations;
  if (!foundations.colors || typeof foundations.colors !== "object" || Object.keys(foundations.colors).length > 40 || Object.entries(foundations.colors).some(([key, value]) => !/^--[a-z0-9-]{1,48}$/.test(key) || typeof value !== "string" || !colorPattern.test(value))) return false;
  if (!/^\d+(?:\.\d+)?(?:px|rem)$/.test(foundations.radius ?? "") || !/^\d+(?:\.\d+)?(?:px|rem)$/.test(foundations.spacing ?? "") || !["comfortable", "compact"].includes(foundations.density ?? "") || !["Geist", "Inter", "system-ui"].includes(foundations.fontFamily ?? "")) return false;
  if (config.icons.library !== "lucide" || !Number.isFinite(config.icons.size) || config.icons.size! < 12 || config.icons.size! > 40 || !Number.isFinite(config.icons.strokeWidth) || config.icons.strokeWidth! < 1 || config.icons.strokeWidth! > 3 || !safe(config.icons.color, 48) || Object.entries(config.icons.mappings ?? {}).some(([key, value]) => !/^[a-z.]{3,48}$/.test(key) || typeof value !== "string" || !iconNames.has(value))) return false;
  const uniqueIds = (items: Array<{ id: string }>) => items.every((item) => !!item && typeof item.id === "string") && new Set(items.map((item) => item.id)).size === items.length;
  if (config.componentPresets.length > 100 || !uniqueIds(config.componentPresets) || config.componentPresets.some((item) => !item || !/^[a-z0-9][a-z0-9._-]{1,80}$/.test(item.id) || !safe(item.name, 80) || !["button", "badge", "card"].includes(item.component) || !["default", "secondary", "outline", "ghost", "destructive", "success", "warning"].includes(item.variant) || !["default", "sm", "lg"].includes(item.size) || !["sm", "md", "lg", "full"].includes(item.radius) || !["default", "compact", "comfortable"].includes(item.padding))) return false;
  if (config.visualizations.length > 100 || !uniqueIds(config.visualizations) || config.visualizations.some((item) => !/^[a-z0-9][a-z0-9._-]{1,80}$/.test(item.id) || !safe(item.name, 80) || !["line", "bar", "area", "pie", "donut", "kpi"].includes(item.type) || !safe(item.title, 100) || typeof item.color !== "string" || !colorPattern.test(item.color) || typeof item.showGrid !== "boolean" || typeof item.showLegend !== "boolean" || !["name", "value", "secondary"].includes(item.xAxisKey) || !["value", "secondary"].includes(item.yAxisKey) || !safe(item.xAxisLabel, 60) || !safe(item.yAxisLabel, 60) || typeof item.showTooltip !== "boolean" || typeof item.showLabels !== "boolean")) return false;
  if (config.patterns.length > 100 || !uniqueIds(config.patterns) || config.patterns.some((item) => !/^[a-z0-9][a-z0-9._-]{1,80}$/.test(item.id) || !safe(item.name, 80) || !["page-header", "search-filters", "metric-grid", "empty-state"].includes(item.template) || !["comfortable", "compact"].includes(item.density))) return false;
  const motion = config.motion;
  return Number.isInteger(motion.durationMs) && motion.durationMs >= 0 && motion.durationMs <= 2000 && ["ease", "ease-in-out", "linear"].includes(motion.easing) && ["subtle", "standard", "reduced"].includes(motion.intensity) && typeof motion.reducedMotion === "boolean";
}

export function safeIconName(name: string | undefined, fallback = "Sparkles") {
  return name && iconNames.has(name) ? name : fallback;
}

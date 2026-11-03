export interface DesignSystemCatalogEntry {
  id: string;
  name: string;
  description: string;
  variants: string;
  source: string;
}

export const COMPONENT_CATALOG: DesignSystemCatalogEntry[] = [
  { id: "button", name: "Button", description: "Actions with shared size, focus, and disabled behavior.", variants: "default · secondary · outline · ghost · destructive · link", source: "src/components/ui/button.tsx" },
  { id: "badge", name: "Badge", description: "Compact status and category labels.", variants: "default · success · warning · destructive · accent · muted · outline", source: "src/components/ui/badge.tsx" },
  { id: "card", name: "Card", description: "A bordered surface with shared header, content, and footer primitives.", variants: "Card · CardHeader · CardContent · CardFooter", source: "src/components/ui/card.tsx" },
  { id: "form-controls", name: "Form controls", description: "Text fields and selection controls for user input.", variants: "Input · Select · Textarea · Checkbox · Switch · RadioGroup", source: "src/components/ui/input.tsx and related primitives" },
  { id: "tabs", name: "Tabs", description: "Keyboard-navigable views within a page or panel.", variants: "Tabs · TabsList · TabsTrigger · TabsContent", source: "src/components/ui/tabs.tsx" },
  { id: "table", name: "Table", description: "Structured rows and columns for dense records.", variants: "Table · TableHeader · TableBody · TableRow · TableHead · TableCell", source: "src/components/ui/table.tsx" },
  { id: "dropdown", name: "Dropdown menu", description: "A keyboard-accessible menu anchored to an action.", variants: "DropdownMenu · Trigger · Content · Item", source: "src/components/ui/dropdown-menu.tsx" },
  { id: "dialog", name: "Dialog", description: "A modal surface for a focused task or confirmation.", variants: "Dialog · Header · Title · Description · Footer", source: "src/components/ui/dialog.tsx" },
  { id: "tooltip", name: "Tooltip", description: "Short contextual help for an icon or control.", variants: "TooltipProvider · Trigger · Content", source: "src/components/ui/tooltip.tsx" },
  { id: "progress", name: "Progress", description: "A labeled measure of completion or capacity.", variants: "Progress value 0–100", source: "src/components/ui/progress.tsx" },
  { id: "skeleton", name: "Skeleton", description: "A placeholder that preserves layout while content loads.", variants: "Skeleton", source: "src/components/ui/skeleton.tsx" },
  { id: "navigation", name: "Navigation", description: "The existing Admin Console navigation item and active state.", variants: "Admin sidebar item", source: "src/pages/AdminIntelligence.tsx" },
  { id: "loading", name: "Loading indicator", description: "The shared loading treatment used during app work.", variants: "BouncingDots", source: "src/components/loading-ui/bouncing-dots.tsx" },
];

export interface DesignPatternEntry {
  name: string;
  description: string;
  source: string;
}

export const PATTERN_CATALOG: DesignPatternEntry[] = [
  { name: "Page header", description: "A sticky title and control area that can collapse as content scrolls.", source: "src/components/admin/AdminStickyHeader.tsx" },
  { name: "Dashboard metrics", description: "A compact row of values for a quick system overview.", source: "src/components/admin/AdminOverview.tsx" },
  { name: "Search and filters", description: "Search and filter controls grouped above a record list.", source: "src/components/admin/AdminReviews.tsx" },
  { name: "Data table with actions", description: "Records with status and row-level actions.", source: "src/components/admin/AdminReviews.tsx" },
  { name: "Detail dialog", description: "A focused overlay for inspecting or editing one record.", source: "src/components/admin/AdminLiveRecordDialog.tsx" },
  { name: "Loading and empty states", description: "Clear feedback while data loads or when no results match.", source: "src/components/admin/AdminOnboarding.tsx" },
];

export const filterComponentCatalog = (query: string) => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return COMPONENT_CATALOG;
  return COMPONENT_CATALOG.filter((entry) =>
    `${entry.name} ${entry.description} ${entry.variants} ${entry.source}`.toLocaleLowerCase().includes(normalized),
  );
};

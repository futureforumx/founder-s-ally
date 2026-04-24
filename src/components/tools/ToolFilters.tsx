import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { ToolCategory, ToolFilterState, ToolSkillLevel } from "@/features/tools/types";

const CATEGORY_OPTIONS: Array<ToolCategory | "All"> = ["All", "AI Agents", "AI Models", "AI Skills", "Startup Tools"];
const SKILL_OPTIONS: Array<ToolSkillLevel | "All"> = ["All", "No-code", "Low-code", "Technical", "Mixed", "Unknown"];
const BOOLEAN_OPTIONS = [
  { value: "all", label: "All" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
] as const;

export function ToolFilters({
  value,
  onChange,
  options,
  hideCategory = false,
}: {
  value: ToolFilterState;
  onChange: (next: ToolFilterState) => void;
  options: { subcategories: string[]; pricing: string[]; useCases: string[] };
  hideCategory?: boolean;
}) {
  return (
    <Card className="rounded-[1.75rem] border-border/70 bg-white/85 shadow-sm">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <div>
            <div className="font-medium text-foreground">Search and filter</div>
            <div className="text-xs text-muted-foreground">Narrow the directory by workflow, pricing, and tool type.</div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <label className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value.search}
              onChange={(event) => onChange({ ...value, search: event.target.value })}
              placeholder="Search tools, categories, use cases"
              className="pl-9"
            />
          </label>

          {!hideCategory ? (
            <Select value={value.category} onValueChange={(category) => onChange({ ...value, category: category as ToolFilterState["category"] })}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select value={value.subcategory} onValueChange={(subcategory) => onChange({ ...value, subcategory })}>
            <SelectTrigger>
              <SelectValue placeholder="Subcategory" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All subcategories</SelectItem>
              {options.subcategories.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={value.pricing} onValueChange={(pricing) => onChange({ ...value, pricing })}>
            <SelectTrigger>
              <SelectValue placeholder="Pricing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All pricing</SelectItem>
              {options.pricing.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={value.freeTier} onValueChange={(freeTier) => onChange({ ...value, freeTier: freeTier as ToolFilterState["freeTier"] })}>
            <SelectTrigger>
              <SelectValue placeholder="Free tier" />
            </SelectTrigger>
            <SelectContent>
              {BOOLEAN_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{`Free tier: ${option.label}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={value.skillLevel} onValueChange={(skillLevel) => onChange({ ...value, skillLevel: skillLevel as ToolFilterState["skillLevel"] })}>
            <SelectTrigger>
              <SelectValue placeholder="Skill level" />
            </SelectTrigger>
            <SelectContent>
              {SKILL_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={value.useCase} onValueChange={(useCase) => onChange({ ...value, useCase })}>
            <SelectTrigger>
              <SelectValue placeholder="Use case" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All use cases</SelectItem>
              {options.useCases.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={value.openSource} onValueChange={(openSource) => onChange({ ...value, openSource: openSource as ToolFilterState["openSource"] })}>
            <SelectTrigger>
              <SelectValue placeholder="Open source" />
            </SelectTrigger>
            <SelectContent>
              {BOOLEAN_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{`Open source: ${option.label}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={value.mobileApp} onValueChange={(mobileApp) => onChange({ ...value, mobileApp: mobileApp as ToolFilterState["mobileApp"] })}>
            <SelectTrigger>
              <SelectValue placeholder="Mobile app" />
            </SelectTrigger>
            <SelectContent>
              {BOOLEAN_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{`Mobile app: ${option.label}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

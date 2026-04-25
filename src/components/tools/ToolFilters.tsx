import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ToolCategory, ToolFilterState, ToolSkillLevel } from "@/features/tools/types";

const CATEGORY_OPTIONS: Array<ToolCategory | "All"> = ["All", "AI Agents", "AI Models", "AI Skills", "Startup Tools"];
const SKILL_OPTIONS: Array<ToolSkillLevel | "All"> = ["All", "No-code", "Low-code", "Technical", "Mixed", "Unknown"];
const BOOLEAN_OPTIONS = [
  { value: "all", label: "All" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
] as const;

const CATEGORY_STYLES: Record<ToolCategory | "All", {
  default: string;
  hover: string;
  active: string;
}> = {
  "All": {
    default: "border-white/[0.08] bg-white/[0.03] text-white/40",
    hover: "hover:border-white/20 hover:bg-white/[0.07] hover:text-white/75",
    active: "border-white/25 bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
  },
  "AI Agents": {
    default: "border-white/[0.08] bg-white/[0.03] text-white/40",
    hover: "hover:border-[#5B5CFF]/35 hover:bg-[#5B5CFF]/10 hover:text-[#8788FF]",
    active: "border-[#5B5CFF]/45 bg-[#5B5CFF]/15 text-[#8788FF] shadow-[0_0_0_1px_rgba(91,92,255,0.18),0_2px_12px_rgba(91,92,255,0.14)]",
  },
  "AI Models": {
    default: "border-white/[0.08] bg-white/[0.03] text-white/40",
    hover: "hover:border-blue-500/35 hover:bg-blue-500/10 hover:text-blue-400",
    active: "border-blue-500/45 bg-blue-500/15 text-blue-400 shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_2px_12px_rgba(59,130,246,0.14)]",
  },
  "AI Skills": {
    default: "border-white/[0.08] bg-white/[0.03] text-white/40",
    hover: "hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-400",
    active: "border-emerald-500/45 bg-emerald-500/15 text-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_2px_12px_rgba(16,185,129,0.14)]",
  },
  "Startup Tools": {
    default: "border-white/[0.08] bg-white/[0.03] text-white/40",
    hover: "hover:border-slate-400/30 hover:bg-slate-400/10 hover:text-slate-300",
    active: "border-slate-400/35 bg-slate-400/12 text-slate-300 shadow-[0_0_0_1px_rgba(148,163,184,0.15)]",
  },
};

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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-[#5B5CFF]" />
        <div>
          <div className="font-manrope text-sm font-semibold text-white/80">Search and filter</div>
          <div className="text-xs text-white/35">Narrow the directory by workflow, pricing, and tool type.</div>
        </div>
      </div>

      {/* Category pills */}
      {!hideCategory ? (
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((cat) => {
            const isActive = value.category === cat;
            const styles = CATEGORY_STYLES[cat];
            return (
              <button
                key={cat}
                onClick={() => onChange({ ...value, category: cat as ToolFilterState["category"] })}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-4 text-xs font-semibold tracking-wide transition-all duration-150 hover:-translate-y-px",
                  isActive ? styles.active : cn(styles.default, styles.hover),
                )}
              >
                {cat === "All" ? "All categories" : cat}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Search + dropdowns */}
      <div className="grid gap-3 lg:grid-cols-4">
        <label className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            value={value.search}
            onChange={(event) => onChange({ ...value, search: event.target.value })}
            placeholder="Search tools, categories, use cases"
            className="border-white/[0.08] bg-white/[0.04] pl-9 text-white placeholder:text-white/30 focus:border-[#5B5CFF]/40 focus:ring-[#5B5CFF]/20"
          />
        </label>

        <Select value={value.subcategory} onValueChange={(subcategory) => onChange({ ...value, subcategory })}>
          <SelectTrigger className="border-white/[0.08] bg-white/[0.04] text-white/60">
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
          <SelectTrigger className="border-white/[0.08] bg-white/[0.04] text-white/60">
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
          <SelectTrigger className="border-white/[0.08] bg-white/[0.04] text-white/60">
            <SelectValue placeholder="Free tier" />
          </SelectTrigger>
          <SelectContent>
            {BOOLEAN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{`Free tier: ${option.label}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.skillLevel} onValueChange={(skillLevel) => onChange({ ...value, skillLevel: skillLevel as ToolFilterState["skillLevel"] })}>
          <SelectTrigger className="border-white/[0.08] bg-white/[0.04] text-white/60">
            <SelectValue placeholder="Skill level" />
          </SelectTrigger>
          <SelectContent>
            {SKILL_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.useCase} onValueChange={(useCase) => onChange({ ...value, useCase })}>
          <SelectTrigger className="border-white/[0.08] bg-white/[0.04] text-white/60">
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
          <SelectTrigger className="border-white/[0.08] bg-white/[0.04] text-white/60">
            <SelectValue placeholder="Open source" />
          </SelectTrigger>
          <SelectContent>
            {BOOLEAN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{`Open source: ${option.label}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.mobileApp} onValueChange={(mobileApp) => onChange({ ...value, mobileApp: mobileApp as ToolFilterState["mobileApp"] })}>
          <SelectTrigger className="border-white/[0.08] bg-white/[0.04] text-white/60">
            <SelectValue placeholder="Mobile app" />
          </SelectTrigger>
          <SelectContent>
            {BOOLEAN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{`Mobile app: ${option.label}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

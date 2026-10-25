import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
};

export const filterTriggerClass =
  "h-9 w-auto gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-sm shadow-none transition-colors hover:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-700 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-700 focus-visible:ring-offset-0 [&>svg]:hidden";

export function FilterSelect({
  label,
  icon: Icon,
  value,
  options,
  onValueChange,
  className,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  options: readonly FilterOption[];
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "All";

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={`${label}: ${selectedLabel}`} className={cn(filterTriggerClass, className)}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
        <span className="whitespace-nowrap font-normal text-neutral-500">{label}:</span>
        <span className="whitespace-nowrap font-medium text-neutral-200">{selectedLabel}</span>
        <span className="ml-1 inline-flex shrink-0" aria-hidden>
          <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

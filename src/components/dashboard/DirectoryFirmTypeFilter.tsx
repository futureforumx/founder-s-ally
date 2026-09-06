import { Building2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DIRECTORY_FIRM_TYPE_FILTERS,
  directoryFirmTypeTriggerLabel,
  type DirectoryFirmTypeFilterId,
} from "@/lib/directoryFirmType";
import { cn } from "@/lib/utils";

export function DirectoryFirmTypeFilter({
  selected,
  onChange,
  className,
}: {
  selected: readonly DirectoryFirmTypeFilterId[];
  onChange: (next: DirectoryFirmTypeFilterId[]) => void;
  className?: string;
}) {
  const label = directoryFirmTypeTriggerLabel(selected);
  const hasSelection = selected.length > 0;

  const toggle = (id: DirectoryFirmTypeFilterId) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={hasSelection ? `Firm type filter, ${label}` : "Filter by firm type"}
          className={cn(
            "flex h-8 w-[min(100%,11.5rem)] shrink-0 items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-2.5 text-left text-[11px] font-medium shadow-sm",
            "text-foreground hover:bg-muted/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "sm:w-[11.5rem]",
            className,
          )}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[14rem] max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))]"
      >
        {DIRECTORY_FIRM_TYPE_FILTERS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={selected.includes(option.id)}
            onCheckedChange={() => toggle(option.id)}
            onSelect={(event) => event.preventDefault()}
            className="text-xs"
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!hasSelection}
          onSelect={() => onChange([])}
          className="text-xs text-muted-foreground"
        >
          Clear firm types
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

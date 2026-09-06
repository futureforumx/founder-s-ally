import { Building2, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

/** Keep in sync with the `max-h` on the menu content below. */
const MENU_MAX_HEIGHT_PX = 352;
const MENU_EDGE_GAP_PX = 16;
/** Cap on how long we wait for a smooth scroll to settle before opening anyway. */
const SCROLL_SETTLE_TIMEOUT_MS = 500;

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pendingOpenRef = useRef<(() => void) | null>(null);

  const cancelPendingOpen = useCallback(() => {
    pendingOpenRef.current?.();
    pendingOpenRef.current = null;
  }, []);

  useEffect(() => cancelPendingOpen, [cancelPendingOpen]);

  const toggle = (id: DirectoryFirmTypeFilterId) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  /**
   * The menu is pinned below the trigger, so when the toolbar sits near the bottom of the
   * viewport we scroll room in first and open once that settles. Opening mid-scroll instead
   * makes the menu rubber-band as its available height grows frame by frame.
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      cancelPendingOpen();
      if (!next) {
        setOpen(false);
        return;
      }

      const trigger = triggerRef.current;
      if (!trigger) {
        setOpen(true);
        return;
      }

      const spaceBelow = window.innerHeight - trigger.getBoundingClientRect().bottom;
      if (spaceBelow >= MENU_MAX_HEIGHT_PX + MENU_EDGE_GAP_PX) {
        setOpen(true);
        return;
      }

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      trigger.scrollIntoView({ block: "center", behavior: reduceMotion ? "instant" : "smooth" });
      if (reduceMotion) {
        setOpen(true);
        return;
      }

      // `scrollend` can come from an inner scroll container, so listen in the capture phase.
      const openNow = () => {
        cleanup();
        setOpen(true);
      };
      const timer = window.setTimeout(openNow, SCROLL_SETTLE_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timer);
        document.removeEventListener("scrollend", openNow, true);
        pendingOpenRef.current = null;
      };
      document.addEventListener("scrollend", openNow, true);
      pendingOpenRef.current = cleanup;
    },
    [cancelPendingOpen],
  );

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
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
        side="bottom"
        sideOffset={6}
        // Toolbar sits low on short viewports; flipping the checklist above the trigger hid the results it filters.
        avoidCollisions={false}
        collisionPadding={8}
        className="min-w-[14rem] max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto"
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

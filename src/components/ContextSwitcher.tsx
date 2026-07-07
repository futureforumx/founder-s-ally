import { ChevronsUpDown } from "lucide-react";
import { useActiveContext } from "@/context/ActiveContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ContextSwitcherProps = {
  collapsed?: boolean;
};

export function ContextSwitcher({ collapsed = false }: ContextSwitcherProps) {
  const { activeContextKind, availableContexts, setActiveContext, isLoading } = useActiveContext();

  const triggerLabel = activeContextKind === "personal" ? "Personal" : "Company";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoading}
          className={cn(
            "h-8 border-sidebar-border/50 bg-sidebar-accent/20 text-sidebar-foreground hover:bg-sidebar-accent/40",
            collapsed ? "w-full justify-center px-0" : "w-full justify-between gap-1 px-2",
          )}
          aria-label="Switch workspace context"
        >
          {!collapsed && (
            <span className="min-w-0 truncate text-left text-[10px] font-medium uppercase tracking-wide">
              {isLoading ? "…" : triggerLabel}
            </span>
          )}
          <ChevronsUpDown className={cn("h-3.5 w-3.5 shrink-0 opacity-70", collapsed && "mx-auto")} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" side="right">
        <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
          Profile
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableContexts.map((c) => (
          <DropdownMenuItem
            key={c.ownerContextId}
            className="text-xs"
            onClick={() => setActiveContext(c.ownerContextId)}
          >
            <span className="font-medium">{c.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

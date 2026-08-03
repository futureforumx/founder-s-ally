import { ChevronsUpDown } from "lucide-react";
import { useActiveContext } from "@/context/ActiveContext";
import { useAuth } from "@/hooks/useAuth";
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

function initialsFor(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

export function ContextSwitcher({ collapsed = false }: ContextSwitcherProps) {
  const { activeContextKind, availableContexts, setActiveContext, isLoading } = useActiveContext();
  const { user } = useAuth();

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaName =
    typeof metadata.full_name === "string" ? metadata.full_name :
    typeof metadata.name === "string" ? metadata.name :
    "";
  const displayName = metaName.trim() || user?.email?.split("@")[0] || "Account";
  const subtitle = activeContextKind === "personal" ? "Personal" : "Company";
  const initials = initialsFor(displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isLoading}
          aria-label="Switch workspace context"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent/40",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[11px] font-semibold text-primary">
            {isLoading ? "…" : initials}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-medium text-sidebar-foreground">
                {isLoading ? "Loading…" : displayName}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/55">{subtitle}</span>
            </span>
          )}
          {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/45" aria-hidden />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" side="right">
        <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
          Switch context
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

import { useActiveContextOptional } from "@/context/ActiveContext";
import { cn } from "@/lib/utils";

type ConnectorContextBannerProps = {
  className?: string;
};

/**
 * Shows which owner/workspace context connector actions apply to.
 */
export function ConnectorContextBanner({ className }: ConnectorContextBannerProps) {
  const ctx = useActiveContextOptional();
  const label = ctx?.activeContextLabel ?? "Personal";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span className="font-medium text-foreground">Installing for:</span>{" "}
      {ctx?.activeContextKind === "personal" ? "Personal" : label}
    </div>
  );
}

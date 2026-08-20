import { Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AdminEditButton({
  onClick,
  className,
  label = "Edit record",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            aria-label={label}
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:border-border hover:text-foreground",
              className,
            )}
          >
            <Pencil className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] bg-popover/95 p-2 backdrop-blur-md">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Admin</span> — edit live record fields.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

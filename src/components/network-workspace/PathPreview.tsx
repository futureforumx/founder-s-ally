import { ChevronRight } from "lucide-react";
import type { IntroPath } from "./types";
import { cn } from "@/lib/utils";

export function PathPreview({ path: introPath, className }: { path: IntroPath; className?: string }) {
  const labels = introPath.hops.map((h) => h.displayName);
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-0.5 text-[11px] font-medium text-foreground/90", className)}>
      {labels.map((label, i) => (
        <span key={`${introPath.id}-${i}`} className="flex min-w-0 items-center gap-0.5">
          {i > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden /> : null}
          <span className="max-w-[7.5rem] truncate">{label}</span>
        </span>
      ))}
    </div>
  );
}

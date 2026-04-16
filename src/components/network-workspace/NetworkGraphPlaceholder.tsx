import { cn } from "@/lib/utils";

/** Lightweight graph preview — replace with graph library + API-backed layout when backend is ready. */
export function NetworkGraphPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-muted/30 to-card/80",
        "min-h-[280px]",
        className,
      )}
    >
      <svg className="absolute inset-0 h-full w-full text-border/60" aria-hidden>
        <line x1="18%" y1="72%" x2="42%" y2="38%" stroke="currentColor" strokeWidth="1" />
        <line x1="42%" y1="38%" x2="68%" y2="52%" stroke="currentColor" strokeWidth="1" />
        <line x1="68%" y1="52%" x2="88%" y2="28%" stroke="currentColor" strokeWidth="1" />
        <line x1="42%" y1="38%" x2="58%" y2="22%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
      </svg>
      <div className="relative flex h-full flex-col p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Graph preview</p>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          Exploratory view only. Lists, path scoring, and intro workflow remain the primary experience.
        </p>
        <div className="pointer-events-none absolute left-[12%] top-[62%] flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/95 text-[10px] font-bold shadow-sm">
          You
        </div>
        <div className="pointer-events-none absolute left-[38%] top-[30%] flex h-10 w-10 items-center justify-center rounded-full border border-violet-500/35 bg-violet-500/10 text-[9px] font-semibold text-foreground">
          A
        </div>
        <div className="pointer-events-none absolute left-[62%] top-[44%] flex h-10 w-10 items-center justify-center rounded-full border border-sky-500/35 bg-sky-500/10 text-[9px] font-semibold text-foreground">
          B
        </div>
        <div className="pointer-events-none absolute right-[8%] top-[18%] flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/10 text-[9px] font-semibold text-foreground">
          T
        </div>
      </div>
    </div>
  );
}

import type { TrendingStartupRow } from "@/lib/trendingStartups/types";
import { cn } from "@/lib/utils";

export function CatalystTeardown({ row, className }: { row: TrendingStartupRow; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI catalyst teardown</h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{row.catalyst}</p>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Market drivers</h3>
          <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
            {row.teardown.marketDrivers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tech stack</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.teardown.techStack.map((item) => (
              <span key={item} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Competitor matrix</h3>
          <ul className="mt-2 space-y-2">
            {row.teardown.competitors.map((item) => (
              <li key={item.name} className="text-[13px] leading-relaxed">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="text-muted-foreground"> · {item.overlap}</span>
                <p className="text-[12px] text-muted-foreground">{item.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

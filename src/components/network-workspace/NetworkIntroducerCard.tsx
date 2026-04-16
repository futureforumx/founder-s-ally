import type { IntroducerProfile } from "./types";

const catLabel: Record<string, string> = {
  investor: "Investors",
  founder: "Founders",
  operator: "Operators",
  customer: "Customers",
  advisor: "Advisors",
  other: "Other",
};

export function NetworkIntroducerCard({ introducer }: { introducer: IntroducerProfile }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{introducer.fullName}</p>
          <p className="text-[11px] text-muted-foreground">
            {introducer.role} · {introducer.firmName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reachable</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{introducer.reachableTargetCount}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{introducer.recentActivitySummary}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {introducer.strongestCategories.map((c) => (
          <span key={c} className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground/90">
            {catLabel[c] ?? c}
          </span>
        ))}
      </div>
      <div className="mt-3 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
        Intro effectiveness{" "}
        <span className="font-mono font-semibold text-foreground/90">
          {introducer.introEffectivenessScore != null ? `${introducer.introEffectivenessScore}/100` : "—"}
        </span>
        <span className="text-muted-foreground/70"> (placeholder)</span>
      </div>
    </div>
  );
}

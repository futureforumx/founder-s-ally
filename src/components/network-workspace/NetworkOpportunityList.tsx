import { motion } from "framer-motion";
import type { ReachablePerson } from "./types";
import { PathPreview } from "./PathPreview";
import { cn } from "@/lib/utils";
import { nwTransition } from "./networkMotion";

const catLabel: Record<ReachablePerson["category"], string> = {
  investor: "Investor",
  founder: "Founder",
  operator: "Operator",
  customer: "Customer",
  advisor: "Advisor",
  other: "Other",
};

const hopLabel: Record<ReachablePerson["hop"], string> = {
  direct: "1-hop",
  "2-hop": "2-hop",
  "3-hop": "3-hop",
};

function EvidenceChips({ tags }: { tags: string[] }) {
  const show = tags.slice(0, 3);
  if (!show.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {show.map((t) => (
        <span
          key={t}
          className="max-w-[10rem] truncate rounded border border-border/45 bg-muted/25 px-1.5 py-0.5 text-[9px] font-medium text-foreground/80"
          title={t}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function NetworkOpportunityList({
  people,
  selectedId,
  onSelect,
  loading,
}: {
  people: ReachablePerson[];
  selectedId: string | null;
  onSelect: (p: ReachablePerson) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-px rounded-lg border border-border/40 bg-muted/10 p-px" aria-busy="true" aria-label="Loading opportunities">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-[6px] bg-background px-3 py-2.5">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-muted/60" />
            <div className="min-w-0 flex-1 space-y-2 py-0.5">
              <div className="h-3.5 w-[40%] max-w-[180px] animate-pulse rounded bg-muted/60" />
              <div className="h-2.5 w-[55%] max-w-[240px] animate-pulse rounded bg-muted/50" />
              <div className="h-2 w-full max-w-[320px] animate-pulse rounded bg-muted/40" />
            </div>
            <div className="hidden w-14 shrink-0 flex-col gap-1 sm:flex">
              <div className="h-2 w-full animate-pulse rounded bg-muted/50" />
              <div className="h-2 w-full animate-pulse rounded bg-muted/40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-px rounded-lg border border-border/40 bg-muted/10 p-px" role="listbox" aria-label="Relationship opportunities">
      {people.map((p, index) => {
        const selected = selectedId === p.id;
        const warmth = p.warmth ?? Math.round(p.bestPath.score * 0.85);
        const fit = p.fitRelevance;
        return (
          <motion.button
            key={p.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(p)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...nwTransition, delay: Math.min(index * 0.02, 0.14) }}
            whileTap={{ scale: 0.995 }}
            className={cn(
              "flex w-full min-w-0 gap-3 rounded-[6px] px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              selected
                ? "border-l-2 border-l-foreground bg-muted/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                : "border-l-2 border-l-transparent bg-background hover:bg-muted/20",
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums",
                selected ? "border-foreground/15 bg-muted/50 text-foreground" : "border-border/60 bg-muted/30 text-muted-foreground",
              )}
              aria-hidden
            >
              {p.fullName
                .split(/\s+/)
                .map((x) => x[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">{p.fullName}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {p.role} · {p.firmName}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="rounded border border-border/50 bg-muted/20 px-1 py-px text-[9px] text-foreground/75">{catLabel[p.category]}</span>
                <span className="tabular-nums">{hopLabel[p.hop]}</span>
              </div>
              <div className="mt-1.5 min-w-0 text-[11px] font-medium text-foreground/85">
                <PathPreview path={p.bestPath} />
              </div>
              <EvidenceChips tags={p.bestPath.reasonTags} />
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
              <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Path</span>
              <motion.span
                key={`${p.id}-${p.bestPath.score}`}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={nwTransition}
                className="text-[13px] font-semibold tabular-nums text-foreground"
              >
                {Math.round(p.bestPath.score)}
              </motion.span>
              <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Warmth</span>
              <span className="text-[12px] font-semibold tabular-nums text-foreground/90">{warmth}</span>
              {fit != null ? (
                <>
                  <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Fit</span>
                  <span className="text-[12px] font-semibold tabular-nums text-foreground/90">{fit}</span>
                </>
              ) : null}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

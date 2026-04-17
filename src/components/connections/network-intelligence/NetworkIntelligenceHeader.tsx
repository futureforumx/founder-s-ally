import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import type { NetworkIntelligenceHeaderModel } from "@/lib/networkIntelligenceViewModel";
import { NETWORK_INTELLIGENCE_COPY } from "@/lib/networkIntelligenceViewModel";

type Props = {
  model: NetworkIntelligenceHeaderModel;
};

export function NetworkIntelligenceHeader({ model }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/[0.04] p-5 shadow-sm"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Radar className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{NETWORK_INTELLIGENCE_COPY.headerTitle}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground max-w-xl leading-relaxed">{NETWORK_INTELLIGENCE_COPY.headerSubtitle}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-background/60 px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Score</p>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {model.scoreOutOf100}
                  <span className="text-sm font-medium text-muted-foreground"> / 100</span>
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground max-w-[200px] text-right">{NETWORK_INTELLIGENCE_COPY.accessProgressLabel}</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                initial={{ width: 0 }}
                animate={{ width: `${model.accessProgressPercent}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[min(100%,380px)] lg:shrink-0">
          {model.statChips.map((chip) => (
            <div
              key={chip.label}
              className="rounded-xl border border-border/80 bg-card/90 px-3 py-2.5 text-center sm:text-left"
            >
              <p className="text-lg font-bold tabular-nums text-foreground">{chip.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-snug">{chip.label}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import type { NetworkIntelligenceHeaderModel } from "@/lib/networkIntelligenceViewModel";
import { NETWORK_INTELLIGENCE_COPY } from "@/lib/networkIntelligenceViewModel";
import { cn } from "@/lib/utils";

type Props = {
  model: NetworkIntelligenceHeaderModel;
  /** Light neutral shell for integrations catalog page */
  tone?: "default" | "catalog";
};

export function NetworkIntelligenceHeader({ model, tone = "default" }: Props) {
  const catalog = tone === "catalog";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className={cn(
        "rounded-2xl border p-5 shadow-sm",
        catalog
          ? "border-[#e5e5ea] bg-white dark:border-border dark:bg-card"
          : "border-border bg-gradient-to-br from-card via-card to-accent/[0.04]",
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                catalog ? "border-[#e8e8ec] bg-[#f7f7f8] dark:border-border dark:bg-muted/40" : "border-primary/20 bg-primary/10",
              )}
            >
              <Radar className={cn("h-5 w-5", catalog ? "text-teal-600 dark:text-teal-400" : "text-primary")} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2
                className={cn(
                  "text-lg font-semibold tracking-tight",
                  catalog ? "text-[#1c1c1e] dark:text-foreground" : "text-foreground",
                )}
              >
                {NETWORK_INTELLIGENCE_COPY.headerTitle}
              </h2>
              <p
                className={cn(
                  "mt-0.5 max-w-xl text-xs leading-relaxed",
                  catalog ? "text-[#636366] dark:text-muted-foreground" : "text-muted-foreground",
                )}
              >
                {NETWORK_INTELLIGENCE_COPY.headerSubtitle}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "rounded-xl border px-4 py-3",
              catalog ? "border-[#ececef] bg-[#fafafa] dark:border-border dark:bg-muted/30" : "border-border/80 bg-background/60",
            )}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p
                  className={cn(
                    "text-[10px] font-mono uppercase tracking-wider",
                    catalog ? "text-[#8e8e93] dark:text-muted-foreground" : "text-muted-foreground",
                  )}
                >
                  Score
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    catalog ? "text-[#1c1c1e] dark:text-foreground" : "text-foreground",
                  )}
                >
                  {model.scoreOutOf100}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      catalog ? "text-[#8e8e93] dark:text-muted-foreground" : "text-muted-foreground",
                    )}
                  >
                    {" "}
                    / 100
                  </span>
                </p>
              </div>
              <p
                className={cn(
                  "max-w-[200px] text-right text-[10px]",
                  catalog ? "text-[#636366] dark:text-muted-foreground" : "text-muted-foreground",
                )}
              >
                {NETWORK_INTELLIGENCE_COPY.accessProgressLabel}
              </p>
            </div>
            <div className={cn("mt-2 h-2 w-full overflow-hidden rounded-full", catalog ? "bg-[#ececef] dark:bg-muted" : "bg-secondary")}>
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
              className={cn(
                "rounded-xl border px-3 py-2.5 text-center sm:text-left",
                catalog
                  ? "border-[#ececef] bg-[#fafafa] dark:border-border dark:bg-muted/30"
                  : "border-border/80 bg-card/90",
              )}
            >
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  catalog ? "text-[#1c1c1e] dark:text-foreground" : "text-foreground",
                )}
              >
                {chip.value}
              </p>
              <p
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide leading-snug",
                  catalog ? "text-[#8e8e93] dark:text-muted-foreground" : "text-muted-foreground",
                )}
              >
                {chip.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LiveOpportunityItem } from "@/lib/networkIntelligenceViewModel";
import { NETWORK_INTELLIGENCE_COPY } from "@/lib/networkIntelligenceViewModel";
import { requestAppNavigate } from "@/lib/appShellNavigate";
import { cn } from "@/lib/utils";

type Props = {
  opportunities: LiveOpportunityItem[];
  tone?: "default" | "catalog";
};

export function LiveOpportunitiesPanel({ opportunities, tone = "default" }: Props) {
  const catalog = tone === "catalog";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
      className={cn(
        "flex h-full min-h-[280px] flex-col rounded-2xl border p-4 shadow-sm",
        catalog
          ? "border-[#e5e5ea] bg-white dark:border-border dark:bg-card"
          : "border-accent/25 bg-gradient-to-b from-accent/[0.06] to-card",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className={cn("h-4 w-4", catalog ? "text-teal-600 dark:text-teal-400" : "text-accent")} aria-hidden />
        <h3
          className={cn(
            "text-sm font-semibold tracking-tight",
            catalog ? "text-[#1c1c1e] dark:text-foreground" : "text-foreground",
          )}
        >
          {NETWORK_INTELLIGENCE_COPY.liveOpportunitiesTitle}
        </h3>
      </div>

      {opportunities.length === 0 ? (
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center",
            catalog ? "border-[#dcdcdf] bg-[#fafafa] dark:border-border dark:bg-muted/20" : "border-border bg-muted/20",
          )}
        >
          <UserRound className="mb-2 h-8 w-8 text-muted-foreground/40" aria-hidden />
          <p className={cn("text-xs font-medium", catalog ? "text-[#1c1c1e] dark:text-foreground" : "text-foreground")}>
            No surfaced opportunities yet
          </p>
          <p className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-muted-foreground">
            Connect Gmail or LinkedIn to unlock intro paths. Real scoring will plug in here when the graph API ships.
          </p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
          {opportunities.map((opp) => (
            <li
              key={opp.id}
              className="rounded-xl border border-border/80 bg-card/95 p-3 shadow-sm"
            >
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent">{opp.headline}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{opp.targetLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Path: <span className="font-medium text-foreground">{opp.pathSummary}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Confidence: <span className="font-semibold tabular-nums text-foreground">{opp.confidencePercent}%</span>
              </p>
              <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                {opp.whyLines.map((line) => (
                  <li key={line} className="flex gap-1.5 text-[11px] text-muted-foreground leading-snug">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-8 rounded-lg text-xs font-semibold"
                  onClick={() => requestAppNavigate("connections")}
                >
                  Request Intro
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => requestAppNavigate("investor-search")}
                >
                  View Profile
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {opportunities.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-8 w-full text-xs text-muted-foreground hover:text-foreground"
          onClick={() => requestAppNavigate("connections")}
        >
          Find more intros
          <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
        </Button>
      ) : null}
    </motion.div>
  );
}

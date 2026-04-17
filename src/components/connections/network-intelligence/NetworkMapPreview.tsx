import { motion } from "framer-motion";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NETWORK_INTELLIGENCE_COPY } from "@/lib/networkIntelligenceViewModel";
import { requestAppNavigate } from "@/lib/appShellNavigate";

export function NetworkMapPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.12 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold text-foreground">{NETWORK_INTELLIGENCE_COPY.networkMapTitle}</h3>
          <p className="text-[11px] text-muted-foreground">{NETWORK_INTELLIGENCE_COPY.networkMapSubtitle}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-border/80 bg-muted/15 py-6 px-3">
        <span className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-foreground">You</span>
        <span className="text-muted-foreground/60 text-xs">—</span>
        <span className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-foreground">Sarah</span>
        <span className="text-muted-foreground/60 text-xs">—</span>
        <span className="rounded-lg border border-success/30 bg-success/10 px-2.5 py-1.5 text-[11px] font-medium text-foreground">Investor</span>
      </div>

      <p className="mt-3 text-center text-[10px] text-muted-foreground">Example path — full graph explorer opens in Connections.</p>

      <Button
        variant="secondary"
        size="sm"
        className="mt-3 w-full rounded-lg text-xs font-semibold"
        onClick={() => requestAppNavigate("network-workspace")}
      >
        Explore Network
      </Button>
    </motion.div>
  );
}

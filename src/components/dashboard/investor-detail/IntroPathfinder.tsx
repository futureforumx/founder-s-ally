import { useState } from "react";
import { Network, X, Mail, Upload, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface IntroPathfinderProps {
  investorName: string;
  firmName?: string;
}

export function IntroPathfinder({ investorName, firmName = "1855 Capital" }: IntroPathfinderProps) {
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <div className="space-y-4">
      {/* Ingestion Banner */}
      {bannerVisible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Network className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">Unlock your hidden network</p>
              <p className="text-xs text-muted-foreground">Sync your inbox or upload your LinkedIn CSV to reveal warm paths to this firm.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold bg-background border border-border hover:bg-secondary px-3 py-1.5 rounded-lg transition-colors">
              <Mail className="w-3.5 h-3.5" /> Sync Gmail
            </button>
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold bg-background border border-border hover:bg-secondary px-3 py-1.5 rounded-lg transition-colors">
              <Upload className="w-3.5 h-3.5" /> Upload CSV
            </button>
            <button
              onClick={() => setBannerVisible(false)}
              className="ml-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Best Path Card */}
      <div className="bg-card border-2 border-success/20 rounded-2xl p-6 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-success/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <p className="text-[10px] font-bold text-success uppercase tracking-wider mb-8 relative">Strongest Intro Path</p>

        {/* Subway Map */}
        <div className="flex items-center w-full relative px-4">
          {/* Node A — You */}
          <div className="flex flex-col items-center shrink-0 z-10">
            <div className="w-12 h-12 rounded-full border-2 border-border bg-secondary flex items-center justify-center text-sm font-bold text-muted-foreground">
              You
            </div>
            <span className="text-xs font-bold text-muted-foreground text-center mt-2">You</span>
          </div>

          {/* Line 1 */}
          <div className="flex-1 relative mx-2 min-w-[80px]">
            <div className="h-0.5 bg-success/30 w-full" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-card border border-success/20 text-success text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
              Strong (Email)
            </span>
          </div>

          {/* Node B — Mutual Connection */}
          <div className="flex flex-col items-center shrink-0 z-10">
            <div className="w-16 h-16 rounded-full border-4 border-success/20 bg-success/5 flex items-center justify-center text-lg font-bold text-foreground">
              SJ
            </div>
            <span className="text-sm font-bold text-foreground text-center mt-2">Sarah Jenkins</span>
            <span className="text-xs text-muted-foreground text-center">Angel Investor</span>
          </div>

          {/* Line 2 */}
          <div className="flex-1 relative mx-2 min-w-[80px]">
            <div className="h-0.5 bg-success/30 w-full" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-card border border-success/20 text-success text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
              Co-invested
            </span>
          </div>

          {/* Node C — Target VC */}
          <div className="flex flex-col items-center shrink-0 z-10">
            <div className="w-12 h-12 rounded-full border-2 border-primary/30 bg-primary/5 flex items-center justify-center text-sm font-bold text-primary">
              MM
            </div>
            <span className="text-xs font-bold text-foreground text-center mt-2">{investorName || "Mike March"}</span>
            <span className="text-[10px] text-muted-foreground text-center">{firmName}</span>
          </div>
        </div>

        {/* Action Footer */}
        <div className="mt-8 pt-4 border-t border-border/50 flex items-center justify-between relative">
          <p className="text-xs text-muted-foreground">
            You and Sarah have exchanged <span className="font-semibold text-foreground">14 emails</span> recently. High probability of response.
          </p>
          <button className="shrink-0 ml-4 bg-success text-success-foreground hover:bg-success/90 px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm inline-flex items-center gap-2">
            Draft Request to Sarah <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

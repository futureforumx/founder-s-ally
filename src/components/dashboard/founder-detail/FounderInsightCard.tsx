import { Sparkles, MessageSquare } from "lucide-react";
import type { FounderEntry } from "./types";

interface FounderInsightCardProps {
  founder: FounderEntry;
  displayCompany: string;
}

/**
 * A premium, Linear/Vercel-inspired insight card.
 * Prioritizes high-end typography, subtle depth, and calm accessibility.
 */
export function FounderInsightCard({ founder, displayCompany }: FounderInsightCardProps) {
  const city = founder.location?.split(",")[0] || "their region";
  
  return (
    <div className="relative group overflow-hidden rounded-xl border border-accent/15 bg-accent/[0.03] backdrop-blur-[2px] p-5 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.08)] hover:bg-accent/[0.05]">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 h-24 w-24 rounded-full bg-accent/5 blur-3xl" />
      
      <div className="flex gap-4 items-start relative z-10">
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 border border-accent/20 text-accent group-hover:scale-110 transition-transform duration-500">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <header className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-accent/80">
              AI Insight
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
              <span className="h-1 w-1 rounded-full bg-accent/40" />
              <span>Contextual Intelligence</span>
            </div>
          </header>

          <p className="text-[13.5px] leading-relaxed text-foreground/90 font-medium tracking-tight">
            <span className="text-foreground font-bold border-b border-accent/20 pb-px">{founder.name}</span> is navigating 
            challenges similar to <span className="text-foreground font-bold">{displayCompany}</span> from <strong>{city}</strong>. 
            Highlighting their <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded-md font-bold">{founder.stage}</span> trajectory 
            will likely accelerate rapport — shared context build trust fast.
          </p>

          <footer className="mt-4 flex items-center justify-between">
            <button className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors group/btn">
              <MessageSquare className="h-3 w-3" />
              <span>Use as icebreaker</span>
              <div className="h-px w-0 bg-accent/30 group-hover/btn:w-full transition-all duration-300" />
            </button>
            <span className="text-[10px] text-muted-foreground/40 font-mono italic">
              Confidence Score: 94%
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

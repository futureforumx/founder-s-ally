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
    <div className="relative group overflow-hidden rounded-xl border border-accent/15 bg-accent/[0.03] backdrop-blur-[2px] p-3.5 shadow-sm transition-all duration-300 hover:shadow-md hover:bg-accent/[0.05]">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 -mr-6 -mt-6 h-16 w-16 rounded-full bg-accent/5 blur-2xl" />
      
      <div className="flex gap-3 items-start relative z-10">
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 border border-accent/20 text-accent group-hover:scale-105 transition-transform duration-500">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <header className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-accent/80">
              AI Insight
            </span>
            <div className="flex items-center gap-1.5 text-[9px] font-light uppercase tracking-wider text-muted-foreground/60 border border-border/30 rounded px-1.5 py-0.5 bg-muted/10 leading-none">
              <span className="h-1 w-1 rounded-full bg-accent/40" />
              <span>Contextual Intelligence</span>
            </div>
          </header>

          <p className="text-[12.5px] leading-snug text-foreground/90 font-medium tracking-tight">
            <span className="text-foreground font-bold border-b border-accent/20 pb-px">{founder.name}</span> is navigating 
            challenges similar to <span className="text-foreground font-bold">{displayCompany}</span> from <strong>{city}</strong>. 
            Highlighting their <span className="bg-accent/10 text-accent px-1 py-0.5 rounded-md font-bold mx-0.5">{founder.stage}</span> trajectory 
            will likely accelerate rapport.
          </p>

          <footer className="mt-3 flex items-center justify-between">
            <button className="inline-flex items-center gap-1.5 text-[10px] font-bold text-accent hover:text-accent/80 transition-colors group/btn">
              <MessageSquare className="h-3 w-3" />
              <span>Use as icebreaker</span>
              <div className="h-px w-0 bg-accent/30 group-hover/btn:w-full transition-all duration-300" />
            </button>
            <div className="flex items-center gap-1.5 text-[10px] text-amber-500 font-mono font-bold italic">
              <Sparkles className="h-2.5 w-2.5 fill-current" />
              <span>Confidence Score: 94%</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

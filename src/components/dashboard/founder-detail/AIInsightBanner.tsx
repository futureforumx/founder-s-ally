import { Sparkles } from "lucide-react";
import type { FounderEntry } from "./types";

interface AIInsightBannerProps {
  founder: FounderEntry;
  displayCompany: string;
}

export function AIInsightBanner({ founder, displayCompany }: AIInsightBannerProps) {
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-3.5 shadow-[0_0_20px_-6px_hsl(var(--accent)/0.12)]">
      <div className="flex gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 text-accent mt-0.5" />
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-accent mb-1">AI Insight</p>
          <p className="text-xs text-foreground leading-relaxed">
            <strong>{founder.name}</strong> is solving a similar hurdle in{" "}
            <strong>{founder.location?.split(",")[0] || "their region"}</strong>.
            Mention their recent {founder.stage} progress when reaching out to{" "}
            {displayCompany} — shared context builds trust fast.
          </p>
        </div>
      </div>
    </div>
  );
}

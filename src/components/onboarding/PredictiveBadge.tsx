import { Sparkles } from "lucide-react";

export function PredictiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 border border-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent ml-1.5 whitespace-nowrap">
      <Sparkles className="h-2.5 w-2.5" />
      Predictive
    </span>
  );
}

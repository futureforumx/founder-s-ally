import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InsightIconProps {
  field: string;
  label?: string;
}

export function InsightIcon({ field, label }: InsightIconProps) {
  const scrollToStrategyRoom = () => {
    const el = document.getElementById("strategy-room");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); scrollToStrategyRoom(); }}
          className="inline-flex items-center justify-center h-4 w-4 rounded-full text-accent/60 hover:text-accent hover:bg-accent/10 transition-colors"
        >
          <Sparkles className="h-2.5 w-2.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px]">
        View {label || field} insights in Strategy Room
      </TooltipContent>
    </Tooltip>
  );
}

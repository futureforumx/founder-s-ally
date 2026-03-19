import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function PhosphorSparkle({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} fill="currentColor" stroke="none">
      <path d="M197.58,129.06l-51.61-19-19-51.65a4,4,0,0,0-7.5,0l-19,51.65-51.65,19a4,4,0,0,0,0,7.5l51.65,19,19,51.61a4,4,0,0,0,7.5,0l19-51.61,51.61-19a4,4,0,0,0,0-7.5Zm-54.08,20a4,4,0,0,0-2.47,2.47L128,185.09l-13-33.56a4,4,0,0,0-2.47-2.47L79,136l33.56-13a4,4,0,0,0,2.47-2.47L128,87l13,33.56a4,4,0,0,0,2.47,2.47L177.05,136ZM144,40a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12,4,4,0,0,1,4,4Zm4,4a12,12,0,0,1,12-12,4,4,0,0,1,0,8,4,4,0,0,0-4,4,4,4,0,0,1-8,0Zm-12,12a4,4,0,0,1,4,4,12,12,0,0,1-12,12,4,4,0,0,1,0-8,4,4,0,0,0,4-4A4,4,0,0,1,136,56Zm-8,0a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12A4,4,0,0,1,128,56ZM220,92a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12A4,4,0,0,1,220,92Zm4,4a12,12,0,0,1,12-12,4,4,0,0,1,0,8,4,4,0,0,0-4,4,4,4,0,0,1-8,0Zm-12,12a4,4,0,0,1,4,4,12,12,0,0,1-12,12,4,4,0,0,1,0-8,4,4,0,0,0,4-4A4,4,0,0,1,212,108Zm-8,0a4,4,0,0,1-4,4,4,4,0,0,0-4,4,4,4,0,0,1-8,0,12,12,0,0,1,12-12A4,4,0,0,1,204,108Z"/>
    </svg>
  );
}

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
          <PhosphorSparkle className="h-2.5 w-2.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px]">
        View {label || field} insights in Strategy Room
      </TooltipContent>
    </Tooltip>
  );
}

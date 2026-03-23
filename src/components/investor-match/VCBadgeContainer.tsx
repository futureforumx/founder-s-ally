import { Flame, Users, Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VCFirm {
  is_trending?: boolean;
  is_popular?: boolean;
  is_recent?: boolean;
}

interface BadgeDef {
  key: string;
  label: string;
  icon: typeof Flame;
  tooltip: string;
  colorClass: string;
  pulse?: boolean;
}

const BADGES: BadgeDef[] = [
  {
    key: "is_trending",
    label: "Trending",
    icon: Flame,
    tooltip: "Trending: High social media/news activity right now",
    colorClass: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    pulse: true,
  },
  {
    key: "is_popular",
    label: "Popular",
    icon: Users,
    tooltip: "Popular: Frequently saved and viewed by founders on the platform",
    colorClass: "bg-blue-600/15 text-blue-600 border-blue-600/30",
  },
  {
    key: "is_recent",
    label: "Recent",
    icon: Clock,
    tooltip: "Recent: Made a new investment or update in the last 30 days",
    colorClass: "bg-green-500/15 text-green-500 border-green-500/30",
  },
];

export function VCBadgeContainer({ vc_firm }: { vc_firm: VCFirm }) {
  const activeBadges = BADGES.filter(
    (b) => vc_firm[b.key as keyof VCFirm] === true
  );

  if (activeBadges.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {activeBadges.map((badge) => {
        const Icon = badge.icon;
        return (
          <TooltipProvider key={badge.key} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.colorClass} ${
                    badge.pulse ? "animate-pulse" : ""
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {badge.label}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-[220px] bg-popover/95 backdrop-blur-md p-2.5"
              >
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {badge.tooltip}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

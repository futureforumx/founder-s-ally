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
  key: keyof VCFirm;
  label: string;
  icon: typeof Flame;
  tooltip: string;
  colorClass: string;
  /** Icon-only row: no fill; colored icon only (full-width pills still use `colorClass`). */
  iconOnlyClass?: string;
  pulse?: boolean;
}

const BADGES: BadgeDef[] = [
  {
    key: "is_trending",
    label: "Trending",
    icon: Flame,
    tooltip: "Trending: High social media/news activity right now",
    colorClass: "bg-warning/10 text-warning border-warning/30",
    iconOnlyClass: "border-transparent bg-transparent text-warning",
    pulse: true,
  },
  {
    key: "is_popular",
    label: "Popular",
    icon: Users,
    tooltip: "Popular: Frequently saved and viewed by founders on the platform",
    colorClass: "bg-accent/10 text-accent border-accent/30",
    iconOnlyClass: "border-transparent bg-transparent text-accent",
    pulse: true,
  },
  {
    key: "is_recent",
    label: "Recent",
    icon: Clock,
    tooltip: "Recent: Made a new investment or update in the last 30 days",
    colorClass: "bg-success/10 text-success border-success/30",
  },
];

export function VCBadgeContainer({
  vc_firm,
  iconOnly = false,
}: {
  vc_firm: VCFirm;
  /** Compact icon buttons (no label text); tooltips unchanged. */
  iconOnly?: boolean;
}) {
  const activeBadges = BADGES.filter((badge) => vc_firm[badge.key] === true);

  if (activeBadges.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={
          iconOnly
            ? "flex flex-row flex-wrap items-center justify-end gap-0"
            : "flex flex-wrap items-center gap-1.5"
        }
      >
        {activeBadges.map((badge) => {
          const Icon = badge.icon;
          const iconOnlyVisual = badge.iconOnlyClass ?? badge.colorClass;
          return (
            <Tooltip key={badge.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={
                    iconOnly
                      ? `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${iconOnlyVisual} ${badge.pulse ? "animate-pulse" : ""}`
                      : `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.colorClass} ${badge.pulse ? "animate-pulse" : ""}`
                  }
                  aria-label={`${badge.label} badge`}
                >
                  <Icon className={iconOnly ? "h-3.5 w-3.5" : "h-3 w-3"} />
                  {!iconOnly ? badge.label : null}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-[220px] bg-popover/95 p-2.5 backdrop-blur-md"
              >
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {badge.tooltip}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

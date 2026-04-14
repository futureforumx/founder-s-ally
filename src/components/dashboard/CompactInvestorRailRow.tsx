import { Flame, Users, Clock } from "lucide-react";
import { FirmLogo } from "@/components/ui/firm-logo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, safeTrim } from "@/lib/utils";
import type { InvestorPreviewModel } from "./InvestorPreviewRow";
import { formatStageForDisplay } from "@/lib/stageUtils";

function stableMatchScore(name: string | null | undefined, explicit: number | null | undefined): number {
  if (explicit != null) return explicit;
  const s = String(name ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 60 + Math.abs(h % 21);
}

function compactMetaLine(model: InvestorPreviewModel): string {
  const stage = model.stage ? formatStageForDisplay(model.stage) : "";
  const loc = safeTrim(model.location);
  const parts = [safeTrim(model.sector), stage, loc].filter(Boolean);
  return parts.join(" · ");
}

function RailStatusSignal({
  model,
  onDeployingClick,
}: {
  model: InvestorPreviewModel;
  onDeployingClick?: () => void;
}) {
  const deploying = model._isActivelyDeploying !== false;
  if (deploying) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeployingClick?.();
              }}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-success transition-colors hover:bg-success/10"
              aria-label="Actively deploying"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-[11px]">
            Actively deploying — click for activity
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (model._isTrending === true) {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-warning" title="Trending">
        <Flame className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  }
  if (model._isPopular === true) {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-accent" title="Popular">
        <Users className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  }
  if (model._isRecent === true) {
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-success" title="Recent">
        <Clock className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  }
  return <span className="inline-block h-6 w-6 shrink-0" aria-hidden />;
}

/**
 * Single-line investor strip for Suggested/Trending rails — not the directory card layout.
 */
export function CompactInvestorRailRow({
  model,
  anchorVcFirmId,
  onClick,
  onDeployingClick,
  trendingColumn,
  rowKind = "investor",
}: {
  model: InvestorPreviewModel;
  anchorVcFirmId?: string | null;
  onClick?: () => void;
  onDeployingClick?: () => void;
  /** Subtle emphasis for the trending rail */
  trendingColumn?: boolean;
  rowKind?: "investor" | "operator";
}) {
  const websiteUrl = model._websiteUrl || null;
  const logoUrl = model._logoUrl || null;
  const sentimentScore = model._founderSentimentScore;
  const sentimentColor =
    sentimentScore != null
      ? sentimentScore >= 70
        ? "text-success"
        : sentimentScore >= 40
          ? "text-warning"
          : "text-destructive"
      : "text-muted-foreground";
  const matchScore = stableMatchScore(model.name, model._matchScore ?? null);
  const matchColor = matchScore >= 75 ? "text-success" : matchScore >= 50 ? "text-warning" : "text-destructive";
  const meta = compactMetaLine(model);

  return (
    <div
      role="button"
      tabIndex={0}
      data-vc-firm-id={anchorVcFirmId || undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left outline-none transition-colors",
        "hover:bg-muted/30 focus-visible:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
        trendingColumn && model._isTrending === true && "bg-warning/[0.04]",
      )}
    >
      <FirmLogo
        firmName={model.name}
        logoUrl={logoUrl}
        websiteUrl={websiteUrl}
        size="sm"
        className="h-7 w-7 shrink-0 rounded-lg text-[10px]"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      />

      <div className="min-w-0 flex-1 leading-none">
        <p className="truncate text-[12px] font-semibold tracking-tight text-foreground">
          {model.name}
          {meta ? (
            <span className="font-normal text-muted-foreground"> · {meta}</span>
          ) : null}
        </p>
      </div>

      <TooltipProvider delayDuration={250}>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("cursor-help text-xs font-bold tabular-nums", matchColor)}>{matchScore}%</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {rowKind === "operator" ? "Operator fit" : "Match score"}
            </TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-border/80" aria-hidden>
            |
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("cursor-help text-xs font-bold tabular-nums", sentimentColor)}>
                {sentimentScore != null ? `${sentimentScore}%` : "—"}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {rowKind === "operator" ? "Peer rating" : "Founder reputation"}
            </TooltipContent>
          </Tooltip>
          <RailStatusSignal model={model} onDeployingClick={onDeployingClick} />
        </div>
      </TooltipProvider>
    </div>
  );
}

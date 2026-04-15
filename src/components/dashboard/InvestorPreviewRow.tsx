import type { CSSProperties } from "react";
import { MapPin, DollarSign, Users, Zap, BarChart2 } from "lucide-react";
import { FirmLogo } from "@/components/ui/firm-logo";
import { Badge } from "@/components/ui/badge";
import { VCBadgeContainer } from "@/components/investor-match/VCBadgeContainer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, safeTrim } from "@/lib/utils";
import type { AumBand } from "@prisma/client";
import { resolveAumBandFromUsd } from "@/lib/aumBand";
import { formatStageForDisplay } from "@/lib/stageUtils";
import { formatFirmTypeLabel } from "@/lib/firmTypeLabels";

export type InvestorPreviewModel = {
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string;
  matchReason: string | null;
  _logoUrl?: string | null;
  _websiteUrl?: string | null;
  _founderSentimentScore?: number | null;
  _matchScore?: number | null;
  _isActivelyDeploying?: boolean;
  _isTrending?: boolean;
  _isPopular?: boolean;
  _isRecent?: boolean;
  _headcount?: string | null;
  _aum?: string | null;
  _firmType?: string;
  _aumBand?: string | null;
  /** Deal velocity score (0–100): derived from recent deal count + active deployment status. */
  _dealVelocityScore?: number | null;
  /** News-derived funding activity (0–100) when synced onto Supabase firm / partner rows. */
  _fundingIntelActivity?: number | null;
  /** When set (e.g. Network “All” tab), rail rows use this instead of the parent `rowKind`. */
  _railRowKind?: "investor" | "operator" | "founder" | "company";
};

function parseAumToMillions(raw: string | null | undefined): number | null {
  const str = safeTrim(raw);
  if (!str) return null;
  const s = str.replace(/,/g, "").toLowerCase();
  let maxM = 0;
  const re = /\$\s*([\d.]+)\s*([bmk])(?![a-z])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const n = parseFloat(m[1]);
    if (Number.isNaN(n)) continue;
    const u = m[2].toLowerCase();
    const millions = u === "b" ? n * 1000 : u === "m" ? n : n / 1000;
    maxM = Math.max(maxM, millions);
  }
  return maxM > 0 ? maxM : null;
}

const INVESTOR_CARD_AUM_BADGE: Record<AumBand, string> = {
  NANO: "NANO",
  MICRO: "MICRO",
  SMALL: "SMALL",
  MID_SIZE: "MID-SIZE",
  LARGE: "LARGE",
  MEGA_FUND: "MEGA",
};

function investorAumBandLabel(aum: string | null | undefined): string | null {
  const mm = parseAumToMillions(aum);
  if (mm == null) return null;
  const band = resolveAumBandFromUsd(mm * 1_000_000);
  return band ? INVESTOR_CARD_AUM_BADGE[band] : null;
}

/** Converts a raw recent-deal count + active-deployment flag into a 0–100 velocity score. */
export function computeDealVelocityScore(
  recentDeals: string[] | null | undefined,
  isActivelyDeploying: boolean | null | undefined,
): number {
  const count = recentDeals?.length ?? 0;
  // Logarithmic curve: 0 deals → ~5, 5 deals → ~65, 12+ deals → 95
  const base = count === 0 ? 5 : Math.min(95, Math.round(15 + Math.log(count + 1) * 32));
  const boost = isActivelyDeploying ? 5 : 0;
  return Math.min(100, base + boost);
}

function stableMatchScore(name: string | null | undefined, explicit: number | null | undefined): number {
  if (explicit != null) return explicit;
  const s = String(name ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 60 + Math.abs(h % 21);
}

export function InvestorPreviewRow({
  model,
  trending,
  onClick,
  onDeployingClick,
  anchorVcFirmId,
  density = "default",
  style,
}: {
  model: InvestorPreviewModel;
  trending?: boolean;
  onClick?: () => void;
  onDeployingClick?: () => void;
  anchorVcFirmId?: string | null;
  density?: "default" | "compact";
  style?: CSSProperties;
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
  const velocityScore = model._dealVelocityScore ?? null;
  const velocityColor =
    velocityScore != null
      ? velocityScore >= 70
        ? "text-success"
        : velocityScore >= 40
          ? "text-warning"
          : "text-destructive"
      : "text-muted-foreground";
  const velocityLabel =
    velocityScore == null ? null
    : velocityScore >= 80 ? "Hot"
    : velocityScore >= 60 ? "Active"
    : velocityScore >= 35 ? "Moderate"
    : "Slow";
  const intelScore = model._fundingIntelActivity ?? null;
  const aumBand = model._aumBand ?? investorAumBandLabel(model._aum);
  const compact = density === "compact";

  return (
    <button
      type="button"
      data-vc-firm-id={anchorVcFirmId || undefined}
      onClick={onClick}
      style={style}
      className={cn(
        "group flex w-full min-w-0 cursor-pointer rounded-xl border text-left transition-[border-color,box-shadow,transform] duration-200",
        compact ? "gap-2.5 px-2.5 py-2" : "gap-3 px-3 py-2.5",
        trending ? "border-accent/20 hover:border-accent/40 hover:shadow-md" : "border-border/55 hover:border-accent/25 hover:shadow-md",
        "hover:-translate-y-px bg-card/90 hover:bg-card",
      )}
    >
      <FirmLogo
        firmName={model.name}
        logoUrl={logoUrl}
        websiteUrl={websiteUrl}
        size={compact ? "md" : "lg"}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("truncate font-bold leading-tight text-foreground", compact ? "text-[13px]" : "text-[14px]")}>
              {model.name}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {[model.sector, model.stage ? formatStageForDisplay(model.stage) : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-1">
            <div
              className={model._isActivelyDeploying !== false ? undefined : "invisible pointer-events-none"}
            >
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeployingClick?.();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeployingClick?.();
                        }
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent text-success"
                      aria-label="Actively deploying"
                    >
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] bg-popover/95 p-2 text-[11px]">
                    Actively deploying — click for recent activity.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <VCBadgeContainer
              iconOnly
              vc_firm={{
                is_trending: model._isTrending,
                is_popular: model._isPopular,
                is_recent: model._isRecent,
              }}
            />
          </div>
        </div>

        <div className={cn("mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/35 pt-1.5", compact && "mt-1 gap-x-2 pt-1")}>
          <span className={cn("font-bold tabular-nums leading-none", matchColor, compact ? "text-xs" : "text-sm")}>
            {matchScore}%
          </span>
          <span className={cn("font-bold tabular-nums leading-none", sentimentColor, compact ? "text-xs" : "text-sm")}>
            {sentimentScore != null ? `${sentimentScore}%` : "—"}
          </span>
          {velocityScore != null ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums leading-none", velocityColor, compact ? "text-xs" : "text-sm")}>
                    <Zap className={cn("shrink-0", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
                    {velocityScore}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px] bg-popover/95 p-2 text-[11px]">
                  Deal Velocity: {velocityLabel} — based on recent deal activity
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {intelScore != null ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums leading-none text-muted-foreground", compact ? "text-xs" : "text-sm")}>
                    <BarChart2 className={cn("shrink-0", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
                    {Math.round(intelScore)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] bg-popover/95 p-2 text-[11px]">
                  Funding news activity (90d, intel_v1): higher means more headline-linked round participation after recency weighting—not a quality judgment.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {model.location ? (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <MapPin className="h-2 w-2 shrink-0" />
              <span className="truncate max-w-[7rem]">{model.location}</span>
            </span>
          ) : null}
        </div>

        <div className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground", compact && "mt-0.5")}>
          {(model._aum || model.model) && (
            <span className="inline-flex items-center gap-0.5">
              <DollarSign className="h-2 w-2 shrink-0" />
              <span className="truncate max-w-[6rem]">{model._aum || model.model}</span>
            </span>
          )}
          {model._headcount && (
            <span className="inline-flex items-center gap-0.5">
              <Users className="h-2 w-2 shrink-0" />
              {model._headcount}
            </span>
          )}
          <Badge
            variant="outline"
            className="h-4 min-h-4 border-zinc-400/45 bg-transparent px-1 py-0 text-[7px] font-light uppercase tracking-[0.08em] text-zinc-600 dark:border-zinc-500/55 dark:text-zinc-300"
          >
            {formatFirmTypeLabel(model._firmType || "INSTITUTIONAL") || "Institutional"}
          </Badge>
          {aumBand ? (
            <Badge
              variant="outline"
              className="h-4 min-h-4 border-zinc-400/45 bg-transparent px-1 py-0 text-[7px] font-light uppercase tracking-[0.08em] text-zinc-600 dark:border-zinc-500/55 dark:text-zinc-300"
            >
              {aumBand}
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CompactInvestorRailRow } from "./CompactInvestorRailRow";
import type { InvestorPreviewModel } from "./InvestorPreviewRow";
import { cn } from "@/lib/utils";

/** Visible rows per column before prev/next arrows reveal more */
const WINDOW = 3;

function useListWindow(length: number) {
  const maxStart = Math.max(0, length - WINDOW);
  const [start, setStart] = useState(0);
  const clamped = Math.min(start, maxStart);
  const canPrev = clamped > 0;
  const canNext = clamped < maxStart;
  const goPrev = useCallback(() => setStart((s) => Math.max(0, s - 1)), []);
  const goNext = useCallback(() => setStart((s) => Math.min(maxStart, s + 1)), [maxStart]);
  return { start: clamped, canPrev, canNext, goPrev, goNext };
}

function PremiumColumnStepper({
  canPrev,
  canNext,
  onPrev,
  onNext,
  label,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  label: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-stretch rounded-full border border-border/50 bg-muted/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm",
        "dark:border-white/[0.08] dark:bg-white/[0.04]",
      )}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        disabled={!canPrev}
        onClick={onPrev}
        className={cn(
          "rounded-l-full px-1.5 py-1 text-muted-foreground transition-all",
          "hover:bg-muted/50 hover:text-foreground active:scale-[0.96]",
          "disabled:pointer-events-none disabled:opacity-25",
        )}
        aria-label="Previous"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <span className="w-px shrink-0 self-stretch bg-border/45" aria-hidden />
      <button
        type="button"
        disabled={!canNext}
        onClick={onNext}
        className={cn(
          "rounded-r-full px-1.5 py-1 text-muted-foreground transition-all",
          "hover:bg-muted/50 hover:text-foreground active:scale-[0.96]",
          "disabled:pointer-events-none disabled:opacity-25",
        )}
        aria-label="Next"
      >
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

function RailColumnHeader({
  title,
  subtitle,
  onViewAll,
  canPrev,
  canNext,
  onPrev,
  onNext,
  stepperLabel,
}: {
  title: string;
  subtitle: string;
  onViewAll?: () => void;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  stepperLabel: string;
}) {
  return (
    <div className="border-b border-border/40 bg-gradient-to-b from-muted/[0.14] to-transparent px-2.5 py-2 dark:from-white/[0.04]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 line-clamp-1 text-[9px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <PremiumColumnStepper
            canPrev={canPrev}
            canNext={canNext}
            onPrev={onPrev}
            onNext={onNext}
            label={stepperLabel}
          />
          {onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              View all
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function stepperLabelForRowKind(
  rowKind: "investor" | "operator" | "founder" | "company",
  column: "suggested" | "trending",
): string {
  const col = column === "suggested" ? "Suggested" : "Trending";
  if (rowKind === "operator") return `${col} operators page`;
  if (rowKind === "founder") return `${col} founders page`;
  if (rowKind === "company") return `${col} companies page`;
  return `${col} investors page`;
}

export function InvestorSuggestedTrendingRails({
  suggested,
  trending,
  suggestedTitle,
  suggestedSubtitle,
  trendingTitle,
  trendingSubtitle,
  onViewAllSuggested,
  onViewAllTrending,
  onPreviewClick,
  onDeployingClick,
  anchorVcFirmId,
  rowKind = "investor",
  suggestedStepperLabel,
  trendingStepperLabel,
}: {
  suggested: InvestorPreviewModel[];
  trending: InvestorPreviewModel[];
  suggestedTitle: string;
  suggestedSubtitle: string;
  trendingTitle: string;
  trendingSubtitle: string;
  onViewAllSuggested?: () => void;
  onViewAllTrending?: () => void;
  onPreviewClick: (inv: InvestorPreviewModel) => void;
  /** Omit for operator rails (no deploying signal). */
  onDeployingClick?: (inv: InvestorPreviewModel) => void;
  anchorVcFirmId?: (inv: InvestorPreviewModel) => string | null;
  rowKind?: "investor" | "operator" | "founder" | "company";
  /** Overrides stepper `aria-label` group for the suggested column (e.g. mixed “All” tab). */
  suggestedStepperLabel?: string;
  /** Overrides stepper `aria-label` group for the trending column. */
  trendingStepperLabel?: string;
}) {
  const suggestedWin = useListWindow(suggested.length);
  const trendingWin = useListWindow(trending.length);

  const suggestedSlots = useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => suggested[suggestedWin.start + i]),
    [suggested, suggestedWin.start],
  );
  const trendingSlots = useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => trending[trendingWin.start + i]),
    [trending, trendingWin.start],
  );

  if (suggested.length === 0 && trending.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/50 bg-card/35 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-[2px]",
        "dark:border-white/[0.08] dark:bg-white/[0.025] dark:shadow-none",
      )}
    >
      <div className="flex min-h-0">
        {/* Suggested */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-border/40">
          <RailColumnHeader
            title={suggestedTitle}
            subtitle={suggestedSubtitle}
            onViewAll={onViewAllSuggested}
            canPrev={suggestedWin.canPrev}
            canNext={suggestedWin.canNext}
            onPrev={suggestedWin.goPrev}
            onNext={suggestedWin.goNext}
            stepperLabel={
              suggestedStepperLabel ?? stepperLabelForRowKind(rowKind, "suggested")
            }
          />
          <div className="flex flex-col">
            {suggestedSlots.map((inv, i) =>
              inv ? (
                <div
                  key={`s-${suggestedWin.start}-${i}-${inv.name}`}
                  className="border-b border-border/[0.12] last:border-b-0"
                >
                  <CompactInvestorRailRow
                    rowKind={inv._railRowKind ?? rowKind}
                    model={inv}
                    anchorVcFirmId={anchorVcFirmId?.(inv) ?? null}
                    onClick={() => onPreviewClick(inv)}
                    onDeployingClick={() =>
                      (inv._railRowKind ?? rowKind) === "investor" ? onDeployingClick?.(inv) : undefined
                    }
                  />
                </div>
              ) : null,
            )}
          </div>
        </div>

        {/* Trending */}
        <div className="flex min-w-0 flex-1 flex-col">
          <RailColumnHeader
            title={trendingTitle}
            subtitle={trendingSubtitle}
            onViewAll={onViewAllTrending}
            canPrev={trendingWin.canPrev}
            canNext={trendingWin.canNext}
            onPrev={trendingWin.goPrev}
            onNext={trendingWin.goNext}
            stepperLabel={
              trendingStepperLabel ?? stepperLabelForRowKind(rowKind, "trending")
            }
          />
          <div className="flex flex-col">
            {trendingSlots.map((inv, i) =>
              inv ? (
                <div
                  key={`t-${trendingWin.start}-${i}-${inv.name}`}
                  className="border-b border-border/[0.12] last:border-b-0"
                >
                  <CompactInvestorRailRow
                    rowKind={inv._railRowKind ?? rowKind}
                    model={inv}
                    trendingColumn
                    anchorVcFirmId={anchorVcFirmId?.(inv) ?? null}
                    onClick={() => onPreviewClick(inv)}
                    onDeployingClick={() =>
                      (inv._railRowKind ?? rowKind) === "investor" ? onDeployingClick?.(inv) : undefined
                    }
                  />
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

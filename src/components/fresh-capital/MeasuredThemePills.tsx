import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
  "inline-flex shrink-0 rounded-full border border-primary/45 bg-primary/15 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary";

const OVERFLOW_MORE_CLASS = cn(
  CHIP_CLASS,
  "cursor-pointer border-primary/55 bg-primary/10 font-semibold tabular-nums hover:bg-primary/18",
);

const SHOW_LESS_CLASS = cn(
  CHIP_CLASS,
  "cursor-pointer border-zinc-500/60 bg-zinc-900/90 font-medium normal-case tracking-normal text-[#b3b3b3] hover:bg-zinc-800 hover:text-[#eeeeee]",
);

function maxFullChipsThatFit(args: {
  cw: number;
  chipWidths: number[];
  overflowWidthByRemaining: (remaining: number) => number;
  gapPx: number;
}): number {
  const { cw, chipWidths, overflowWidthByRemaining, gapPx } = args;
  const n = chipWidths.length;
  if (n === 0 || cw <= 0) return n;

  const gap = gapPx;

  for (let k = n; k >= 0; k--) {
    if (k === 0) {
      const ow = overflowWidthByRemaining(n);
      if (ow <= cw) return 0;
      continue;
    }

    let sum = 0;
    for (let i = 0; i < k; i++) sum += chipWidths[i]!;
    sum += gap * Math.max(0, k - 1);

    if (k >= n) {
      if (sum <= cw) return k;
      continue;
    }

    const remaining = n - k;
    const ow = overflowWidthByRemaining(remaining);
    if (sum + gap + ow <= cw) return k;
  }

  return 0;
}

export type MeasuredThemePillsProps = {
  themes: string[];
  /** Stable key so expansion resets when the row identity changes */
  rowKey: string;
};

/**
 * Width-aware theme chips: collapsed row shows only whole pills that fit + `+N`,
 * measured against the column — no horizontal clipping.
 */
export function MeasuredThemePills({ themes, rowKey }: MeasuredThemePillsProps) {
  const [expanded, setExpanded] = useState(false);
  const [fitCount, setFitCount] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chipMeasureWrapRef = useRef<HTMLDivElement>(null);
  const overflowMeasureWrapRef = useRef<HTMLDivElement>(null);

  const recomputeFit = useCallback(() => {
    const el = containerRef.current;
    const chipWrap = chipMeasureWrapRef.current;
    const ovWrap = overflowMeasureWrapRef.current;
    if (!el || !chipWrap || !ovWrap) return;

    const cw = el.getBoundingClientRect().width;
    const gapPx = parseFloat(getComputedStyle(chipWrap).gap || "4") || 4;

    const chipEls = chipWrap.querySelectorAll<HTMLElement>("[data-measure-chip]");
    const chipWidths: number[] = [];
    for (let i = 0; i < chipEls.length; i++) {
      chipWidths.push(chipEls[i]!.offsetWidth);
    }

    const overflowWidthByRemaining = (remaining: number): number => {
      const node = ovWrap.querySelector<HTMLElement>(`[data-overflow-n="${remaining}"]`);
      return node?.offsetWidth ?? 0;
    };

    setFitCount(maxFullChipsThatFit({ cw, chipWidths, overflowWidthByRemaining, gapPx }));
  }, []);

  useLayoutEffect(() => {
    setExpanded(false);
    setFitCount(null);
  }, [rowKey]);

  useLayoutEffect(() => {
    if (expanded) return;
    recomputeFit();
  }, [expanded, themes, recomputeFit]);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => recomputeFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, recomputeFit]);

  if (themes.length === 0) {
    return <span className="text-sm text-[#b3b3b3]">—</span>;
  }

  const n = themes.length;

  if (expanded) {
    return (
      <>
        <HiddenMeasureLayer themes={themes} chipWrapRef={chipMeasureWrapRef} overflowWrapRef={overflowMeasureWrapRef} />
        <div className="flex min-w-0 flex-wrap items-start gap-1">
          {themes.map((theme, i) => (
            <span key={`${theme}-${i}`} title={theme} className={CHIP_CLASS}>
              {theme.toUpperCase()}
            </span>
          ))}
          <button
            type="button"
            className={SHOW_LESS_CLASS}
            aria-expanded
            aria-label="Show fewer themes"
            onClick={() => setExpanded(false)}
          >
            Show less
          </button>
        </div>
      </>
    );
  }

  const measured = fitCount !== null;
  const visibleEnd = measured ? Math.min(fitCount!, n) : Math.min(3, n);
  const collapsedVisible = themes.slice(0, visibleEnd);
  const hiddenCount = n - visibleEnd;
  const showOverflowChip = measured ? fitCount! < n : n > 3;

  return (
    <>
      <HiddenMeasureLayer themes={themes} chipWrapRef={chipMeasureWrapRef} overflowWrapRef={overflowMeasureWrapRef} />

      <div
        ref={containerRef}
        className={cn(
          "min-w-0",
          measured ? "flex flex-nowrap items-center gap-1" : "flex flex-wrap items-start gap-1",
        )}
      >
        {collapsedVisible.map((theme, i) => (
          <span key={`${theme}-${i}`} title={theme} className={CHIP_CLASS}>
            {theme.toUpperCase()}
          </span>
        ))}
        {showOverflowChip ? (
          <button
            type="button"
            className={OVERFLOW_MORE_CLASS}
            aria-expanded={false}
            aria-label={`Show ${hiddenCount} more theme${hiddenCount === 1 ? "" : "s"}`}
            onClick={() => setExpanded(true)}
          >
            +{hiddenCount}
          </button>
        ) : null}
      </div>
    </>
  );
}

function HiddenMeasureLayer({
  themes,
  chipWrapRef,
  overflowWrapRef,
}: {
  themes: string[];
  chipWrapRef: RefObject<HTMLDivElement | null>;
  overflowWrapRef: RefObject<HTMLDivElement | null>;
}) {
  const n = themes.length;
  return (
    <div
      className="pointer-events-none fixed left-[-10000px] top-0 z-[-100] flex flex-col gap-2 opacity-0"
      aria-hidden
    >
      <div ref={chipWrapRef} className="flex flex-nowrap gap-1">
        {themes.map((theme, i) => (
          <span key={`mchip-${i}`} data-measure-chip className={CHIP_CLASS}>
            {theme.toUpperCase()}
          </span>
        ))}
      </div>
      <div ref={overflowWrapRef} className="flex flex-nowrap gap-1">
        {Array.from({ length: n }, (_, i) => i + 1).map((rem) => (
          <span key={`mov-${rem}`} data-overflow-n={rem} className={OVERFLOW_MORE_CLASS}>
            +{rem}
          </span>
        ))}
      </div>
    </div>
  );
}

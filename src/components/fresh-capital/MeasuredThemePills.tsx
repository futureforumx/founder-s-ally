import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MeasuredThemePillsProps {
  themes: string[];
  /** Stable key from parent row — used to reset overflow count when the row changes. */
  rowKey: string;
}

/** Approximate width of the "+N more" button so we don't let the last visible pill get clipped by it. */
const OVERFLOW_BTN_WIDTH = 56; // px — enough for "+9 more"

export function MeasuredThemePills({ themes, rowKey }: MeasuredThemePillsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(themes.length);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
    const el = containerRef.current;
    if (!el || themes.length === 0) {
      setVisibleCount(themes.length);
      return;
    }

    const children = Array.from(el.children) as HTMLElement[];
    if (children.length === 0) return;

    const containerRight = el.getBoundingClientRect().right;
    let count = 0;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      // If this is not the last pill, reserve room for the "+N more" button
      const isLast = i === children.length - 1;
      const threshold = isLast ? containerRight + 2 : containerRight - OVERFLOW_BTN_WIDTH + 2;
      if (rect.right <= threshold) {
        count++;
      } else {
        break;
      }
    }
    setVisibleCount(Math.max(1, count));
  }, [rowKey, themes]);

  if (themes.length === 0) {
    return <span className="text-sm text-[#b3b3b3]">—</span>;
  }

  const visible = themes.slice(0, visibleCount);
  const hidden = themes.slice(visibleCount);
  const overflow = hidden.length;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* First row — measured. overflow-visible so pills are never clipped mid-character */}
      <div
        ref={containerRef}
        className="flex min-w-0 flex-nowrap gap-1.5 overflow-visible"
      >
        {visible.map((theme) => (
          <span
            key={theme}
            title={theme}
            className={cn(
              "inline-flex max-w-[9rem] shrink-0 items-center truncate rounded-full border border-primary/45 bg-primary/15",
              "px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary shadow-sm",
            )}
          >
            {theme}
          </span>
        ))}
        {overflow > 0 && !expanded && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary/80 transition-colors hover:border-primary/55 hover:bg-primary/20 hover:text-primary"
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Expanded overflow rows */}
      {expanded && overflow > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {hidden.map((theme) => (
            <span
              key={theme}
              title={theme}
              className={cn(
                "inline-flex max-w-[9rem] shrink-0 items-center truncate rounded-full border border-primary/45 bg-primary/15",
                "px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary shadow-sm",
              )}
            >
              {theme}
            </span>
          ))}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full border border-zinc-700/50 bg-transparent px-2 py-0.5 text-2xs font-medium text-[#888] transition-colors hover:text-[#aaa]"
          >
            show less
          </button>
        </div>
      )}
    </div>
  );
}

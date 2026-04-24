import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MeasuredThemePillsProps {
  themes: string[];
  /** Stable key from parent row — used to reset overflow count when the row changes. */
  rowKey: string;
}

/**
 * Fresh Capital theme/sector pills with overflow measurement.
 * Renders as many pills as fit in a single line, then shows "+N more" for the rest.
 */
export function MeasuredThemePills({ themes, rowKey }: MeasuredThemePillsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(themes.length);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || themes.length === 0) {
      setVisibleCount(themes.length);
      return;
    }

    // Measure how many pills fit before wrapping
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length === 0) return;

    const containerRight = el.getBoundingClientRect().right;
    let count = 0;
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (rect.right <= containerRight + 2) {
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
  const overflow = themes.length - visibleCount;

  return (
    <div
      ref={containerRef}
      className="flex min-w-0 flex-nowrap gap-1.5 overflow-hidden"
      title={themes.join(", ")}
    >
      {visible.map((theme) => (
        <span
          key={theme}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border border-primary/45 bg-primary/15",
            "px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary shadow-sm",
          )}
        >
          {theme}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-flex shrink-0 items-center rounded-full border border-zinc-700/50 bg-transparent px-2 py-0.5 text-2xs font-medium text-[#888]">
          +{overflow}
        </span>
      )}
    </div>
  );
}

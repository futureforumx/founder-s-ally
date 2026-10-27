import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const CHROME = "--admin-chrome-height";
const STACK = "--admin-stack-height";

function publishHeight(el: HTMLElement, stacked: boolean) {
  const host = el.parentElement;

  if (!host) return;

  if (stacked) {
    host.style.setProperty(STACK, `calc(var(${CHROME}, 0px) + ${el.offsetHeight}px)`);

    return;
  }

  host.style.setProperty(CHROME, `${el.offsetHeight}px`);
}

/**
 * Pins a section title (and any filters placed inside it) to the admin scroller.
 * `stacked` pins below the page header that published --admin-chrome-height.
 */
export function AdminStickyHeader({
  children,
  className,
  stacked = false,
  collapsible = !stacked,
  trailing,
}: {
  children: ReactNode;
  className?: string;
  stacked?: boolean;
  /** Main page headers can fold away; stacked section headers stay put. */
  collapsible?: boolean;
  /** Sits in the same right-hand group as the collapse control, at every width. */
  trailing?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [toggleTop, setToggleTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;

    if (!el) return;

    const host = el.parentElement;
    const publish = () => publishHeight(el, stacked);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);

    return () => {
      observer.disconnect();
      host?.style.removeProperty(stacked ? STACK : CHROME);
    };
  }, [expanded, stacked]);

  const groupedActions = trailing != null;

  useLayoutEffect(() => {
    if (!collapsible || !expanded || groupedActions) return;
    const header = ref.current;
    const content = contentRef.current;
    const row = content?.firstElementChild;

    if (!header || !(row instanceof HTMLElement)) return;

    const align = () => {
      const rowBox = row.getBoundingClientRect();
      const headerTop = header.getBoundingClientRect().top;
      setToggleTop(rowBox.top - headerTop + rowBox.height / 2);
    };

    align();
    const observer = new ResizeObserver(align);
    observer.observe(row);
    observer.observe(header);

    return () => observer.disconnect();
  }, [collapsible, expanded, groupedActions]);

  const collapseButton = collapsible ? (
    <button
      type="button"
      onClick={() => setExpanded((open) => !open)}
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse header" : "Expand header"}
      className={cn(
        "z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-white/70 transition-colors hover:bg-white/10 hover:text-white",
        groupedActions ? undefined : "absolute right-8 -translate-y-1/2",
      )}
      style={groupedActions ? undefined : { top: expanded && toggleTop != null ? toggleTop : "50%" }}
    >
      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  ) : null;

  return (
    <div
      ref={ref}
      className={cn(
        "relative sticky -mx-8 border-b border-white/[0.06] bg-[#050505] pl-8",
        stacked ? "z-20 py-3 pr-8" : cn("z-30", collapsible && !groupedActions ? "pr-20" : "pr-8", expanded ? "py-4" : "min-h-12 py-2"),
      )}
      style={{ top: stacked ? `var(${CHROME}, 0px)` : 0 }}
    >
      {groupedActions ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div ref={contentRef} className={cn("min-w-0 flex-1", className, expanded ? undefined : "hidden")}>
            {children}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {expanded && trailing}
            {collapseButton}
          </div>
        </div>
      ) : (
        <>
          {collapseButton}
          <div ref={contentRef} className={cn(className, expanded ? undefined : "hidden")}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

/** Pins a filter row under the section header while the list below scrolls. */
export function AdminStickyFilters({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky z-20 -mx-8 border-b border-white/[0.06] bg-[#050505] py-3 pl-8 pr-8",
        className,
      )}
      style={{ top: `var(${STACK}, var(${CHROME}, 0px))` }}
    >
      {children}
    </div>
  );
}

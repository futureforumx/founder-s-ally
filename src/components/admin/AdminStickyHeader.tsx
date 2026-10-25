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
}: {
  children: ReactNode;
  className?: string;
  stacked?: boolean;
  /** Main page headers can fold away; stacked section headers stay put. */
  collapsible?: boolean;
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

  useLayoutEffect(() => {
    if (!collapsible || !expanded) return;
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
  }, [collapsible, expanded]);

  return (
    <div
      ref={ref}
      className={cn(
        "relative sticky -mx-8 border-b border-white/[0.06] bg-[#050505] pl-8",
        stacked ? "z-20 py-3 pr-8" : cn("z-30", collapsible ? "pr-20" : "pr-8", expanded ? "py-4" : "min-h-12 py-2"),
      )}
      style={{ top: stacked ? `var(${CHROME}, 0px)` : 0 }}
    >
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse header" : "Expand header"}
          className="absolute right-8 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          style={{ top: expanded && toggleTop != null ? toggleTop : "50%" }}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
      <div ref={contentRef} className={cn(className, expanded ? undefined : "hidden")}>
        {children}
      </div>
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

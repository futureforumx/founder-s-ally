import { useLayoutEffect, useRef, type ReactNode } from "react";
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
}: {
  children: ReactNode;
  className?: string;
  stacked?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

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
  }, [stacked]);

  return (
    <div
      ref={ref}
      className={cn(
        "sticky -mx-8 border-b border-white/[0.06] bg-[#050505] pl-8",
        stacked ? "z-20 py-3 pr-8" : "z-30 py-4 pr-20",
        className,
      )}
      style={{ top: stacked ? `var(${CHROME}, 0px)` : 0 }}
    >
      {children}
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

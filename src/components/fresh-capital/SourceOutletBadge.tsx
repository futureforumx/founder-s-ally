import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  hasArticle: boolean;
  /** Primary label (e.g. outlet hostname). Used when `hasArticle` is true. */
  outletLabel: string | null;
  /**
   * When set with `hasArticle`, renders a real link (Fresh Funds meta row).
   * Omit for Latest Funding so the row-level click handler stays the only primary open action.
   */
  href?: string | null;
  /**
   * When there is no article URL, show this muted label (e.g. outlet parsed from a headline)
   * instead of the default “No article link”.
   */
  noLinkFallbackLabel?: string | null;
  className?: string;
};

/**
 * Shared “source” pill used on Fresh Capital feeds: subtle when there is no article URL,
 * premium scan-friendly when there is.
 */
export function SourceOutletBadge({
  hasArticle,
  outletLabel,
  href,
  noLinkFallbackLabel,
  className,
}: Props) {
  const primary = (outletLabel?.trim() || "Source").trim();
  const mutedAlt = noLinkFallbackLabel?.trim() || "";
  const displayMuted = mutedAlt || "No article link";
  const canLink = Boolean(hasArticle && href?.trim());

  const content = (
    <>
      {hasArticle ? (
        <ExternalLink className="h-2.5 w-2.5 shrink-0 text-zinc-500" aria-hidden />
      ) : null}
      <span>{hasArticle ? primary : displayMuted}</span>
    </>
  );

  const pillClass = cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] transition-colors",
    hasArticle
      ? "border-zinc-800/80 bg-zinc-950/50 text-zinc-500"
      : mutedAlt
        ? "border-zinc-800/60 bg-zinc-950/30 text-zinc-500"
        : "border-zinc-800/80 bg-zinc-950/40 text-zinc-600",
    className,
  );

  if (canLink) {
    return (
      <a
        href={href!.trim()}
        target="_blank"
        rel="noopener"
        className={cn(
          pillClass,
          "no-underline hover:border-zinc-700/80 hover:bg-zinc-900/50 hover:text-zinc-400",
        )}
      >
        {content}
      </a>
    );
  }

  return <span className={pillClass}>{content}</span>;
}

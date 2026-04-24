import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceOutletBadgeProps {
  hasArticle: boolean;
  outletLabel: string | null;
  href?: string | null;
  /** Shown as plain text when there is no clickable link (e.g. source parsed from title only). */
  noLinkFallbackLabel?: string | null;
}

/**
 * Fresh Capital firm meta row — source outlet chip.
 * Renders a linked badge when an article URL is present, or a plain label as fallback.
 */
export function SourceOutletBadge({ hasArticle, outletLabel, href, noLinkFallbackLabel }: SourceOutletBadgeProps) {
  const label = outletLabel ?? noLinkFallbackLabel;

  if (!label) return null;

  if (hasArticle && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-zinc-600/60 bg-zinc-900/80 px-2 py-0.5",
          "text-2xs font-medium text-[#b3b3b3] transition-colors hover:border-zinc-500 hover:text-[#e0e0e0]",
        )}
      >
        {label}
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
      </a>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-zinc-700/50 bg-zinc-900/60 px-2 py-0.5 text-2xs font-medium text-[#888]">
      {label}
    </span>
  );
}

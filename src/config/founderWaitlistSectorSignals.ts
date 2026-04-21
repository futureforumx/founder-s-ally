import type { FounderWaitlistSectorValue } from "./founderWaitlistSector";

/**
 * Static “live intelligence” copy for /access founder sector selection.
 * Perception-only; not tied to real-time data.
 */
export const FOUNDER_WAITLIST_SECTOR_SIGNAL_FALLBACK =
  "Active investors are continuing to deploy capital in this sector.";

/** Canonical sector slug → one-line signal hint (curated categories). */
export const FOUNDER_WAITLIST_SECTOR_SIGNAL_HINTS: Partial<
  Record<FounderWaitlistSectorValue, string>
> = {
  ai_ml: "AI funding activity is accelerating—top funds are actively deploying.",
  fintech: "Fintech deal activity is shifting toward infrastructure and embedded finance.",
  healthcare: "Healthcare investors are prioritizing automation and clinical workflows.",
  enterprise_saas: "SaaS investors are focusing on efficiency and AI-driven workflows.",
  developer_tools: "Developer tooling remains a top category for early-stage funding.",
};

/**
 * Substrings to emphasize in UI for curated lines (must appear in the matching hint string).
 * Keep aligned with `supabase/functions/_shared/founderWaitlistSnapshotMvp.ts` SIGNAL_HIGHLIGHT_TERMS.
 */
export const FOUNDER_WAITLIST_SECTOR_SIGNAL_HIGHLIGHT_TERMS: Partial<
  Record<FounderWaitlistSectorValue, string[]>
> = {
  healthcare: ["automation", "clinical workflows"],
};

/** Resolve highlight terms from canonical snapshot copy when the API omits `highlightTerms`. */
export function getFounderWaitlistMarketSignalHighlightTerms(signalText: string): string[] | undefined {
  const normalized = signalText.trim();
  for (const slug of Object.keys(FOUNDER_WAITLIST_SECTOR_SIGNAL_HINTS) as FounderWaitlistSectorValue[]) {
    const hint = FOUNDER_WAITLIST_SECTOR_SIGNAL_HINTS[slug];
    if (!hint || hint.trim() !== normalized) continue;
    const terms = FOUNDER_WAITLIST_SECTOR_SIGNAL_HIGHLIGHT_TERMS[slug];
    return terms?.length ? terms : undefined;
  }
  return undefined;
}

export function getFounderWaitlistSectorSignalHint(slug: string): string {
  const direct = FOUNDER_WAITLIST_SECTOR_SIGNAL_HINTS[slug as FounderWaitlistSectorValue];
  if (direct) return direct;
  return FOUNDER_WAITLIST_SECTOR_SIGNAL_FALLBACK;
}

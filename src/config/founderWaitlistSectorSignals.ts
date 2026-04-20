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

export function getFounderWaitlistSectorSignalHint(slug: string): string {
  const direct = FOUNDER_WAITLIST_SECTOR_SIGNAL_HINTS[slug as FounderWaitlistSectorValue];
  if (direct) return direct;
  return FOUNDER_WAITLIST_SECTOR_SIGNAL_FALLBACK;
}

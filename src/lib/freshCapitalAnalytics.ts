import { trackMixpanelEvent } from "@/lib/mixpanel";

const ATTR = { signup_attribution_source: "fresh_capital", surface: "fresh_capital" } as const;

function baseProps(): Record<string, unknown> {
  if (typeof window === "undefined") return { ...ATTR };
  return {
    ...ATTR,
    path: window.location.pathname,
    href: window.location.href,
    referrer: document.referrer || undefined,
  };
}

export function trackFreshCapitalPageView(extra?: Record<string, unknown>): void {
  trackMixpanelEvent("page_view_fresh_capital", { ...baseProps(), ...extra });
}

export function trackFreshCapitalViewLatestFunds(): void {
  trackMixpanelEvent("click_view_latest_funds", baseProps());
}

export function trackFreshCapitalGetFullAccess(): void {
  trackMixpanelEvent("click_get_full_access", baseProps());
}

export function trackFreshCapitalJoinVekta(): void {
  trackMixpanelEvent("click_join_vekta", baseProps());
}

export function trackFreshCapitalStageFilter(from: string, to: string): void {
  trackMixpanelEvent("filter_stage_changed", { ...baseProps(), from_stage: from, to_stage: to });
}

export function trackFreshCapitalSectorFilter(from: string | null, to: string | null): void {
  trackMixpanelEvent("filter_sector_changed", { ...baseProps(), from_sector: from, to_sector: to });
}

export function trackFreshCapitalGatedPreviewInteraction(interactionKind: string): void {
  trackMixpanelEvent("gated_preview_interaction", { ...baseProps(), interaction_kind: interactionKind });
}

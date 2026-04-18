/**
 * Fresh Capital public page — Mixpanel contract (keep in sync with docs/fresh-capital-release-checklist.md).
 *
 * Events (names are stable API for dashboards):
 * - page_view_fresh_capital
 * - click_view_latest_funds
 * - click_get_full_access
 * - click_join_vekta  (always pass cta_location from call sites)
 * - filter_stage_changed
 * - filter_sector_changed
 * - gated_preview_interaction
 *
 * Base props on every event: signup_attribution_source, surface, path, href, referrer (when in browser).
 */
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

/** Signup CTAs only — use {@link freshCapitalSignupHref} for the link target. */
export function trackFreshCapitalJoinVekta(extra?: { cta_location: string }): void {
  trackMixpanelEvent("click_join_vekta", { ...baseProps(), ...extra });
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

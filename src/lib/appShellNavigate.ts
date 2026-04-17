/**
 * Cross-surface navigation from deep UI (e.g. Settings → Network integrations)
 * to main app views. Index.tsx listens for this event.
 *
 * TODO: When a global router or nav context exists, prefer that over window events.
 */

export const VEKTA_APP_NAVIGATE_EVENT = "vekta:navigate-app-view";

export type NavigateableAppView = "connections" | "network" | "network-workspace" | "investor-search";

export function requestAppNavigate(view: NavigateableAppView): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VEKTA_APP_NAVIGATE_EVENT, { detail: { view } }));
}

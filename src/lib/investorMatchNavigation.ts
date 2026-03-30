/** Fired when user should see InvestorMatch “ALL” (matches) subview — sidebar Network, top ALL, or routeView("investors"). */
export const VEKTA_INVESTORS_ALL_FOCUS_EVENT = "vekta-investors-all-focus";

export function dispatchInvestorsAllFocus() {
  window.dispatchEvent(new CustomEvent(VEKTA_INVESTORS_ALL_FOCUS_EVENT));
}

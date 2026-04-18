/**
 * Central signup / conversion targets for the public Fresh Capital page.
 *
 * **Attribution (expected):** `freshCapitalSignupHref()` always sets query param `signup_attribution=fresh_capital`
 * (merged with `VITE_FRESH_CAPITAL_SIGNUP_QUERY` when set). Mixpanel events use `signup_attribution_source: "fresh_capital"`.
 * Use both for funnel analysis; URL param alone may be stripped by auth providers.
 *
 * TODO(public-conversion): If you add a dedicated marketing waitlist or `/access`-first flow,
 * set `VITE_FRESH_CAPITAL_SIGNUP_PATH` (e.g. `/access` or `/auth/sign-up`) and optional
 * `VITE_FRESH_CAPITAL_SIGNUP_QUERY` (e.g. `intent=fresh_capital`) — update components only here.
 */
const SIGNUP_PATH = (import.meta.env.VITE_FRESH_CAPITAL_SIGNUP_PATH as string | undefined)?.trim() || "/auth/sign-up";
const SIGNUP_QUERY = (import.meta.env.VITE_FRESH_CAPITAL_SIGNUP_QUERY as string | undefined)?.trim() || "";

/** Relative URL for primary signup CTA (includes attribution query for measurement). */
export function freshCapitalSignupHref(): string {
  const base = SIGNUP_PATH.startsWith("/") ? SIGNUP_PATH : `/${SIGNUP_PATH}`;
  const params = new URLSearchParams();
  params.set("signup_attribution", "fresh_capital");
  if (SIGNUP_QUERY) {
    const extra = new URLSearchParams(SIGNUP_QUERY.startsWith("?") ? SIGNUP_QUERY.slice(1) : SIGNUP_QUERY);
    extra.forEach((v, k) => params.set(k, v));
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

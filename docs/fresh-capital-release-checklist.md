# Fresh Capital (`/fresh-capital`) — release-readiness audit

Use this before **staging QA** and again before **public launch**. See also `docs/fresh-capital-public-surface.md`.

## Required RPCs (Postgres / Supabase)

- [ ] `public.get_new_vc_funds(integer, integer, text[], text[], text[], numeric, numeric, text[])` exists and returns the extended columns (including `likely_actively_deploying`) per `20260423120000_get_new_vc_funds_likely_actively_deploying.sql`.
- [ ] `public.get_new_vc_funds(...)` is filtering to canonical verified/public-safe `vc_funds.verification_status` rows only.
- [ ] Optional: `public.get_capital_heatmap_backend` — if absent, the UI uses the documented sector-tag fallback (acceptable for launch if product agrees).

## Required grants (`anon`)

- [ ] `GRANT EXECUTE ON FUNCTION public.get_new_vc_funds(...) TO anon` (re-applied after any `DROP`/`CREATE` of that signature).
- [ ] `public.vc_fund_sync_runs` and `public.vc_fund_sync_latest_runs` exist so detect / verify / promote / rederive / mirror status is inspectable during staging.
- [ ] If heatmap RPC is deployed: `GRANT EXECUTE ON FUNCTION public.get_capital_heatmap_backend(...) TO anon`.

## Required env vars (hosting)

- [ ] `VITE_SUPABASE_URL` — production/staging value points at the project where migrations were applied.
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` — anon/publishable key for that project.
- [ ] `VITE_MIXPANEL_TOKEN` (optional) — override default Mixpanel project if needed.

## Demo mode guardrails

- [ ] **Production:** `import.meta.env.PROD === true` → demo rows **never** run; missing Supabase env → configuration error state (not fake data).
- [ ] **Non-production demo:** only when `VITE_FRESH_CAPITAL_DEMO=true` **and** Supabase URL/key unset — verify locally if you rely on demo.

## Signup attribution (conversion)

- [ ] All signup CTAs resolve through `freshCapitalSignupHref()` (`src/lib/freshCapitalConversion.ts`).
- [ ] Default query includes `signup_attribution=fresh_capital` (and optional `VITE_FRESH_CAPITAL_SIGNUP_QUERY`).
- [ ] Confirm downstream (Clerk / marketing) whether query params are preserved; Mixpanel still carries `signup_attribution_source` on events.

## Expected Mixpanel events

| Event | When | Consistent props |
|-------|------|------------------|
| `page_view_fresh_capital` | After first resolved load | `signup_attribution_source`, `surface`, `path`, `href`, `referrer`, `heatmap_source`, `using_demo_data`, `load_ok`, `misconfigured` |
| `click_view_latest_funds` | Hero primary CTA | base props |
| `click_get_full_access` | Hero outline CTA | base props |
| `click_join_vekta` | Any signup navigation tracked as join | base props + `cta_location` |
| `filter_stage_changed` | Stage tab | `from_stage`, `to_stage` |
| `filter_sector_changed` | Sector select | `from_sector`, `to_sector` |
| `gated_preview_interaction` | Gated example cards | `interaction_kind` |

Base props: `signup_attribution_source: "fresh_capital"`, `surface: "fresh_capital"`, plus `path` / `href` / `referrer` when `window` is defined (see `src/lib/freshCapitalAnalytics.ts`).

## Developer debugging (heatmap)

- In **dev** (`npm run dev`), grep the browser console for:
  - `[FreshCapital] heatmap_rpc` — per `fetchFreshCapitalLive` call: whether the optional heatmap RPC returned rows, errored, or was empty/unparsed.
  - `[FreshCapital] heatmap_page_source=` — per page query: final UI source `rpc` vs `fallback_sector_tag_counts`.

## Staging vs public launch

- **Staging QA:** acceptable once RPCs + grants + env are on a staging project and the three feed states (success / RPC error / misconfig) were manually checked; heatmap RPC optional.
- **Public launch:** require production env vars, migrations applied to **production** DB, anon grants verified, and analytics spot-checked in the live Mixpanel project.

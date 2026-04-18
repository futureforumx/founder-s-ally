# Fresh Capital (`/fresh-capital`) — public surface

## RPCs used (browser → `supabasePublicDirectory`, anon role)

| RPC | Purpose | `GRANT EXECUTE … TO anon` |
|-----|---------|---------------------------|
| `get_new_vc_funds` | Primary feed: firm, fund, sizes, dates, stage/sector/geo tags, `has_fresh_capital`, `likely_actively_deploying` (same expression as `get_active_funds_by_stage`), `fresh_capital_priority_score` (sort-only client), `source_confidence` (sort-only client). | **Required** — base grants in `20260418190000_vc_fund_canonicalization.sql`; extended return type in `20260423120000_get_new_vc_funds_likely_actively_deploying.sql` (drops/recreates function; re-applies `GRANT EXECUTE … TO anon`). |
| `get_capital_heatmap_backend` | Optional canonical sector/stage activity buckets when implemented server-side. | **Required** when the function exists; safe to omit until shipped |

## Not used on this page (avoid extra data exposure)

- `get_recent_fund_signals` — richer narrative fields; not needed for the current UI.
- `get_fresh_capital_firms` — firm rollup including `estimated_check_range_json`; not used to reduce surface area.
- `get_active_funds_by_stage` — **removed** from the Fresh Capital client after `likely_actively_deploying` was added to `get_new_vc_funds` so badge semantics match one SQL definition.

## Leakage review (anon)

- **Partner / intro paths:** not present in `get_new_vc_funds` return set.
- **Internal scoring:** `fresh_capital_priority_score` and `source_confidence` are returned for **server-consistent ordering**; the UI must not render numeric scores (only badges). `metadata` / `field_provenance` on `vc_funds` are **not** selected.

## Demo data (`VITE_FRESH_CAPITAL_DEMO`)

- Demo rows are **only** returned when `import.meta.env.PROD` is false **and** `VITE_FRESH_CAPITAL_DEMO=true`.
- Production builds **never** use demo rows, including when RPCs fail (user sees error / empty per React Query).

## Heatmap: RPC vs fallback

- **Canonical:** `get_capital_heatmap_backend` when it returns a non-empty normalized array.
- **Fallback:** counts how many **feed rows** (from `get_new_vc_funds`, same query that populates the wide list) mention each `sector_focus` tag; top N by count; tiers by relative share (66% / 33% cutoffs). This approximates “announcement density by sector tag” but **does not** replicate fund-weighted or time-windowed server logic until a heatmap RPC is deployed.

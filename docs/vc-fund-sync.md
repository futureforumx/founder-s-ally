**VC Fund Sync**

This rollout keeps `public.firm_records` as the canonical firm identity model, adds a richer `public.vc_funds` layer for fund-specific intelligence, mirrors a compatibility subset back into `public.fund_records`, and now adds staged detection plus selective verification so cheap signals can be clustered before canonical promotion.

**Schema**

- `public.vc_funds` is the canonical fund table keyed by `firm_record_id + normalized_name + vintage_year` via `normalized_key`.
  - Verified freshness fields now live here too: `verification_status`, `last_verified_at`, `freshness_synced_at`, `latest_source_published_at`.
- `public.vc_fund_sources` stores append-only provenance per source artifact.
- `public.vc_fund_people` links inferred partners to a fund through `firm_investors` when possible, with a fallback `canonical_person_key`.
- `public.vc_fund_signals` is the domain event stream for fund activity and can be mirrored into `intelligence_events`.
- `public.candidate_capital_events` is the low-cost staging/cluster table for weak or early capital signals.
- `public.candidate_capital_event_evidence` stores append-only evidence URLs and raw payloads per candidate cluster.
- `public.firm_records` gets derived capital fields: `last_fund_announcement_date`, `latest_fund_size_usd`, `has_fresh_capital`, `active_fund_vintage`, `last_capital_signal_at`, `fresh_capital_priority_score`, `estimated_check_range_json`, `active_fund_count`.
- `public.firm_records` is also the canonical firm freshness surface: `likely_actively_deploying`, `capital_freshness_boost_score`, `freshness_synced_at`, `freshness_verified_at`, `latest_verified_vc_fund_id`, `recent_capital_signal_count`.
- `public.firm_records.likely_actively_deploying` and `public.firm_records.capital_freshness_boost_score` are ranking-ready backend inputs.
- `public.firm_investors.capital_freshness_boost_score` and `public.firm_investors.last_capital_signal_at` expose investor-level capital freshness inputs for later ranking work.
- `public.fund_records.canonical_vc_fund_id` provides a compatibility bridge for legacy reads, with mirrored `verification_status`, `last_verified_at`, and `canonical_freshness_synced_at`.
- `public.vc_fund_sync_runs` is the lightweight ops log for detect / verify / promote / rederive / mirror / daily jobs, and `public.vc_fund_sync_latest_runs` exposes the latest run per phase.

**Sync Flow**

1. A real official-website adapter scans likely firm news/press/blog pages and returns lightweight capital-event candidates.
2. A second external-news adapter pulls low-cost press/news corroboration from configured news APIs and only refetches likely fund pages.
3. Matching resolves the firm against `firm_records` using website host, aliases, and token overlap.
4. Candidate scoring assigns deterministic confidence plus corroboration/conflict signals.
5. Clustering rolls repeated sightings into `candidate_capital_events` and preserves append-only evidence in `candidate_capital_event_evidence`.
6. Selective verification re-fetches only escalated clusters, refines parsed fields, and either verifies, keeps escalated, routes to review, or rejects.
7. Promotion takes verified clusters, plus strict official-source exceptions, upserts `vc_funds`, stamps canonical verification/freshness metadata, attaches `vc_fund_sources`, links people, emits `vc_fund_signals`, refreshes firm derivations, and mirrors a subset into `fund_records`.
8. Re-derive refreshes canonical firm freshness on `firm_records` and investor ranking inputs on `firm_investors`.
9. Mirroring pushes `vc_fund_signals` into `intelligence_events` with stable dedupe keys and entity links.

**Source Priority**

- Highest: `official_website`, `sec_filing`, `adv_filing`
- Mid: `press_release`, `structured_provider`
- Lower: `news_article`, `rss`
- Fallback: `manual`, `inferred`, `other`

Field-specific overrides favor filings for `vintageYear`, `targetSizeUsd`, `finalSizeUsd`, and official/press sources for `announcedDate` and partner mentions.

**Matching Rules**

- Firm match:
  - exact source host + exact firm/alias name
  - exact source host
  - exact normalized name or alias
  - token-overlap fallback with review if confidence < `0.72`
- Fund match:
  - deterministic `normalized_key`
  - `normalizeFundName` collapses LP suffixes, Roman numerals, ordinals, and vehicle synonyms
  - `extractFundSequenceNumber` detects `Fund II`, `Fund 3`, etc.
- Exclusions:
  - generic fundraising headlines without a vehicle name
  - portfolio financing news (`Series A`, `lead investor`, `funding round`) that is not a fund vehicle announcement

**Candidate Thresholds**

- ignore: `< 0.28`
- pending: `0.28 - 0.5199`
- review: `0.52 - 0.7199`
- escalated: `0.72 - 0.8999`
- verified: `>= 0.90`
- official-source auto-promote: `>= 0.94`
- verification band: `0.72 - 0.93`

**Jobs**

- `scripts/vc-fund-sync/backfill.ts`: historical catch-up
- `scripts/vc-fund-sync/daily.ts`: daily incremental sync (`detect -> verify -> promote -> rederive -> mirror`)
- `scripts/vc-fund-sync/detect.ts`: candidate detection and staging only
- `scripts/vc-fund-sync/verify.ts`: selective verification for escalated candidate clusters
- `scripts/vc-fund-sync/promote.ts`: promote staged candidates into canonical funds and signals
- `scripts/vc-fund-sync/mirror.ts`: mirror fund signals into `intelligence_events`
- `scripts/vc-fund-sync/heatmap.ts`: backend heatmap aggregation fetch/refresh path
- `scripts/vc-fund-sync/repair.ts`: rerun ambiguous or partial items
- `scripts/vc-fund-sync/rederive.ts`: refresh firm-level freshness flags and scoring

All jobs are idempotent because writes are keyed on `normalized_key`, source URLs/content hashes, and signal `dedupe_key`.
Run observability is append-only in `vc_fund_sync_runs`, keyed by phase + timestamp rather than mutable singleton state.

**RPCs**

- `get_new_vc_funds`
- `get_recent_fund_signals`
- `get_firm_funds`
- `get_fresh_capital_firms`
- `get_active_funds_by_stage`
- `get_candidate_capital_events_for_review`
- `get_recent_fresh_capital_backend`
- `get_capital_heatmap_backend`
- `get_firms_with_fresh_capital_backend`

These support stage, sector, geography, fund-size, firm-type, and recency filters for Investors, Research, Market, and ranking use cases.
Public/backend freshness RPCs now read only from canonical `vc_funds` rows whose `verification_status` is verified/manual-reviewed/official-source-promoted.

**Assumptions**

- `firm_records` is the only canonical firm identity anchor for this rollout.
- `firm_investors` is the preferred people bridge for inferred GP/partner links.
- Existing `fund_records` remains live until UI and service consumers finish migrating to `vc_funds`.
- Generic `intelligence_events` is now mirrored from `vc_fund_signals`; feed-specific ranking/presentation can build on that later.

**Risks**

- Some environments may not yet have `firm_investors`; the service tolerates an empty lookup, but partner linkage quality drops.
- Legacy `fund_records` still uses a simpler shape than `vc_funds`, so compatibility mirroring necessarily loses field richness.
- Firm creation should stay conservative in production; the default daily job disables automatic firm creation.
- The official website and external news adapters are intentionally conservative and optimized for cheap signal detection first; SEC filings or structured-provider verification should be the next corroboration expansion.

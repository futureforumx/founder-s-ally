-- Verification queries for Latest Funding → get_recent_funding_feed (run in SQL editor or psql).
-- Replace limits as needed.

-- 1) Pipeline health: recent fi_fetch_runs
SELECT fr.id,
       fs.slug,
       fr.status,
       fr.started_at,
       fr.completed_at,
       fr.docs_fetched,
       fr.docs_parsed,
       fr.deals_upserted,
       fr.error_summary
FROM public.fi_fetch_runs fr
JOIN public.fi_sources fs ON fs.id = fr.source_id
ORDER BY fr.started_at DESC
LIMIT 25;

-- 2) Canonical inventory
SELECT count(*) FILTER (WHERE duplicate_of_deal_id IS NULL AND needs_review = false) AS canonical_visible,
       count(*) FILTER (WHERE duplicate_of_deal_id IS NOT NULL) AS duplicates,
       count(*) FILTER (WHERE needs_review) AS needs_review_ct,
       count(*) FILTER (WHERE primary_source_url IS NULL AND primary_press_url IS NULL) AS missing_any_url,
       count(*) FILTER (WHERE announced_date IS NULL) AS missing_announced_date
FROM public.fi_deals_canonical;

-- 3) Legacy inventory
SELECT count(*) AS legacy_rows,
       count(*) FILTER (WHERE duplicate_of_deal_id IS NOT NULL) AS dupes
FROM public.funding_deals
WHERE duplicate_of_deal_id IS NULL AND COALESCE(needs_review, false) = false;

-- 4) What the RPC returns (same as app)
SELECT *
FROM public.get_recent_funding_feed(40);

-- 5) Source mix in RPC output (after deploy of 20260430140000)
SELECT source_type,
       confirmation_status,
       count(*) AS n
FROM public.get_recent_funding_feed(200) AS f
GROUP BY 1, 2
ORDER BY n DESC;

-- 6) Spot-check ids: are winners mostly fi_* uuid vs legacy prisma style?
SELECT left(id, 8) AS id_prefix,
       source_type,
       confirmation_status,
       company_name,
       announced_at
FROM public.get_recent_funding_feed(30);

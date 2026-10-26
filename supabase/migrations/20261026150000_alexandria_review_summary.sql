-- Admin console "Record Enrichment" insight cards.
-- Counts distinct records (not fields) that still need a human decision after Alexandria enrichment:
--   * pending candidate values (medium-confidence / conflicting facts that were NOT written), and
--   * pending alexandria_identity_match reviews (ambiguous matches that were NOT written).
-- "needs_review" is the recent slice (candidates/reviews created in the last p_recent_days),
-- "backlog" is everything still pending. Aggregates only: no field values are returned.

CREATE OR REPLACE FUNCTION public.alexandria_review_summary(p_recent_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pending_fields AS (
    SELECT entity_type::text AS entity_type, entity_id::text AS entity_id, created_at
    FROM public.enrichment_candidate_values
    WHERE status = 'pending' AND run_id IS NOT NULL
  ),
  pending_identity AS (
    SELECT COALESCE(review_data->>'entity_type', 'firm') AS entity_type,
           COALESCE(review_data->>'entity_id', firm_id::text, entity_id) AS entity_id,
           created_at
    FROM public.enrichment_review_queue
    WHERE entity_type::text = 'alexandria_identity_match' AND status::text = 'pending'
  ),
  records AS (
    SELECT entity_type, entity_id,
           count(*)        AS pending_fields,
           min(created_at) AS oldest_at,
           max(created_at) AS newest_at,
           0               AS identity_reviews
    FROM pending_fields GROUP BY entity_type, entity_id
    UNION ALL
    SELECT entity_type, entity_id, 0, min(created_at), max(created_at), count(*)
    FROM pending_identity GROUP BY entity_type, entity_id
  ),
  merged AS (
    SELECT entity_type, entity_id,
           sum(pending_fields)::int    AS pending_fields,
           sum(identity_reviews)::int  AS identity_reviews,
           min(oldest_at)              AS oldest_at,
           max(newest_at)              AS newest_at
    FROM records GROUP BY entity_type, entity_id
  ),
  recent AS (
    SELECT * FROM merged WHERE newest_at >= now() - make_interval(days => GREATEST(p_recent_days, 1))
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'recent_days', GREATEST(p_recent_days, 1),
    'needs_review', jsonb_build_object(
      'records', (SELECT count(*) FROM recent),
      'fields', (SELECT COALESCE(sum(pending_fields), 0) FROM recent),
      'identity_reviews', (SELECT COALESCE(sum(identity_reviews), 0) FROM recent),
      'by_entity', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('entity_type', entity_type, 'records', n) ORDER BY entity_type)
        FROM (SELECT entity_type, count(*) AS n FROM recent GROUP BY entity_type) t), '[]'::jsonb)
    ),
    'backlog', jsonb_build_object(
      'records', (SELECT count(*) FROM merged),
      'fields', (SELECT COALESCE(sum(pending_fields), 0) FROM merged),
      'identity_reviews', (SELECT COALESCE(sum(identity_reviews), 0) FROM merged),
      'older_records', (SELECT count(*) FROM merged WHERE newest_at < now() - make_interval(days => GREATEST(p_recent_days, 1))),
      'oldest_at', (SELECT min(oldest_at) FROM merged),
      'by_entity', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('entity_type', entity_type, 'records', n) ORDER BY entity_type)
        FROM (SELECT entity_type, count(*) AS n FROM merged GROUP BY entity_type) t), '[]'::jsonb)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.alexandria_review_summary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alexandria_review_summary(integer) TO service_role;

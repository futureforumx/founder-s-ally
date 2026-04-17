-- GP/LP fund-close articles were sometimes stored with the VC as company_name.
-- Public feed hides needs_review; mark historical rows matching ingest heuristics.
UPDATE public.funding_deals fd
SET
  needs_review = true,
  review_reason = 'likely_vc_fund_raise_not_portfolio'
FROM public.source_articles sa
WHERE sa.id = fd.source_article_id
  AND fd.slot_index = 0
  AND COALESCE(fd.needs_review, false) IS NOT TRUE
  AND (
    lower(sa.title) ~ 'raises\s+\$[0-9,.]+\s*[kmb]?[^.]{0,160}to back'
    OR lower(sa.title) ~ 'raises\s+\$[0-9,.]+\s*[kmb]?[^.]{0,120}\s+fund\b'
    OR lower(sa.title) ~ 'raises\s+\$[0-9,.]+\s*[kmb]?[^.]{0,120}(new|latest|inaugural)\s+fund\b'
    OR lower(left(coalesce(sa.raw_text, ''), 3000) || E'\n' || sa.title)
      ~ 'closes\s+\$[0-9,.]+\s*[kmb]?[^.]{0,160}\s+fund\b'
    OR lower(left(coalesce(sa.raw_text, ''), 3000) || E'\n' || sa.title)
      ~ 'final\s+close[^.]{0,120}\s+fund\b'
    OR (
      lower(left(coalesce(sa.raw_text, ''), 3000)) ~ 'lp\s+commitments?'
      AND lower(left(coalesce(sa.raw_text, ''), 3000)) ~ '\s+fund\b'
      AND lower(left(coalesce(sa.raw_text, ''), 3000)) ~ '\$\s*[0-9,.]+[kmb]?'
    )
  );

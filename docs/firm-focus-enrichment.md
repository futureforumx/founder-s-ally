# Firm Focus Enrichment

This pipeline fills missing venture-firm focus data in `public.firm_records` using a targeted source waterfall:

1. Official firm site
2. Official blog / news / announcements
3. TechCrunch
4. PR fallback

It writes:

- Canonical firm fields on `public.firm_records`
- Run-level logs to `public.firm_enrichment_runs`
- Field-level winner/candidate rows to `public.firm_field_values`
- Raw supporting evidence to `public.firm_source_evidence`
- Compatibility provenance to `public.firm_field_sources`
- Low-confidence / conflicting cases to `public.enrichment_review_queue`

## Run dry-run

```bash
pnpm tsx scripts/enrich-firm-focus.ts --limit=200 --commit=false
```

Optional flags:

```bash
pnpm tsx scripts/enrich-firm-focus.ts \
  --limit=200 \
  --offset=0 \
  --firm-id=<uuid> \
  --min-confidence=0.72 \
  --report-path=reports/firm-focus.csv \
  --commit=false
```

## Run commit mode

```bash
pnpm tsx scripts/enrich-firm-focus.ts --limit=200 --commit=true
```

## Confidence scoring

- `official_site`: starts at `0.96`
- `official_blog`: starts at `0.92`
- `techcrunch`: starts at `0.84`
- `press_release`: starts at `0.74`
- `other`: starts at `0.55`

Field confidence is then adjusted slightly by extraction explicitness. The final `extraction_confidence` stored on `firm_records` is the average confidence of winning field values for that firm in the run.

## Manual review

The pipeline routes a firm to `public.enrichment_review_queue` when:

- winning evidence remains below the configured confidence threshold
- multiple sources disagree on the same field without a clear priority gap
- a run produces evidence but still cannot safely fill the missing fields

Those firms are also marked with:

- `firm_records.manual_review_status = 'needs_review'`
- `firm_records.needs_review = true`

## Canonical field mapping

- `themes` in the enrichment object maps to `firm_records.investment_themes`
- `latest_fund_announcement_date` is written to both:
  - `firm_records.latest_fund_announcement_date`
  - `firm_records.last_fund_announcement_date`
- `extraction_confidence` is also mirrored into `firm_records.intel_confidence_score`

## Output report

Each run writes a CSV report under `reports/` with:

- `firm_name`
- `missing_fields_before`
- `fields_filled`
- `extraction_confidence`
- `latest_fund_name`
- `latest_fund_size_usd`
- `evidence_count`
- `needs_manual_review`

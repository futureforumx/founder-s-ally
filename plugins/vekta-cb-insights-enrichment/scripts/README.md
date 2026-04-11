# Scripts

Use this folder for scripts that support the CB Insights enrichment workflow for VEKTA APP data.

## Available script

`cb-insights-enrichment.ts`

- `prepare` builds editable review queues from the repo's investor and firm CSVs.
- `merge` takes those reviewed queues and writes app-ready CSV outputs with CB Insights columns appended.
- Base source fields are only backfilled when they are currently blank.

## Usage

```bash
npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts prepare
npx tsx plugins/vekta-cb-insights-enrichment/scripts/cb-insights-enrichment.ts merge
```

## Workflow

1. Run `prepare` to generate `data/cb-insights/investor-review-queue.csv` and `data/cb-insights/firm-review-queue.csv`.
2. Fill in the `CB Insights ...` columns during manual review or after an automated scrape.
3. Run `merge` to produce merged CSVs under `data/cb-insights/merged/`.

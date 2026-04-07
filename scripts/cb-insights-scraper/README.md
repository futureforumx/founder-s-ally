# CB Insights Scraper

Playwright-based scraper that enriches `firm_records` and `firm_investors` in Supabase with data from CB Insights investor profiles.

## Setup

```bash
cd scripts/cb-insights-scraper
npm install
npx playwright install chromium
cp .env.example .env   # then fill in your credentials
```

## Usage

```bash
# Full run (headless, live writes)
npm run scrape

# Watch the browser while it runs
npm run scrape:headed

# Dry run — scrapes but writes nothing to DB
npm run scrape:dry

# Only firms or only investors
node scraper.mjs --table=firms
node scraper.mjs --table=investors
```

## How it works

1. Logs into CB Insights with your credentials
2. Queries Supabase for `firm_records` that have a `website_url` but are missing key fields (description, AUM, founded year, HQ city, headcount)
3. Searches CB Insights for each firm by name, matches by domain
4. Scrapes the profile page for all available data
5. Updates only NULL/empty fields in the DB (never overwrites existing data)
6. Also scrapes team members and matches them against `firm_investors`
7. Repeats for standalone `firm_investors` missing bio/city data

## Resumability

Progress is saved to `scraper-progress.json` after each firm. If the script crashes or you stop it, re-running will skip already-processed records.

## Rate limiting

Default: 3 seconds between requests. Adjust `DELAY_MS` in `.env`. CB Insights may rate-limit or block if you go too fast.

## Fields enriched

### firm_records
- description, elevator_pitch
- hq_city, hq_state, hq_country
- founded_year, aum, total_headcount
- preferred_stage, thesis_verticals
- linkedin_url, x_url, facebook_url, crunchbase_url
- cb_insights_url
- Recent deals (written to firm_recent_deals)

### firm_investors
- bio, title
- city, state, country
- linkedin_url

# Fixture-only data quality report

**Run date:** 2026-11-02
**Input:** Four deliberately messy synthetic records in unit-test fixtures. No Crunchbase/Tracxn data, credentials, API requests, or production database were used.

| Measure | Before cleaning | After preview pipeline |
| --- | ---: | ---: |
| Rows inspected | 4 | 4 |
| Unique provider IDs | 4 | 4 |
| HTML/encoding or whitespace artifacts | 2 | 0 in normalized display values |
| Duplicate company suffixes | 1 | 0 in normalized company name |
| Tracking parameters in website URLs | 1 | 0 in normalized website URL |
| Country values confidently mapped | 1 | 1 ISO alpha-2 value |
| Partial dates | 1 | 1 preserved at original precision |
| Placeholder/title-ambiguous records quarantined | 0 in raw input | 2 |
| Funding round without explicit currency | 1 | 1 quarantined; no USD assumption |
| Records staged after validation | 0 | 1 |
| Fuzzy name-only automatic merges | 0 | 0 |
| Production canonical writes | 0 | 0 |

The test suite verifies these behaviors with targeted fixtures, including legal suffix repetition, placeholder names, embedded founder titles, malformed dates, missing currency, invalid websites, and exact-domain versus name-only identity resolution. The four-row counts above describe fixture checks, not a measured change to VEKTA's existing production database. No sample data was staged.

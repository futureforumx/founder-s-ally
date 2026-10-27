# Startup Domain Rating tracking

The backend uses Ahrefs' free `GET https://api.ahrefs.com/v3/public/domain-rating-free` endpoint with a server-side `AHREFS_API_KEY`, `output=json`, and pinned `AHREFS_RATING_VERSION=dr3`. Set secrets in the Vercel project environment; never expose the key with a `VITE_` name. The scheduled Vercel cron runs hourly and processes due records using `AHREFS_REFRESH_INTERVAL_HOURS` (24 by default), bounded by `AHREFS_REQUEST_BUDGET_PER_RUN` and `AHREFS_CONCURRENCY`. Set the existing `CRON_SECRET` in Vercel. Newly enabled records are due immediately and are picked up on the next hourly run.

## API

`POST /api/domain-rating`, authenticated with `Authorization: Bearer <Clerk session token>`. Each body supplies `ownerContextId` and `startupId`. Actions:

```json
{"action":"enable","ownerContextId":"<uuid>","startupId":"<startup id>"}
{"action":"change","ownerContextId":"<uuid>","startupId":"<startup id>","domain":"example.com"}
{"action":"status","ownerContextId":"<uuid>","startupId":"<startup id>","limit":90}
{"action":"refresh","ownerContextId":"<uuid>","startupId":"<startup id>"}
{"action":"stop","ownerContextId":"<uuid>","startupId":"<startup id>"}
```

Enable defaults to `startups.company_url`. Hosts are lowercased and IDNs converted to ASCII; schemes, ports, path, query, fragment, and terminal dot are removed. `www` and subdomains are preserved and tracked separately. IPs and local/internal hostnames are rejected. Requests only go to the fixed Ahrefs endpoint.

History stores actual successful observations only, keyed by domain and rating version. The current API's 7/30-day changes are null until a prior observation exists at or before each comparison point. Manual refresh obeys the same cooldown. The worker keeps the last valid observation and reports stale/error state on failure.

Ahrefs currently describes this endpoint as free; Vekta still incurs hosting and storage usage. Provider limits and availability can change. Keep Ahrefs attribution (“Domain Rating by Ahrefs”, https://ahrefs.com/) and follow its current license, including attribution and limits on redistribution, competing services, and bypassing limits. Vekta uses this only as a supporting metric for startup domains.

Apply the migration with the project's normal Supabase migration deployment. No live provider call is made without `AHREFS_API_KEY`.

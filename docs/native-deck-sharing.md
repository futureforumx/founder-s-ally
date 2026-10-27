# Native pitch deck sharing

Vekta hosts deck sharing on the existing Vercel and Supabase setup. Investor PDFs stay in the existing private pitch-deck storage (R2 first, private Supabase Storage for legacy keys). Vercel API routes check a hashed link token, expiration, revocation, and optional gates before issuing a short-lived HttpOnly viewer session. The PDF.js viewer then reads bytes through an authenticated Vekta proxy. Storage URLs and signed storage URLs are never sent to the investor browser.

Papermark is not used by the active application. The abandoned migration version is retained as a no-op for migration-history compatibility. If Papermark mapping tables or records already exist in a deployment, this feature does not query, delete, or rewrite them.

## Setup

1. Configure the existing Supabase project and private storage in Vercel. Required server variables are `SUPABASE_URL` (or the existing `VITE_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service key as a `VITE_` variable.
2. For R2 decks, configure `CF_R2_ENDPOINT` or `CF_R2_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, and `CF_R2_BUCKET_PITCH_DECKS`. The current Vekta uploader already uses this private bucket and stores `r2://` keys. Legacy private Supabase Storage keys in the existing `pitch-decks` bucket are supported as well.
3. Apply the native sharing migrations to the same Supabase project used by Vekta, including `20261026193329_native_deck_sharing_analytics.sql`, `20261026210930_deck_share_company_stage_snapshot.sql`, `20261026212720_deck_share_email_allowlist.sql`, and `20261026235102_deck_share_custom_urls.sql`. Review the complete pending migration list before applying it; this project contains unrelated pending migrations too.
4. Deploy the Vekta app through its existing GitHub to Vercel connection. No Papermark API key, webhook, service, or document-service plan is required.

Sharing currently accepts published PDF uploads. Each sharing link snapshots the PDF object key and upload timestamp. Uploading a newer deck creates a different Vekta deck row; old links remain pinned to their original version. New investor URLs use `/share/{company-name}/{random-suffix}`. The company segment follows the founder's current account company name. A company workspace is optional; share ownership and deck access are enforced against the authenticated founder, and new links do not require a workspace ID. The editable suffix defaults to 12 random lowercase letters and digits and can be changed or regenerated. A database unique index prevents duplicate public paths. Availability checks are advisory; create and edit also enforce uniqueness at write time. Editing a link after its company name changes updates that link's URL and invalidates its former path. Legacy opaque-token URLs continue to work until a link is edited to assign a branded path, at which point the old token URL is denied. Revoking a link retains its analytics history but immediately denies new viewer sessions and every subsequent PDF range request.

Contact email is optional, prefilled from the signed-in founder's profile, and stored on each link. Multiple links can point to different investors and deck versions; each has its own public path so attribution stays link-specific. Changing a custom path removes the prior path mapping. Password, email, expiration, and download/print settings remain enforced by the Vekta viewer and file proxy.

## Security and identity

- Each share token is a keyed HMAC-SHA-256 over a 256-bit Web Crypto nonce, authenticated owner ID, and operation version. That yields a retry-stable, unguessable token while the database stores only its SHA-256 digest. The plaintext is returned to the authenticated founder for copying and is not persisted.
- Optional passwords use scrypt hashes and constant-time comparison. Optional email gating records a self-submitted address as unverified. A confirmed Vekta account is labeled verified; the intended investor association is never treated as proof of identity.
- Founder management and analytics require a Supabase user verified by Supabase Auth or a signature-verified Clerk token. Each query checks the authenticated owner against the deck or link owner. Browser roles cannot select or mutate share/session/event tables directly.
- PDFs are read from private storage server-side and streamed from `/api/deck-share-file` only when the current link and session remain active. Signed Supabase URLs, where needed for legacy storage, remain inside the Vercel function.
- The “show download” option controls only a viewer shortcut. It does not prevent copying, screenshots, browser tools, or other ways of saving visible content.

## Analytics definitions

`deck_share_sessions` and `deck_share_events` are first-party Vekta records. A session starts only after PDF.js renders a slide and sends `session_start`; a file request by itself is not a view. The client reports slide visibility and active-time events in batches. Time increments are capped at 20 seconds and accrue only while the tab is visible, focused, and has recent user activity. Treat them as estimates, not precise measurements.

- **Visits:** sessions with a recorded first rendered slide.
- **Unique viewers:** distinct pseudonymous first-party browser IDs for the selected PDF version. Browser storage changes and separate browsers can split one person into multiple viewers.
- **Slide views:** distinct started sessions that rendered each slide.
- **Viewing time estimate:** accepted slide-time event seconds, deduplicated by event UUID.
- **Completion:** started sessions that rendered every known page in the PDF. It is unavailable when the deck has no known page count.
- **Returning visits:** additional sessions on the same link sharing a first-party browser ID.
- **Last activity:** latest accepted session start, slide view, or active-time event.
- **Identity:** anonymous, submitted-but-unverified email, or confirmed Vekta account. Intended recipient is shown separately.

Analytics are grouped by share link and exact uploaded PDF version. `lastSyncedAt` is the time the server calculated the current response; it is not a provider sync or a real-time delivery guarantee. Event UUID upserts make retries idempotent. A persistent Postgres rate-limit function applies limits across Vercel instances.

Legacy rows in `deck_share_views` remain stored and are not deleted. They are excluded from the new session and slide metrics because they do not contain validated PDF.js session events.

## Capacity and expected usage cost

This adds no storage or analytics vendor. PDF bytes remain in existing private storage; analytics use the existing Supabase Postgres database; viewer/API requests use the existing Vercel project. Actual incremental charges depend on the accounts' current plans, quotas, region, and total deck traffic.

For an example workload of 1,000 sessions averaging 10 minutes and 12 slides viewed, the client records roughly 40,000 active-time events, 12,000 slide-view events, 1,000 session starts, and up to 1,000 session ends (about 54,000 event rows, plus session rows and indexes). That is roughly 10–30 MB of Postgres growth as a planning estimate; measure actual table growth after rollout. Each 15-second active interval also invokes the Vercel event endpoint. PDF.js uses range reads through the Vercel proxy, so large decks and high view counts can use Vercel function duration and transfer quotas even though the R2 origin has no egress fee.

Cloudflare's current R2 Standard allowance includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations; standard storage above the allowance is listed at $0.015/GB-month, Class A at $4.50/million, Class B at $0.36/million, and R2 egress is free. See [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Supabase currently documents 500 MB database size on Free and 8 GB per project included on Pro, with additional database size at $0.125/GB. Existing plan quotas and organization usage determine whether these event rows add a charge. See [Supabase billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase).

Vercel currently lists 1 million function invocations included for Pro and charges by function usage beyond included quotas; PDF streaming also consumes function time and transfer capacity. The file proxy requests a 120-second maximum duration, which the deployed plan and runtime must permit. See [Vercel function pricing](https://vercel.com/docs/functions/usage-and-pricing) and [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration). Confirm current transfer limits before sharing large decks broadly.

## Validation and remaining prerequisites

The unit suite covers token and password hashing, expiration/revocation decisions, event validation, and denial of direct PDF requests without an active share session. The Supabase pgTAP test asserts server-only table and RPC access. A complete live publish/view/revoke/cross-startup isolation run requires the migration to be applied and deployed Vercel functions to use the same Supabase project and private storage configuration. Check Supabase database usage and R2 bucket bytes in their dashboards; remote usage queries were unavailable from this environment, Docker was not running for local Supabase, and no live migration was applied here.

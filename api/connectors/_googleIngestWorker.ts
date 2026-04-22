/**
 * Gmail / Google Calendar pull for one connected_account row.
 *
 * Staging dispatch (single path): inserts `connector_source_records`, then POSTs
 * `{ sourceRecordIds }` to the `source-record-created` Edge Function only.
 * The DB INSERT webhook on `connector_source_records` is removed (see migration
 * 20260422181000_drop_connector_source_records_insert_webhook).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const GMAIL_LIST_MAX = 25;
const GMAIL_DETAIL_MAX = 20;
const CAL_LIST_MAX = 25;

const STAGING_DISPATCH_PATH = "explicit_post_source_record_created" as const;

type GoogleOauthMeta = {
  refresh_token?: string | null;
  access_token?: string | null;
  expires_in?: number | null;
};

export type GoogleIngestResult = {
  provider: string;
  connected_account_id: string;
  /** Rows returned by the Google list API (message ids or calendar events). */
  records_fetched_from_api: number;
  /** external_ids already present for (owner_context_id, provider) — UNIQUE dedupe. */
  records_skipped_already_synced: number;
  /** New IDs not ingested because of GMAIL_DETAIL_MAX (Gmail only; calendar uses list cap only). */
  records_skipped_due_to_fetch_cap: number;
  /** UNIQUE (owner_context_id, provider, external_id) race / retry. */
  records_skipped_duplicate_insert: number;
  /** Gmail per-message GET failures. */
  records_detail_fetch_failed: number;
  source_records_inserted: number;
  edge_dispatch_path: typeof STAGING_DISPATCH_PATH;
  edge_invoke_ok: boolean;
  edge_invoke_status: number;
  edge_invoke_snippet: string;
  errors: string[];
  refreshed_tokens: boolean;
};

function ingestLog(ownerContextId: string, accountId: string, provider: string, message: string): void {
  console.log(`[google-ingest] context=${ownerContextId} account=${accountId} provider=${provider} ${message}`);
}

/**
 * Loads external_ids already stored for this owner + provider.
 * Dedupe key matches DB: UNIQUE (owner_context_id, provider, external_id).
 */
async function loadSyncedExternalIdsSet(
  supabase: SupabaseClient,
  ownerContextId: string,
  provider: "gmail" | "google_calendar",
): Promise<Set<string>> {
  const { data: existingRows, error } = await supabase
    .from("connector_source_records")
    .select("external_id")
    .eq("owner_context_id", ownerContextId)
    .eq("provider", provider);

  if (error) {
    ingestLog(ownerContextId, "", provider, `loadSyncedExternalIdsSet failed: ${error.message}`);
    throw new Error(`Failed to load existing connector_source_records: ${error.message}`);
  }

  return new Set((existingRows ?? []).map((r: { external_id: string }) => r.external_id));
}

function getMeta(account: { metadata: unknown }): GoogleOauthMeta {
  const m = account.metadata as { google_oauth?: GoogleOauthMeta } | null;
  return m?.google_oauth ?? {};
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in?: number }> {
  const cid = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const sec = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!cid || !sec) throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cid,
      client_secret: sec,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return (await res.json()) as { access_token: string; expires_in?: number };
}

async function persistNewAccessToken(
  supabase: SupabaseClient,
  accountId: string,
  metadataRoot: Record<string, unknown>,
  accessToken: string,
  expiresIn?: number,
): Promise<void> {
  const prevGo = (metadataRoot.google_oauth as GoogleOauthMeta) ?? {};
  const go: GoogleOauthMeta = {
    ...prevGo,
    access_token: accessToken,
    expires_in: expiresIn ?? prevGo.expires_in ?? null,
  };
  const nextMeta = { ...metadataRoot, google_oauth: go };
  const { error } = await supabase.from("connected_accounts").update({ metadata: nextMeta, updated_at: new Date().toISOString() }).eq("id", accountId);
  if (error) throw new Error(`Failed to persist refreshed token: ${error.message}`);
}

/** Returns a valid access token, refreshing (and persisting) when using refresh_token. */
async function ensureAccessToken(
  supabase: SupabaseClient,
  account: { id: string; metadata: unknown },
): Promise<{ accessToken: string; refreshed: boolean }> {
  const root = { ...((account.metadata ?? {}) as Record<string, unknown>) };
  const go = getMeta({ metadata: root });
  if (go.refresh_token?.trim()) {
    const t = await refreshAccessToken(go.refresh_token.trim());
    await persistNewAccessToken(supabase, account.id, root, t.access_token, t.expires_in);
    return { accessToken: t.access_token, refreshed: true };
  }
  const at = go.access_token?.trim();
  if (!at) throw new Error("No Google OAuth token on connected account");
  return { accessToken: at, refreshed: false };
}

async function googleFetch(accessToken: string, url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}

type GmailHeader = { name?: string; value?: string };

function headersMap(headers: GmailHeader[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) m[h.name.toLowerCase()] = h.value;
  }
  return m;
}

function gmailMessageToRaw(msg: {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[] };
}): Record<string, unknown> {
  const h = headersMap(msg.payload?.headers);
  return {
    id: msg.id,
    threadId: msg.threadId ?? null,
    snippet: msg.snippet ?? null,
    subject: h["subject"] ?? null,
    from: h["from"] ?? null,
    to: h["to"] ?? null,
    cc: h["cc"] ?? null,
    bcc: h["bcc"] ?? null,
    internalDate: msg.internalDate ?? null,
    labelIds: msg.labelIds ?? [],
    provider: "gmail",
  };
}

/** Only staging path: POST batches to source-record-created (no DB webhook). */
async function dispatchStagingViaEdgeFunction(recordIds: string[]): Promise<{ ok: boolean; status: number; snippet: string }> {
  if (recordIds.length === 0) return { ok: true, status: 0, snippet: "" };
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    return { ok: false, status: 0, snippet: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }
  const url = `${base}/functions/v1/source-record-created`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const wh = process.env.SUPABASE_WEBHOOK_SECRET;
  if (wh) headers["x-webhook-secret"] = wh;

  const chunks: string[] = [];
  const batchSize = 20;
  let ok = true;
  let lastStatus = 200;
  for (let i = 0; i < recordIds.length; i += batchSize) {
    const slice = recordIds.slice(i, i + batchSize);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ sourceRecordIds: slice }),
    });
    lastStatus = res.status;
    const text = await res.text();
    chunks.push(text.slice(0, 300));
    if (!res.ok) ok = false;
  }
  return { ok, status: lastStatus, snippet: chunks.join(" | ") };
}

export async function ingestGoogleConnectedAccount(
  supabase: SupabaseClient,
  ownerContextId: string,
  account: { id: string; provider: string; metadata: unknown },
  syncRunId: string,
): Promise<GoogleIngestResult> {
  const errors: string[] = [];
  let sourceRecordsInserted = 0;
  let edgeOk = true;
  let edgeStatus = 200;
  let edgeSnippet = "";
  let refreshedTokens = false;

  let recordsFetchedFromApi = 0;
  let skippedAlready = 0;
  let skippedCap = 0;
  let skippedDupInsert = 0;
  let detailFetchFailed = 0;

  try {
    const { accessToken, refreshed } = await ensureAccessToken(supabase, account);
    refreshedTokens = refreshed;

    if (account.provider === "gmail") {
      const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      listUrl.searchParams.set("maxResults", String(GMAIL_LIST_MAX));
      listUrl.searchParams.set("q", "newer_than:14d");
      const listRes = await googleFetch(accessToken, listUrl.toString());
      if (!listRes.ok) {
        const t = await listRes.text();
        errors.push(`gmail.list (${listRes.status}): ${t.slice(0, 200)}`);
      } else {
        const listJson = (await listRes.json()) as { messages?: { id: string }[] };
        const ids = (listJson.messages ?? []).map((m) => m.id).filter(Boolean);
        recordsFetchedFromApi = ids.length;

        const existing = await loadSyncedExternalIdsSet(supabase, ownerContextId, "gmail");

        skippedAlready = ids.filter((id) => existing.has(id)).length;
        const candidates = ids.filter((id) => !existing.has(id));
        skippedCap = Math.max(0, candidates.length - GMAIL_DETAIL_MAX);
        const newIds = candidates.slice(0, GMAIL_DETAIL_MAX);

        ingestLog(
          ownerContextId,
          account.id,
          "gmail",
          `list=${ids.length} alreadySynced=${skippedAlready} capSkip=${skippedCap} toDetail=${newIds.length}`,
        );

        const insertedIds: string[] = [];

        for (const mid of newIds) {
          const mUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(mid)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Subject&metadataHeaders=Date`;
          const mRes = await googleFetch(accessToken, mUrl);
          if (!mRes.ok) {
            detailFetchFailed++;
            errors.push(`gmail.get ${mid} (${mRes.status})`);
            continue;
          }
          const msg = (await mRes.json()) as Parameters<typeof gmailMessageToRaw>[0];
          const raw = gmailMessageToRaw(msg);
          const { data: ins, error: insErr } = await supabase
            .from("connector_source_records")
            .insert({
              owner_context_id: ownerContextId,
              sync_run_id: syncRunId,
              provider: "gmail",
              record_type: "email",
              external_id: mid,
              raw_data: raw,
            })
            .select("id")
            .single();

          if (insErr) {
            if ((insErr as { code?: string }).code === "23505") {
              skippedDupInsert++;
              ingestLog(ownerContextId, account.id, "gmail", `duplicate_insert_skip id=${mid}`);
              continue;
            }
            errors.push(`insert ${mid}: ${insErr.message}`);
            continue;
          }
          if (ins?.id) insertedIds.push(ins.id as string);
          sourceRecordsInserted++;
        }

        const inv = await dispatchStagingViaEdgeFunction(insertedIds);
        edgeOk = inv.ok;
        edgeStatus = inv.status;
        edgeSnippet = inv.snippet;
        if (!inv.ok) errors.push(`source-record-created: HTTP ${inv.status}`);
        ingestLog(
          ownerContextId,
          account.id,
          "gmail",
          `inserted=${sourceRecordsInserted} edgeOk=${inv.ok} dupSkip=${skippedDupInsert} detailFail=${detailFetchFailed}`,
        );
      }
    } else if (account.provider === "google_calendar") {
      const timeMin = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const calUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      calUrl.searchParams.set("maxResults", String(CAL_LIST_MAX));
      calUrl.searchParams.set("singleEvents", "true");
      calUrl.searchParams.set("orderBy", "startTime");
      calUrl.searchParams.set("timeMin", timeMin);

      const calRes = await googleFetch(accessToken, calUrl.toString());
      if (!calRes.ok) {
        const t = await calRes.text();
        errors.push(`calendar.list (${calRes.status}): ${t.slice(0, 200)}`);
      } else {
        const calJson = (await calRes.json()) as { items?: Record<string, unknown>[] };
        const items = calJson.items ?? [];
        recordsFetchedFromApi = items.length;

        const existing = await loadSyncedExternalIdsSet(supabase, ownerContextId, "google_calendar");

        let skippedCal = 0;
        const insertedIds: string[] = [];
        for (const ev of items) {
          const eid = typeof ev.id === "string" ? ev.id : null;
          if (!eid) continue;
          if (existing.has(eid)) {
            skippedCal++;
            continue;
          }

          const { data: ins, error: insErr } = await supabase
            .from("connector_source_records")
            .insert({
              owner_context_id: ownerContextId,
              sync_run_id: syncRunId,
              provider: "google_calendar",
              record_type: "calendar_event",
              external_id: eid,
              raw_data: ev,
            })
            .select("id")
            .single();

          if (insErr) {
            if ((insErr as { code?: string }).code === "23505") {
              skippedDupInsert++;
              ingestLog(ownerContextId, account.id, "google_calendar", `duplicate_insert_skip id=${eid}`);
              continue;
            }
            errors.push(`insert ${eid}: ${insErr.message}`);
            continue;
          }
          if (ins?.id) insertedIds.push(ins.id as string);
          sourceRecordsInserted++;
        }
        skippedAlready = skippedCal;

        ingestLog(
          ownerContextId,
          account.id,
          "google_calendar",
          `list=${items.length} alreadySynced=${skippedAlready} inserted=${sourceRecordsInserted}`,
        );

        const inv = await dispatchStagingViaEdgeFunction(insertedIds);
        edgeOk = inv.ok;
        edgeStatus = inv.status;
        edgeSnippet = inv.snippet;
        if (!inv.ok) errors.push(`source-record-created: HTTP ${inv.status}`);
      }
    } else {
      errors.push(`Unsupported provider ${account.provider}`);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return {
    provider: account.provider,
    connected_account_id: account.id,
    records_fetched_from_api: recordsFetchedFromApi,
    records_skipped_already_synced: skippedAlready,
    records_skipped_due_to_fetch_cap: skippedCap,
    records_skipped_duplicate_insert: skippedDupInsert,
    records_detail_fetch_failed: detailFetchFailed,
    source_records_inserted: sourceRecordsInserted,
    edge_dispatch_path: STAGING_DISPATCH_PATH,
    edge_invoke_ok: edgeOk,
    edge_invoke_status: edgeStatus,
    edge_invoke_snippet: edgeSnippet,
    errors,
    refreshed_tokens: refreshedTokens,
  };
}

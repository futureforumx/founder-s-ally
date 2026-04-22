import { getClerkUserIdFromAuthHeader } from "../_clerkFromRequest";
import { getSupabaseServiceClient } from "../_supabaseServiceClient";
import { assertConnectorManagementForUser, isUuid } from "../_ownerContextAccess";
import { ingestGoogleConnectedAccount } from "./_googleIngestWorker";

type AccountRow = { id: string; provider: string; metadata: unknown };

/**
 * Google resync: creates per-account sync_runs, pulls Gmail/Calendar via Google APIs,
 * inserts connector_source_records, and invokes `source-record-created` for staging + graph promotion.
 * Google Sheets accounts can be linked, but they are not part of the ingest/resync pipeline yet.
 */
export async function runGoogleResync(input: {
  authorization: string | undefined;
  owner_context_id: string | undefined;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  const ownerContextId = typeof input.owner_context_id === "string" ? input.owner_context_id.trim() : "";
  if (!isUuid(ownerContextId)) {
    return { status: 400, json: { error: "owner_context_id must be a UUID" } };
  }

  const userId = await getClerkUserIdFromAuthHeader(input.authorization);
  if (!userId) {
    return { status: 401, json: { error: "Missing or invalid Authorization bearer token" } };
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { status: 500, json: { error: "Server missing Supabase service configuration" } };
  }

  const gate = await assertConnectorManagementForUser(supabase, userId, ownerContextId);
  if (!gate.ok) {
    return { status: 403, json: { error: gate.message } };
  }

  const { data: accounts, error: accErr } = await supabase
    .from("connected_accounts")
    .select("id, provider, metadata")
    .eq("owner_context_id", ownerContextId)
    .in("provider", ["gmail", "google_calendar"])
    .eq("status", "active");

  if (accErr) {
    return { status: 500, json: { error: "Failed to load Google accounts", detail: accErr.message } };
  }

  const list = (accounts ?? []) as AccountRow[];
  if (!list.length) {
    return { status: 404, json: { error: "No active Gmail or Google Calendar connection for this context" } };
  }

  const started = new Date().toISOString();
  const results: Record<string, unknown>[] = [];

  for (const account of list) {
    const { data: runRow, error: runInsErr } = await supabase
      .from("sync_runs")
      .insert({
        connected_account_id: account.id,
        status: "running",
        started_at: started,
        metadata: {
          trigger: "api_connectors_google_resync",
          provider: account.provider,
          owner_context_id: ownerContextId,
          staging_dispatch_path: "explicit_post_source_record_created",
        },
      })
      .select("id")
      .single();

    if (runInsErr || !runRow?.id) {
      results.push({
        provider: account.provider,
        sync_run_id: null,
        status: "failed",
        error: runInsErr?.message ?? "sync_run insert failed",
      });
      continue;
    }

    const syncRunId = runRow.id as string;

    const ingest = await ingestGoogleConnectedAccount(supabase, ownerContextId, account, syncRunId);

    const finished = new Date().toISOString();
    const listOrAuthFailure = ingest.errors.some((e) =>
      /token|gmail\.list|calendar\.list|No Google OAuth|Token refresh failed/i.test(e),
    );
    const finalStatus =
      ingest.source_records_inserted > 0
        ? "completed"
        : ingest.errors.length === 0
          ? "completed"
          : listOrAuthFailure
            ? "failed"
            : "completed";

    const skippedTotal =
      ingest.records_skipped_already_synced +
      ingest.records_skipped_due_to_fetch_cap +
      ingest.records_skipped_duplicate_insert;

    const { error: runUpdErr } = await supabase
      .from("sync_runs")
      .update({
        status: finalStatus,
        completed_at: finished,
        records_fetched: ingest.records_fetched_from_api,
        records_staged: ingest.source_records_inserted,
        error_message: ingest.errors.length ? ingest.errors.slice(0, 5).join(" | ").slice(0, 2000) : null,
        metadata: {
          trigger: "api_connectors_google_resync",
          provider: account.provider,
          owner_context_id: ownerContextId,
          connected_account_id: ingest.connected_account_id,
          staging_dispatch_path: ingest.edge_dispatch_path,
          started_at: started,
          finished_at: finished,
          source_records_inserted: ingest.source_records_inserted,
          records_skipped_total: skippedTotal,
          records_skipped_breakdown: {
            already_synced: ingest.records_skipped_already_synced,
            fetch_cap: ingest.records_skipped_due_to_fetch_cap,
            duplicate_insert: ingest.records_skipped_duplicate_insert,
            detail_fetch_failed: ingest.records_detail_fetch_failed,
          },
          edge_invoke_ok: ingest.edge_invoke_ok,
          edge_invoke_status: ingest.edge_invoke_status,
          edge_invoke_snippet: ingest.edge_invoke_snippet.slice(0, 1500),
          partial_errors: ingest.errors,
          token_refreshed: ingest.refreshed_tokens,
        },
      })
      .eq("id", syncRunId);

    if (runUpdErr) {
      results.push({
        provider: account.provider,
        sync_run_id: syncRunId,
        status: "failed",
        error: runUpdErr.message,
      });
      continue;
    }

    await supabase
      .from("connected_accounts")
      .update({ last_synced_at: finished, updated_at: finished })
      .eq("id", account.id);

    results.push({
      provider: account.provider,
      sync_run_id: syncRunId,
      status: finalStatus,
      source_records_inserted: ingest.source_records_inserted,
      edge_invoke_ok: ingest.edge_invoke_ok,
      errors: ingest.errors,
    });
  }

  const anyFailed = results.some((r) => r.status === "failed");
  const anyOk = results.some((r) => r.status === "completed");

  return {
    status: anyOk ? 200 : 502,
    json: {
      ok: anyOk,
      ...(anyOk ? {} : { error: "All Google sync attempts failed" }),
      owner_context_id: ownerContextId,
      accounts: list.length,
      results,
      partial_failure: anyFailed && anyOk,
    },
  };
}

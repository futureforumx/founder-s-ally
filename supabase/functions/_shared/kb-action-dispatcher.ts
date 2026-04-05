// =============================================================================
// Aurora KB — Action Dispatcher
// =============================================================================
// Generic action execution layer with preview and execute modes.
// Every action is logged to kb_action_logs for full auditability.
// Provider-specific logic is isolated behind the ActionProviderAdapter interface.
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  ActionRequest,
  ActionResult,
  ActionProviderAdapter,
} from "./kb-types.ts";

// ---------------------------------------------------------------------------
// Provider registry — adapters register here at startup
// ---------------------------------------------------------------------------
const providerRegistry = new Map<string, ActionProviderAdapter>();

export function registerProvider(adapter: ActionProviderAdapter): void {
  providerRegistry.set(adapter.providerName, adapter);
}

export function getProvider(name: string): ActionProviderAdapter | undefined {
  return providerRegistry.get(name);
}

export function listProviders(): string[] {
  return Array.from(providerRegistry.keys());
}

// ---------------------------------------------------------------------------
// previewAction — validate + simulate without executing
// ---------------------------------------------------------------------------
export async function previewAction(
  supabase: SupabaseClient,
  request: ActionRequest,
): Promise<ActionResult> {
  const adapter = resolveAdapter(request);

  // Validate payload
  const validation = adapter.validatePayload(request.actionType, request.payload);
  if (!validation.valid) {
    const logId = await createActionLog(supabase, request, "preview");
    const result: ActionResult = {
      status: "failed",
      actionLogId: logId,
      summary: `Validation failed: ${validation.errors?.join(", ")}`,
      failures: validation.errors?.map((e) => ({ error: e })),
    };
    await updateActionLog(supabase, logId, "failed", result, validation.errors?.join("; "));
    return result;
  }

  // Create audit log
  const logId = await createActionLog(supabase, request, "preview");

  try {
    // Delegate preview to adapter
    const result = await adapter.preview(request.actionType, request.payload);
    result.actionLogId = logId;

    await updateActionLog(supabase, logId, "preview", result);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown preview error";
    await updateActionLog(supabase, logId, "failed", undefined, errMsg);
    return {
      status: "failed",
      actionLogId: logId,
      summary: `Preview failed: ${errMsg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// executeAction — validate + execute through provider adapter
// ---------------------------------------------------------------------------
export async function executeAction(
  supabase: SupabaseClient,
  request: ActionRequest,
): Promise<ActionResult> {
  const adapter = resolveAdapter(request);

  // Validate payload
  const validation = adapter.validatePayload(request.actionType, request.payload);
  if (!validation.valid) {
    const logId = await createActionLog(supabase, request, "failed");
    const result: ActionResult = {
      status: "failed",
      actionLogId: logId,
      summary: `Validation failed: ${validation.errors?.join(", ")}`,
      failures: validation.errors?.map((e) => ({ error: e })),
    };
    await updateActionLog(supabase, logId, "failed", result, validation.errors?.join("; "));
    return result;
  }

  // Create audit log in "running" state
  const logId = await createActionLog(supabase, request, "running");

  try {
    // Execute through adapter
    const result = await adapter.execute(request.actionType, request.payload);
    result.actionLogId = logId;

    // Persist result
    await updateActionLog(supabase, logId, result.status, result);

    // Create external object links if the provider returned identifiers
    // TODO: Parse providerResponse for external IDs and create kb_external_object_links
    if (
      result.status === "success" &&
      request.relatedEntityType &&
      request.relatedEntityId &&
      result.providerResponse
    ) {
      await tryCreateExternalLink(supabase, request, result);
    }

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown execution error";
    await updateActionLog(supabase, logId, "failed", undefined, errMsg);
    return {
      status: "failed",
      actionLogId: logId,
      summary: `Execution failed: ${errMsg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveAdapter(request: ActionRequest): ActionProviderAdapter {
  const providerName = request.provider;
  if (!providerName) {
    throw new Error("provider is required in action request");
  }

  const adapter = getProvider(providerName);
  if (!adapter) {
    throw new Error(
      `Unknown provider: "${providerName}". Available: ${listProviders().join(", ") || "none"}`,
    );
  }

  return adapter;
}

async function createActionLog(
  supabase: SupabaseClient,
  request: ActionRequest,
  initialStatus: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("kb_action_logs")
    .insert({
      user_id: request.userId ?? null,
      workspace_id: request.workspaceId ?? null,
      action_type: request.actionType,
      target_provider: request.provider ?? null,
      status: initialStatus,
      preview_only: request.preview ?? false,
      related_entity_type: request.relatedEntityType ?? null,
      related_entity_id: request.relatedEntityId ?? null,
      request_payload: request.payload,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Failed to create action log: ${error.message}`);
    // Return a placeholder ID — action should still proceed
    return "00000000-0000-0000-0000-000000000000";
  }

  return data.id;
}

async function updateActionLog(
  supabase: SupabaseClient,
  logId: string,
  status: string,
  result?: ActionResult,
  errorMessage?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  };

  if (result) {
    update.response_payload = {
      status: result.status,
      summary: result.summary,
      successes: result.successes,
      failures: result.failures,
    };
  }

  if (errorMessage) {
    update.error_message = errorMessage;
  }

  const { error } = await supabase
    .from("kb_action_logs")
    .update(update)
    .eq("id", logId);

  if (error) {
    console.error(`Failed to update action log ${logId}: ${error.message}`);
  }
}

/**
 * Attempt to create an external object link from a successful action.
 * This is best-effort — failures are logged but do not propagate.
 */
async function tryCreateExternalLink(
  supabase: SupabaseClient,
  request: ActionRequest,
  result: ActionResult,
): Promise<void> {
  const response = result.providerResponse;
  if (!response || !request.relatedEntityType || !request.relatedEntityId) return;

  // Look for common external ID patterns in the provider response
  const externalId = (response as any).id ?? (response as any).externalId ?? (response as any).recordId;
  if (!externalId) return;

  try {
    await supabase.from("kb_external_object_links").insert({
      provider: request.provider ?? "unknown",
      entity_type: request.relatedEntityType,
      entity_id: request.relatedEntityId,
      external_object_type: request.actionType,
      external_object_id: String(externalId),
      external_url: (response as any).url ?? null,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Failed to create external object link: ${err}`);
  }
}

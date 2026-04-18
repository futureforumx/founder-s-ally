import { isOwnerContextUuid } from "@/lib/connectorContextStorage";

export type ConnectorClientAction =
  | { kind: "connect"; integrationKey: string; ownerContextId: string }
  | { kind: "disconnect"; integrationKey: string; ownerContextId: string }
  | { kind: "resync"; integrationKey: string; ownerContextId: string }
  | { kind: "linkedin_csv_upload"; fileName: string; fileSize: number; ownerContextId: string }
  | { kind: "gmail_sync_intent"; ownerContextId: string };

/**
 * Records the last connector action with `owner_context_id` for debugging and for a future edge pipeline.
 * Does not call the network when `owner_context_id` is not a real UUID (e.g. synthetic `personal`).
 */
export function recordConnectorClientIntent(action: ConnectorClientAction): void {
  try {
    const payload = {
      ...action,
      recordedAt: Date.now(),
      ownerUuid: isOwnerContextUuid(action.ownerContextId) ? action.ownerContextId : null,
    };
    sessionStorage.setItem("vekta-connector-last-client-intent", JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Merge `owner_context_id` into an edge-function body when it is a real UUID. */
export function withOwnerContext<T extends Record<string, unknown>>(
  body: T,
  ownerContextId: string,
): T & { owner_context_id?: string } {
  if (!isOwnerContextUuid(ownerContextId)) return body;
  return { ...body, owner_context_id: ownerContextId };
}

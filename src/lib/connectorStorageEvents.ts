/** Dispatched when connector connection state is persisted (localStorage). */
export const CONNECTOR_STORAGE_EVENT = "vekta-connectors-updated";

export function notifyConnectorsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONNECTOR_STORAGE_EVENT));
}

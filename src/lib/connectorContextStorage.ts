/** Mirrors `ActiveContext` localStorage key — scoped connector keys use the same scope id string. */
export const ACTIVE_OWNER_CONTEXT_STORAGE_KEY = "vekta-active-owner-context-id";

const SCOPE_SEPARATOR = "::";

/** UUID v4 pattern for `owner_contexts.id` values (not the `personal` sentinel). */
export function isOwnerContextUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

export function contextScopedStorageKey(baseKey: string, ownerContextId: string): string {
  const scope = ownerContextId.trim() || "personal";
  return `${baseKey}${SCOPE_SEPARATOR}${scope}`;
}

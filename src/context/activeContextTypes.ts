/** Synthetic id when `owner_contexts` has no personal row yet (localStorage + UI). */
export const PERSONAL_CONTEXT_SENTINEL = "personal" as const;

export type ActiveContextKind = "personal" | "workspace";

export type AvailableContextPersonal = {
  kind: "personal";
  ownerContextId: string;
  label: "Personal";
};

export type AvailableContextWorkspace = {
  kind: "workspace";
  ownerContextId: string;
  workspaceId: string;
  label: string;
  role: string;
  slug: string;
};

export type AvailableContext = AvailableContextPersonal | AvailableContextWorkspace;

export type ActiveContextValue = {
  activeContextId: string;
  activeContextKind: ActiveContextKind;
  /** Display label for the installing-for banner and switcher. */
  activeContextLabel: string;
  /**
   * Whether the signed-in user may connect/disconnect integrations and run resync
   * for the active owner_context_id. Personal contexts: true when the id is a real
   * owner context UUID. Workspace: true only for membership role owner.
   */
  canManageConnectorIntegrations: boolean;
  availableContexts: AvailableContext[];
  setActiveContext: (ownerContextId: string) => void;
  isLoading: boolean;
  /** True when identity data is usable (or intentionally skipped without Supabase). */
  isReady: boolean;
};

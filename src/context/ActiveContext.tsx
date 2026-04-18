import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import {
  fetchWorkspaceIdentityBundle,
  type WorkspaceIdentityBundle,
} from "@/lib/workspaceIdentityFetch";
import {
  PERSONAL_CONTEXT_SENTINEL,
  type ActiveContextKind,
  type ActiveContextValue,
  type AvailableContext,
  type AvailableContextWorkspace,
} from "@/context/activeContextTypes";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";

const STORAGE_KEY = "vekta-active-owner-context-id";

const ActiveContextReactContext = createContext<ActiveContextValue | null>(null);

function readStoredContextId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredContextId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

function buildAvailableContexts(bundle: WorkspaceIdentityBundle | null): AvailableContext[] {
  if (!bundle) {
    return [{ kind: "personal", ownerContextId: PERSONAL_CONTEXT_SENTINEL, label: "Personal" }];
  }

  const out: AvailableContext[] = [];
  const personalId = bundle.personalOwnerContext?.id ?? PERSONAL_CONTEXT_SENTINEL;
  out.push({ kind: "personal", ownerContextId: personalId, label: "Personal" });

  const ocByWorkspace = new Map<string, string>();
  for (const oc of bundle.workspaceOwnerContexts) {
    if (oc.workspace_id) ocByWorkspace.set(oc.workspace_id, oc.id);
  }

  for (const m of bundle.memberships) {
    const w = m.workspace;
    if (!w?.id) continue;
    const ownerContextId = ocByWorkspace.get(w.id);
    if (!ownerContextId) continue;
    const row: AvailableContextWorkspace = {
      kind: "workspace",
      ownerContextId,
      workspaceId: w.id,
      label: w.name,
      role: m.role,
      slug: w.slug,
    };
    out.push(row);
  }

  return out;
}

function pickInitialContextId(
  contexts: AvailableContext[],
  stored: string | null,
  defaultWorkspaceId: string | null | undefined,
): string {
  const ids = new Set(contexts.map((c) => c.ownerContextId));
  if (stored && ids.has(stored)) return stored;

  const personal = contexts.find((c) => c.kind === "personal");
  if (stored === PERSONAL_CONTEXT_SENTINEL && personal) return personal.ownerContextId;

  if (defaultWorkspaceId) {
    const match = contexts.find((c) => c.kind === "workspace" && c.workspaceId === defaultWorkspaceId);
    if (match) return match.ownerContextId;
  }

  return personal?.ownerContextId ?? PERSONAL_CONTEXT_SENTINEL;
}

export function ActiveContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

  const queryEnabled = Boolean(userId && isSupabaseConfigured && !demoMode);

  const { data: bundle, isLoading, isFetched } = useQuery({
    queryKey: ["workspace-identity-contexts", userId],
    enabled: queryEnabled,
    queryFn: () => fetchWorkspaceIdentityBundle(userId!),
    staleTime: 60_000,
  });

  const availableContexts = useMemo(() => {
    if (!userId) {
      return [{ kind: "personal" as const, ownerContextId: PERSONAL_CONTEXT_SENTINEL, label: "Personal" as const }];
    }
    if (!isSupabaseConfigured || demoMode) {
      return [{ kind: "personal" as const, ownerContextId: PERSONAL_CONTEXT_SENTINEL, label: "Personal" as const }];
    }
    return buildAvailableContexts(bundle ?? null);
  }, [userId, bundle, demoMode]);

  const isReady = !userId || !isSupabaseConfigured || demoMode || !queryEnabled || isFetched;

  const [activeContextId, setActiveContextId] = useState<string>(() => readStoredContextId() ?? PERSONAL_CONTEXT_SENTINEL);

  useEffect(() => {
    if (!userId) {
      setActiveContextId(PERSONAL_CONTEXT_SENTINEL);
      return;
    }
    if (!isReady) return;

    const stored = readStoredContextId();
    const defaultWs = bundle?.userRow?.default_workspace_id ?? null;
    const valid = new Set(availableContexts.map((c) => c.ownerContextId));

    setActiveContextId((prev) => {
      if (valid.has(prev)) return prev;
      const next = pickInitialContextId(availableContexts, stored, defaultWs);
      writeStoredContextId(next);
      return next;
    });
  }, [userId, isReady, availableContexts, bundle?.userRow?.default_workspace_id]);

  const setActiveContext = useCallback(
    (ownerContextId: string) => {
      const valid = new Set(availableContexts.map((c) => c.ownerContextId));
      if (!valid.has(ownerContextId)) return;
      setActiveContextId(ownerContextId);
      writeStoredContextId(ownerContextId);
    },
    [availableContexts],
  );

  const { activeContextKind, activeContextLabel } = useMemo(() => {
    const match = availableContexts.find((c) => c.ownerContextId === activeContextId);
    if (!match) {
      return { activeContextKind: "personal" as const, activeContextLabel: "Personal" };
    }
    if (match.kind === "personal") {
      return { activeContextKind: "personal" as const, activeContextLabel: "Personal" };
    }
    return { activeContextKind: "workspace" as const, activeContextLabel: match.label };
  }, [availableContexts, activeContextId]);

  const canManageConnectorIntegrations = useMemo(() => {
    if (!isOwnerContextUuid(activeContextId)) return false;
    const match = availableContexts.find((c) => c.ownerContextId === activeContextId);
    if (!match) return false;
    if (match.kind === "personal") return true;
    return String(match.role ?? "")
      .trim()
      .toLowerCase() === "owner";
  }, [availableContexts, activeContextId]);

  const value = useMemo<ActiveContextValue>(
    () => ({
      activeContextId,
      activeContextKind: activeContextKind as ActiveContextKind,
      activeContextLabel,
      canManageConnectorIntegrations,
      availableContexts,
      setActiveContext,
      isLoading: Boolean(userId && queryEnabled && isLoading),
      isReady: Boolean(isReady),
    }),
    [
      activeContextId,
      activeContextKind,
      activeContextLabel,
      canManageConnectorIntegrations,
      availableContexts,
      setActiveContext,
      userId,
      queryEnabled,
      isLoading,
      isReady,
    ],
  );

  return <ActiveContextReactContext.Provider value={value}>{children}</ActiveContextReactContext.Provider>;
}

export function useActiveContext(): ActiveContextValue {
  const ctx = useContext(ActiveContextReactContext);
  if (!ctx) {
    throw new Error("useActiveContext must be used within ActiveContextProvider");
  }
  return ctx;
}

/** For optional surfaces (e.g. dialogs) that may render outside the provider. */
export function useActiveContextOptional(): ActiveContextValue | null {
  return useContext(ActiveContextReactContext);
}

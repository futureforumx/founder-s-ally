import type { QueryClient } from "@tanstack/react-query";
import { CONNECTED_ACCOUNTS_QUERY_ROOT } from "@/hooks/useConnectedAccounts";
import { RECS_QUERY_KEY } from "@/hooks/useRecommendations";
import { TARGETS_QUERY_KEY } from "@/hooks/useInvestorTargets";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";
import type { ConnectorClientAction } from "@/lib/connectorIntent";
import { recordConnectorClientIntent } from "@/lib/connectorIntent";

/** Session key: after Google OAuth, resume this app view (e.g. Targeting). */
const OAUTH_RESUME_VIEW_KEY = "vekta_oauth_resume_view";

export function setConnectorOAuthResumeView(view: "targeting"): void {
  try {
    sessionStorage.setItem(OAUTH_RESUME_VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

/** Read and clear stored post-OAuth navigation hint (at most once per redirect). */
export function consumeConnectorOAuthResumeView(): string | null {
  try {
    const v = sessionStorage.getItem(OAUTH_RESUME_VIEW_KEY);
    if (v) sessionStorage.removeItem(OAUTH_RESUME_VIEW_KEY);
    return v;
  } catch {
    return null;
  }
}

/** Session-only breadcrumb for connectors without server routes yet (Attio, HubSpot, etc.). */
export function logConnectorClientPlaceholder(action: ConnectorClientAction): void {
  recordConnectorClientIntent(action);
}

export function invalidateConnectorSurfaceQueries(
  queryClient: QueryClient,
  ownerContextId: string | null | undefined,
): void {
  const id = ownerContextId?.trim() ?? "";
  if (isOwnerContextUuid(id)) {
    void queryClient.invalidateQueries({ queryKey: [CONNECTED_ACCOUNTS_QUERY_ROOT, id] });
    void queryClient.invalidateQueries({ queryKey: ["connector_ingestion", id] });
    void queryClient.invalidateQueries({ queryKey: ["paths_to_org", id] });
    void queryClient.invalidateQueries({ queryKey: [RECS_QUERY_KEY, id] });
    void queryClient.invalidateQueries({ queryKey: [TARGETS_QUERY_KEY, id] });
  }
  void queryClient.invalidateQueries({ queryKey: [CONNECTED_ACCOUNTS_QUERY_ROOT] });
  void queryClient.invalidateQueries({ queryKey: ["connector_ingestion"] });
}

function apiOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

async function connectorPostJson(
  path: string,
  body: Record<string, unknown>,
  getToken: () => Promise<string | null>,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string; status: number }> {
  const token = (await getToken())?.trim();
  if (!token) return { ok: false, status: 401, message: "You need to be signed in." };

  let res: Response;
  try {
    res = await fetch(`${apiOrigin()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (e) {
    return { ok: false, status: 0, message: e instanceof Error ? e.message : "Network error" };
  }

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const err =
      (typeof json.error === "string" && json.error.trim()) ||
      (typeof json.detail === "string" && json.detail.trim()) ||
      `Request failed (HTTP ${res.status})`;
    return { ok: false, status: res.status, message: err };
  }

  return { ok: true, json };
}

export async function startGoogleOAuthRedirect(params: {
  connector: "gmail" | "gcal";
  ownerContextId: string;
  getToken: () => Promise<string | null>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isOwnerContextUuid(params.ownerContextId)) {
    return { ok: false, message: "Switch to a context with a real owner ID before connecting Google." };
  }
  const token = (await params.getToken())?.trim();
  if (!token) return { ok: false, message: "You need to be signed in to start Google OAuth." };

  const url =
    `${apiOrigin()}/api/oauth/google/start?` +
    new URLSearchParams({
      connector: params.connector,
      owner_context_id: params.ownerContextId.trim(),
    }).toString();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
      credentials: "same-origin",
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" };
  }

  if (res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
    const loc = res.headers.get("Location");
    if (!loc) return { ok: false, message: "OAuth redirect missing Location header" };
    window.location.assign(loc);
    return { ok: true };
  }

  if (res.status === 401) {
    return { ok: false, message: "Session expired — sign in again." };
  }

  let msg = `Could not start Google OAuth (HTTP ${res.status})`;
  try {
    const j = (await res.json()) as { error?: string };
    if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
  } catch {
    /* ignore */
  }
  return { ok: false, message: msg };
}

/** Calendar-only OAuth (`connector=gcal`); use when UI exposes a distinct Calendar connect action. */
export function startGoogleCalendarOAuthRedirect(
  params: Omit<Parameters<typeof startGoogleOAuthRedirect>[0], "connector">,
) {
  return startGoogleOAuthRedirect({ ...params, connector: "gcal" });
}

export async function uploadLinkedinCsv(params: {
  ownerContextId: string;
  file: File;
  getToken: () => Promise<string | null>;
}): Promise<{ ok: true; approxDataRows: number } | { ok: false; message: string }> {
  if (!isOwnerContextUuid(params.ownerContextId)) {
    return { ok: false, message: "LinkedIn CSV upload requires a real owner context UUID." };
  }
  const token = (await params.getToken())?.trim();
  if (!token) return { ok: false, message: "You need to be signed in to upload." };

  const body = new FormData();
  body.set("owner_context_id", params.ownerContextId.trim());
  body.set("file", params.file);

  let res: Response;
  try {
    res = await fetch(`${apiOrigin()}/api/connectors/linkedin/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      credentials: "same-origin",
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" };
  }

  if (!res.ok) {
    let msg = `Upload failed (HTTP ${res.status})`;
    try {
      const j = (await res.json()) as { error?: string; detail?: string };
      if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
      if (typeof j.detail === "string" && j.detail.trim()) msg = `${msg}: ${j.detail.trim()}`;
    } catch {
      /* ignore */
    }
    return { ok: false, message: msg };
  }

  try {
    const j = (await res.json()) as { approx_data_rows?: number };
    return { ok: true, approxDataRows: typeof j.approx_data_rows === "number" ? j.approx_data_rows : 0 };
  } catch {
    return { ok: true, approxDataRows: 0 };
  }
}

export type ConnectorUiIntegrationKey =
  | "google"
  | "linkedin"
  | "hubspot"
  | "attio"
  | "notion"
  | "twitter"
  | string;

function isCrmPlaceholderKey(key: ConnectorUiIntegrationKey): boolean {
  return key === "hubspot" || key === "attio";
}

/**
 * Central routing for connector connect. Google OAuth is live; CRM keys stay placeholders.
 */
export async function runConnectorConnectAction(input: {
  integrationKey: ConnectorUiIntegrationKey;
  ownerContextId: string;
  getToken: () => Promise<string | null>;
}): Promise<
  | { outcome: "google_oauth_redirect" }
  | { outcome: "stub_only" }
  | { outcome: "blocked"; message: string }
> {
  const { integrationKey, ownerContextId, getToken } = input;

  if (integrationKey === "google") {
    if (!isOwnerContextUuid(ownerContextId)) {
      return { outcome: "blocked", message: "Google connect requires a real owner context UUID." };
    }
    const r = await startGoogleOAuthRedirect({ connector: "gmail", ownerContextId, getToken });
    if (!r.ok) return { outcome: "blocked", message: r.message };
    return { outcome: "google_oauth_redirect" };
  }

  if (isCrmPlaceholderKey(integrationKey)) {
    logConnectorClientPlaceholder({ kind: "connect", integrationKey, ownerContextId });
    return { outcome: "stub_only" };
  }

  logConnectorClientPlaceholder({ kind: "connect", integrationKey, ownerContextId });
  return { outcome: "stub_only" };
}

/** Disconnect: live for Google + LinkedIn CSV rows; placeholders for CRM and other keys. */
export async function runConnectorDisconnectAction(input: {
  integrationKey: ConnectorUiIntegrationKey;
  ownerContextId: string;
  getToken: () => Promise<string | null>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { integrationKey, ownerContextId, getToken } = input;

  if (!isOwnerContextUuid(ownerContextId)) {
    logConnectorClientPlaceholder({ kind: "disconnect", integrationKey, ownerContextId });
    return { ok: true };
  }

  const oc = ownerContextId.trim();

  if (integrationKey === "google") {
    const r = await connectorPostJson("/api/connectors/google/disconnect", { owner_context_id: oc }, getToken);
    if (!r.ok) return { ok: false, message: r.message };
    return { ok: true };
  }

  if (integrationKey === "linkedin") {
    const r = await connectorPostJson("/api/connectors/linkedin/disconnect", { owner_context_id: oc }, getToken);
    if (!r.ok) return { ok: false, message: r.message };
    return { ok: true };
  }

  if (isCrmPlaceholderKey(integrationKey)) {
    logConnectorClientPlaceholder({ kind: "disconnect", integrationKey, ownerContextId });
    return { ok: true };
  }

  logConnectorClientPlaceholder({ kind: "disconnect", integrationKey, ownerContextId });
  return { ok: true };
}

/** Resync: live for Google (sync_runs trigger); other keys remain placeholder-only. */
export async function runConnectorResyncAction(input: {
  integrationKey: ConnectorUiIntegrationKey;
  ownerContextId: string;
  getToken: () => Promise<string | null>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { integrationKey, ownerContextId, getToken } = input;

  if (integrationKey !== "google") {
    logConnectorClientPlaceholder({ kind: "resync", integrationKey, ownerContextId });
    return { ok: true };
  }

  if (!isOwnerContextUuid(ownerContextId)) {
    logConnectorClientPlaceholder({ kind: "resync", integrationKey, ownerContextId });
    return { ok: true };
  }

  const r = await connectorPostJson(
    "/api/connectors/google/resync",
    { owner_context_id: ownerContextId.trim() },
    getToken,
  );
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true };
}

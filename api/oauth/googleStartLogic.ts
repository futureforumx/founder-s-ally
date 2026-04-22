import { getClerkUserIdFromAuthHeader } from "../_clerkFromRequest";
import { getSupabaseServiceClient } from "../_supabaseServiceClient";
import { assertConnectorManagementForUser, isUuid } from "../_ownerContextAccess";
import { signGoogleOAuthState } from "../_oauthStateSigned";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

function googleScopes(connector: "gmail" | "gcal" | "gsheets"): string {
  const email = "https://www.googleapis.com/auth/userinfo.email openid";
  if (connector === "gmail") {
    return ["https://www.googleapis.com/auth/gmail.readonly", email].join(" ");
  }
  if (connector === "gsheets") {
    return ["https://www.googleapis.com/auth/spreadsheets.readonly", email].join(" ");
  }
  return ["https://www.googleapis.com/auth/calendar.readonly", email].join(" ");
}

export async function buildGoogleOAuthStartResponse(input: {
  method: string;
  connector: string | undefined;
  owner_context_id: string | undefined;
  authorization: string | undefined;
}): Promise<
  | { kind: "redirect"; location: string }
  | { kind: "json"; status: number; body: Record<string, unknown> }
> {
  if (input.method !== "GET") {
    return { kind: "json", status: 405, body: { error: "Method not allowed" } };
  }

  const connectorRaw = (input.connector ?? "").trim();
  const connector =
    connectorRaw === "gcal" ? "gcal" : connectorRaw === "gmail" ? "gmail" : connectorRaw === "gsheets" ? "gsheets" : null;
  const ownerContextId = (input.owner_context_id ?? "").trim();

  if (!connector) {
    return { kind: "json", status: 400, body: { error: "Invalid connector (use gmail, gcal, or gsheets)" } };
  }
  if (!isUuid(ownerContextId)) {
    return { kind: "json", status: 400, body: { error: "owner_context_id must be a UUID" } };
  }

  const userId = await getClerkUserIdFromAuthHeader(input.authorization);
  if (!userId) {
    return { kind: "json", status: 401, body: { error: "Missing or invalid Authorization bearer token" } };
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { kind: "json", status: 500, body: { error: "Server missing Supabase service configuration" } };
  }

  const gate = await assertConnectorManagementForUser(supabase, userId, ownerContextId);
  if (!gate.ok) {
    return { kind: "json", status: 403, body: { error: gate.message } };
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return {
      kind: "json",
      status: 500,
      body: { error: "Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_REDIRECT_URI" },
    };
  }

  const exp = Date.now() + 15 * 60_000;
  const state = signGoogleOAuthState({ v: 1, uid: userId, oc: ownerContextId, connector, exp });

  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("scope", googleScopes(connector));
  u.searchParams.set("state", state);
  u.searchParams.set("include_granted_scopes", "true");

  return { kind: "redirect", location: u.toString() };
}

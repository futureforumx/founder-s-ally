import { getSupabaseServiceClient } from "../_supabaseServiceClient";
import { assertConnectorManagementForUser } from "../_ownerContextAccess";
import { verifyGoogleOAuthState } from "../_oauthStateSigned";
import { getAppOriginForOAuthRedirect } from "../_appOrigin";

function redirectPath(pathWithQuery: string): { kind: "redirect"; location: string } {
  const origin = getAppOriginForOAuthRedirect();
  const p = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return { kind: "redirect", location: `${origin}${p}` };
}

export async function buildGoogleOAuthCallbackResponse(input: {
  method: string;
  code: string | undefined;
  state: string | undefined;
  error: string | undefined;
}): Promise<{ kind: "redirect"; location: string }> {
  if (input.method !== "GET") {
    return redirectPath(`/intelligence?connector_oauth=error&reason=${encodeURIComponent("method")}`);
  }

  if (input.error) {
    return redirectPath(`/intelligence?connector_oauth=error&reason=${encodeURIComponent(input.error)}`);
  }

  const payload = verifyGoogleOAuthState(input.state ?? "");
  if (!input.code || !payload) {
    return redirectPath(`/intelligence?connector_oauth=error&reason=${encodeURIComponent("invalid_state")}`);
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return redirectPath(`/intelligence?connector_oauth=error&reason=${encodeURIComponent("server_config")}`);
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return redirectPath(`/intelligence?connector_oauth=error&reason=${encodeURIComponent("supabase_config")}`);
  }

  const gate = await assertConnectorManagementForUser(supabase, payload.uid, payload.oc);
  if (!gate.ok) {
    return redirectPath(
      `/intelligence?connector_oauth=error&reason=${encodeURIComponent("connector_forbidden")}`,
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return redirectPath(
      `/intelligence?connector_oauth=error&reason=${encodeURIComponent("token_exchange")}&detail=${encodeURIComponent(t.slice(0, 200))}`,
    );
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const access = tokenJson.access_token;
  if (!access) {
    return redirectPath(`/intelligence?connector_oauth=error&reason=${encodeURIComponent("no_access_token")}`);
  }

  const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access}` },
  });
  const uiJson = ui.ok ? ((await ui.json()) as { id?: string; email?: string }) : {};
  const externalId = (uiJson.id && String(uiJson.id)) || payload.uid;
  const email = uiJson.email ? String(uiJson.email) : null;

  const provider =
    payload.connector === "gcal"
      ? "google_calendar"
      : payload.connector === "gsheets"
        ? "google_sheets"
        : "gmail";
  const metadata = {
    google_oauth: {
      scope: tokenJson.scope ?? null,
      expires_in: tokenJson.expires_in ?? null,
      refresh_token: tokenJson.refresh_token ?? null,
      access_token: access,
    },
  };

  const upsertRow = {
    owner_context_id: payload.oc,
    provider,
    account_email: email,
    external_account_id: externalId,
    status: "active",
    last_synced_at: new Date().toISOString(),
    metadata,
  };

  const { error: upErr } = await supabase.from("connected_accounts").upsert(upsertRow, {
    onConflict: "owner_context_id,provider,external_account_id",
  });

  if (upErr) {
    return redirectPath(
      `/intelligence?connector_oauth=error&reason=${encodeURIComponent("db_upsert")}&detail=${encodeURIComponent(upErr.message)}`,
    );
  }

  const q = new URLSearchParams({
    connector_oauth: "success",
    owner_context_id: payload.oc,
    connector: payload.connector,
  });
  return redirectPath(`/intelligence?${q.toString()}`);
}

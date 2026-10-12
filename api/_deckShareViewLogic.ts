import { createHash } from "node:crypto";
import { getSupabaseServiceClient } from "./_supabaseServiceClient.js";
import { parseR2StoredValue, r2ConfiguredFor, signedR2PitchDeckUrl } from "./_r2UserAssets.js";

/**
 * Opening a share link. Runs unauthenticated — the token is the credential — so it
 * uses the service role to read the share and append the view, and never exposes
 * the owner's user id or the underlying storage key to the caller.
 */

export type DeckShareViewRequest = {
  token: string;
  userAgent?: string | null;
  referrer?: string | null;
  /** Hashed with a salt before storage; the raw value is never persisted. */
  ip?: string | null;
};

export type DeckShareViewResponse =
  | {
      status: 200;
      body: {
        ok: true;
        fileName: string;
        recipientName: string;
        sharedAt: string;
        signedUrl: string;
      };
    }
  | { status: 400 | 404 | 410 | 500; body: { error: string } };

type ShareRow = {
  id: string;
  recipient_name: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  company_pitch_decks: { file_name: string; file_url: string } | null;
};

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

function viewerHash(ip: string | null | undefined, userAgent: string | null | undefined): string | null {
  if (!ip && !userAgent) return null;
  // Salted so the log can group repeat opens without being reversible to an IP.
  const salt = process.env.DECK_SHARE_VIEW_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "vekta";
  return createHash("sha256").update(`${salt}:${ip ?? ""}:${userAgent ?? ""}`).digest("hex").slice(0, 32);
}

async function signDeckUrl(fileUrl: string): Promise<string | null> {
  const r2Key = parseR2StoredValue(fileUrl);
  if (r2Key) {
    if (!r2ConfiguredFor("pitch-deck").ok) return null;
    return signedR2PitchDeckUrl(r2Key);
  }

  // Legacy decks still sitting in the Supabase storage bucket.
  const service = getSupabaseServiceClient();
  if (!service) return null;
  const { data } = await service.storage.from("pitch-decks").createSignedUrl(fileUrl, 3600);
  return data?.signedUrl ?? null;
}

export async function resolveDeckShareView(
  input: DeckShareViewRequest,
): Promise<DeckShareViewResponse> {
  const token = (input.token || "").trim().toLowerCase();
  if (!TOKEN_PATTERN.test(token)) {
    return { status: 400, body: { error: "Invalid share link" } };
  }

  const service = getSupabaseServiceClient();
  if (!service) {
    return { status: 500, body: { error: "Sharing is not configured" } };
  }

  const { data, error } = await service
    .from("deck_shares")
    .select("id, recipient_name, created_at, expires_at, revoked_at, company_pitch_decks(file_name, file_url)")
    .eq("token", token)
    .maybeSingle();

  if (error) return { status: 500, body: { error: "Could not open this share link" } };

  const share = data as ShareRow | null;
  if (!share) return { status: 404, body: { error: "This share link does not exist" } };
  if (share.revoked_at) return { status: 410, body: { error: "This share link was revoked" } };
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return { status: 410, body: { error: "This share link has expired" } };
  }

  const deck = share.company_pitch_decks;
  if (!deck) return { status: 404, body: { error: "The shared deck is no longer available" } };

  const signedUrl = await signDeckUrl(deck.file_url);
  if (!signedUrl) return { status: 500, body: { error: "Could not load the shared deck" } };

  // Logged after the deck resolves, so failed opens don't show up as views.
  const { error: viewError } = await service.from("deck_share_views").insert({
    share_id: share.id,
    viewer_hash: viewerHash(input.ip, input.userAgent),
    user_agent: input.userAgent ? String(input.userAgent).slice(0, 400) : null,
    referrer: input.referrer ? String(input.referrer).slice(0, 400) : null,
  });
  if (viewError) console.error("[deck-share-view] failed to record view:", viewError.message);

  return {
    status: 200,
    body: {
      ok: true,
      fileName: deck.file_name,
      recipientName: share.recipient_name,
      sharedAt: share.created_at,
      signedUrl,
    },
  };
}

/** First hop in X-Forwarded-For, which is the client as seen by the edge. */
export function clientIpFromHeaders(forwardedFor: unknown, fallback?: string | null): string | null {
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return String(forwardedFor[0]).split(",")[0].trim();
  }
  return fallback ?? null;
}

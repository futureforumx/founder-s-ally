import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hashPrivateValue, hashShareToken } from "./_deckShareCrypto.js";

export type DeckShareService = SupabaseClient;
export type DeckShareWithDeck = {
  id: string; user_id: string; deck_id: string; expires_at?: string | null; revoked_at?: string | null;
  file_url_snapshot?: string | null; show_download?: boolean; require_email?: boolean; allowed_emails?: string[];
  company_pitch_decks?: { id: string; user_id: string; file_name: string; file_size_bytes: number | null; slide_count: number | null } | null;
};
export type DeckShareViewerSession = { id: string; share_id: string; visitor_hash: string; started_at: string | null; expires_at: string; deck_shares: DeckShareWithDeck | null };

export function getDeckShareService(): DeckShareService | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clerkDomain() {
  const key = process.env.VITE_CLERK_PUBLISHABLE_KEY || "";
  try {
    const decoded = Buffer.from(key.replace(/^pk_(live|test)_/, ""), "base64").toString("utf8").replace(/\0/g, "").trim();
    return decoded.replace(/^https?:\/\//, "").replace(/\$$/, "").trim();
  } catch { return ""; }
}

/** Server-verified identity for founder controls; never trust decoded JWT claims. */
export async function getVerifiedOwnerId(authHeader: string | undefined, service: DeckShareService): Promise<string | null> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { data: { user } } = await service.auth.getUser(token);
    if (user?.id) return user.id;
  } catch { /* check legacy Clerk sessions below */ }
  try {
    const domain = clerkDomain();
    const jwks = createRemoteJWKSet(new URL(domain ? `https://${domain}/.well-known/jwks.json` : "https://api.clerk.com/v1/jwks"));
    const { payload } = await jwtVerify(token, jwks);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}

export async function getVerifiedViewer(service: DeckShareService, authHeader: string | undefined) {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { data: { user } } = await service.auth.getUser(token);
    if (user?.id && user.email && (user.email_confirmed_at || user.confirmed_at)) {
      return { userId: user.id, email: user.email };
    }
  } catch { /* anonymous sessions remain supported */ }
  return null;
}

export async function consumeDeckShareLimit(service: DeckShareService, key: string, max: number, windowSeconds: number) {
  const { data, error } = await service.rpc("consume_deck_share_rate_limit", {
    p_key_hash: hashPrivateValue(key), p_limit: max, p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

export async function findShareByToken(service: DeckShareService, token: string) {
  const { data, error } = await service.from("deck_shares").select("*").eq("token_hash", hashShareToken(token)).maybeSingle();
  if (error) throw error;
  return data;
}

/** Resolve a workspace slug only after proving that this user belongs to it. */
export async function getDeckShareWorkspace(service: DeckShareService, workspaceId: string, ownerId: string) {
  const { data: workspace, error } = await service.from("workspaces")
    .select("id,slug,owner_id").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  if (!workspace) return null;
  if (workspace.owner_id !== ownerId) {
    const { data: membership, error: membershipError } = await service.from("workspace_memberships")
      .select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", ownerId).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return null;
  }
  return { id: workspace.id as string, slug: workspace.slug as string };
}

export async function findShareByPath(service: DeckShareService, companySlug: string, presentationSlug: string) {
  const { data, error } = await service.from("deck_shares").select("*")
    .eq("company_slug", companySlug).eq("presentation_slug", presentationSlug).maybeSingle();
  if (error) throw error;
  return data;
}

export function readCookie(req: VercelRequest, key: string) {
  const fromParser = req.cookies?.[key];
  if (typeof fromParser === "string") return fromParser;
  const raw = req.headers.cookie || "";
  for (const pair of raw.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === key) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function setViewerCookies(res: VercelResponse, sessionToken: string, visitorToken: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `vekta_deck_session=${encodeURIComponent(sessionToken)}; Path=/api; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`,
    `vekta_deck_visitor=${encodeURIComponent(visitorToken)}; Path=/api; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
  ]);
}

export async function findViewerSession(service: DeckShareService, rawSession: string) {
  if (!rawSession) return null;
  const { data, error } = await service.from("deck_share_sessions")
    .select("id,share_id,visitor_hash,started_at,expires_at,deck_shares!inner(id,user_id,deck_id,token_hash,name,recipient_name,recipient_firm,recipient_email,expires_at,revoked_at,password_hash,require_email,allowed_emails,show_download,deck_version_uploaded_at,file_url_snapshot,company_name_snapshot,company_logo_url_snapshot,company_pitch_decks!inner(id,user_id,file_name,file_size_bytes,slide_count))")
    .eq("session_token_hash", hashShareToken(rawSession)).maybeSingle();
  if (error) throw error;
  return data as unknown as DeckShareViewerSession | null;
}

export function shareIsActive(share: { revoked_at?: string | null; expires_at?: string | null }, now = Date.now()) {
  if (share.revoked_at) return "revoked" as const;
  if (share.expires_at && Date.parse(share.expires_at) <= now) return "expired" as const;
  return null;
}

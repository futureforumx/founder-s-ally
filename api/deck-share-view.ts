import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readJsonBody } from "./_readJsonBody.js";
import { randomBytes } from "node:crypto";
import { hashShareToken, verifySharePassword } from "./_deckShareCrypto.js";
import { isAllowedDeckViewerEmail } from "./_deckShareEmail.js";
import { consumeDeckShareLimit, findShareByPath, findShareByToken, getDeckShareService, getVerifiedViewer, setViewerCookies, shareIsActive } from "./_deckShareServer.js";

/** Validate a public bearer link, apply its password gate, then issue a short-lived HttpOnly viewer session. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = await readJsonBody(req).catch(() => ({} as Record<string, unknown>));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const companySlug = typeof body.companySlug === "string" ? body.companySlug.trim().toLowerCase() : "";
  const presentationSlug = typeof body.presentationSlug === "string" ? body.presentationSlug.trim().toLowerCase() : "";
  const suppliedEmail = typeof body.viewerEmail === "string" ? body.viewerEmail.trim().toLowerCase().slice(0, 254) : "";
  const tokenValid = /^[A-Za-z0-9_-]{32,60}$/.test(token);
  const pathValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companySlug) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(presentationSlug);
  if (!tokenValid && !pathValid) return res.status(404).json({ error: "This share link is unavailable." });
  const service = getDeckShareService();
  if (!service) return res.status(503).json({ error: "Deck viewing is temporarily unavailable." });
  try {
    const rateKey = tokenValid ? hashShareToken(token) : hashShareToken(`${companySlug}/${presentationSlug}`);
    if (!await consumeDeckShareLimit(service, `access:${rateKey}`, 12, 60)) return res.status(429).json({ error: "Too many attempts for this link. Try again shortly." });
    const share = tokenValid ? await findShareByToken(service, token) : await findShareByPath(service, companySlug, presentationSlug);
    if (!share) return res.status(404).json({ error: "This share link is unavailable." });
    // Once a branded path is assigned, the original opaque token URL must stop
    // resolving too; otherwise editing the URL would leave the previous address live.
    if (tokenValid && share.presentation_slug) return res.status(404).json({ error: "This share link is unavailable." });
    const status = shareIsActive(share);
    if (status) return res.status(410).json({ error: status === "expired" ? "This share link has expired." : "This share link was revoked." });
    const requiresPassword = Boolean(share.password_hash);
    const requiresEmail = Boolean(share.require_email);
    const suppliedPassword = typeof body.password === "string" ? body.password : "";
    const passwordValid = !requiresPassword || verifySharePassword(suppliedPassword, share.password_hash);
    const emailFormatValid = !requiresEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail);
    const gateContext = {
      requiresPassword,
      requiresEmail,
      companyName: share.company_name_snapshot || "Vekta founder",
      companyLogoUrl: share.company_logo_url_snapshot || null,
      contactEmail: share.contact_email || null,
    };
    if (!passwordValid || !emailFormatValid) {
      const error = !passwordValid
        ? suppliedPassword ? "That password did not match." : "Enter the password to open this deck."
        : suppliedEmail ? "Enter a valid email address to open this deck." : "Enter your email address to open this deck.";
      return res.status(401).json({ error, ...gateContext });
    }
    if (requiresEmail && !isAllowedDeckViewerEmail(suppliedEmail, share.allowed_emails)) {
      return res.status(403).json({ error: "This email address is not on the viewing list.", ...gateContext });
    }
    const { data: deck, error } = await service.from("company_pitch_decks")
      .select("id,user_id,file_name,file_size_bytes,slide_count").eq("id", share.deck_id).eq("user_id", share.user_id).maybeSingle();
    if (error) return res.status(500).json({ error: "Could not load this deck." });
    if (!deck || !share.file_url_snapshot) return res.status(404).json({ error: "This deck is no longer available." });
    if (!deck.file_name.toLowerCase().endsWith(".pdf")) return res.status(415).json({ error: "This shared deck is not a supported PDF." });

    const sessionToken = randomBytes(32).toString("base64url");
    let visitorToken = req.cookies?.vekta_deck_visitor || "";
    if (!visitorToken) {
      const rawCookie = req.headers.cookie || "";
      visitorToken = rawCookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("vekta_deck_visitor="))?.slice("vekta_deck_visitor=".length) || "";
      try { visitorToken = decodeURIComponent(visitorToken); } catch { visitorToken = ""; }
    }
    if (!visitorToken || !/^[A-Za-z0-9_-]{32,60}$/.test(visitorToken)) visitorToken = randomBytes(32).toString("base64url");
    const verifiedViewer = await getVerifiedViewer(service, req.headers.authorization);
    const sessionExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await service.from("deck_share_sessions").insert({
      share_id: share.id, session_token_hash: hashShareToken(sessionToken), visitor_hash: hashShareToken(visitorToken),
      viewer_user_id: verifiedViewer?.userId ?? null, viewer_email: verifiedViewer?.email ?? (suppliedEmail || null),
      identity_status: verifiedViewer ? "verified_account" : suppliedEmail ? "submitted_email" : "anonymous", expires_at: sessionExpiresAt,
    });
    if (insertError) return res.status(500).json({ error: "Could not start a secure viewer session." });
    setViewerCookies(res, sessionToken, visitorToken, 6 * 60 * 60);
    return res.status(200).json({
      ok: true, deckId: deck.id, fileName: deck.file_name, slideCount: deck.slide_count,
      companyName: share.company_name_snapshot || "Vekta founder", companyLogoUrl: share.company_logo_url_snapshot,
      companyStage: share.company_stage_snapshot || null, contactEmail: share.contact_email || null,
      linkName: share.name || share.recipient_name, showDownload: Boolean(share.show_download), requiresEmail: Boolean(share.require_email),
    });
  } catch {
    return res.status(503).json({ error: "Deck access checks are temporarily unavailable." });
  }
}

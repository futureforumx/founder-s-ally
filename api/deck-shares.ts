import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deriveShareToken, hashSharePassword, hashShareToken } from "./_deckShareCrypto.js";
import { parseAllowedEmails } from "./_deckShareEmail.js";
import { consumeDeckShareLimit, getDeckShareService, getVerifiedOwnerId } from "./_deckShareServer.js";

const str = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const passwordValue = (value: unknown) => typeof value === "string" ? value : "";
const activeShareQuery = "id,user_id,deck_id,name,recipient_name,recipient_firm,recipient_email,intended_investor_id,created_at,expires_at,revoked_at,password_hash,require_email,allowed_emails,show_download,company_stage_snapshot,workspace_id,company_slug,presentation_slug,contact_email,create_request_id,company_pitch_decks!inner(file_name,uploaded_at,slide_count)";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const workspacePathSlug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method || "")) return res.status(405).json({ error: "Method not allowed" });
  const service = getDeckShareService();
  if (!service) return res.status(503).json({ error: "Deck sharing is not configured." });
  const ownerId = await getVerifiedOwnerId(req.headers.authorization, service);
  if (!ownerId) return res.status(401).json({ error: "Sign in to manage deck sharing." });

  if (req.method === "GET") {
    const checkSlug = str(req.query.checkSlug, 80).toLowerCase();
    const companyName = str(req.query.companyName, 160);
    if (req.query.checkAvailability === "1") {
      if (!slugPattern.test(checkSlug)) return res.status(400).json({ error: "Enter a valid custom link." });
      try {
        if (!await consumeDeckShareLimit(service, `slug-check:${ownerId}`, 90, 60)) return res.status(429).json({ error: "Too many custom link checks. Try again shortly." });
        const companySlug = workspacePathSlug(companyName) || "company";
        const excludeLinkId = str(req.query.excludeLinkId, 60);
        let query = service.from("deck_shares").select("id").eq("company_slug", companySlug).eq("presentation_slug", checkSlug);
        if (excludeLinkId) query = query.neq("id", excludeLinkId);
        const { data, error } = await query.limit(1);
        if (error) return res.status(500).json({ error: "Could not check custom link availability." });
        return res.status(200).json({ companySlug, available: !data?.length });
      } catch { return res.status(503).json({ error: "Custom link availability is temporarily unavailable." }); }
    }
    const deckId = str(req.query.deckId, 60);
    let query = service.from("deck_shares").select(activeShareQuery).eq("user_id", ownerId).order("created_at", { ascending: false });
    if (deckId) query = query.eq("deck_id", deckId);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: "Could not load deck share links." });
    return res.status(200).json({ links: (data ?? []).map((row) => ({
      ...row,
      token: row.create_request_id && /^[A-Za-z0-9_-]{43}$/.test(row.create_request_id) ? deriveShareToken(ownerId, row.create_request_id) : null,
      password_hash: undefined,
      has_password: Boolean(row.password_hash),
    })) });
  }

  const limitKey = req.method === "POST" ? `manage:create:${ownerId}` : `manage:${req.method}:${ownerId}`;
  try {
    if (!await consumeDeckShareLimit(service, limitKey, 60, 60)) return res.status(429).json({ error: "Too many sharing changes. Try again shortly." });
  } catch { return res.status(503).json({ error: "Share rate limiting is unavailable." }); }

  if (req.method === "POST") {
    const deckId = str(req.body?.deckId, 60);
    const presentationSlug = str(req.body?.presentationSlug, 80).toLowerCase();
    const contactEmail = str(req.body?.contactEmail, 254).toLowerCase();
    const requestId = str(req.body?.createRequestId, 60);
    const name = str(req.body?.name);
    const password = passwordValue(req.body?.password);
    const companyName = str(req.body?.companyName, 160);
    const companyStage = str(req.body?.companyStage, 80);
    const logoUrl = str(req.body?.companyLogoUrl, 1000);
    const investorId = str(req.body?.investorId, 60) || null;
    const recipientName = str(req.body?.investorName, 180) || "";
    const recipientEmail = str(req.body?.investorEmail, 254) || "";
    let allowedEmails: string[];
    try { allowedEmails = req.body?.requireEmail === true ? parseAllowedEmails(req.body?.allowedEmails) : []; }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Enter valid email addresses." }); }
    const expiresAt = str(req.body?.expiresAt, 50);
    if (!deckId) return res.status(400).json({ error: "Choose a deck version before creating a share link." });
    if (!slugPattern.test(presentationSlug)) return res.status(400).json({ error: "Use lowercase letters, numbers, and hyphens for the custom link." });
    if (!validEmail(contactEmail)) return res.status(400).json({ error: "Enter a valid contact email address." });
    if (!name) return res.status(400).json({ error: "Enter a name for this share link." });
    if (!companyName) return res.status(400).json({ error: "Enter the company name investors should see on the shared deck page." });
    if (!/^[A-Za-z0-9_-]{43}$/.test(requestId)) return res.status(400).json({ error: "The link request expired. Close this form and start a new share link." });
    const companySlug = workspacePathSlug(companyName) || "company";
    const { data: priorRequest, error: priorError } = await service.from("deck_shares").select(activeShareQuery).eq("user_id", ownerId).eq("create_request_id", requestId).maybeSingle();
    if (priorError) {
      // The idempotency column is installed by the native sharing migration.
      // Surface a useful setup error when an API deploy reaches a DB that has
      // not applied it yet (or PostgREST has not refreshed its schema cache).
      console.error("Deck share idempotency lookup failed", { code: priorError.code, message: priorError.message });
      const details = `${priorError.code || ""} ${priorError.message || ""}`;
      if (/create_request_id/i.test(details) && /42703|PGRST204|schema cache|does not exist|could not find/i.test(details)) {
        return res.status(503).json({ error: "Deck sharing setup is incomplete. Apply the pending native deck sharing database migration, then retry." });
      }
      return res.status(500).json({ error: "Could not check whether this sharing request already completed." });
    }
    if (priorRequest) return res.status(200).json({ link: { ...priorRequest, token: deriveShareToken(ownerId, requestId), password_hash: undefined, has_password: Boolean(priorRequest.password_hash) }, replayed: true });
    const { data: pathConflict, error: pathError } = await service.from("deck_shares").select("id")
      .eq("company_slug", companySlug).eq("presentation_slug", presentationSlug).maybeSingle();
    if (pathError) return res.status(500).json({ error: "Could not check custom link availability." });
    if (pathConflict) return res.status(409).json({ error: "This custom link is already in use. Choose another address." });
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) return res.status(400).json({ error: "Choose a future expiration date." });
    if (password.length > 200) return res.status(400).json({ error: "Use a password with no more than 200 characters." });
    if (password && password.length < 4) return res.status(400).json({ error: "Use a password with at least 4 characters." });
    const { data: deck, error: deckError } = await service.from("company_pitch_decks")
      .select("id,user_id,file_name,file_url,uploaded_at,file_size_bytes,slide_count")
      .eq("id", deckId).eq("user_id", ownerId).maybeSingle();
    if (deckError) return res.status(500).json({ error: "Could not load this deck." });
    if (!deck) return res.status(404).json({ error: "Deck not found." });
    if (!deck.file_name.toLowerCase().endsWith(".pdf")) return res.status(415).json({ error: "Native investor sharing currently supports published PDF decks." });
    const privateFile = typeof deck.file_url === "string" && (deck.file_url.startsWith(`r2://pitch-decks/${ownerId}/`) || (!deck.file_url.includes("://") && deck.file_url.startsWith(`${ownerId}/`)));
    if (!privateFile) return res.status(409).json({ error: "This deck is not stored in a supported private Vekta pitch-deck bucket." });
    let investorFirm = "";
    if (investorId) {
      const { data: investor, error } = await service.from("firm_records").select("id,firm_name").eq("id", investorId).maybeSingle();
      if (error || !investor) return res.status(400).json({ error: "Choose an existing investor record." });
      investorFirm = investor.firm_name || "";
    }
    let safeLogo = "";
    try { const parsed = new URL(logoUrl); if (parsed.protocol === "https:") safeLogo = parsed.toString(); } catch { /* optional logo */ }
    const token = deriveShareToken(ownerId, requestId);
    const { data, error } = await service.from("deck_shares").insert({
      user_id: ownerId, deck_id: deck.id, create_request_id: requestId, token: null, token_hash: hashShareToken(token),
      workspace_id: null, company_slug: companySlug, presentation_slug: presentationSlug, contact_email: contactEmail || null,
      name, recipient_name: recipientName, recipient_firm: investorFirm || null, recipient_email: recipientEmail || null,
      intended_investor_id: investorId, password_hash: password ? hashSharePassword(password) : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null, require_email: req.body?.requireEmail === true, allowed_emails: allowedEmails, show_download: req.body?.showDownload === true,
      deck_version_uploaded_at: deck.uploaded_at, file_url_snapshot: deck.file_url,
      company_name_snapshot: companyName, company_logo_url_snapshot: safeLogo || null, company_stage_snapshot: companyStage || null,
    }).select(activeShareQuery).single();
    if (error?.code === "23505") {
      const { data: replayed } = await service.from("deck_shares").select(activeShareQuery).eq("user_id", ownerId).eq("create_request_id", requestId).maybeSingle();
      if (replayed) return res.status(200).json({ link: { ...replayed, token: deriveShareToken(ownerId, requestId), password_hash: undefined, has_password: Boolean(replayed.password_hash) }, replayed: true });
      return res.status(409).json({ error: "This custom link is already in use. Choose another address." });
    }
    if (error || !data) return res.status(500).json({ error: "Could not create the share link." });
    return res.status(201).json({ link: { ...data, token, password_hash: undefined, has_password: Boolean(data.password_hash) } });
  }

  const linkId = str(req.query.linkId || req.body?.linkId, 60);
  if (!linkId) return res.status(400).json({ error: "Choose a share link." });
  const { data: existing, error: lookupError } = await service.from("deck_shares").select("*").eq("id", linkId).eq("user_id", ownerId).maybeSingle();
  if (lookupError) return res.status(500).json({ error: "Could not verify share ownership." });
  if (!existing) return res.status(404).json({ error: "Share link not found." });
  if (req.method === "DELETE") {
    if (!existing.revoked_at) {
      const { error } = await service.from("deck_shares").update({ revoked_at: new Date().toISOString() }).eq("id", linkId).eq("user_id", ownerId);
      if (error) return res.status(500).json({ error: "Could not revoke this link." });
    }
    return res.status(200).json({ ok: true });
  }
  if (req.method === "PATCH") {
    const name = str(req.body?.name) || existing.name;
    const companyStage = Object.prototype.hasOwnProperty.call(req.body ?? {}, "companyStage")
      ? (typeof req.body?.companyStage === "string" ? str(req.body.companyStage, 80) || null : null)
      : existing.company_stage_snapshot;
    const expiresAt = str(req.body?.expiresAt, 50);
    const password = passwordValue(req.body?.password);
    const companyName = str(req.body?.companyName ?? existing.company_name_snapshot, 160);
    const presentationSlug = str(req.body?.presentationSlug || existing.presentation_slug, 80).toLowerCase();
    const contactEmail = str(req.body?.contactEmail ?? existing.contact_email, 254).toLowerCase();
    const investorId = Object.prototype.hasOwnProperty.call(req.body ?? {}, "investorId") ? str(req.body?.investorId, 60) || null : existing.intended_investor_id;
    let allowedEmails: string[];
    try { allowedEmails = req.body?.requireEmail === true ? parseAllowedEmails(req.body?.allowedEmails) : []; }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Enter valid email addresses." }); }
    if (!slugPattern.test(presentationSlug)) return res.status(400).json({ error: "Enter a valid custom link." });
    if (!validEmail(contactEmail)) return res.status(400).json({ error: "Enter a valid contact email address." });
    const companySlug = workspacePathSlug(companyName) || "company";
    let investorFirm: string | null | undefined;
    let investorName: string | null | undefined;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "investorId")) {
      if (investorId) {
        const { data: investor, error: investorError } = await service.from("firm_records").select("id,firm_name").eq("id", investorId).maybeSingle();
        if (investorError || !investor) return res.status(400).json({ error: "Choose an existing investor record." });
        investorFirm = investor.firm_name || null;
        investorName = str(req.body?.investorName, 180) || investor.firm_name || null;
      } else {
        investorFirm = null;
        // recipient_name is NOT NULL on legacy deck_shares rows. Keep the
        // no-investor state as an empty string, matching link creation.
        investorName = "";
      }
    }
    const { data: pathConflict, error: pathError } = await service.from("deck_shares").select("id")
      .eq("company_slug", companySlug).eq("presentation_slug", presentationSlug).neq("id", linkId).maybeSingle();
    if (pathError) return res.status(500).json({ error: "Could not check custom link availability." });
    if (pathConflict) return res.status(409).json({ error: "This custom link is already in use. Choose another address." });
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) return res.status(400).json({ error: "Choose a future expiration date." });
    if (password.length > 200) return res.status(400).json({ error: "Use a password with no more than 200 characters." });
    if (password && password.length < 4) return res.status(400).json({ error: "Use a password with at least 4 characters." });
    const patch: Record<string, unknown> = { name, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null, require_email: req.body?.requireEmail === true, allowed_emails: allowedEmails, show_download: req.body?.showDownload === true, company_stage_snapshot: companyStage, workspace_id: existing.workspace_id || null, company_slug: companySlug, company_name_snapshot: companyName || existing.company_name_snapshot, presentation_slug: presentationSlug, contact_email: contactEmail || null };
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "investorId")) Object.assign(patch, { intended_investor_id: investorId, recipient_name: investorName, recipient_firm: investorFirm, recipient_email: null });
    if (password) patch.password_hash = hashSharePassword(password);
    else if (req.body?.clearPassword === true) patch.password_hash = null;
    const { data, error } = await service.from("deck_shares").update(patch).eq("id", linkId).eq("user_id", ownerId).select(activeShareQuery).single();
    if (error?.code === "23505") return res.status(409).json({ error: "This custom link is already in use. Choose another address." });
    if (error) return res.status(500).json({ error: "Could not update share settings." });
    return res.status(200).json({ link: { ...data, password_hash: undefined, has_password: Boolean(data.password_hash) } });
  }
  return res.status(405).json({ error: "Method not allowed" });
}

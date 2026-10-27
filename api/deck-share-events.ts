import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { findViewerSession, getDeckShareService, consumeDeckShareLimit, readCookie, shareIsActive, type DeckShareWithDeck } from "./_deckShareServer.js";
import { prepareDeckShareEventRows, type IncomingDeckShareEvent } from "./_deckShareEvents.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const service = getDeckShareService();
  if (!service) return res.status(503).json({ error: "Analytics are unavailable." });
  const sessionToken = readCookie(req, "vekta_deck_session");
  if (!sessionToken) return res.status(401).json({ error: "Viewer session expired." });
  try {
    const session = await findViewerSession(service, sessionToken);
    if (!session || Date.parse(session.expires_at) <= Date.now()) return res.status(401).json({ error: "Viewer session expired." });
    const share = session.deck_shares as DeckShareWithDeck | null;
    if (!share || shareIsActive(share)) return res.status(410).json({ error: "This share link is unavailable." });
    if (!await consumeDeckShareLimit(service, `events:${session.id}`, 40, 60)) return res.status(429).json({ error: "Viewer events are being sent too quickly." });
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const input = Array.isArray(body.events) ? body.events as IncomingDeckShareEvent[] : [];
    const maxPage = Math.min(Number(share.company_pitch_decks?.slide_count) || 500, 500);
    const prepared = prepareDeckShareEventRows(input, session.id, share.id, maxPage, share.deck_id);
    if (prepared.error) return res.status(400).json({ error: prepared.error });
    const rows = prepared.rows!;
    const { data: inserted, error: insertError } = await service.from("deck_share_events").upsert(rows, { onConflict: "event_id", ignoreDuplicates: true }).select("event_id,event_type,created_at");
    if (insertError) return res.status(500).json({ error: "Could not record viewer activity." });
    const fresh = inserted ?? [];
    return res.status(200).json({ ok: true, accepted: fresh.length, duplicateCount: rows.length - fresh.length, requestId: randomUUID() });
  } catch {
    return res.status(503).json({ error: "Viewer analytics are temporarily unavailable." });
  }
}

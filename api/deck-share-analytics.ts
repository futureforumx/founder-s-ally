import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDeckShareService, getVerifiedOwnerId, consumeDeckShareLimit } from "./_deckShareServer.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const service = getDeckShareService();
  if (!service) return res.status(503).json({ error: "Deck analytics are unavailable." });
  const ownerId = await getVerifiedOwnerId(req.headers.authorization, service);
  if (!ownerId) return res.status(401).json({ error: "Sign in to view deck analytics." });
  const deckId = typeof req.query.deckId === "string" ? req.query.deckId : "";
  if (!/^[0-9a-f-]{36}$/i.test(deckId)) return res.status(400).json({ error: "Choose a deck version." });
  try {
    if (!await consumeDeckShareLimit(service, `analytics:${ownerId}`, 60, 60)) return res.status(429).json({ error: "Too many analytics requests. Try again shortly." });
    const { data, error } = await service.rpc("get_deck_share_analytics", { p_owner_id: ownerId, p_deck_id: deckId });
    if (error) return res.status(500).json({ error: "Could not load deck analytics." });
    if (!data) return res.status(404).json({ error: "Deck version not found." });
    return res.status(200).json(data);
  } catch {
    return res.status(503).json({ error: "Deck analytics are temporarily unavailable." });
  }
}

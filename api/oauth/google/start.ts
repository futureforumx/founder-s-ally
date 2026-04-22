/**
 * GET /api/oauth/google/start?connector=gmail|gcal|gsheets&owner_context_id=<uuid>
 * Requires Authorization: Bearer <Clerk JWT> (SPA uses fetch + redirect: manual).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildGoogleOAuthStartResponse } from "./_googleStartLogic";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.status(204).end();
  }

  const r = await buildGoogleOAuthStartResponse({
    method: req.method ?? "GET",
    connector: typeof req.query.connector === "string" ? req.query.connector : undefined,
    owner_context_id:
      typeof req.query.owner_context_id === "string" ? req.query.owner_context_id : undefined,
    authorization: req.headers.authorization as string | undefined,
  });

  if (r.kind === "redirect") {
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, r.location);
  }

  if (r.status === 204) {
    return res.status(204).end();
  }

  return res.status(r.status).json(r.body);
}

/**
 * GET /api/oauth/google/callback?code=…&state=…
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildGoogleOAuthCallbackResponse } from "./googleCallbackLogic";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const r = await buildGoogleOAuthCallbackResponse({
    method: req.method ?? "GET",
    code: typeof req.query.code === "string" ? req.query.code : undefined,
    state: typeof req.query.state === "string" ? req.query.state : undefined,
    error: typeof req.query.error === "string" ? req.query.error : undefined,
  });
  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, r.location);
}

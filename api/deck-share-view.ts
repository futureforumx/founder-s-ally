import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientIpFromHeaders, resolveDeckShareView } from "./_deckShareViewLogic.js";
import { readJsonBody } from "./_readJsonBody.js";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

/** Public: the share token is the only credential. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
  const result = await resolveDeckShareView({
    token: typeof body.token === "string" ? body.token : "",
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
    referrer: typeof body.referrer === "string" ? body.referrer : null,
    ip: clientIpFromHeaders(req.headers["x-forwarded-for"], req.socket?.remoteAddress ?? null),
  });

  return res.status(result.status).json(result.body);
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readJsonBody } from "../../_readJsonBody";
import { runGoogleResync } from "../_googleResyncLogic";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body: Record<string, unknown> = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const owner_context_id = typeof body.owner_context_id === "string" ? body.owner_context_id : undefined;
  const out = await runGoogleResync({
    authorization: req.headers.authorization as string | undefined,
    owner_context_id,
  });
  return res.status(out.status).json(out.json);
}

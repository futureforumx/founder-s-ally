import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClerkUserIdFromAuthHeader } from "../_clerkFromRequest";
import { parseR2StoredValue, r2ConfiguredFor, signedR2PitchDeckUrl } from "../_r2UserAssets";
import { readJsonBody } from "../_readJsonBody";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getClerkUserIdFromAuthHeader(req.headers.authorization as string | undefined);
  if (!userId) return res.status(401).json({ error: "Missing or invalid Authorization bearer token" });

  const body = await readJsonBody(req).catch(() => ({}));
  const fileUrl = typeof body.file_url === "string" ? body.file_url : "";
  const key = parseR2StoredValue(fileUrl);
  if (!key || !key.startsWith(`pitch-decks/${userId}/`)) return res.status(400).json({ error: "Invalid pitch deck key" });

  const configured = r2ConfiguredFor("pitch-deck");
  if (!configured.ok) return res.status(500).json({ error: "R2 pitch decks are not configured", missing: configured.missing });

  try {
    const signedUrl = await signedR2PitchDeckUrl(key);
    return res.status(200).json({ ok: true, signedUrl });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to sign R2 URL" });
  }
}

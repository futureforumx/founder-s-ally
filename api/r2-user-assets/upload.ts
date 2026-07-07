import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClerkUserIdFromAuthHeader } from "../_clerkFromRequest";
import { parseMultipartAsset, r2ConfiguredFor, uploadR2UserAsset } from "../_r2UserAssets";

export const config = { api: { bodyParser: false } };

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const parsed = await parseMultipartAsset(req);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const userId = await getClerkUserIdFromAuthHeader(req.headers.authorization as string | undefined);
  if (!userId) return res.status(401).json({ error: "Missing or invalid Authorization bearer token" });

  const configured = r2ConfiguredFor(parsed.assetType);
  if (!configured.ok) return res.status(500).json({ error: "R2 upload is not configured", missing: configured.missing });

  try {
    const out = await uploadR2UserAsset({
      userId,
      assetType: parsed.assetType,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      fileData: parsed.fileData,
    });
    return res.status(200).json({ ok: true, key: out.key, url: out.url, bucket: out.bucket });
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "R2 upload failed" });
  }
}

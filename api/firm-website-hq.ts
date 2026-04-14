import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleFirmWebsiteHqPost } from "./handleFirmWebsiteHqPost.js";

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  return res;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return setCors(res).status(200).end();
  }
  if (req.method !== "POST") {
    return setCors(res).status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

  try {
    const out = await handleFirmWebsiteHqPost(body);
    return setCors(res).status(200).json(out);
  } catch (error) {
    return setCors(res).status(500).json({
      error: error instanceof Error ? error.message : "HQ lookup failed",
    });
  }
}

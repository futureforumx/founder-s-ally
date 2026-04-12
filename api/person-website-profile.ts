import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolvePersonWebsiteProfile } from "./_personWebsiteProfile.js";

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
  const firmWebsiteUrl = typeof body.firmWebsiteUrl === "string" ? body.firmWebsiteUrl.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : null;

  if (!firmWebsiteUrl || !fullName) {
    return setCors(res).status(400).json({
      error: "firmWebsiteUrl and fullName are required",
    });
  }

  try {
    const profile = await resolvePersonWebsiteProfile({ firmWebsiteUrl, fullName, title });
    return setCors(res).status(200).json(profile);
  } catch (error) {
    return setCors(res).status(500).json({
      error: error instanceof Error ? error.message : "Profile lookup failed",
    });
  }
}

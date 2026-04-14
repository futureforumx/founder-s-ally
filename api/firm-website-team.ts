import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveFirmWebsiteTeam } from "./_firmWebsiteTeam.js";

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
  const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  const forceRefresh = body.forceRefresh === true;
  if (!websiteUrl) {
    return setCors(res).status(400).json({ error: "websiteUrl is required" });
  }

  try {
    const { people, teamMemberEstimate } = await resolveFirmWebsiteTeam(websiteUrl, { forceRefresh });
    return setCors(res).status(200).json({ people, teamMemberEstimate });
  } catch (error) {
    return setCors(res).status(500).json({
      error: error instanceof Error ? error.message : "Team lookup failed",
    });
  }
}

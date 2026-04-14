import type { VercelRequest, VercelResponse } from "@vercel/node";
import { mirrorFirmInvestorHeadshotsForFirm, supabaseAdminForMirror } from "./_mirrorFirmInvestorHeadshots.js";

function setCors(res: VercelResponse): VercelResponse {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  return res;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return setCors(res).status(200).end();
  }
  if (req.method !== "POST") {
    return setCors(res).status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const firmRecordId = typeof body.firmRecordId === "string" ? body.firmRecordId.trim() : "";
  if (!firmRecordId || !isUuid(firmRecordId)) {
    return setCors(res).status(400).json({ error: "firmRecordId (uuid) is required" });
  }

  const admin = supabaseAdminForMirror();
  if (!admin) {
    return setCors(res).status(200).json({
      configured: false,
      firmRecordId,
      candidates: 0,
      mirrored: 0,
      failed: 0,
      message: "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not set",
    });
  }

  try {
    const result = await mirrorFirmInvestorHeadshotsForFirm(admin, firmRecordId);
    return setCors(res).status(200).json(result);
  } catch (error) {
    return setCors(res).status(500).json({
      error: error instanceof Error ? error.message : "Mirror failed",
    });
  }
}

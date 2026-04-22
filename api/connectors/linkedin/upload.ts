/**
 * POST /api/connectors/linkedin/upload — multipart form: owner_context_id, file (.csv)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runLinkedinCsvUpload } from "../_linkedinUploadLogic";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const out = await runLinkedinCsvUpload(req, req.headers.authorization as string | undefined);
  return res.status(out.status).json(out.json);
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchProxiedExternalImage, parseProxyTargetUrl } from "./_proxyExternalImage.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return res.status(405).setHeader("Content-Type", "text/plain").send("Method not allowed");
  }

  const rawU = typeof req.query.u === "string" ? req.query.u : Array.isArray(req.query.u) ? req.query.u[0] : "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawU);
  } catch {
    return res.status(400).setHeader("Content-Type", "text/plain").send("Bad u param");
  }

  const target = parseProxyTargetUrl(decoded);
  if (!target) {
    return res.status(400).setHeader("Content-Type", "text/plain").send("URL not allowed");
  }

  const out = await fetchProxiedExternalImage(target);
  if (!out.ok) {
    return res.status((out as { ok: false; status: number; message: string }).status).setHeader("Content-Type", "text/plain").send((out as { ok: false; status: number; message: string }).message);
  }

  res.setHeader("Content-Type", out.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).send(out.body);
}

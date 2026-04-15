/**
 * Shared logic for GET `/api/proxy-external-image` — fetches allowlisted raster URLs server-side
 * so the browser loads them same-origin (Licdn / LinkedIn / WordPress Photon often block direct hotlinks).
 */

import { shouldProxyHeadshotHostname } from "../src/lib/headshotProxyHost.js";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const IMAGE_FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; VEKTAHeadshotProxy/1.0; +https://vekta.app)",
  accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function sniffRasterFormat(buf: Buffer): { contentType: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return { contentType: "image/jpeg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { contentType: "image/png" };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { contentType: "image/gif" };
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { contentType: "image/webp" };
  }
  return null;
}

export function parseProxyTargetUrl(raw: string | null | undefined): URL | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!shouldProxyHeadshotHostname(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

export type ProxyImageResult =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; status: number; message: string };

export async function fetchProxiedExternalImage(target: URL): Promise<ProxyImageResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.href, {
      signal: controller.signal,
      headers: IMAGE_FETCH_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, status: res.status, message: `Upstream ${res.status}` };
    }
    const headerCt = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32 || buf.length > MAX_IMAGE_BYTES) {
      return { ok: false, status: 502, message: "Invalid image size" };
    }
    if (headerCt.includes("svg")) {
      return { ok: false, status: 415, message: "SVG not allowed" };
    }
    if (headerCt.startsWith("image/") && !headerCt.includes("svg")) {
      return { ok: true, body: buf, contentType: headerCt || "image/jpeg" };
    }
    const sniffed = sniffRasterFormat(buf);
    if (sniffed) return { ok: true, body: buf, contentType: sniffed.contentType };
    return { ok: false, status: 502, message: "Not a raster image" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return { ok: false, status: 504, message: msg };
  } finally {
    clearTimeout(timer);
  }
}

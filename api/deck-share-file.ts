import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";
import { getR2PitchDeckObject, parseR2StoredValue } from "./_r2UserAssets.js";
import { findViewerSession, getDeckShareService, consumeDeckShareLimit, readCookie, shareIsActive, type DeckShareWithDeck } from "./_deckShareServer.js";

function setPdfHeaders(res: VercelResponse, details: { length?: number; range?: string; etag?: string }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
  if (details.length !== undefined) res.setHeader("Content-Length", String(details.length));
  if (details.range) res.setHeader("Content-Range", details.range);
  if (details.etag) res.setHeader("ETag", details.etag);
}

function nodeReadable(body: unknown): Readable | null {
  if (!body || typeof body !== "object") return null;
  const candidate = body as {
    pipe?: (destination: NodeJS.WritableStream) => unknown;
    getReader?: () => unknown;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };
  if (body instanceof Readable || typeof candidate.pipe === "function") return body as Readable;
  if (typeof candidate.getReader === "function") {
    return Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>);
  }
  if (typeof candidate[Symbol.asyncIterator] === "function") return Readable.from(body as AsyncIterable<Uint8Array>);
  return null;
}

async function readBytes(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const service = getDeckShareService();
  if (!service) return res.status(503).end();
  const sessionToken = readCookie(req, "vekta_deck_session");
  if (!sessionToken) return res.status(401).end();
  try {
    const session = await findViewerSession(service, sessionToken);
    if (!session || Date.parse(session.expires_at) <= Date.now()) return res.status(401).end();
    const share = session.deck_shares as DeckShareWithDeck | null;
    const deck = share?.company_pitch_decks;
    if (!share || !deck || share.user_id !== deck.user_id || !share.file_url_snapshot) return res.status(404).end();
    const inactive = shareIsActive(share);
    if (inactive) return res.status(410).end();
    if (!deck.file_name.toLowerCase().endsWith(".pdf")) return res.status(415).end();
    if (!await consumeDeckShareLimit(service, `file:${session.id}`, 600, 60)) return res.status(429).end();

    const stored = String(share.file_url_snapshot);
    const r2Key = parseR2StoredValue(stored);
    const expectedPrefix = `pitch-decks/${share.user_id}/`;
    const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : undefined;
    if (r2Key) {
      if (!r2Key.startsWith(expectedPrefix) || r2Key.includes("..")) return res.status(404).end();
      const object = await getR2PitchDeckObject(r2Key, rangeHeader);
      const stream = nodeReadable(object.Body);
      if (!stream) return res.status(404).end();
      const bytes = await readBytes(stream);
      if (!bytes.length) return res.status(404).end();
      const rangeLength = object.ContentRange?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/);
      if (rangeLength && bytes.length !== Number(rangeLength[2]) - Number(rangeLength[1]) + 1) {
        console.error("[deck-share-file] R2 range length did not match Content-Range", { expected: Number(rangeLength[2]) - Number(rangeLength[1]) + 1, received: bytes.length });
        return res.status(502).end();
      }
      setPdfHeaders(res, { length: bytes.length, range: object.ContentRange, etag: object.ETag });
      res.status(object.ContentRange ? 206 : 200);
      return res.end(bytes);
    }

    // Legacy Supabase Storage object keys are private too. Fetch them server-side
    // and stream through this gate; the signed storage URL never reaches a viewer.
    if (stored.includes("://") || !stored.startsWith(`${share.user_id}/`) || stored.includes("..")) return res.status(404).end();
    const { data: signed, error } = await service.storage.from("pitch-decks").createSignedUrl(stored, 60);
    if (error || !signed?.signedUrl) return res.status(404).end();
    const upstream = await fetch(signed.signedUrl, { headers: rangeHeader ? { Range: rangeHeader } : {} });
    if (!upstream.ok || !upstream.body) return res.status(upstream.status === 416 ? 416 : 404).end();
    const contentRange = upstream.headers.get("content-range") || undefined;
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length) return res.status(404).end();
    setPdfHeaders(res, { length: bytes.length, range: contentRange, etag: upstream.headers.get("etag") || undefined });
    res.status(upstream.status);
    return res.end(bytes);
  } catch (error) {
    console.error("[deck-share-file] Could not fetch private deck", error);
    if (!res.headersSent) res.status(503).end();
    else res.end();
  }
}

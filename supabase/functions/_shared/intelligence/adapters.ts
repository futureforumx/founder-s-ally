/**
 * Pluggable source adapters. Register new kinds in SOURCE_ADAPTERS and point
 * intelligence_sources.metadata.adapter at the key (default: "rss").
 */

export interface RssItem {
  title: string;
  link: string | null;
  pubDate: string | null;
  description: string | null;
}

/** Minimal RSS 2.0 item extraction (no XML dependency). */
export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const title = textTag(block, "title");
    const link = textTag(block, "link");
    const pubDate = textTag(block, "pubDate") || textTag(block, "dc:date");
    const description = textTag(block, "description") || textTag(block, "content:encoded");
    if (title) {
      items.push({
        title: decodeEntities(stripHtml(title)),
        link: link ? decodeEntities(link.trim()) : null,
        pubDate: pubDate ? pubDate.trim() : null,
        description: description ? decodeEntities(stripHtml(description)).slice(0, 2000) : null,
      });
    }
  }
  return items;
}

function textTag(block: string, tag: string): string | null {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`, "i");
  const mm = block.match(re);
  return mm ? mm[1].trim() : null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export type SourceAdapter = (args: {
  fetch: typeof fetch;
  baseUrl: string;
  metadata: Record<string, unknown>;
}) => Promise<RssItem[]>;

export const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  async rss({ fetch, baseUrl, metadata }) {
    const feedUrl = typeof metadata.feed_url === "string" && metadata.feed_url.trim()
      ? metadata.feed_url.trim()
      : baseUrl;
    if (!feedUrl) return [];
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "VektaIntelligence/1.0" },
    });
    if (!res.ok) throw new Error(`RSS fetch ${res.status}: ${feedUrl}`);
    const xml = await res.text();
    return parseRssItems(xml);
  },
};

export function getAdapterKey(metadata: Record<string, unknown>): string {
  const a = metadata.adapter;
  return typeof a === "string" && a.trim() ? a.trim() : "rss";
}

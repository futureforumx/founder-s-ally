/**
 * Parse Work at a Startup (workatastartup.com) Inertia SSR payloads from HTML:
 * `<div ... data-page="...">` (HTML-escaped JSON).
 */

/** Browser-like UA; WAAS often returns 406/403 for generic bots. */
export const WAAS_FETCH_UA =
  process.env.WAAS_FETCH_USER_AGENT?.trim() ||
  process.env.YC_FETCH_USER_AGENT?.trim() ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function fetchWaasHtml(url: string): Promise<{ html: string; status: number }> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": WAAS_FETCH_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await res.text();
  return { html, status: res.status };
}

export type InertiaPage<TProps = Record<string, unknown>> = {
  component: string;
  props: TProps;
};

const DATA_PAGE_RE = /data-page="([^"]+)"/;

function decodeDataPageAttr(encoded: string): string {
  return encoded
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Extract & parse Inertia JSON from SSR HTML (`data-page`). */
export function parseInertiaDataPage<TProps = Record<string, unknown>>(html: string): InertiaPage<TProps> | null {
  const m = html.match(DATA_PAGE_RE);
  if (!m) return null;
  try {
    return JSON.parse(decodeDataPageAttr(m[1]!)) as InertiaPage<TProps>;
  } catch {
    return null;
  }
}

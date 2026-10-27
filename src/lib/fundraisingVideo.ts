/** Convert recognized video share URLs into fixed, provider-owned embed URLs. */
export function getValidatedVideoEmbedUrl(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (["youtube.com", "m.youtube.com"].includes(host)) {
      const id = url.searchParams.get("v") ?? url.pathname.match(/^\/embed\/([\w-]+)$/)?.[1] ?? url.pathname.match(/^\/shorts\/([\w-]+)$/)?.[1];
      return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (["vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = url.pathname.match(/\/(?:video\/)?(\d{5,})/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "loom.com") {
      const id = url.pathname.match(/^\/share\/([\w-]+)\/?$/)?.[1];
      return id ? `https://www.loom.com/embed/${id}` : null;
    }
  } catch { return null; }
  return null;
}

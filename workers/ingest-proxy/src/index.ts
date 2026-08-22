/**
 * Host-restricted fetch proxy for GitHub Actions ingest.
 * Only forwards https URLs whose hostname is in ALLOWED_HOSTS (geekwire.com).
 *
 * Usage: GET /?url=https%3A%2F%2Fwww.geekwire.com%2Ffundings%2F
 */
const DEFAULT_ALLOWED = ["geekwire.com", "www.geekwire.com"];

function allowedHosts(env: { ALLOWED_HOSTS?: string }): Set<string> {
  const raw = (env.ALLOWED_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set(raw.length ? raw : DEFAULT_ALLOWED);
}

function forbidden(message: string, status = 403): Response {
  return new Response(message, { status, headers: { "cache-control": "no-store" } });
}

export default {
  async fetch(request: Request, env: { ALLOWED_HOSTS?: string }): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return forbidden("method not allowed", 405);
    }

    const incoming = new URL(request.url);
    const targetRaw = incoming.searchParams.get("url")?.trim() || "";
    if (!targetRaw) return forbidden("missing url query parameter", 400);

    let target: URL;
    try {
      target = new URL(targetRaw);
    } catch {
      return forbidden("invalid url", 400);
    }
    if (target.protocol !== "https:") return forbidden("only https targets are allowed", 400);

    const host = target.hostname.toLowerCase();
    if (!allowedHosts(env).has(host)) {
      return forbidden(`host not allowlisted: ${host}`);
    }

    const headers = new Headers();
    const ua = request.headers.get("user-agent");
    headers.set(
      "user-agent",
      ua || "Mozilla/5.0 (compatible; VEKTA-FundingIngest/1.0; +https://vekta.app)",
    );
    headers.set("accept", request.headers.get("accept") || "*/*");
    headers.set("accept-language", request.headers.get("accept-language") || "en-US,en;q=0.9");
    headers.set("referer", `${target.protocol}//${target.hostname}/`);

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      redirect: "follow",
    });

    const out = new Headers(upstream.headers);
    out.set("x-ingest-proxy-host", host);
    out.delete("set-cookie");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

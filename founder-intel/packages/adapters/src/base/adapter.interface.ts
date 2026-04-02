import type { AdapterConfig, AdapterResult, IAdapter } from "@founder-intel/types";

export { IAdapter, AdapterConfig, AdapterResult };

// ─── Base robot-checking utility ─────────────────────────────────────────────

export async function checkRobotsTxt(
  baseUrl: string,
  userAgent = "FounderIntelBot/1.0"
): Promise<boolean> {
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).toString();
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return true; // No robots.txt → assume allowed

    const text = await res.text();
    // Simple parser — look for Disallow on relevant paths
    const lines = text.split("\n");
    let inScope = false;
    for (const raw of lines) {
      const line = raw.trim().toLowerCase();
      if (line.startsWith("user-agent:")) {
        const agent = line.replace("user-agent:", "").trim();
        inScope = agent === "*" || agent === userAgent.toLowerCase();
      }
      if (inScope && line.startsWith("disallow: /")) {
        const path = line.replace("disallow:", "").trim();
        if (path === "/" || path === "/*") return false;
      }
    }
    return true;
  } catch {
    return true; // Network failure → optimistically allow
  }
}

// ─── Rate-limited fetch helper ────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function rateLimitedFetch(
  url: string,
  options: RequestInit,
  rateLimitMs: number
): Promise<Response> {
  await sleep(rateLimitMs);
  return fetch(url, options);
}

import * as cheerio from "cheerio";
import type { AtsHint, SourceDetectionResult } from "./types.js";
import { fetchText } from "./http.js";
import { fetchHtmlWithPlaywright, shouldTryPlaywrightForHtml } from "./playwrightFetch.js";

const CAREER_PATHS = [
  "/careers",
  "/jobs",
  "/join-us",
  "/work-with-us",
  "/about/careers",
  "/career",
  "/opportunities",
  "/openings",
  "/team",
  "/life",
];

function normalizeRoot(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (!u.hostname) return null;
    u.hash = "";
    u.pathname = "/";
    u.search = "";
    return u;
  } catch {
    return null;
  }
}

function uniqHints(hints: AtsHint[]): AtsHint[] {
  const seen = new Set<string>();
  const out: AtsHint[] = [];
  for (const h of hints) {
    const k = `${h.kind}:${h.token.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

function extractHintsFromHtml(html: string, pageUrl: string): AtsHint[] {
  const hints: AtsHint[] = [];
  const hay = html;
  const $ = cheerio.load(html);

  const scanHref = (href: string | undefined) => {
    if (!href) return;
    const abs = (() => {
      try {
        return new URL(href, pageUrl).toString();
      } catch {
        return href;
      }
    })();

    const ashbyBoard = abs.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
    if (ashbyBoard?.[1]) {
      hints.push({ kind: "ASHBY", token: ashbyBoard[1], evidenceUrl: pageUrl });
    }
    const ghBoard =
      abs.match(/boards\.greenhouse\.io\/([^/?#]+)/i) ||
      abs.match(/job-boards\.greenhouse\.io\/([^/?#]+)/i) ||
      abs.match(/boards\.eu\.greenhouse\.io\/([^/?#]+)/i);
    if (ghBoard?.[1]) {
      hints.push({ kind: "GREENHOUSE", token: ghBoard[1], evidenceUrl: pageUrl });
    }
    const leverSite = abs.match(/jobs\.lever\.co\/([^/?#]+)/i);
    if (leverSite?.[1]) {
      hints.push({ kind: "LEVER", token: leverSite[1], evidenceUrl: pageUrl });
    }
  };

  $("a[href],link[href],iframe[src],frame[src],embed[src]").each((_, el) => {
    const href = $(el).attr("href") || $(el).attr("src");
    scanHref(href);
  });

  // Inline scripts / JSON blobs sometimes embed board tokens
  const ghInline = hay.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/"'?&]+)/i);
  if (ghInline?.[1]) hints.push({ kind: "GREENHOUSE", token: ghInline[1], evidenceUrl: pageUrl });
  const ghEmbed = hay.match(/embed\.greenhouse\.io\/[^"']*for=([a-z0-9_-]+)/i);
  if (ghEmbed?.[1]) hints.push({ kind: "GREENHOUSE", token: ghEmbed[1], evidenceUrl: pageUrl });
  const ghBoardsCdn = hay.match(/job-boards\.cdn\.greenhouse\.io\/([^/"'?]+)/i);
  if (ghBoardsCdn?.[1]) hints.push({ kind: "GREENHOUSE", token: ghBoardsCdn[1], evidenceUrl: pageUrl });

  const ashInline = hay.match(/api\.ashbyhq\.com\/posting-api\/job-board\/([^/"'?&]+)/i);
  if (ashInline?.[1]) hints.push({ kind: "ASHBY", token: ashInline[1], evidenceUrl: pageUrl });
  const ashWindow = hay.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)\b/i);
  if (ashWindow?.[1]) hints.push({ kind: "ASHBY", token: ashWindow[1], evidenceUrl: pageUrl });

  const levInline = hay.match(/api\.lever\.co\/v0\/postings\/([^/"'?&]+)/i);
  if (levInline?.[1]) hints.push({ kind: "LEVER", token: levInline[1], evidenceUrl: pageUrl });

  return uniqHints(hints);
}

function orderHints(hints: AtsHint[]): AtsHint[] {
  const rank = (k: AtsHint["kind"]) => (k === "ASHBY" ? 0 : k === "GREENHOUSE" ? 1 : 2);
  return [...hints].sort((a, b) => rank(a.kind) - rank(b.kind));
}

export async function detectSources(website: string, log: (m: string) => void): Promise<SourceDetectionResult> {
  const probeErrors: SourceDetectionResult["probeErrors"] = [];
  const root = normalizeRoot(website);
  if (!root) {
    return {
      rootUrl: website,
      careersPageUrl: null,
      atsHints: [],
      probeErrors: [{ url: website, message: "Invalid website URL" }],
    };
  }

  const rootUrl = root.origin;
  let bestCareers: string | null = null;
  const allHints: AtsHint[] = [];
  let richestHtml = "";
  let richestUrl = rootUrl + "/";

  async function probe(url: string) {
    try {
      const { ok, status, text } = await fetchText(url);
      if (!ok) {
        probeErrors.push({ url, message: `HTTP ${status}` });
        return null;
      }
      if (text.length > richestHtml.length) {
        richestHtml = text;
        richestUrl = url;
      }
      return text;
    } catch (e) {
      probeErrors.push({ url, message: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  const homeHtml = await probe(rootUrl + "/");
  if (homeHtml) {
    allHints.push(...extractHintsFromHtml(homeHtml, rootUrl + "/"));
    if (!bestCareers) {
      const $ = cheerio.load(homeHtml);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        try {
          const u = new URL(href, rootUrl);
          if (u.origin !== new URL(rootUrl).origin) return;
          const p = u.pathname.toLowerCase();
          if (CAREER_PATHS.some((cp) => p === cp || p.startsWith(`${cp}/`))) {
            bestCareers = u.toString();
          }
        } catch {
          /* ignore */
        }
      });
    }
  }

  for (const path of CAREER_PATHS) {
    const url = rootUrl + path;
    const html = await probe(url);
    if (!html) continue;
    if (!bestCareers) bestCareers = url;
    allHints.push(...extractHintsFromHtml(html, url));
  }

  let merged = orderHints(uniqHints(allHints));

  if (merged.length === 0 && shouldTryPlaywrightForHtml(richestHtml, false)) {
    const pwUrl = bestCareers || `${rootUrl}/careers`;
    const pw = await fetchHtmlWithPlaywright(pwUrl, log);
    if (pw) {
      merged = orderHints(uniqHints([...merged, ...extractHintsFromHtml(pw, pwUrl)]));
    }
    if (merged.length === 0) {
      const pwHome = await fetchHtmlWithPlaywright(`${rootUrl}/`, log);
      if (pwHome) {
        merged = orderHints(uniqHints([...merged, ...extractHintsFromHtml(pwHome, `${rootUrl}/`)]));
      }
    }
    if (merged.length) log(`ATS hints after Playwright: ${merged.length}`);
  }

  return {
    rootUrl: rootUrl,
    careersPageUrl: bestCareers,
    atsHints: merged,
    probeErrors,
  };
}

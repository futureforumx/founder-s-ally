import * as cheerio from "cheerio";
import type { CompanyJobSourceType } from "@prisma/client";
import { fetchText } from "../http.js";
import { fetchHtmlWithPlaywright, shouldTryPlaywrightForHtml } from "../playwrightFetch.js";
import type { NormalizedJobInput } from "../types.js";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pathLooksJobLike(pathname: string, searchParams: URLSearchParams): boolean {
  const p = pathname.toLowerCase();
  if (searchParams.get("gh_jid")) return true;
  return (
    p.includes("/job/") ||
    p.includes("/jobs/") ||
    p.includes("/position/") ||
    p.includes("/opening/") ||
    p.includes("/role/") ||
    p.includes("/vacancy/") ||
    p.includes("/vacancies/") ||
    p.includes("/opportunities/") ||
    p.includes("/hiring/")
  );
}

function walkJsonLd(node: unknown, acc: { title: string; url: string; datePosted?: string }[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const x of node) walkJsonLd(x, acc);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;

  if (o["@graph"]) {
    walkJsonLd(o["@graph"], acc);
  }

  const t = o["@type"];
  const types = Array.isArray(t) ? t.map(String) : t != null ? [String(t)] : [];
  if (types.includes("JobPosting")) {
    const title =
      (typeof o.title === "string" && o.title) ||
      (typeof o.name === "string" && o.name) ||
      (typeof o.headline === "string" && o.headline) ||
      "";
    const urlRaw =
      (typeof o.url === "string" && o.url) ||
      (typeof o.directApply === "object" &&
        o.directApply &&
        typeof (o.directApply as { url?: string }).url === "string" &&
        (o.directApply as { url: string }).url) ||
      (typeof o.sameAs === "string" && o.sameAs) ||
      "";
    const datePosted = typeof o.datePosted === "string" ? o.datePosted : undefined;
    if (title.trim() && urlRaw.trim()) {
      acc.push({ title: title.trim(), url: urlRaw.trim(), datePosted });
    }
    return;
  }

  for (const [k, v] of Object.entries(o)) {
    if (k === "@graph") continue;
    if (v && typeof v === "object") walkJsonLd(v, acc);
  }
}

function extractJsonLdJobs(html: string, careersPageUrl: string, base: URL): NormalizedJobInput[] {
  const $ = cheerio.load(html);
  const rawBlocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).text().trim();
    if (!txt) return;
    try {
      rawBlocks.push(JSON.parse(txt));
    } catch {
      /* ignore invalid JSON-LD */
    }
  });
  const found: { title: string; url: string; datePosted?: string }[] = [];
  for (const block of rawBlocks) walkJsonLd(block, found);

  const out: NormalizedJobInput[] = [];
  const sourceType: CompanyJobSourceType = "WEBSITE";
  const seen = new Set<string>();

  for (const f of found) {
    let abs: URL;
    try {
      abs = new URL(f.url, careersPageUrl);
    } catch {
      continue;
    }
    if (abs.origin !== base.origin) continue;
    const applyUrl = abs.toString();
    if (seen.has(applyUrl)) continue;
    seen.add(applyUrl);
    let postedAt: Date | null = null;
    if (f.datePosted) {
      const d = new Date(f.datePosted);
      postedAt = Number.isNaN(d.getTime()) ? null : d;
    }
    out.push({
      sourceType,
      sourceUrl: careersPageUrl,
      externalJobId: null,
      title: f.title,
      department: null,
      team: null,
      location: null,
      locationType: null,
      employmentType: null,
      postedAt,
      applyUrl,
      descriptionSnippet: null,
      descriptionRaw: null,
      compensationText: null,
      compensationMin: null,
      compensationMax: null,
      compensationCurrency: null,
      rawJson: { source: "json-ld", jobPosting: f },
      mergeKey: `web:ld:${applyUrl}`,
    });
  }
  return out;
}

function pushCardJob(
  out: NormalizedJobInput[],
  seen: Set<string>,
  careersPageUrl: string,
  base: URL,
  titleRaw: string,
  href: string | undefined,
  sourceType: CompanyJobSourceType,
  rawExtra: Record<string, unknown>,
) {
  if (!href) return;
  let abs: URL;
  try {
    abs = new URL(href, careersPageUrl);
  } catch {
    return;
  }
  if (abs.origin !== base.origin) return;
  if (!pathLooksJobLike(abs.pathname, abs.searchParams)) return;
  const title = titleRaw.replace(/\s+/g, " ").trim();
  if (title.length < 3 || title.length > 180) return;
  const lower = title.toLowerCase();
  if (
    lower === "careers" ||
    lower === "jobs" ||
    lower === "view all" ||
    lower === "apply" ||
    lower === "see all openings" ||
    lower.startsWith("all jobs")
  ) {
    return;
  }
  const applyUrl = abs.toString();
  if (seen.has(applyUrl)) return;
  seen.add(applyUrl);
  out.push({
    sourceType,
    sourceUrl: careersPageUrl,
    externalJobId: null,
    title,
    department: null,
    team: null,
    location: null,
    locationType: null,
    employmentType: null,
    postedAt: null,
    applyUrl,
    descriptionSnippet: null,
    descriptionRaw: null,
    compensationText: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    rawJson: rawExtra,
    mergeKey: `web:card:${applyUrl}`,
  });
}

/**
 * Parse careers HTML into normalized WEBSITE jobs (JSON-LD, anchors, card/list heuristics).
 */
export function parseWebsiteJobsFromHtml(
  html: string,
  careersPageUrl: string,
  companyOrigin: string,
): NormalizedJobInput[] {
  const base = new URL(companyOrigin);
  const fromLd = extractJsonLdJobs(html, careersPageUrl, base);
  const seen = new Set(fromLd.map((j) => j.applyUrl));
  const out = [...fromLd];
  const sourceType: CompanyJobSourceType = "WEBSITE";

  const $ = cheerio.load(html);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs: URL;
    try {
      abs = new URL(href, careersPageUrl);
    } catch {
      return;
    }
    if (abs.origin !== base.origin) return;
    if (!pathLooksJobLike(abs.pathname, abs.searchParams)) return;

    const title = $(el).text().replace(/\s+/g, " ").trim();
    if (title.length < 3 || title.length > 180) return;
    const lower = title.toLowerCase();
    if (
      lower === "careers" ||
      lower === "jobs" ||
      lower === "view all" ||
      lower === "apply" ||
      lower === "see all openings" ||
      lower.startsWith("all jobs")
    ) {
      return;
    }

    const applyUrl = abs.toString();
    if (seen.has(applyUrl)) return;
    seen.add(applyUrl);

    const parent = $(el).closest("li,article,div,tr");
    const ctx = parent.text().replace(/\s+/g, " ").trim();
    let location: string | null = null;
    if (ctx.length > title.length + 8) {
      const tail = ctx.slice(ctx.indexOf(title) + title.length).trim();
      const m = tail.match(
        /\b(remote|hybrid|onsite|on-site|new york|san francisco|london|berlin|toronto|austin|seattle|emea|apac|americas)[^|]{0,80}/i,
      );
      if (m) location = m[0].trim().slice(0, 120);
    }

    out.push({
      sourceType,
      sourceUrl: careersPageUrl,
      externalJobId: null,
      title,
      department: null,
      team: null,
      location,
      locationType: null,
      employmentType: null,
      postedAt: null,
      applyUrl,
      descriptionSnippet: null,
      descriptionRaw: null,
      compensationText: null,
      compensationMin: null,
      compensationMax: null,
      compensationCurrency: null,
      rawJson: { href: applyUrl },
      mergeKey: `web:${norm(title)}:${location ? norm(location) : ""}:${applyUrl}`,
    });
  });

  const cardSelectors = [
    "[data-job-id]",
    "[data-testid=\"JobCard\"]",
    "[data-testid=\"job-card\"]",
    "[data-testid*=\"JobCard\"]",
    "[data-testid*=\"job-card\"]",
    "[class*=\"job-card\"]",
    "[class*=\"JobCard\"]",
    "[class*=\"job-listing\"]",
    "[class*=\"JobListing\"]",
    "article[class*=\"job\"]",
  ];

  for (const sel of cardSelectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const href =
        $el.attr("data-href") ||
        $el.attr("data-url") ||
        $el.find("a[href]").first().attr("href") ||
        $el.closest("a[href]").attr("href");
      const title =
        $el.attr("data-job-title") ||
        $el.find("h1, h2, h3, h4, [class*='title' i]").first().text() ||
        $el.text();
      pushCardJob(out, seen, careersPageUrl, base, title, href, sourceType, {
        source: "card",
        selector: sel,
      });
    });
  }

  return out;
}

/**
 * Fetch + parse careers page; optionally re-fetch with Playwright when the shell looks like a SPA
 * and the static parse found nothing useful.
 */
export async function extractWebsiteJobs(
  careersPageUrl: string,
  companyOrigin: string,
  log: (m: string) => void,
): Promise<NormalizedJobInput[]> {
  const { ok, status, text } = await fetchText(careersPageUrl, 22_000);
  if (!ok) throw new Error(`Careers page HTTP ${status}`);

  let merged = parseWebsiteJobsFromHtml(text, careersPageUrl, companyOrigin);
  const useful = merged.length > 0;

  if (!useful && shouldTryPlaywrightForHtml(text, false)) {
    const pw = await fetchHtmlWithPlaywright(careersPageUrl, log);
    if (pw && pw.length > text.length + 500) {
      const second = parseWebsiteJobsFromHtml(pw, careersPageUrl, companyOrigin);
      if (second.length > merged.length) {
        log(`Website parse: static=${merged.length} playwright=${second.length}`);
        merged = second;
      }
    }
  }

  return merged;
}

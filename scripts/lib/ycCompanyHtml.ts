/**
 * Shared helpers for reading YC company directory HTML (ycombinator.com/companies/*).
 * Used by startup scrapers and bulk export scripts.
 */

import { execFileSync } from "node:child_process";

export const YC_FETCH_UA =
  process.env.YC_FETCH_USER_AGENT?.trim() ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const YC_COMPANY_SITEMAP_URL = "https://www.ycombinator.com/companies/sitemap";

export const YC_COMPANY_SKIP_SITEMAP_SLUGS = new Set([
  "industry",
  "batch",
  "sitemap",
  "_metadata",
  "featured",
  "breakthrough",
  "black-founders",
  "hispanic-latino-founders",
  "women-founders",
  "founders-you-may-know",
  "top-companies",
]);

function fetchTextViaCurl(url: string): string {
  return execFileSync("curl", ["-sS", "-L", "-A", YC_FETCH_UA, url], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Fetch HTML from a YC company URL (browser-like UA; optional curl fallback). */
export async function fetchYcCompanyHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": YC_FETCH_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (res.ok) return res.text();
  if (process.env.YC_FETCH_DISABLE_CURL === "1") {
    throw new Error(`GET ${url} → ${res.status}`);
  }
  try {
    return fetchTextViaCurl(url);
  } catch (e) {
    throw new Error(`GET ${url} → ${res.status} (fetch); curl fallback: ${e instanceof Error ? e.message : e}`);
  }
}

export function parseSlugsFromYcCompanySitemap(xml: string): string[] {
  const re = /<loc>https:\/\/www\.ycombinator\.com\/companies\/([^<]+)<\/loc>/g;
  const slugs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const slug = decodeURIComponent(m[1]!).split("?")[0]!.split("#")[0]!;
    if (!YC_COMPANY_SKIP_SITEMAP_SLUGS.has(slug) && slug.length > 1 && !slug.includes("/")) {
      slugs.push(slug);
    }
  }
  return [...new Set(slugs)];
}

export type YcCompanyPageData = {
  name: string;
  slug: string;
  batch?: string;
  status?: string;
  description?: string;
  longDescription?: string;
  website?: string;
  location?: string;
  teamSize?: number;
  sector?: string;
  tags?: string[];
  founders?: Array<{ name: string; title?: string; linkedin?: string }>;
  logoUrl?: string;
};

/** Parse a single /companies/{slug} HTML document (__NEXT_DATA__ or fallbacks). */
export function parseYcCompanyPage(html: string, slug: string): YcCompanyPageData | null {
  const data: YcCompanyPageData = { name: "", slug };

  const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nd = JSON.parse(nextDataMatch[1]!);
      const pp = nd?.props?.pageProps;
      const company = pp?.company || pp?.startup || pp;
      if (company?.name) {
        data.name = company.name;
        data.batch = company.batch || company.ycBatch || null;
        data.status = company.status || null;
        data.description = company.one_liner || company.tagline || company.short_description || null;
        data.longDescription = company.long_description || company.description || null;
        data.website = company.website || company.url || null;
        data.location = company.location || company.city || null;
        data.teamSize = company.team_size || company.num_employees || null;
        data.sector = company.industry || company.vertical || null;
        data.tags = company.tags || company.industries || [];
        data.logoUrl = company.image_url || company.small_logo_thumb_url || company.logo_url || null;

        if (company.founders && Array.isArray(company.founders)) {
          data.founders = company.founders.map((f: Record<string, unknown>) => ({
            name:
              (f.full_name as string) ||
              (f.name as string) ||
              `${(f.first_name as string) || ""} ${(f.last_name as string) || ""}`.trim(),
            title: (f.title as string) || null,
            linkedin: (f.linkedin_url as string) || (f.linkedin as string) || null,
          }));
        }
        return data;
      }
    } catch {
      /* parse failed */
    }
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
  const name = titleMatch?.[1]?.replace(/\s*[|–-]\s*Y Combinator.*$/, "").trim();
  if (!name) return null;
  data.name = name;

  const metaDesc = html.match(/<meta\s+(?:name|property)="(?:og:)?description"\s+content="([^"]+)"/);
  data.description = metaDesc?.[1]?.trim() || null;

  const batchMatch = html.match(/\b([SWF]\d{2})\b/);
  data.batch = batchMatch?.[1] || null;

  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  data.logoUrl = ogImage?.[1] || null;

  const websiteMatch = html.match(/href="(https?:\/\/(?!www\.ycombinator\.com)[^"]+)"\s*(?:target="_blank"|rel="noopener")/);
  data.website = websiteMatch?.[1] || null;

  const founderSection = html.match(/(?:Founders?|Team)[\s:]+([^<]{5,200})/i);
  if (founderSection) {
    const junk = /^(directory|founders?|team|apply|jobs?)$/i;
    data.founders = founderSection[1]!
      .split(/[,&]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2 && s.length < 60 && !junk.test(s))
      .map((n) => ({ name: n }));
  }

  return data;
}

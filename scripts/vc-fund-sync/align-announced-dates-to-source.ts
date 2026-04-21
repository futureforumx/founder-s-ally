import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

type RpcRow = {
  vc_fund_id: string;
  firm_name: string;
  fund_name: string;
  announced_date: string | null;
  close_date: string | null;
  announcement_url: string | null;
};

type DetectionMethod =
  | "article:published_time"
  | "name:article:published_time"
  | "itemprop:datePublished"
  | "time:datetime"
  | "json:datePublished"
  | "json:publishedAt"
  | "json:published_at"
  | "json:article:published_time"
  | "url:yyyy/mm/dd"
  | "url:businesswire-home"
  | "url:fortune-style"
  | "url:axios-style";

type FetchAudit = {
  status: number | null;
  finalUrl: string;
  publishedDate: string | null;
  detectionMethod: DetectionMethod | null;
  error: string | null;
};

type AuditRow = RpcRow & FetchAudit & {
  mismatch: boolean;
  action: "update" | "skip" | "review";
  reason: string;
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_KEY ||
  "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const APPLY = process.argv.includes("--apply");
const OUTPUT_PATH = path.join(process.cwd(), "reports", "fresh-capital-announced-date-audit.json");

function normalizeDate(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value) return null;
  const direct = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (direct) return direct[1];
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractUrlDate(target: string): { date: string | null; method: DetectionMethod | null } {
  try {
    const url = new URL(target);
    const ymd = url.pathname.match(/\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/);
    if (ymd) {
      return { date: `${ymd[1]}-${ymd[2]}-${ymd[3]}`, method: "url:yyyy/mm/dd" };
    }

    if (url.hostname.includes("businesswire.com")) {
      const bw = url.pathname.match(/\/news\/home\/(20\d{2})(\d{2})(\d{2})\d+/);
      if (bw) {
        return { date: `${bw[1]}-${bw[2]}-${bw[3]}`, method: "url:businesswire-home" };
      }
    }

    if (url.hostname.includes("fortune.com")) {
      const fortune = url.pathname.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
      if (fortune) {
        return { date: `${fortune[1]}-${fortune[2]}-${fortune[3]}`, method: "url:fortune-style" };
      }
    }

    if (url.hostname.includes("axios.com")) {
      const axios = url.pathname.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
      if (axios) {
        return { date: `${axios[1]}-${axios[2]}-${axios[3]}`, method: "url:axios-style" };
      }
    }
  } catch {
    return { date: null, method: null };
  }

  return { date: null, method: null };
}

function extractPublishedDate(html: string): { date: string | null; method: DetectionMethod | null } {
  const patterns: Array<[DetectionMethod, RegExp]> = [
    ["article:published_time", /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i],
    ["name:article:published_time", /<meta[^>]+name=["']article:published_time["'][^>]+content=["']([^"']+)["']/i],
    ["itemprop:datePublished", /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i],
    ["time:datetime", /<time[^>]+datetime=["']([^"']+)["']/i],
    ["json:datePublished", /"datePublished"\s*:\s*"([^"]+)"/i],
    ["json:publishedAt", /"publishedAt"\s*:\s*"([^"]+)"/i],
    ["json:published_at", /"published_at"\s*:\s*"([^"]+)"/i],
    ["json:article:published_time", /"article:published_time"\s*:\s*"([^"]+)"/i],
  ];

  for (const [method, pattern] of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const date = normalizeDate(decodeHtml(match[1]));
    if (date) return { date, method };
  }

  return { date: null, method: null };
}

async function fetchAudit(url: string): Promise<FetchAudit> {
  const urlDerived = extractUrlDate(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    const finalUrl = response.url || url;

    // Many publisher error pages include a misleading "datePublished" for the error page itself.
    if (!response.ok && urlDerived.date) {
      return {
        status: response.status,
        finalUrl,
        publishedDate: urlDerived.date,
        detectionMethod: urlDerived.method,
        error: null,
      };
    }

    const html = await response.text();
    const extracted = extractPublishedDate(html);

    return {
      status: response.status,
      finalUrl,
      publishedDate: extracted.date ?? urlDerived.date,
      detectionMethod: extracted.method ?? urlDerived.method,
      error: null,
    };
  } catch (error) {
    return {
      status: null,
      finalUrl: url,
      publishedDate: urlDerived.date,
      detectionMethod: urlDerived.method,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function diffDays(left: string, right: string): number {
  const a = Date.parse(`${left}T12:00:00Z`);
  const b = Date.parse(`${right}T12:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

function classify(row: RpcRow, fetched: FetchAudit): Pick<AuditRow, "action" | "reason"> {
  if (!fetched.publishedDate) {
    return { action: "review", reason: "No publish date detected from source page." };
  }

  if (!row.announced_date) {
    return { action: "update", reason: "Missing announced_date; source page provides one." };
  }

  if (row.announced_date === fetched.publishedDate) {
    return { action: "skip", reason: "Already aligned with source publish date." };
  }

  const delta = Math.abs(diffDays(row.announced_date, fetched.publishedDate));
  const yearGap = Math.abs(
    Number(row.announced_date.slice(0, 4)) - Number(fetched.publishedDate.slice(0, 4)),
  );

  if (yearGap >= 2) {
    return { action: "review", reason: `Large year gap (${yearGap} years); source URL may be stale or incorrect.` };
  }

  if ((fetched.status ?? 200) >= 400 && !String(fetched.detectionMethod).startsWith("url:")) {
    return { action: "review", reason: "Source returned an error page and date was not safely URL-derived." };
  }

  return { action: "update", reason: `High-confidence mismatch (${delta} day difference).` };
}

async function mapLimit<T, U>(items: T[], limit: number, fn: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const out = new Array<U>(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      out[current] = await fn(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function loadRows(): Promise<RpcRow[]> {
  const fundArgs = {
    p_limit: 120,
    p_days: 365,
    p_stage: null,
    p_sector: null,
    p_geography: null,
    p_fund_size_min: null,
    p_fund_size_max: null,
    p_firm_type: null,
  };

  const { data, error } = await supabase.rpc("get_new_vc_funds", fundArgs);
  if (error) throw new Error(`get_new_vc_funds failed: ${error.message}`);

  return (data ?? [])
    .filter((row: any) => typeof row.announcement_url === "string" && row.announcement_url.trim())
    .map(
      (row: any): RpcRow => ({
        vc_fund_id: String(row.vc_fund_id),
        firm_name: String(row.firm_name ?? ""),
        fund_name: String(row.fund_name ?? ""),
        announced_date: typeof row.announced_date === "string" ? row.announced_date : null,
        close_date: typeof row.close_date === "string" ? row.close_date : null,
        announcement_url: String(row.announcement_url),
      }),
    );
}

async function writeReport(rows: AuditRow[]) {
  const report = {
    generated_at: new Date().toISOString(),
    apply: APPLY,
    summary: {
      total: rows.length,
      detected_dates: rows.filter((row) => row.publishedDate).length,
      updates: rows.filter((row) => row.action === "update").length,
      reviews: rows.filter((row) => row.action === "review").length,
      unchanged: rows.filter((row) => row.action === "skip").length,
    },
    rows,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function applyUpdates(rows: AuditRow[]) {
  const updates = rows.filter((row) => row.action === "update" && row.publishedDate && row.announced_date !== row.publishedDate);
  for (const row of updates) {
    const { error } = await supabase
      .from("vc_funds")
      .update({ announced_date: row.publishedDate })
      .eq("id", row.vc_fund_id);

    if (error) {
      throw new Error(`Failed to update ${row.firm_name} / ${row.fund_name}: ${error.message}`);
    }
  }

  return updates.length;
}

async function main() {
  const rows = await loadRows();
  const audited = await mapLimit(rows, 6, async (row) => {
    const fetched = await fetchAudit(row.announcement_url!);
    const classification = classify(row, fetched);
    return {
      ...row,
      ...fetched,
      mismatch: Boolean(fetched.publishedDate && row.announced_date && fetched.publishedDate !== row.announced_date),
      ...classification,
    } satisfies AuditRow;
  });

  await writeReport(audited);
  const applied = APPLY ? await applyUpdates(audited) : 0;

  const summary = {
    total: audited.length,
    detected_dates: audited.filter((row) => row.publishedDate).length,
    updates_ready: audited.filter((row) => row.action === "update" && row.announced_date !== row.publishedDate).length,
    review_needed: audited.filter((row) => row.action === "review").length,
    applied,
    report_path: OUTPUT_PATH,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

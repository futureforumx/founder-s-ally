import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles.js";

loadEnvFiles();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ""
).trim();
const SUPABASE_PUBLISHABLE_KEY = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();
if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set");

const TARGET = (process.env.HEADSHOT_TARGET ?? "all").toLowerCase(); // founders | operators | all
const DRY_RUN = process.env.DRY_RUN !== "false";
const ALLOW_REFRESH = process.env.ALLOW_REFRESH === "true";
const MAX_ROWS = Math.max(0, Number(process.env.MAX_ROWS ?? "0"));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? "4"));
const NAV_TIMEOUT_MS = Math.max(3000, Number(process.env.NAV_TIMEOUT_MS ?? "18000"));
const HEADLESS = process.env.HEADLESS !== "false";

const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_KEY) throw new Error("Neither service-role nor publishable Supabase key is set");
if (!SUPABASE_SERVICE_ROLE_KEY && !DRY_RUN) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for live updates (set DRY_RUN=true to test reads)");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

type FounderRow = {
  id: string;
  full_name: string;
  linkedin_url: string | null;
  x_url: string | null;
  avatar_url: string | null;
  startup_id: string | null;
};

type OperatorRow = {
  id: string;
  full_name: string;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
};

type StartupWebsite = { id: string; company_url: string | null };
type ContactKind = "founder" | "operator";

type ContactWorkItem = {
  kind: ContactKind;
  id: string;
  fullName: string;
  currentAvatarUrl: string | null;
  candidateUrls: string[];
};

const BAD_HOST_SNIPPETS = ["gravatar.com/avatar/", "unavatar.io", "favicon", "logo"];
const BAD_PATH_SNIPPETS = ["default_profile", "default-avatar", "default_avatar", "/logo", "/icon", "/banner", "/cover"];
const GOOD_PATH_SNIPPETS = ["profile", "avatar", "headshot", "portrait", "profile_images", "profile-displayphoto"];

function normalizeUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).toString();
    return new URL(`https://${value}`).toString();
  } catch {
    return null;
  }
}

function pickFirst(...values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function isLikelyHeadshot(url: string): boolean {
  const lower = url.toLowerCase();
  if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(lower) && !lower.includes("/image/") && !lower.includes("profile_images")) {
    return false;
  }
  if (BAD_HOST_SNIPPETS.some((s) => lower.includes(s))) return false;
  if (BAD_PATH_SNIPPETS.some((s) => lower.includes(s))) return false;
  if (GOOD_PATH_SNIPPETS.some((s) => lower.includes(s))) return true;
  return !lower.includes("logo");
}

async function fetchFounderRows(): Promise<FounderRow[]> {
  const { data, error } = await supabase
    .from("startup_founders")
    .select("id,full_name,linkedin_url,x_url,avatar_url,startup_id")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`startup_founders fetch failed: ${error.message}`);
  return (data ?? []) as FounderRow[];
}

async function fetchOperatorRows(): Promise<OperatorRow[]> {
  const { data, error } = await supabase
    .from("operator_profiles")
    .select("id,full_name,linkedin_url,x_url,website_url,avatar_url")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`operator_profiles fetch failed: ${error.message}`);
  return (data ?? []) as OperatorRow[];
}

async function fetchStartupWebsiteMap(startupIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(startupIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (!uniqueIds.length) return map;

  const chunkSize = 500;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const ids = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("startups")
      .select("id,company_url")
      .in("id", ids);
    if (error) throw new Error(`startups website lookup failed: ${error.message}`);
    for (const row of (data ?? []) as StartupWebsite[]) {
      const url = normalizeUrl(row.company_url);
      if (url) map.set(row.id, url);
    }
  }
  return map;
}

async function extractHeadshotFromPage(page: Page, sourceUrl: string): Promise<string | null> {
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  } catch {
    return null;
  }

  let urls: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
      urls = await page.evaluate(() => {
        const results: string[] = [];
        const push = (v: string | null | undefined) => {
          if (!v) return;
          const s = v.trim();
          if (!s) return;
          results.push(s);
        };

        const metaSelectors = [
          'meta[property="og:image"]',
          'meta[property="og:image:secure_url"]',
          'meta[name="twitter:image"]',
          'meta[name="twitter:image:src"]',
          'link[rel="image_src"]',
        ];
        for (const selector of metaSelectors) {
          const el = document.querySelector(selector);
          if (!el) continue;
          const value = el.getAttribute("content") || el.getAttribute("href");
          push(value);
        }

        for (const img of Array.from(document.querySelectorAll("img"))) {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
          push(src);
        }
        return results;
      });
      break;
    } catch {
      if (attempt === 1) return null;
      await page.waitForTimeout(500);
    }
  }

  for (const raw of urls) {
    const normalized = normalizeUrl(raw);
    if (!normalized) continue;
    if (!isLikelyHeadshot(normalized)) continue;
    return normalized;
  }
  return null;
}

async function updateAvatar(kind: ContactKind, id: string, avatarUrl: string): Promise<void> {
  if (DRY_RUN) return;
  if (kind === "founder") {
    const { error } = await supabase
      .from("startup_founders")
      .update({ avatar_url: avatarUrl })
      .eq("id", id);
    if (error) throw new Error(`startup_founders update failed: ${error.message}`);
    return;
  }
  const { error } = await supabase
    .from("operator_profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", id);
  if (error) throw new Error(`operator_profiles update failed: ${error.message}`);
}

async function buildWorkItems(): Promise<ContactWorkItem[]> {
  const items: ContactWorkItem[] = [];

  if (TARGET === "all" || TARGET === "founders") {
    const founders = await fetchFounderRows();
    const founderScope = MAX_ROWS > 0 ? founders.slice(0, MAX_ROWS) : founders;
    const startupMap = await fetchStartupWebsiteMap(founderScope.map((r) => r.startup_id ?? "").filter(Boolean));
    for (const row of founderScope) {
      if (!ALLOW_REFRESH && row.avatar_url) continue;
      const companyUrl = row.startup_id ? startupMap.get(row.startup_id) ?? null : null;
      const candidateUrls = pickFirst(row.linkedin_url, row.x_url, companyUrl);
      if (!candidateUrls.length) continue;
      items.push({
        kind: "founder",
        id: row.id,
        fullName: row.full_name,
        currentAvatarUrl: row.avatar_url,
        candidateUrls,
      });
    }
  }

  if (TARGET === "all" || TARGET === "operators") {
    const operators = await fetchOperatorRows();
    const operatorScope = MAX_ROWS > 0 ? operators.slice(0, MAX_ROWS) : operators;
    for (const row of operatorScope) {
      if (!ALLOW_REFRESH && row.avatar_url) continue;
      const candidateUrls = pickFirst(row.linkedin_url, row.x_url, row.website_url);
      if (!candidateUrls.length) continue;
      items.push({
        kind: "operator",
        id: row.id,
        fullName: row.full_name,
        currentAvatarUrl: row.avatar_url,
        candidateUrls,
      });
    }
  }

  return items;
}

async function main() {
  console.log("=".repeat(72));
  console.log("Playwright founder/operator headshot updater");
  console.log(`target=${TARGET} dryRun=${DRY_RUN} allowRefresh=${ALLOW_REFRESH} maxRows=${MAX_ROWS || "all"} concurrency=${CONCURRENCY}`);
  console.log("=".repeat(72));

  const workItems = await buildWorkItems();
  console.log(`Eligible contacts: ${workItems.length}`);
  if (!workItems.length) return;

  const browser: Browser = await chromium.launch({ headless: HEADLESS });
  const contexts = await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, workItems.length) }, () =>
      browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 900 },
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  let cursor = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  async function worker(page: Page) {
    for (;;) {
      const index = cursor++;
      if (index >= workItems.length) return;
      const item = workItems[index];

      let found: string | null = null;
      let sourceUrl = "";
      for (const url of item.candidateUrls) {
        const imageUrl = await extractHeadshotFromPage(page, url);
        if (imageUrl) {
          found = imageUrl;
          sourceUrl = url;
          break;
        }
      }

      if (!found) {
        skipped += 1;
        console.log(`SKIP [${item.kind}] ${item.fullName} — no headshot found`);
        continue;
      }

      try {
        await updateAvatar(item.kind, item.id, found);
        updated += 1;
        const mode = DRY_RUN ? "DRY" : "LIVE";
        console.log(`${mode} UPDATE [${item.kind}] ${item.fullName} <= ${found} (from ${sourceUrl})`);
      } catch (error) {
        failed += 1;
        console.log(`FAIL [${item.kind}] ${item.fullName} — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await Promise.all(pages.map((p) => worker(p)));
  await Promise.all(pages.map((p) => p.close()));
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();

  console.log("-".repeat(72));
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed : ${failed}`);
  console.log("=".repeat(72));
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});

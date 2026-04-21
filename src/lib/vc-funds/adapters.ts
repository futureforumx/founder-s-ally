import { load } from "cheerio";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPITAL_EVENT_KEYWORDS, CAPITAL_EVENT_SCAN_PATHS } from "./config";
import { contentHash, extractFundSequenceNumber, normalizeFirmName, normalizeFundName } from "./normalize";
import type { ExtractedFundAnnouncement, FirmRecordLookup, FundSyncRunOptions, VcFundSourceAdapter } from "./types";
import { fetchAlleywatchFunding, fetchTechcrunchVenture } from "../../../scripts/funding-ingest/sources";
import { isLikelyVcFundVehicleHeadline, stripHtml } from "../../../scripts/funding-ingest/extract";

type LinkCandidate = {
  url: string;
  headline: string;
  excerpt: string | null;
  publishedAt: string | null;
};

type NewsRawArticle = {
  title: string;
  url: string;
  source_name: string;
  published_at: string;
  content_snippet: string;
  tags: string[];
  og_image_url: string | null;
};

type FeedListing = {
  articleUrl: string;
  title: string;
  publishedAt: Date | null;
  summary?: string | null;
  sourceKey: string;
  sourceType?: ExtractedFundAnnouncement["sourceType"];
  metadata?: Record<string, unknown> | null;
};

type ProviderKey = "signal_nfx" | "cb_insights" | "tracxn";

type AuthenticatedProviderEvidenceArgs = {
  firmName: string;
  firmWebsiteUrl?: string | null;
  signalNfxUrl?: string | null;
  cbInsightsUrl?: string | null;
  tracxnUrl?: string | null;
  fundLabel?: string | null;
  announcedDate?: string | null;
};

type ProviderSession = {
  browser: any;
  context: any;
  page: any;
};

const providerSessions = new Map<ProviderKey, Promise<ProviderSession | null>>();

function normalizeUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function envNumber(name: string): number | null {
  const value = (process.env[name] || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ensureDataDir(): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function authFilePath(provider: ProviderKey): string {
  if (provider === "signal_nfx") return envValue("SIGNAL_AUTH_FILE") || join(process.cwd(), "data", "signal-nfx-auth.json");
  if (provider === "cb_insights") return envValue("CBI_AUTH_FILE") || join(process.cwd(), "data", "cbi-auth.json");
  return envValue("TRACXN_AUTH_FILE") || join(process.cwd(), "data", "tracxn-auth.json");
}

function bodyTextToAnnouncement(args: {
  provider: ProviderKey;
  profileUrl: string;
  firmName: string;
  firmWebsiteUrl?: string | null;
  fundLabel?: string | null;
  announcedDate?: string | null;
  bodyText: string;
  description?: string | null;
  fundSizeText?: string | null;
  stageFocus?: string[];
  sectorFocus?: string[];
  geographyFocus?: string[];
}): ExtractedFundAnnouncement | null {
  const providerName =
    args.provider === "signal_nfx" ? "Signal NFX" :
    args.provider === "cb_insights" ? "CB Insights" :
    "Tracxn";
  const rawText = [args.description, args.fundSizeText, args.bodyText].filter(Boolean).join("\n\n").trim();
  const fundSize = parseUsdAmountText(args.fundSizeText || rawText);
  const fundLabel = args.fundLabel?.trim() || `${args.firmName} Fund`;
  if (!providerBodySupportsFundLabel(args.firmName, args.fundLabel, rawText)) return null;
  if (!rawText && fundSize == null) return null;

  return {
    externalId: contentHash([args.provider, args.firmName, args.profileUrl, fundLabel]),
    firmName: args.firmName,
    firmWebsiteUrl: args.firmWebsiteUrl || null,
    fundName: fundLabel,
    fundLabel,
    fundType: "venture",
    fundSize,
    currency: "USD",
    vintageYear: extractVintageYear(rawText),
    announcedDate: args.announcedDate || null,
    closeDate: null,
    sourceUrl: args.profileUrl,
    sourceTitle: `${args.firmName} profile on ${providerName}`,
    sourcePublisher: providerName,
    sourceType: "structured_provider",
    rawText,
    confidence: 0.78,
    stageFocus: args.stageFocus,
    sectorFocus: args.sectorFocus,
    geographyFocus: args.geographyFocus,
    metadata: {
      detection_mode: "authenticated_profile_verification",
      provider_key: args.provider,
      extracted_sequence_number: extractFundSequenceNumber(fundLabel),
      normalized_fund_label: normalizeFundName(fundLabel),
      profile_verification: true,
    },
  };
}

function profileLabelValue(bodyText: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = bodyText.match(new RegExp(`${label}\\s*:?\\s*([^\\n]{1,160})`, "i"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function providerBodySupportsFundLabel(firmName: string, fundLabel: string | null | undefined, bodyText: string): boolean {
  const normalizedLabel = normalizeFundName(fundLabel || "");
  if (!normalizedLabel) return false;
  const normalizedFirm = normalizeFirmName(firmName);
  if (normalizedFirm && normalizedLabel.includes(normalizedFirm)) return true;
  const escaped = (fundLabel || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escaped && new RegExp(escaped, "i").test(bodyText)) return true;
  return false;
}

async function navigateAndExtractProfileText(
  page: any,
  profileUrl: string,
  expectedText?: string | null,
  timeout = 30000,
): Promise<{
  profileUrl: string;
  body: string;
  description: string | null;
  fundSizeText: string | null;
} | null> {
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout }).catch(() => null);
  if (expectedText) {
    await page.waitForFunction(
      ({ expected }) => {
        const text = document.body.innerText || "";
        return text.toLowerCase().includes(expected.toLowerCase()) && !/\bloading\.\.\.\b/i.test(text);
      },
      { expected: expectedText },
      { timeout: 10000 },
    ).catch(() => null);
  } else {
    await page.waitForTimeout(2500);
  }
  if (page.url().includes("/login")) return null;

  const data = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const description =
      document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
      document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ||
      null;
    return {
      body,
      description,
      profileUrl: window.location.href,
    };
  });
  if (!data.body && !data.description) return null;

  return {
    profileUrl: data.profileUrl,
    body: data.body,
    description: data.description,
    fundSizeText: profileLabelValue(data.body, [
      "Current Fund Size",
      "Fund Size",
      "AUM",
      "Assets Under Management",
      "Sweet Spot",
      "Investment Range",
    ]),
  };
}

async function getPlaywrightSession(provider: ProviderKey): Promise<ProviderSession | null> {
  if (providerSessions.has(provider)) return providerSessions.get(provider)!;
  const promise = createPlaywrightSession(provider).catch(() => null);
  providerSessions.set(provider, promise);
  return promise;
}

async function createPlaywrightSession(provider: ProviderKey): Promise<ProviderSession | null> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  const filePath = authFilePath(provider);
  let context: any;
  if (existsSync(filePath)) {
    context = await browser.newContext({ storageState: JSON.parse(readFileSync(filePath, "utf8")) });
  } else {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
  }
  const page = await context.newPage();

  if (provider === "signal_nfx") {
    await page.goto("https://signal.nfx.com/investors", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2000);
    if (page.url().includes("/login")) {
      const email = envValue("SIGNAL_NFX_EMAIL", "SIGNAL_NFX_EMAIL_2");
      const password = envValue("SIGNAL_NFX_PASSWORD", "SIGNAL_NFX_PASSWORD_2");
      if (!email || !password) return null;
      await page.goto("https://signal.nfx.com/login", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      if (!await emailInput.isVisible().catch(() => false)) return null;
      await emailInput.fill(email);
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click().catch(() => null);
        await page.waitForTimeout(1200);
      }
      const passwordInput = page.locator('input[type="password"]').first();
      if (!await passwordInput.isVisible().catch(() => false)) return null;
      await passwordInput.fill(password);
      const loginButton = page.locator('button:has-text("Log In"), button:has-text("Sign In"), button[type="submit"]').first();
      await loginButton.click().catch(() => null);
      await page.waitForURL((url: URL) => !url.toString().includes("/login"), { timeout: 20000 }).catch(() => null);
      if (page.url().includes("/login")) return null;
      ensureDataDir();
      await context.storageState({ path: filePath });
    }
  }

  if (provider === "cb_insights") {
    await page.goto("https://app.cbinsights.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2000);
    if (page.url().includes("/login")) {
      const email = envValue("CBI_EMAIL");
      const password = envValue("CBI_PASSWORD");
      if (!email || !password) return null;
      const emailInput = page.locator('input[name="email"], input[type="email"], input[name="username"]').first();
      if (!await emailInput.isVisible().catch(() => false)) return null;
      await emailInput.fill(email);
      const continueButton = page.locator('button:has-text("Continue"), button[type="submit"]').first();
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click().catch(() => null);
        await page.waitForTimeout(1000);
      }
      const passwordInput = page.locator('input[type="password"]').first();
      if (!await passwordInput.isVisible().catch(() => false)) return null;
      await passwordInput.fill(password);
      const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), button[type="submit"]').first();
      await loginButton.click().catch(() => null);
      await page.waitForURL((url: URL) => !url.pathname.includes("/login"), { timeout: 30000 }).catch(() => null);
      if (page.url().includes("/login")) return null;
      ensureDataDir();
      await context.storageState({ path: filePath });
    }
  }

  if (provider === "tracxn") {
    await page.goto("https://platform.tracxn.com/a/home", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2000);
    if (page.url().includes("/login")) {
      const email = envValue("TRACXN_EMAIL");
      const password = envValue("TRACXN_PASSWORD");
      if (!email || !password) return null;
      await page.goto("https://platform.tracxn.com/a/login", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      if (!await emailInput.isVisible().catch(() => false)) return null;
      await emailInput.fill(email);
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click().catch(() => null);
        await page.waitForTimeout(1200);
      }
      const passwordInput = page.locator('input[type="password"]').first();
      if (!await passwordInput.isVisible().catch(() => false)) return null;
      await passwordInput.fill(password);
      const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), button[type="submit"]').first();
      await loginButton.click().catch(() => null);
      await page.waitForURL((url: URL) => !url.pathname.includes("/login"), { timeout: 30000 }).catch(() => null);
      if (page.url().includes("/login")) return null;
      ensureDataDir();
      await context.storageState({ path: filePath });
    }
  }

  return { browser, context, page };
}

async function fetchSignalNfxProfileEvidence(args: AuthenticatedProviderEvidenceArgs): Promise<ExtractedFundAnnouncement | null> {
  const session = await getPlaywrightSession("signal_nfx");
  if (!session) return null;
  const { page } = session;
  const slug = normalizeFirmName(args.firmName).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const data = await navigateAndExtractProfileText(
    page,
    args.signalNfxUrl || `https://signal.nfx.com/firms/${slug}`,
    args.firmName,
    45000,
  );
  if (!data) return null;
  return bodyTextToAnnouncement({
    provider: "signal_nfx",
    profileUrl: data.profileUrl,
    firmName: args.firmName,
    firmWebsiteUrl: args.firmWebsiteUrl,
    fundLabel: args.fundLabel,
    announcedDate: args.announcedDate,
    bodyText: data.body,
    description: data.description,
    fundSizeText: data.fundSizeText,
  });
}

async function fetchCbInsightsProfileEvidence(args: AuthenticatedProviderEvidenceArgs): Promise<ExtractedFundAnnouncement | null> {
  const session = await getPlaywrightSession("cb_insights");
  if (!session) return null;
  const { page } = session;
  if (!args.cbInsightsUrl) return null;
  const data = await navigateAndExtractProfileText(page, args.cbInsightsUrl, args.firmName, 45000);
  if (!data) return null;
  return bodyTextToAnnouncement({
    provider: "cb_insights",
    profileUrl: data.profileUrl,
    firmName: args.firmName,
    firmWebsiteUrl: args.firmWebsiteUrl,
    fundLabel: args.fundLabel,
    announcedDate: args.announcedDate,
    bodyText: data.body,
    description: data.description,
    fundSizeText: data.fundSizeText,
  });
}

async function fetchTracxnProfileEvidence(args: AuthenticatedProviderEvidenceArgs): Promise<ExtractedFundAnnouncement | null> {
  const session = await getPlaywrightSession("tracxn");
  if (!session) return null;
  const { page } = session;
  if (!args.tracxnUrl) return null;
  const data = await navigateAndExtractProfileText(page, args.tracxnUrl, args.firmName, 45000);
  if (!data) return null;
  return bodyTextToAnnouncement({
    provider: "tracxn",
    profileUrl: data.profileUrl,
    firmName: args.firmName,
    firmWebsiteUrl: args.firmWebsiteUrl,
    fundLabel: args.fundLabel,
    announcedDate: args.announcedDate,
    bodyText: data.body,
    description: data.description,
    fundSizeText: data.fundSizeText,
  });
}

export async function fetchAuthenticatedVerificationEvidence(
  args: AuthenticatedProviderEvidenceArgs,
): Promise<ExtractedFundAnnouncement[]> {
  const jobs: Array<Promise<ExtractedFundAnnouncement | null>> = [];
  if (args.signalNfxUrl) jobs.push(fetchSignalNfxProfileEvidence(args).catch(() => null));
  if (args.cbInsightsUrl) jobs.push(fetchCbInsightsProfileEvidence(args).catch(() => null));
  if (args.tracxnUrl) jobs.push(fetchTracxnProfileEvidence(args).catch(() => null));
  const results = await Promise.all(jobs);
  return results.filter((value): value is ExtractedFundAnnouncement => Boolean(value));
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    let normalized = input.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function tokenizeFirmName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s&.-]/g, " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
}

function normUrl(href: string): string {
  try {
    const url = new URL(href);
    url.hash = "";
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    url.pathname = path;
    return url.href.toLowerCase();
  } catch {
    return href.trim().toLowerCase();
  }
}

function parsePublishedAt($: ReturnType<typeof load>): string | null {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="publish_date"]',
    'meta[name="pubdate"]',
    "time[datetime]",
  ];
  for (const selector of selectors) {
    const value =
      $(selector).attr("content") ||
      $(selector).attr("datetime") ||
      $(selector).first().text();
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function extractUsdAmount(text: string): number | null {
  const match = text.match(/\$?\s?(\d+(?:\.\d+)?)\s?(million|billion|m|b)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit.startsWith("b") ? 1_000_000_000 : 1_000_000;
  return Math.round(value * multiplier);
}

function extractVintageYear(text: string): number | null {
  const match = text.match(/\b(20\d{2}|19\d{2}) vintage\b|\bvintage (\d{4})\b|\b(20\d{2}|19\d{2}) fund\b/i);
  if (!match) return null;
  const raw = match[1] || match[2] || match[3];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseMonthYearToIsoDate(text: string): string | null {
  const match = text.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year) || year < 1900) return null;
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).toISOString();
}

function parseFlexibleUsDateToIsoDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  const monthYear = parseMonthYearToIsoDate(normalized);
  if (monthYear) return monthYear;

  const mdy = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (
      Number.isFinite(month) &&
      month >= 1 &&
      month <= 12 &&
      Number.isFinite(day) &&
      day >= 1 &&
      day <= 31 &&
      Number.isFinite(year) &&
      year >= 1900
    ) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
    }
  }

  const direct = new Date(normalized);
  return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
}

function parseUsdAmountText(text: string | null | undefined): number | null {
  if (!text) return null;
  const raw = text.trim();
  if (!raw || raw.includes("/")) return null;
  const normalized = raw.replace(/[,\s]/g, "");
  const hasCurrencyMarker = /\$|usd|us\$|million|billion|thousand|[mbk]\b/i.test(raw);
  const match = normalized.match(/\$?(\d+(?:\.\d+)?)([MBK]|B)?/i);
  if (!match) return null;
  if (!hasCurrencyMarker && !match[2]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = (match[2] || "").toUpperCase();
  if (!suffix && /billion/i.test(raw)) return Math.round(value * 1_000_000_000);
  if (!suffix && /million/i.test(raw)) return Math.round(value * 1_000_000);
  if (!suffix && /thousand/i.test(raw)) return Math.round(value * 1_000);
  if (suffix === "B") return Math.round(value * 1_000_000_000);
  if (suffix === "M") return Math.round(value * 1_000_000);
  if (suffix === "K") return Math.round(value * 1_000);
  return Math.round(value);
}

function sourceLimit(options: FundSyncRunOptions, sourceKey: string, fallback: number): number {
  const optionValue = options.sourceFetchLimits?.[sourceKey];
  if (typeof optionValue === "number" && Number.isFinite(optionValue) && optionValue > 0) {
    return Math.round(optionValue);
  }
  const envName = `VC_FUND_${sourceKey.replace(/[^A-Z0-9]+/gi, "_").toUpperCase()}_MAX`;
  return envNumber(envName) ?? fallback;
}

function inferEventTypeGuess(text: string): ExtractedFundAnnouncement["metadata"] {
  const lowered = text.toLowerCase();
  if (/\bfinal close\b|\bclosed\b/.test(lowered)) return { event_type_guess: "fund_closed" };
  if (/\btarget\b/.test(lowered)) return { event_type_guess: "fund_target_updated" };
  if (/\bvehicle\b|\bopportunity fund\b|\bgrowth fund\b|\bseed fund\b|\brolling fund\b/.test(lowered)) return { event_type_guess: "new_vehicle_detected" };
  return { event_type_guess: "new_fund_announced" };
}

function articleLooksRelevant(text: string): boolean {
  return CAPITAL_EVENT_KEYWORDS.positiveFund.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativePortfolio.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativeHiring.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativeProduct.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativeCommentary.test(text);
}

function isPressReleasePublisher(publisher: string): boolean {
  return /\b(prnewswire|business wire|globenewswire|accesswire)\b/i.test(publisher);
}

function buildFundLabel(firm: FirmRecordLookup | { firm_name: string }, headline: string, body: string): string | null {
  const combined = `${headline} ${body}`;
  const explicit = combined.match(/\b([A-Z][A-Za-z0-9&'’\- ]{0,80}(?:Fund|Vehicle)(?:\s+[IVX0-9]+)?)\b/);
  if (explicit?.[1]) return explicit[1].trim();
  const seq = combined.match(/\bFund\s+([IVX0-9]+)\b/i);
  if (seq?.[1]) return `${firm.firm_name} Fund ${seq[1]}`;
  if (/\bopportunity fund\b/i.test(combined)) return `${firm.firm_name} Opportunity Fund`;
  if (/\bgrowth fund\b/i.test(combined)) return `${firm.firm_name} Growth Fund`;
  if (/\bseed fund\b/i.test(combined)) return `${firm.firm_name} Seed Fund`;
  return null;
}

function inferFirmNameFromBlob(title: string, body: string): string | null {
  const blob = `${title} ${body}`;
  const patterns = [
    /\b([A-Z][A-Za-z0-9&'’.\- ]{1,80}?)\s+(?:announces|launches|unveils|closes|closed|raises)\b/,
    /\b([A-Z][A-Za-z0-9&'’.\- ]{1,80}?)['’]s\s+(?:new|latest|debut|inaugural)\s+fund\b/,
    /\b([A-Z][A-Za-z0-9&'’.\- ]{1,80}?)\s+(?:Fund|Capital|Ventures|Partners)\b/,
  ];
  for (const pattern of patterns) {
    const match = blob.match(pattern);
    const value = match?.[1]?.trim();
    if (value && value.length >= 3) return value.replace(/\s+$/, "");
  }
  return null;
}

function sourcePublisherLabel(sourceKey: string): string {
  switch (sourceKey) {
    case "TECHCRUNCH_VENTURE":
    case "TECHCRUNCH_FUNDING_TAG":
      return "TechCrunch";
    case "ALLEYWATCH_FUNDING":
      return "AlleyWatch";
    case "GEEKWIRE_FUNDINGS":
      return "GeekWire";
    case "PRNEWSWIRE_VENTURE_CAPITAL":
      return "PR Newswire";
    case "VCSHEET_FUNDS":
      return "VC Sheet";
    case "SHAI_GOLDMAN_NEW_FUNDS_SHEET":
      return "Shai Goldman New Funds Sheet";
    default:
      return sourceKey;
  }
}

function inferStageFocus(text: string): string[] {
  const mappings = [
    ["pre-seed", "Pre-Seed"],
    ["seed", "Seed"],
    ["series a", "Series A"],
    ["series b", "Series B"],
    ["growth", "Growth"],
    ["early stage", "Early Stage"],
  ] as const;
  return mappings
    .filter(([needle]) => new RegExp(`\\b${needle.replace(/\s+/g, "\\s+")}\\b`, "i").test(text))
    .map(([, label]) => label);
}

function inferSectorFocus(text: string): string[] {
  const mappings = [
    ["ai", "AI"],
    ["artificial intelligence", "AI"],
    ["fintech", "Fintech"],
    ["climate", "Climate"],
    ["health", "Health"],
    ["biotech", "Biotech"],
    ["enterprise", "Enterprise"],
    ["developer", "Devtools"],
    ["devtools", "Devtools"],
    ["consumer", "Consumer"],
    ["crypto", "Crypto"],
    ["cyber", "Cybersecurity"],
    ["defense", "Defense"],
    ["deeptech", "Deeptech"],
  ] as const;
  return Array.from(new Set(
    mappings
      .filter(([needle]) => new RegExp(`\\b${needle.replace(/\s+/g, "\\s+")}\\b`, "i").test(text))
      .map(([, label]) => label),
  ));
}

function inferGeographyFocus(text: string): string[] {
  const mappings = [
    ["united states", "United States"],
    ["u.s.", "United States"],
    ["usa", "United States"],
    ["north america", "North America"],
    ["europe", "Europe"],
    ["latin america", "Latin America"],
    ["latam", "Latin America"],
    ["asia", "Asia"],
    ["apac", "Asia-Pacific"],
    ["middle east", "Middle East"],
    ["africa", "Africa"],
    ["canada", "Canada"],
    ["india", "India"],
  ] as const;
  return Array.from(new Set(
    mappings
      .filter(([needle]) => new RegExp(`\\b${needle.replace(/\./g, "\\.").replace(/\s+/g, "\\s+")}\\b`, "i").test(text))
      .map(([, label]) => label),
  ));
}

function cleanStructuredCellText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function splitStructuredList(value: string | null | undefined): string[] {
  const normalized = cleanStructuredCellText(value);
  if (!normalized) return [];
  return normalized
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugish(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFundSequenceLabel(value: string | null | undefined): string | null {
  const normalized = cleanStructuredCellText(value)?.replace(/^fund\s+/i, "") || null;
  if (!normalized) return null;
  if (/^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|\d+)$/i.test(normalized)) return normalized.toUpperCase();
  return normalized;
}

function deriveSheetFirmAndFund(rawName: string, sequenceValue: string | null | undefined): { firmName: string; fundLabel: string } {
  const name = cleanStructuredCellText(rawName) || rawName.trim();
  const sequence = normalizeFundSequenceLabel(sequenceValue);

  if (/\bfund\b/i.test(name)) {
    const fundLabel = sequence && !new RegExp(`\\b${sequence}\\b$`, "i").test(name)
      ? `${name} ${sequence}`
      : name;
    return { firmName: name, fundLabel };
  }

  const fundLabel = sequence ? `${name} Fund ${sequence}` : `${name} Fund`;
  return { firmName: name, fundLabel };
}

function splitTsvRows(tsv: string): string[][] {
  return tsv
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
}

function metaContent($: ReturnType<typeof load>, property: string): string | null {
  return (
    $(`meta[property="${property}"]`).attr("content") ||
    $(`meta[name="${property}"]`).attr("content") ||
    null
  );
}

function sectionValue(sectionText: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sectionText.match(new RegExp(`${escaped}:\\s*([^\\n]+)`, "i"));
  return cleanStructuredCellText(match?.[1] || null);
}

function parseMonthYearOrDateToIso(text: string | null | undefined): string | null {
  if (!text) return null;
  const monthYear = parseMonthYearToIsoDate(text);
  if (monthYear) return monthYear;
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  return null;
}

function extractRecentFundDate(text: string): string | null {
  const patterns = [
    /\b(?:announced|launched|closed|raised|unveiled)\b[^.]{0,80}\b(?:in|on)\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|[A-Z][a-z]+\s+\d{4}|\d{1,2}\/\d{4})/i,
    /\b([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|[A-Z][a-z]+\s+\d{4}|\d{1,2}\/\d{4})\b[^.]{0,80}\b(?:fund|vehicle)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const iso = parseMonthYearOrDateToIso(match?.[1] || null);
    if (iso) return iso;
  }
  return null;
}

function extractRecentFundLabel(text: string, firmName: string): string {
  const explicit = text.match(/\b([A-Z][A-Za-z0-9&'’\- ]{0,90}(?:Fund|Vehicle)(?:\s+[IVX0-9]+)?)\b/);
  if (explicit?.[1] && fundLabelContainsFirmName(firmName, explicit[1])) return explicit[1].trim();
  const sequence = text.match(/\bFund\s+([IVX0-9]+)\b/i);
  if (sequence?.[1]) return `${firmName} Fund ${sequence[1]}`;
  return `${firmName} Fund`;
}

function isPlausibleFundLabel(label: string | null | undefined, firmName: string): boolean {
  if (!label) return false;
  const normalized = normalizeFundName(label);
  const normalizedFirm = normalizeFirmName(firmName);
  if (!normalized || !normalizedFirm) return false;
  if (label.length > 90) return false;
  if (/^(the|lps? include|everything startup|fundthe)\b/i.test(label.trim())) return false;
  if (!/\bfund\b|\bvehicle\b/i.test(label)) return false;
  return normalized.includes(normalizedFirm) || /fund\s+[ivx0-9]+$/i.test(label.trim());
}

// enrichEverythingStartupsAnnouncement removed — everythingstartups no longer used as a source.

function fundLabelContainsFirmName(firmName: string, fundLabel: string | null | undefined): boolean {
  if (!fundLabel) return false;
  const firmTokens = normalizeFirmName(firmName).split(" ").filter((token) => token.length >= 3);
  const label = normalizeFundName(fundLabel);
  return firmTokens.some((token) => label.includes(token));
}

function isFirmWebsiteHost(url: string | null | undefined, firms: FirmRecordLookup[]): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;
  return firms.some((firm) => {
    const firmDomain = extractDomain(firm.website_url ?? null);
    return Boolean(firmDomain && (firmDomain === domain || domain.endsWith(`.${firmDomain}`)));
  });
}

function parseSourceFeedArticle(
  articleUrl: string,
  articleHtml: string,
  fallback: FeedListing,
  firms: FirmRecordLookup[],
): ExtractedFundAnnouncement | null {
  const $ = load(articleHtml);
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    fallback.title ||
    "Untitled capital event";
  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    $("article p").slice(0, 4).text().replace(/\s+/g, " ").trim() ||
    fallback.summary ||
    "";
  const bodyHtml = $("article").html() || $("body").html() || "";
  const body = stripHtml(bodyHtml).slice(0, 7000);
  const blob = `${title} ${description} ${body}`;
  if (!articleLooksRelevant(blob)) return null;
  if (!isLikelyVcFundVehicleHeadline(title, body) && !/\bfund\b|\bfinal close\b|\bnew vehicle\b/i.test(blob)) return null;

  const publishedAt = parsePublishedAt($) || fallback.publishedAt?.toISOString() || null;
  const publisher = sourcePublisherLabel(fallback.sourceKey);
  const firmName = inferFirmNameFromBlob(title, blob);
  if (!firmName) return null;
  if (isFirmWebsiteHost(articleUrl, firms)) return null;

  const pseudoFirm = { firm_name: firmName, website_url: null };
  let fundLabel = buildFundLabel(pseudoFirm, title, blob);
  if (!fundLabelContainsFirmName(firmName, fundLabel)) {
    fundLabel = `${firmName} Fund`;
  }

  return {
    externalId: contentHash([normalizeFirmName(firmName), articleUrl, title]),
    firmName,
    firmWebsiteUrl: null,
    fundName: fundLabel,
    fundLabel,
    fundType: null,
    fundSize: extractUsdAmount(blob),
    currency: "USD",
    vintageYear: extractVintageYear(blob),
    announcedDate: publishedAt ? publishedAt.slice(0, 10) : null,
    closeDate: /\bfinal close|closed\b/i.test(blob) ? (publishedAt ? publishedAt.slice(0, 10) : null) : null,
    sourceUrl: articleUrl,
    sourceTitle: title,
    sourcePublisher: publisher,
    sourceType: "news_article",
    rawText: `${description}\n\n${body}`.trim(),
    confidence: 0.6,
    metadata: {
      ...inferEventTypeGuess(blob),
      detection_mode: "source_feed_listing",
      source_feed_key: fallback.sourceKey,
      extracted_sequence_number: extractFundSequenceNumber(fundLabel || title),
      normalized_fund_label: fundLabel ? normalizeFundName(fundLabel) : null,
    },
  };
}

function parseStructuredSourceFeedArticle(listing: FeedListing): ExtractedFundAnnouncement | null {
  const firmName = String(listing.metadata?.firm_name || "").trim();
  if (!firmName) return null;
  const sourceTitle = listing.title?.trim() || `${firmName} fund announcement`;
  const fundLabel =
    typeof listing.metadata?.fund_label === "string" && listing.metadata?.fund_label.trim()
      ? listing.metadata.fund_label.trim()
      : `${firmName} Fund`;
  const announcedIso =
    typeof listing.metadata?.announced_at === "string" && listing.metadata.announced_at
      ? listing.metadata.announced_at
      : listing.publishedAt?.toISOString() || null;
  const fundSize =
    typeof listing.metadata?.fund_size_usd === "number"
      ? listing.metadata.fund_size_usd
      : parseUsdAmountText(typeof listing.metadata?.fund_size_text === "string" ? listing.metadata.fund_size_text : null);
  const rawTextParts = [
    typeof listing.summary === "string" ? listing.summary : null,
    typeof listing.metadata?.fund_status === "string" ? listing.metadata.fund_status : null,
    Array.isArray(listing.metadata?.sector_focus) ? listing.metadata?.sector_focus.join(", ") : null,
    Array.isArray(listing.metadata?.stage_focus) ? listing.metadata?.stage_focus.join(", ") : null,
    Array.isArray(listing.metadata?.geography_focus) ? listing.metadata?.geography_focus.join(", ") : null,
  ].filter(Boolean);

  return {
    externalId: contentHash([listing.sourceKey, firmName, sourceTitle, listing.articleUrl]),
    firmName,
    firmWebsiteUrl: null,
    fundName: fundLabel,
    fundLabel,
    fundType: typeof listing.metadata?.fund_type === "string" ? listing.metadata.fund_type : null,
    fundSize,
    currency: "USD",
    vintageYear: extractVintageYear(`${sourceTitle} ${listing.summary || ""}`),
    announcedDate: announcedIso ? announcedIso.slice(0, 10) : null,
    closeDate: null,
    sourceUrl: listing.articleUrl,
    sourceTitle,
    sourcePublisher: sourcePublisherLabel(listing.sourceKey),
    sourceType: listing.sourceType || "structured_provider",
    rawText: rawTextParts.join("\n").trim() || listing.summary || sourceTitle,
    confidence: 0.72,
    stageFocus: Array.isArray(listing.metadata?.stage_focus)
      ? listing.metadata.stage_focus.filter((value): value is string => typeof value === "string")
      : undefined,
    sectorFocus: Array.isArray(listing.metadata?.sector_focus)
      ? listing.metadata.sector_focus.filter((value): value is string => typeof value === "string")
      : undefined,
    geographyFocus: Array.isArray(listing.metadata?.geography_focus)
      ? listing.metadata.geography_focus.filter((value): value is string => typeof value === "string")
      : undefined,
    metadata: {
      event_type_guess: "new_fund_announced",
      detection_mode: "structured_source_listing",
      source_feed_key: listing.sourceKey,
      extracted_sequence_number: extractFundSequenceNumber(fundLabel || sourceTitle),
      normalized_fund_label: fundLabel ? normalizeFundName(fundLabel) : null,
      ...(listing.metadata || {}),
    },
  };
}

async function fetchTechcrunchFundingTagListings(
  since: Date | null,
  maxItems: number,
  log: (message: string) => void,
): Promise<FeedListing[]> {
  const found: FeedListing[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 12 && found.length < maxItems; page += 1) {
    const url = page === 1 ? "https://techcrunch.com/tag/funding/" : `https://techcrunch.com/tag/funding/page/${page}/`;
    const html = await fetchHtml(url);
    if (!html) break;
    const $ = load(html);
    const pageRows: FeedListing[] = [];

    $("a[href]").each((_, anchor) => {
      const href = $(anchor).attr("href");
      if (!href) return;
      const articleUrl = href.startsWith("http") ? href : normalizeUrl(url, href);
      if (!articleUrl.includes("techcrunch.com/") || articleUrl.includes("/tag/")) return;

      const title =
        $(anchor).find("h2, h3, h4").first().text().trim() ||
        $(anchor).text().replace(/\s+/g, " ").trim();
      if (!title || title.length < 15) return;

      const container = $(anchor).closest("article, li, div");
      const dateText = container.find("time").first().attr("datetime") || container.find("time").first().text().trim();
      const publishedAt = dateText ? new Date(dateText) : null;
      if (since && publishedAt && publishedAt <= since) return;

      pageRows.push({
        articleUrl,
        title,
        publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
        summary: null,
        sourceKey: "TECHCRUNCH_FUNDING_TAG",
        sourceType: "news_article",
      });
    });

    if (pageRows.length === 0) break;
    let staleCount = 0;
    for (const row of pageRows) {
      const key = normUrl(row.articleUrl);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(row);
      if (since && row.publishedAt && row.publishedAt <= since) staleCount += 1;
      if (found.length >= maxItems) break;
    }
    log(`[techcrunch-funding] page ${page}: ${pageRows.length} row(s)`);
    if (staleCount === pageRows.length && pageRows.length > 0) break;
  }

  return found;
}

// fetchEverythingStartupsListings removed.
// everythingstartups.com was the original source of all 91 bad fund records
// (wrong amounts, stale data, aggregator-only URLs).  It is no longer used as
// an ingestion source.  Replaced by: TechCrunch, PRNewswire, BusinessWire,
// VCSheet, and the Shai Goldman community sheet.

// fetchVcstackFundingListings removed.
// vcstack.com generated synthetic anchor fragment URLs (#item-N) with no
// stable identity, causing deduplication collisions.  Removed in favour of
// primary press-release sources (PRNewswire, BusinessWire).

async function fetchPrNewswireVentureListings(
  since: Date | null,
  maxItems: number,
  log: (message: string) => void,
): Promise<FeedListing[]> {
  const found: FeedListing[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 8 && found.length < maxItems; page += 1) {
    const url = page === 1
      ? "https://www.prnewswire.com/news-releases/financial-services-latest-news/venture-capital-list/"
      : `https://www.prnewswire.com/news-releases/financial-services-latest-news/venture-capital-list/?page=${page}`;
    const html = await fetchHtml(url);
    if (!html) break;
    const $ = load(html);
    let pageRows = 0;

    $("a.newsreleaseconsolidatelink[href]").each((_, anchor) => {
      if (found.length >= maxItems) return false;
      const href = $(anchor).attr("href");
      if (!href) return;
      const articleUrl = href.startsWith("http") ? href : normalizeUrl("https://www.prnewswire.com", href);
      const key = normUrl(articleUrl);
      if (seen.has(key)) return;

      const text = $(anchor).text().replace(/\s+/g, " ").trim();
      const match = text.match(/^([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{2}:\d{2}\s+ET)\s+(.+)$/);
      const publishedAt = match?.[1] ? new Date(match[1]) : null;
      if (since && publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt <= since) return;

      const title =
        $(anchor).find("h2, h3, h4").first().text().replace(/\s+/g, " ").trim() ||
        (match?.[2] || text).trim();
      const summary = $(anchor).find("p").first().text().replace(/\s+/g, " ").trim() || null;
      if (!title) return;

      seen.add(key);
      found.push({
        articleUrl,
        title,
        publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
        summary,
        sourceKey: "PRNEWSWIRE_VENTURE_CAPITAL",
        sourceType: "press_release",
      });
      pageRows += 1;
      return undefined;
    });

    log(`[prnewswire] page ${page}: ${pageRows} row(s)`);
    if (pageRows === 0) break;
  }

  return found;
}

async function fetchVcsheetFundListings(
  since: Date | null,
  maxItems: number,
  log: (message: string) => void,
): Promise<FeedListing[]> {
  const html = await fetchHtml("https://www.vcsheet.com/funds");
  if (!html) return [];

  const $ = load(html);
  const urls: string[] = [];
  const seen = new Set<string>();

  $("a[href*='/fund/']").each((_, anchor) => {
    if (urls.length >= maxItems) return false;
    const href = $(anchor).attr("href");
    if (!href) return;
    const articleUrl = href.startsWith("http") ? href : normalizeUrl("https://www.vcsheet.com/funds", href);
    const key = normUrl(articleUrl);
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(articleUrl);
    return undefined;
  });

  const currentYear = new Date().getUTCFullYear();
  const recentYears = [currentYear, currentYear - 1];
  const listings: FeedListing[] = [];

  for (const articleUrl of urls) {
    if (listings.length >= maxItems) break;
    const profileHtml = await fetchHtml(articleUrl);
    if (!profileHtml) continue;
    const page = load(profileHtml);
    const title = page("title").text().replace(/\s+/g, " ").trim();
    const firmName = title.replace(/\s*-\s*VC Fund Breakdown\s*$/i, "").trim();
    const bodyText = page("body").text().replace(/\s+/g, " ").trim();
    const lower = bodyText.toLowerCase();
    const hasRecentFundSignal =
      /\b(new fund|inaugural fund|debut fund|fund [ivx0-9]+|largest fund|final close|closed fund|launched fund|raised fund)\b/i.test(bodyText) &&
      /\b(announced|launch|launched|close|closed|raised|raise|debut)\b/i.test(bodyText) &&
      recentYears.some((year) => lower.includes(String(year)));
    if (!firmName || !hasRecentFundSignal) continue;

    const announcedIso = extractRecentFundDate(bodyText);
    const publishedAt = announcedIso ? new Date(announcedIso) : null;
    if (since && publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt <= since) continue;

    const stageFocus = page("body").text() ? inferStageFocus(bodyText) : [];
    const sectorFocus = inferSectorFocus(bodyText);
    const geographyFocus = inferGeographyFocus(bodyText);
    const fundSizeText = profileLabelValue(bodyText, ["Current Fund Size", "Fund Size", "AUM", "Avg Check"]);

    listings.push({
      articleUrl,
      title: `${firmName} fund profile`,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
      summary: bodyText.slice(0, 400),
      sourceKey: "VCSHEET_FUNDS",
      sourceType: "structured_provider",
      metadata: {
        firm_name: firmName,
        fund_label: extractRecentFundLabel(bodyText, firmName),
        fund_size_text: fundSizeText,
        fund_size_usd: parseUsdAmountText(fundSizeText),
        announced_at: announcedIso,
        stage_focus: stageFocus,
        sector_focus: sectorFocus,
        geography_focus: geographyFocus,
        extraction_mode: "profile_recency_inference",
      },
    });
  }

  log(`[vcsheet] ${listings.length} row(s)`);
  return listings;
}

async function fetchShaiGoldmanSheetListings(
  since: Date | null,
  maxItems: number,
  log: (message: string) => void,
): Promise<FeedListing[]> {
  const sheetUrl = "https://docs.google.com/spreadsheets/d/1ebGZ6-ivf_3woBGC4Kz_3217DhjGsefoRu_5iP3nuFQ/edit?gid=0#gid=0";
  const exportUrl = "https://docs.google.com/spreadsheets/d/1ebGZ6-ivf_3woBGC4Kz_3217DhjGsefoRu_5iP3nuFQ/export?format=tsv&gid=0";
  const response = await fetch(exportUrl, {
    headers: {
      Accept: "text/tab-separated-values,text/plain;q=0.9,*/*;q=0.8",
      "User-Agent": "VektaFreshCapitalBot/1.0 (+https://vekta.app)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response?.ok) return [];

  const tsv = await response.text().catch(() => "");
  if (!tsv.trim()) return [];

  const rows = splitTsvRows(tsv);
  const headerIndex = rows.findIndex((row) => row.some((cell) => /fund name/i.test(cell)));
  if (headerIndex === -1) return [];

  const out: FeedListing[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (out.length >= maxItems) break;
    const rawName = cleanStructuredCellText(row[1]);
    if (!rawName) continue;

    const rawDate = cleanStructuredCellText(row[3]);
    const announcedAt = parseFlexibleUsDateToIsoDate(rawDate);
    const publishedAt = announcedAt ? new Date(announcedAt) : null;
    if (since && publishedAt && publishedAt <= since) continue;

    const { firmName, fundLabel } = deriveSheetFirmAndFund(rawName, row[5]);
    const notesUrl = cleanStructuredCellText(row[7]);
    const sourceUrl = notesUrl && /^https?:\/\//i.test(notesUrl)
      ? notesUrl
      : `${sheetUrl}&row=${encodeURIComponent(cleanStructuredCellText(row[0]) || slugish(rawName))}`;
    const amountText = cleanStructuredCellText(row[2]);
    const yearRaised = cleanStructuredCellText(row[4]);
    const location = cleanStructuredCellText(row[6]);
    const sequence = normalizeFundSequenceLabel(row[5]);
    const summary = [amountText, rawDate, location, notesUrl].filter(Boolean).join(" · ");

    out.push({
      articleUrl: sourceUrl,
      title: `${fundLabel} from shared fund sheet`,
      publishedAt,
      summary,
      sourceKey: "SHAI_GOLDMAN_NEW_FUNDS_SHEET",
      sourceType: "structured_provider",
      metadata: {
        firm_name: firmName,
        fund_label: fundLabel,
        fund_size_text: amountText,
        fund_size_usd: parseUsdAmountText(amountText),
        announced_at: announcedAt,
        vintage_year: yearRaised ? Number(yearRaised) : null,
        fund_sequence_label: sequence,
        geography_focus: location ? [location] : [],
        source_document_url: sheetUrl,
        reference_url: notesUrl || null,
        extraction_mode: "public_sheet_tsv",
      },
    });
  }

  log(`[shai-sheet] ${out.length} row(s)`);
  return out;
}

// fetchFoundersuiteFundListings removed.
// The Foundersuite source was a single static blog article
// ("50 Newly Launched VC Funds for Startups in 2025") — not a live feed.
// Once `since` advanced past its publish date it returned 0 results.
// Removed to avoid stale-source noise in the pipeline.

async function fetchSourceFeedListings(options: FundSyncRunOptions, log: (message: string) => void): Promise<FeedListing[]> {
  const since = options.dateFrom ? new Date(options.dateFrom) : null;
  const max = Math.max(150, Math.min(options.maxItems ?? 1500, 3000));

  // Removed sources (do not re-add without overwrite-protection review):
  //   EVERYTHING_STARTUPS_NEW_VC_FUNDS — stale aggregator, wrong amounts/URLs
  //   VCSTACK_FUNDING_ANNOUNCEMENTS    — fake #item-N anchor URLs, unreliable
  //   FOUNDERSUITE_NEW_VC_FUNDS_2025   — static one-off blog article, not a live feed
  const [techcrunch, alleywatch, techcrunchFunding, prNewswire, vcsheet, shaiSheet] = await Promise.all([
    fetchTechcrunchVenture(since, sourceLimit(options, "TECHCRUNCH_VENTURE", Math.min(max, 400)), log).catch(() => []),
    fetchAlleywatchFunding(since, sourceLimit(options, "ALLEYWATCH_FUNDING", Math.min(max, 300)), log).catch(() => []),
    fetchTechcrunchFundingTagListings(since, sourceLimit(options, "TECHCRUNCH_FUNDING_TAG", Math.min(max, 300)), log).catch(() => []),
    fetchPrNewswireVentureListings(since, sourceLimit(options, "PRNEWSWIRE_VENTURE_CAPITAL", Math.min(max, 250)), log).catch(() => []),
    fetchVcsheetFundListings(since, sourceLimit(options, "VCSHEET_FUNDS", Math.min(max, 150)), log).catch(() => []),
    fetchShaiGoldmanSheetListings(since, sourceLimit(options, "SHAI_GOLDMAN_NEW_FUNDS_SHEET", Math.min(max, 400)), log).catch(() => []),
  ]);

  const grouped = new Map<string, FeedListing[]>();
  for (const row of [...techcrunch, ...alleywatch, ...techcrunchFunding, ...prNewswire, ...vcsheet, ...shaiSheet]) {
    if (!grouped.has(row.sourceKey)) grouped.set(row.sourceKey, []);
    grouped.get(row.sourceKey)!.push(row);
  }

  for (const rows of grouped.values()) {
    rows.sort((left, right) => {
      const leftStructured = left.sourceType === "structured_provider" ? 1 : 0;
      const rightStructured = right.sourceType === "structured_provider" ? 1 : 0;
      if (leftStructured !== rightStructured) return rightStructured - leftStructured;
      return (right.publishedAt?.getTime() || 0) - (left.publishedAt?.getTime() || 0);
    });
  }

  const sources = Array.from(grouped.keys()).sort((left, right) => {
    const leftStructured = grouped.get(left)?.[0]?.sourceType === "structured_provider" ? 1 : 0;
    const rightStructured = grouped.get(right)?.[0]?.sourceType === "structured_provider" ? 1 : 0;
    if (leftStructured !== rightStructured) return rightStructured - leftStructured;
    return left.localeCompare(right);
  });

  const unique = new Map<string, FeedListing>();
  let madeProgress = true;
  while (unique.size < max && madeProgress) {
    madeProgress = false;
    for (const sourceKey of sources) {
      const rows = grouped.get(sourceKey) || [];
      while (rows.length > 0) {
        const row = rows.shift()!;
        const key = normUrl(row.articleUrl);
        if (unique.has(key)) continue;
        unique.set(key, {
          articleUrl: row.articleUrl,
          title: row.title,
          publishedAt: row.publishedAt,
          summary: row.summary ?? null,
          sourceKey: row.sourceKey,
          sourceType: row.sourceType,
          metadata: row.metadata ?? null,
        });
        madeProgress = true;
        break;
      }
      if (unique.size >= max) break;
    }
  }

  return Array.from(unique.values());
}

async function detectSourceFeedCandidates(firms: FirmRecordLookup[], options: FundSyncRunOptions): Promise<ExtractedFundAnnouncement[]> {
  const listings = await fetchSourceFeedListings(options, (message) => {
    if (options.verbose) console.log(`[vc-fund:adapter:feeds] ${message}`);
  });
  const found: ExtractedFundAnnouncement[] = [];

  for (const listing of listings) {
    if (options.dateTo && listing.publishedAt && listing.publishedAt > new Date(options.dateTo)) continue;
    if (listing.sourceType === "structured_provider") {
      const parsed = parseStructuredSourceFeedArticle(listing);
      if (!parsed) continue;
      found.push(parsed);
      if ((options.maxItems || 0) > 0 && found.length >= options.maxItems!) break;
      continue;
    }
    const articleHtml = await fetchHtml(listing.articleUrl);
    if (!articleHtml) continue;
    const parsed = parseSourceFeedArticle(listing.articleUrl, articleHtml, listing, firms);
    if (!parsed) continue;
    found.push(parsed);
    if ((options.maxItems || 0) > 0 && found.length >= options.maxItems!) break;
  }

  return found;
}

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "VektaFreshCapitalBot/1.0 (+https://vekta.app)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractLinkCandidates(baseUrl: string, html: string, limit = 4): LinkCandidate[] {
  const $ = load(html);
  const candidates: LinkCandidate[] = [];

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) return;
    const url = normalizeUrl(baseUrl, href);
    if (hostname(url) !== hostname(baseUrl)) return;

    const headline = $(anchor).text().replace(/\s+/g, " ").trim();
    const excerpt = $(anchor).closest("article, li, div").text().replace(/\s+/g, " ").trim() || null;
    const blob = `${headline} ${excerpt || ""}`;
    if (!articleLooksRelevant(blob)) return;

    candidates.push({
      url,
      headline,
      excerpt,
      publishedAt: null,
    });
  });

  const unique = new Map<string, LinkCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.url)) unique.set(candidate.url, candidate);
    if (unique.size >= limit) break;
  }
  return Array.from(unique.values());
}

function parseCapitalArticle(
  firm: FirmRecordLookup | { id?: string; firm_name: string; website_url?: string | null },
  articleUrl: string,
  articleHtml: string,
  fallback: { headline?: string | null; excerpt?: string | null; publishedAt?: string | null; sourceType: ExtractedFundAnnouncement["sourceType"]; publisher?: string | null; metadata?: Record<string, unknown> },
): ExtractedFundAnnouncement | null {
  const $ = load(articleHtml);
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    fallback.headline ||
    "Untitled capital event";
  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    $("article p").slice(0, 3).text().replace(/\s+/g, " ").trim() ||
    fallback.excerpt ||
    "";
  const body = $("body").text().replace(/\s+/g, " ").trim().slice(0, 7000);
  const blob = `${title} ${description} ${body}`;
  if (!articleLooksRelevant(blob)) return null;

  const publishedAt = parsePublishedAt($) || fallback.publishedAt || null;
  const publisher = fallback.publisher || hostname(articleUrl);
  const fundLabel = buildFundLabel(firm, title, blob);
  const sourceType = fallback.sourceType === "news_article" && isPressReleasePublisher(publisher || "") ? "press_release" : fallback.sourceType;

  return {
    externalId: contentHash([firm.id || normalizeFirmName(firm.firm_name), articleUrl, title]),
    firmName: firm.firm_name,
    firmWebsiteUrl: firm.website_url || null,
    fundName: fundLabel,
    fundLabel,
    fundType: null,
    fundSize: extractUsdAmount(blob),
    currency: "USD",
    vintageYear: extractVintageYear(blob),
    announcedDate: publishedAt ? publishedAt.slice(0, 10) : null,
    closeDate: /\bfinal close|closed\b/i.test(blob) ? (publishedAt ? publishedAt.slice(0, 10) : null) : null,
    sourceUrl: articleUrl,
    sourceTitle: title,
    sourcePublisher: publisher,
    sourceType,
    rawText: `${description}\n\n${body}`.trim(),
    confidence: sourceType === "official_website" ? 0.62 : sourceType === "press_release" ? 0.68 : 0.56,
    metadata: {
      ...inferEventTypeGuess(blob),
      ...(fallback.metadata || {}),
      verification_refetch_url: articleUrl,
      extracted_sequence_number: extractFundSequenceNumber(fundLabel || title),
      normalized_fund_label: fundLabel ? normalizeFundName(fundLabel) : null,
    },
  };
}

export async function refetchCapitalArticleDetails(args: {
  url: string;
  firmName: string;
  firmWebsiteUrl?: string | null;
  sourceType: ExtractedFundAnnouncement["sourceType"];
  publisher?: string | null;
  headline?: string | null;
  excerpt?: string | null;
  publishedAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ExtractedFundAnnouncement | null> {
  const html = await fetchHtml(args.url);
  if (!html) return null;
  return parseCapitalArticle(
    { firm_name: args.firmName, website_url: args.firmWebsiteUrl || null },
    args.url,
    html,
    {
      sourceType: args.sourceType,
      publisher: args.publisher || null,
      headline: args.headline || null,
      excerpt: args.excerpt || null,
      publishedAt: args.publishedAt || null,
      metadata: args.metadata,
    },
  );
}

async function detectFirmWebsiteCandidates(firm: FirmRecordLookup, options: FundSyncRunOptions): Promise<ExtractedFundAnnouncement[]> {
  if (!firm.website_url) return [];
  const found: ExtractedFundAnnouncement[] = [];
  let scanned = 0;

  for (const path of CAPITAL_EVENT_SCAN_PATHS) {
    if ((options.maxItems || 0) > 0 && found.length >= options.maxItems!) break;
    const pageUrl = normalizeUrl(firm.website_url, path);
    const html = await fetchHtml(pageUrl);
    scanned += 1;
    if (!html) continue;

    const links = extractLinkCandidates(pageUrl, html, 4);
    for (const link of links) {
      const articleHtml = await fetchHtml(link.url);
      if (!articleHtml) continue;
      const parsed = parseCapitalArticle(firm, link.url, articleHtml, {
        sourceType: "official_website",
        publisher: hostname(link.url),
        headline: link.headline,
        excerpt: link.excerpt,
        publishedAt: link.publishedAt,
        metadata: {
          detection_mode: "official_website_news",
          scan_page_url: pageUrl,
          pages_scanned: scanned,
        },
      });
      if (!parsed) continue;
      if (options.dateFrom && parsed.announcedDate && new Date(parsed.announcedDate) < new Date(options.dateFrom)) continue;
      if (options.dateTo && parsed.announcedDate && new Date(parsed.announcedDate) > new Date(options.dateTo)) continue;
      found.push(parsed);
    }
  }

  return found;
}

function isRelevantToFirm(article: NewsRawArticle, firm: FirmRecordLookup): boolean {
  const name = (firm.firm_name || "").trim().toLowerCase();
  if (!name) return true;
  const tokens = tokenizeFirmName(name);
  const domain = extractDomain(firm.website_url ?? null);
  const articleDomain = extractDomain(article.url);
  const haystack = `${article.title} ${article.content_snippet} ${article.source_name}`.toLowerCase();

  if (haystack.includes(name)) return true;
  if (domain && (articleDomain === domain || articleDomain?.endsWith(`.${domain}`))) return true;

  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) hits += 1;
  }
  return hits >= Math.min(2, tokens.length);
}

function dedupeNewsArticles(articles: NewsRawArticle[]): NewsRawArticle[] {
  const seen = new Set<string>();
  const out: NewsRawArticle[] = [];
  for (const article of articles) {
    const url = (article.url || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const key = normUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

async function fetchNewsApi(firmName: string): Promise<NewsRawArticle[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];
  const safe = firmName.replace(/"/g, "").trim();
  const query = encodeURIComponent(`"${safe}"`);
  const url = `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=12&language=en&apiKey=${encodeURIComponent(key)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const json = await response.json();
    const rows = json?.articles;
    if (!Array.isArray(rows)) return [];
    return rows.map((row: Record<string, unknown>) => ({
      title: String(row.title ?? "").trim() || "Untitled",
      url: String(row.url ?? "").trim(),
      source_name: String((row.source as { name?: string } | undefined)?.name ?? "NewsAPI"),
      published_at: row.publishedAt ? String(row.publishedAt) : new Date().toISOString(),
      content_snippet: String(row.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof row.urlToImage === "string" ? row.urlToImage : null,
    }));
  } catch {
    return [];
  }
}

async function fetchGNews(firmName: string): Promise<NewsRawArticle[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const query = encodeURIComponent(firmName);
  const url = `https://gnews.io/api/v4/search?q=${query}&lang=en&max=12&token=${encodeURIComponent(key)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const json = await response.json();
    const rows = json?.articles;
    if (!Array.isArray(rows)) return [];
    return rows.map((row: Record<string, unknown>) => ({
      title: String(row.title ?? "").trim() || "Untitled",
      url: String(row.url ?? "").trim(),
      source_name: String((row.source as { name?: string } | undefined)?.name ?? "GNews"),
      published_at: row.publishedAt ? String(row.publishedAt) : new Date().toISOString(),
      content_snippet: String(row.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof row.image === "string" ? row.image : null,
    }));
  } catch {
    return [];
  }
}

async function fetchMediastack(firmName: string): Promise<NewsRawArticle[]> {
  const key = process.env.MEDIASTACK_ACCESS_KEY;
  if (!key) return [];
  const keywords = encodeURIComponent(firmName);
  const url = `https://api.mediastack.com/v1/news?access_key=${encodeURIComponent(key)}&keywords=${keywords}&languages=en&sort=published_desc&limit=12`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const json = await response.json();
    const rows = json?.data;
    if (!Array.isArray(rows)) return [];
    return rows.map((row: Record<string, unknown>) => ({
      title: String(row.title ?? "").trim() || "Untitled",
      url: String(row.url ?? "").trim(),
      source_name: String(row.source ?? "Mediastack"),
      published_at: row.published_at ? String(row.published_at) : new Date().toISOString(),
      content_snippet: String(row.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof row.image === "string" ? row.image : null,
    }));
  } catch {
    return [];
  }
}

async function fetchExternalNewsForFirm(firm: FirmRecordLookup): Promise<NewsRawArticle[]> {
  const [a, b, c] = await Promise.all([
    fetchNewsApi(firm.firm_name),
    fetchGNews(firm.firm_name),
    fetchMediastack(firm.firm_name),
  ]);

  return dedupeNewsArticles([...a, ...b, ...c])
    .filter((article) => isRelevantToFirm(article, firm))
    .filter((article) => articleLooksRelevant(`${article.title} ${article.content_snippet}`))
    .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
    .slice(0, 10);
}

async function detectExternalNewsCandidates(firm: FirmRecordLookup, options: FundSyncRunOptions): Promise<ExtractedFundAnnouncement[]> {
  const rows = await fetchExternalNewsForFirm(firm);
  const found: ExtractedFundAnnouncement[] = [];

  for (const row of rows) {
    if (options.dateFrom && row.published_at && new Date(row.published_at) < new Date(options.dateFrom)) continue;
    if (options.dateTo && row.published_at && new Date(row.published_at) > new Date(options.dateTo)) continue;

    const refined = await refetchCapitalArticleDetails({
      url: row.url,
      firmName: firm.firm_name,
      firmWebsiteUrl: firm.website_url || null,
      sourceType: isPressReleasePublisher(row.source_name) ? "press_release" : "news_article",
      publisher: row.source_name,
      headline: row.title,
      excerpt: row.content_snippet,
      publishedAt: row.published_at,
      metadata: {
        detection_mode: "external_news_api",
        og_image_url: row.og_image_url,
      },
    });
    if (!refined) continue;

    found.push({
      ...refined,
      confidence: refined.sourceType === "press_release" ? 0.69 : 0.57,
      metadata: {
        ...(refined.metadata || {}),
        raw_firm_name: firm.firm_name,
        event_type_guess: refined.metadata?.event_type_guess || inferEventTypeGuess(`${row.title} ${row.content_snippet}`).event_type_guess,
        normalized_fund_label: refined.fundLabel ? normalizeFundName(refined.fundLabel) : null,
        fund_sequence_number: extractFundSequenceNumber(refined.fundLabel || refined.sourceTitle || ""),
      },
    });
  }

  return found;
}

export const officialWebsiteCapitalAdapter: VcFundSourceAdapter = {
  key: "official_website",
  label: "Official firm website news/press detector",
  priority: 100,
  async fetchFundAnnouncements({ firms, options }): Promise<ExtractedFundAnnouncement[]> {
    const targets = firms
      .filter((firm) => Boolean(firm.website_url))
      .filter((firm) => !options.firmId || firm.id === options.firmId)
      .slice(0, options.maxItems ? Math.max(options.maxItems, 10) : 40);

    const results: ExtractedFundAnnouncement[] = [];
    for (const firm of targets) {
      try {
        const matches = await detectFirmWebsiteCandidates(firm, options);
        results.push(...matches);
        if (options.verbose) console.log(`[vc-fund:adapter:official] ${firm.firm_name}: ${matches.length} candidate(s)`);
      } catch (error) {
        console.warn(`[vc-fund:adapter:official] ${firm.firm_name}:`, error);
      }
    }
    return results;
  },
};

export const sourceFeedCapitalAdapter: VcFundSourceAdapter = {
  key: "source_feeds",
  label: "External source feed detector",
  priority: 110,
  async fetchFundAnnouncements({ firms, options }): Promise<ExtractedFundAnnouncement[]> {
    const matches = await detectSourceFeedCandidates(firms, options);
    if (options.verbose) console.log(`[vc-fund:adapter:feeds] total ${matches.length} candidate(s)`);
    return matches;
  },
};

export const externalNewsCapitalAdapter: VcFundSourceAdapter = {
  key: "external_news",
  label: "External news and press corroboration detector",
  priority: 85,
  async fetchFundAnnouncements({ firms, options }): Promise<ExtractedFundAnnouncement[]> {
    const targets = firms
      .filter((firm) => !options.firmId || firm.id === options.firmId)
      .slice(0, options.maxItems ? Math.max(options.maxItems, 10) : 25);

    const results: ExtractedFundAnnouncement[] = [];
    for (const firm of targets) {
      try {
        const matches = await detectExternalNewsCandidates(firm, options);
        results.push(...matches);
        if (options.verbose) console.log(`[vc-fund:adapter:news] ${firm.firm_name}: ${matches.length} candidate(s)`);
      } catch (error) {
        console.warn(`[vc-fund:adapter:news] ${firm.firm_name}:`, error);
      }
    }
    return results;
  },
};

export function buildDefaultFundAdapters(): VcFundSourceAdapter[] {
  return [sourceFeedCapitalAdapter];
}

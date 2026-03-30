/**
 * Backfill missing emails for VC firms and VC people via a provider waterfall.
 *
 * Usage:
 *   npm run db:enrich:emails:waterfall
 *   ENRICH_EMAILS_MAX_PEOPLE=300 ENRICH_EMAILS_MAX_FIRMS=150 npm run db:enrich:emails:waterfall
 *   ENRICH_EMAILS_DRY_RUN=1 npm run db:enrich:emails:waterfall
 *
 * Provider order (waterfall):
 *   1) Apollo
 *   2) People Data Labs
 *   3) Hunter
 *   4) Lusha
 *   5) Clay
 *   6) Exa
 *   7) Jina
 *   8) Linkup
 *   9) Scrapeless
 *   10) Groq
 *   11) Gemini
 *   12) DeepSeek
 *   13) Tavily
 *
 * Notes:
 * - API keys are read from env vars only; never hardcode secrets in source.
 * - Some vendors require custom account-specific endpoints. For those, set *_URL env vars.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDatabaseUrl } from "./lib/loadDatabaseUrl";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { fetchGravatarProfile } from "./lib/gravatar";

type EntityKind = "person" | "firm";

type PersonTarget = {
  kind: "person";
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  firmName: string;
  firmDomain: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
};

type FirmTarget = {
  kind: "firm";
  id: string;
  firmName: string;
  domain: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
};

type Target = PersonTarget | FirmTarget;

type ProviderResult = {
  provider: string;
  emails: string[];
  evidence?: string;
};

type ProviderCall = {
  name: string;
  run: () => Promise<ProviderResult | null>;
};

type CandidateEvaluation = {
  email: string;
  provider: string;
  score: number;
  domainMatch: boolean;
  validationPassed: boolean;
  validationReason: string;
  decision: "chosen" | "rejected";
  decisionReason: string;
  lowConfidenceFallback: boolean;
};

type BatchState = {
  chosenEmailToOrg: Map<string, string>;
};

type EnvConfig = {
  maxPeople: number;
  maxFirms: number;
  delayMs: number;
  timeoutMs: number;
  dryRun: boolean;
  minWriteScore: number;
  minWriteScoreNoDomain: number;
  duplicateExtremeScore: number;
  allowMismatchedFallback: boolean;
  mismatchedFallbackMinScore: number;
  sourceFilter?: string;
  // keys
  lushaApiKey?: string;
  pdlApiKey?: string;
  clayApiKey?: string;
  hunterApiKey?: string;
  exaApiKey?: string;
  apolloApiKey?: string;
  jinaApiKey?: string;
  linkupApiKey?: string;
  tavilyApiKey?: string;
  scrapelessApiKey?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  deepseekApiKey?: string;
  // custom urls for providers that vary per account
  lushaPersonUrl?: string;
  lushaFirmUrl?: string;
  clayPersonUrl?: string;
  clayFirmUrl?: string;
  linkupSearchUrl?: string;
  scrapelessPersonUrl?: string;
  scrapelessFirmUrl?: string;
};

type HunterEmail = {
  value?: string;
  confidence?: number;
  first_name?: string;
  last_name?: string;
  position?: string;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function envAny(...names: string[]): string | undefined {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return undefined;
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCliArgs(): { dryRun?: boolean; limit?: number } {
  const args = process.argv.slice(2);
  let dryRun: boolean | undefined;
  let limit: number | undefined;
  for (const arg of args) {
    if (arg === "--dry-run" || arg === "--dryrun" || arg === "--dry") dryRun = true;
    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch) limit = Number.parseInt(limitMatch[1], 10);
  }
  return { dryRun, limit };
}

function getConfig(): EnvConfig {
  const cli = parseCliArgs();
  const maxPeople = cli.limit ?? Math.max(1, parseEnvInt("ENRICH_EMAILS_MAX_PEOPLE", 400));
  const maxFirms = cli.limit ?? Math.max(1, parseEnvInt("ENRICH_EMAILS_MAX_FIRMS", 250));
  const delayMs = Math.max(0, parseEnvInt("ENRICH_EMAILS_DELAY_MS", 180));
  const timeoutMs = Math.max(2000, parseEnvInt("ENRICH_EMAILS_TIMEOUT_MS", 18000));
  const minWriteScore = Math.max(1, parseEnvInt("ENRICH_EMAILS_MIN_SCORE", 65));
  const minWriteScoreNoDomain = Math.max(1, parseEnvInt("ENRICH_EMAILS_MIN_SCORE_NO_DOMAIN", 40));
  const duplicateExtremeScore = Math.max(minWriteScore, parseEnvInt("ENRICH_EMAILS_DUPLICATE_EXTREME_SCORE", 92));
  const mismatchedFallbackMinScore = Math.max(minWriteScore, parseEnvInt("ENRICH_EMAILS_MISMATCHED_FALLBACK_MIN_SCORE", 80));
  const dryRun = cli.dryRun ?? ["1", "true", "yes"].includes((process.env.ENRICH_EMAILS_DRY_RUN || "").toLowerCase());
  const allowMismatchedFallback = ["1", "true", "yes"].includes((process.env.ENRICH_EMAILS_ALLOW_MISMATCHED_FALLBACK || "").toLowerCase());

  return {
    maxPeople,
    maxFirms,
    delayMs,
    timeoutMs,
    dryRun,
    minWriteScore,
    minWriteScoreNoDomain,
    duplicateExtremeScore,
    allowMismatchedFallback,
    mismatchedFallbackMinScore,
    sourceFilter: envAny("ENRICH_EMAILS_SOURCE", "VC_EMAIL_SOURCE_FILTER"),
    lushaApiKey: envAny("LUSHA_API_KEY", "LUSHA_API"),
    pdlApiKey: envAny("PEOPLE_DATA_LABS_API_KEY", "PDL_API_KEY", "PEOPLEDATALABS_API_KEY"),
    clayApiKey: envAny("CLAY_API_KEY", "CLAY_API"),
    hunterApiKey: envAny("HUNTER_API_KEY", "HUNTER_API"),
    exaApiKey: envAny("EXA_API_KEY", "EXA_AI_API_KEY"),
    apolloApiKey: envAny("APOLLO_API_KEY", "APOLLO_API"),
    jinaApiKey: envAny("JINA_API_KEY", "JINA_API"),
    linkupApiKey: envAny("LINKUP_API_KEY", "LINKUP_API"),
    tavilyApiKey: envAny("TAVILY_API_KEY", "TAVILY_API"),
    scrapelessApiKey: envAny("SCRAPELESS_API_KEY", "SCRAPELESS_API", "SCRAPELESS_API_TOKEN"),
    groqApiKey: envAny("GROQ_API_KEY", "GROQ_API"),
    geminiApiKey: envAny("GEMINI_API_KEY", "GEMINI_25_API_KEY", "GEMINI_API"),
    deepseekApiKey: envAny("DEEPSEEK_API_KEY", "DEEPSEEK_API"),
    lushaPersonUrl: env("LUSHA_PERSON_URL"),
    lushaFirmUrl: env("LUSHA_FIRM_URL"),
    clayPersonUrl: env("CLAY_PERSON_URL"),
    clayFirmUrl: env("CLAY_FIRM_URL"),
    linkupSearchUrl: env("LINKUP_SEARCH_URL"),
    scrapelessPersonUrl: env("SCRAPELESS_PERSON_URL"),
    scrapelessFirmUrl: env("SCRAPELESS_FIRM_URL"),
  };
}

function configuredProviders(cfg: EnvConfig): string[] {
  const providers: string[] = [];
  if (cfg.apolloApiKey) providers.push("Apollo");
  if (cfg.pdlApiKey) providers.push("People Data Labs");
  if (cfg.hunterApiKey) providers.push("Hunter");
  if (cfg.lushaApiKey && (cfg.lushaPersonUrl || cfg.lushaFirmUrl)) providers.push("Lusha");
  if (cfg.clayApiKey && (cfg.clayPersonUrl || cfg.clayFirmUrl)) providers.push("Clay");
  if (cfg.exaApiKey) providers.push("Exa");
  if (cfg.jinaApiKey) providers.push("Jina");
  if (cfg.linkupApiKey && cfg.linkupSearchUrl) providers.push("Linkup");
  if (cfg.scrapelessApiKey && (cfg.scrapelessPersonUrl || cfg.scrapelessFirmUrl)) providers.push("Scrapeless");
  if (cfg.groqApiKey) providers.push("Groq");
  if (cfg.geminiApiKey) providers.push("Gemini");
  if (cfg.deepseekApiKey) providers.push("DeepSeek");
  if (cfg.tavilyApiKey) providers.push("Tavily");
  return providers;
}

type ParsedEnvEntry = { key: string; line: number };

function parseEnvKeys(filePath: string): ParsedEnvEntry[] {
  const out: ParsedEnvEntry[] = [];
  if (!existsSync(filePath)) return out;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    out.push({ key: m[1], line: i + 1 });
  }
  return out;
}

function countKeysLoadedFromFile(entries: ParsedEnvEntry[]): number {
  let loaded = 0;
  for (const entry of entries) {
    const existing = process.env[entry.key];
    if (existing == null || existing === "") loaded += 1;
  }
  return loaded;
}

function printProviderPresenceBooleans(): void {
  const has = (...names: string[]) => names.some((name) => {
    const v = process.env[name];
    return typeof v === "string" && v.trim().length > 0;
  });
  const bool = (name: string) => has(name);

  console.log("[env-debug] provider key presence (canonical + aliases):");
  // Apollo
  console.log(`[env-debug]   APOLLO_API_KEY=${bool("APOLLO_API_KEY")}  APOLLO_API=${bool("APOLLO_API")}`);
  // PDL
  console.log(`[env-debug]   PDL_API_KEY=${bool("PDL_API_KEY")}  PEOPLE_DATA_LABS_API_KEY=${bool("PEOPLE_DATA_LABS_API_KEY")}  PEOPLEDATALABS_API_KEY=${bool("PEOPLEDATALABS_API_KEY")}`);
  // Hunter
  console.log(`[env-debug]   HUNTER_API_KEY=${bool("HUNTER_API_KEY")}  HUNTER_API=${bool("HUNTER_API")}`);
  // Lusha
  console.log(`[env-debug]   LUSHA_API_KEY=${bool("LUSHA_API_KEY")}  LUSHA_API=${bool("LUSHA_API")}`);
  // Clay
  console.log(`[env-debug]   CLAY_API_KEY=${bool("CLAY_API_KEY")}  CLAY_API=${bool("CLAY_API")}`);
  // Exa
  console.log(`[env-debug]   EXA_API_KEY=${bool("EXA_API_KEY")}  EXA_AI_API_KEY=${bool("EXA_AI_API_KEY")}`);
  // Jina
  console.log(`[env-debug]   JINA_API_KEY=${bool("JINA_API_KEY")}  JINA_API=${bool("JINA_API")}`);
  // Linkup
  console.log(`[env-debug]   LINKUP_API_KEY=${bool("LINKUP_API_KEY")}  LINKUP_API=${bool("LINKUP_API")}`);
  // Scrapeless
  console.log(`[env-debug]   SCRAPELESS_API_KEY=${bool("SCRAPELESS_API_KEY")}  SCRAPELESS_API=${bool("SCRAPELESS_API")}  SCRAPELESS_API_TOKEN=${bool("SCRAPELESS_API_TOKEN")}`);
  // Groq
  console.log(`[env-debug]   GROQ_API_KEY=${bool("GROQ_API_KEY")}  GROQ_API=${bool("GROQ_API")}`);
  // Gemini
  console.log(`[env-debug]   GEMINI_API_KEY=${bool("GEMINI_API_KEY")}  GEMINI_25_API_KEY=${bool("GEMINI_25_API_KEY")}  GEMINI_API=${bool("GEMINI_API")}`);
  // DeepSeek
  console.log(`[env-debug]   DEEPSEEK_API_KEY=${bool("DEEPSEEK_API_KEY")}  DEEPSEEK_API=${bool("DEEPSEEK_API")}`);
  // Tavily
  console.log(`[env-debug]   TAVILY_API_KEY=${bool("TAVILY_API_KEY")}  TAVILY_API=${bool("TAVILY_API")}`);
}

function validateEnvLocalFormat(filePath: string): void {
  if (!existsSync(filePath)) {
    console.log("[env-debug] .env.local format check: file missing");
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const issues: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const lineNo = i + 1;

    if (/^export\s+/.test(trimmed)) issues.push(`line ${lineNo}: uses export prefix`);
    if (trimmed.includes(",")) issues.push(`line ${lineNo}: contains comma`);
    if (/^[^=]+:/.test(trimmed)) issues.push(`line ${lineNo}: uses colon before equals`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) issues.push(`line ${lineNo}: not KEY=value`);
    if (/^[\u2018\u2019\u201C\u201D]/.test(trimmed) || /[\u2018\u2019\u201C\u201D]/.test(trimmed)) {
      issues.push(`line ${lineNo}: contains smart quotes`);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*\s+=/.test(raw) || /^\s+[A-Za-z_][A-Za-z0-9_]*=/.test(raw)) {
      issues.push(`line ${lineNo}: has whitespace around key name`);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*\s+#/.test(raw)) issues.push(`line ${lineNo}: has trailing inline comment`);
  }

  if (issues.length === 0) {
    console.log("[env-debug] .env.local format check: OK");
  } else {
    console.log(`[env-debug] .env.local format check: ${issues.length} issue(s)`);
    for (const issue of issues) console.log(`[env-debug] ${issue}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeDomain(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

function isLikelyEmail(value: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(value);
}

function isMalformedDomain(domain: string): boolean {
  if (!domain || domain.length > 253 || !domain.includes(".")) return true;
  if (domain.startsWith(".") || domain.endsWith(".")) return true;
  if (domain.includes("..")) return true;
  const labels = domain.split(".");
  if (labels.length < 2) return true;
  if (labels.some((label) => !label || label.length > 63)) return true;
  if (labels.some((label) => label.startsWith("-") || label.endsWith("-"))) return true;
  if (labels.some((label) => !/^[a-z0-9-]+$/i.test(label))) return true;
  if (!/^[a-z]{2,63}$/i.test(labels[labels.length - 1])) return true;
  if (["example", "invalid", "localhost", "test"].includes(labels[labels.length - 1])) return true;
  return false;
}

function normalizeEmail(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!isLikelyEmail(v)) return null;
  const domain = v.split("@")[1] || "";
  if (isMalformedDomain(domain)) return null;
  if (v.endsWith("@example.com") || v.endsWith("@test.com")) return null;
  return v;
}

function extractEmails(text: string, domainHint?: string | null): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const out = matches
    .map((m) => normalizeEmail(m))
    .filter((v): v is string => Boolean(v));
  if (!domainHint) return Array.from(new Set(out));
  const preferred = out.filter((e) => e.endsWith(`@${domainHint}`));
  return Array.from(new Set(preferred.length ? preferred : out));
}

const PROVIDER_TRUST_SCORE: Record<string, number> = {
  Apollo: 30,
  "People Data Labs": 28,
  Hunter: 26,
  Lusha: 24,
  Clay: 20,
  Linkup: 14,
  Scrapeless: 12,
  Jina: 10,
  Tavily: 8,
  Exa: 7,
  Groq: 3,
  Gemini: 3,
  DeepSeek: 3,
};

const JUNK_PATTERNS = [
  /system/i,
  /example/i,
  /test/i,
  /placeholder/i,
  /dummy/i,
  /fake/i,
  /noreply/i,
  /no-reply/i,
  /do-not-reply/i,
  /donotreply/i,
  /firstname/i,
  /lastname/i,
  /parser/i,
  /artifact/i,
  /unknown/i,
  /temp/i,
  /^null$/i,
  /^none$/i,
];

function expectedDomainForTarget(target: Target): string | null {
  return target.kind === "person" ? target.firmDomain : target.domain;
}

function orgKeyForTarget(target: Target): string {
  if (target.kind === "person") return (target.firmDomain || target.firmName || target.id).toLowerCase();
  return (target.domain || target.firmName || target.id).toLowerCase();
}

function isRoleContactPerson(target: Target): boolean {
  if (target.kind !== "person") return false;
  const role = `${target.firstName} ${target.lastName}`.toLowerCase();
  return /investment\s*team|venture\s*team|deals?\s*team|partnerships?/i.test(role);
}

function noDomainEntityMatchBonus(target: Target, domain: string): number {
  const blockedDirectoryStems = new Set([
    "leadiq",
    "tracxn",
    "signalhire",
    "crunchbase",
    "zoominfo",
    "hunter",
    "rocketreach",
    "seamless",
    "merriam-webster",
    "wikipedia",
  ]);
  const stem = (domain.split(".")[0] || "").toLowerCase();
  if (!stem) return 0;
  if (blockedDirectoryStems.has(stem)) return -35;

  const stopwords = new Set([
    "the",
    "capital",
    "ventures",
    "venture",
    "partners",
    "partner",
    "group",
    "fund",
    "vc",
    "investments",
    "investment",
    "management",
    "holdings",
    "labs",
    "lab",
    "global",
  ]);

  const firmName = target.kind === "person" ? target.firmName : target.firmName;
  const tokens = firmName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token));

  if (!tokens.length) return 0;

  const compactFirm = tokens.join("");
  const stemCompact = stem.replace(/[^a-z0-9]/g, "");

  const hasStrongToken = tokens.some((token) => stemCompact === token || stemCompact.startsWith(token) || stemCompact.includes(token));
  const hasTwoTokenOverlap = tokens.length >= 2 && tokens.filter((token) => stemCompact.includes(token)).length >= 2;

  if (hasTwoTokenOverlap) return 55;
  if (hasStrongToken) return 45;
  if (compactFirm && (stemCompact.includes(compactFirm) || compactFirm.includes(stemCompact))) return 40;
  return 0;
}

function scoreEmail(target: Target, email: string, provider: string): number {
  let score = PROVIDER_TRUST_SCORE[provider] ?? 5;
  const domain = email.split("@")[1] || "";
  const local = email.split("@")[0] || "";
  const expectedDomain = expectedDomainForTarget(target);

  if (target.kind === "firm") {
    if (expectedDomain) {
      if (domain === expectedDomain) score += 50;
      else score -= 60;
    } else {
      score += noDomainEntityMatchBonus(target, domain);
    }
    if (["info", "hello", "team", "partners", "contact", "investments"].includes(local)) score += 10;
    if (domain.includes("gmail.com") || domain.includes("yahoo.com") || domain.includes("hotmail.com")) score -= 35;
    return score;
  }

  const first = target.firstName.toLowerCase();
  const last = target.lastName.toLowerCase();
  if (expectedDomain) {
    if (domain === expectedDomain) score += 45;
    else score -= 55;
  } else {
    score += noDomainEntityMatchBonus(target, domain);
  }
  if (local.includes(first) && local.includes(last)) score += 15;
  if (local === `${first}.${last}` || local === `${first}_${last}` || local === `${first}${last}`) score += 25;
  if (isRoleContactPerson(target) && ["info", "hello", "team", "partners", "contact", "investments", "investmentteam", "investment.team"].includes(local)) {
    score += 20;
  }
  if (domain.includes("gmail.com") || domain.includes("yahoo.com") || domain.includes("hotmail.com")) score -= 20;
  return score;
}

function validateCandidate(target: Target, email: string): { pass: boolean; reason: string; domainMatch: boolean } {
  const normalized = normalizeEmail(email);
  if (!normalized) return { pass: false, reason: "invalid_email_format_or_domain", domainMatch: false };
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return { pass: false, reason: "invalid_email_parts", domainMatch: false };

  if (local.length > 40) {
    return { pass: false, reason: "local_part_too_long_parser_artifact", domainMatch: false };
  }
  if (/%[0-9a-f]{2}/i.test(local)) {
    return { pass: false, reason: "url_encoded_local_part_parser_artifact", domainMatch: false };
  }
  if (/\.(com|io|ai|vc|org|net|co|in)[a-z0-9]/i.test(local)) {
    return { pass: false, reason: "embedded_domain_in_local_part_parser_artifact", domainMatch: false };
  }

  if (JUNK_PATTERNS.some((pattern) => pattern.test(local) || pattern.test(normalized))) {
    return { pass: false, reason: "junk_or_placeholder_pattern", domainMatch: false };
  }

  const expectedDomain = expectedDomainForTarget(target);
  if (!expectedDomain) {
    return { pass: true, reason: "ok_no_expected_domain", domainMatch: true };
  }

  const domainMatch = domain === expectedDomain;
  if (!domainMatch) {
    if (target.kind === "firm") {
      return { pass: true, reason: "domain_mismatch_company", domainMatch };
    }
    return { pass: true, reason: "domain_mismatch_current_firm", domainMatch };
  }

  return { pass: true, reason: "ok", domainMatch: true };
}

function evaluateCandidates(
  target: Target,
  providerResults: ProviderResult[],
  batch: BatchState,
  cfg: EnvConfig,
): { chosen: CandidateEvaluation | null; evaluations: CandidateEvaluation[] } {
  const evaluations: CandidateEvaluation[] = [];
  const seen = new Set<string>();
  const hasExpectedDomain = Boolean(expectedDomainForTarget(target));
  const minScore = hasExpectedDomain ? cfg.minWriteScore : cfg.minWriteScoreNoDomain;
  const llmProviders = new Set(["Groq", "Gemini", "DeepSeek"]);

  for (const result of providerResults) {
    for (const rawEmail of result.emails) {
      const email = normalizeEmail(rawEmail);
      if (!email) {
        evaluations.push({
          email: rawEmail,
          provider: result.provider,
          score: 0,
          domainMatch: false,
          validationPassed: false,
          validationReason: "invalid_email_format_or_domain",
          decision: "rejected",
          decisionReason: "invalid_email_format_or_domain",
          lowConfidenceFallback: false,
        });
        continue;
      }

      const key = `${result.provider}::${email}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const validation = validateCandidate(target, email);
      const score = scoreEmail(target, email, result.provider);
      const orgKey = orgKeyForTarget(target);
      const priorOrg = batch.chosenEmailToOrg.get(email);
      const crossFirmDuplicate = Boolean(priorOrg && priorOrg !== orgKey);

      const lowConfidenceFallback = !validation.domainMatch && cfg.allowMismatchedFallback && score >= cfg.mismatchedFallbackMinScore;
      let decision: CandidateEvaluation["decision"] = "chosen";
      let decisionReason = "pass";

      if (!validation.pass) {
        decision = "rejected";
        decisionReason = validation.reason;
      } else if (!hasExpectedDomain && llmProviders.has(result.provider)) {
        decision = "rejected";
        decisionReason = "llm_blocked_no_expected_domain";
      } else if (!validation.domainMatch && !lowConfidenceFallback) {
        decision = "rejected";
        decisionReason = "domain_mismatch_blocked";
      } else if (score < minScore) {
        decision = "rejected";
        decisionReason = `below_min_score_${minScore}`;
      } else if (crossFirmDuplicate && score < cfg.duplicateExtremeScore) {
        decision = "rejected";
        decisionReason = "duplicate_across_unrelated_firms";
      } else if (crossFirmDuplicate) {
        decisionReason = "duplicate_allowed_extreme_confidence";
      } else if (lowConfidenceFallback) {
        decisionReason = "low_confidence_fallback_domain_mismatch";
      }

      evaluations.push({
        email,
        provider: result.provider,
        score,
        domainMatch: validation.domainMatch,
        validationPassed: validation.pass,
        validationReason: validation.reason,
        decision,
        decisionReason,
        lowConfidenceFallback,
      });
    }
  }

  const eligible = evaluations
    .filter((item) => item.decision === "chosen")
    .sort((a, b) => b.score - a.score);

  const chosen = eligible[0] ?? null;
  if (chosen) batch.chosenEmailToOrg.set(chosen.email, orgKeyForTarget(target));

  return { chosen, evaluations };
}

function printDryRunRows(target: Target, evaluations: CandidateEvaluation[], chosen: CandidateEvaluation | null): void {
  const targetLabel =
    target.kind === "person"
      ? `${target.fullName} | ${target.firmName}`
      : target.firmName;
  for (const row of evaluations.sort((a, b) => b.score - a.score)) {
    const chosenVsRejected =
      chosen && row.email === chosen.email && row.provider === chosen.provider ? "chosen" : "rejected";
    console.log(
      [
        "dryrun",
        target.kind,
        targetLabel,
        row.email,
        row.provider,
        row.score,
        row.validationPassed ? row.validationReason : `fail:${row.validationReason}`,
        row.domainMatch ? "yes" : "no",
        chosenVsRejected,
        row.decisionReason,
      ].join(" | "),
    );
  }
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function emailsFromUnknown(data: unknown, domainHint?: string | null): string[] {
  const bag: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      bag.push(...extractEmails(v, domainHint));
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) walk(x);
    }
  };
  walk(data);
  return Array.from(new Set(bag));
}

async function hunterDomainSearch(domain: string, apiKey: string, timeoutMs: number): Promise<HunterEmail[]> {
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.searchParams.set("domain", domain);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", "20");

  const res = await fetchJson(
    url.toString(),
    {
      method: "GET",
    },
    timeoutMs,
  );

  if (!res.ok) return [];
  const rows = (res.data as { data?: { emails?: HunterEmail[] } } | null)?.data?.emails;
  return Array.isArray(rows) ? rows : [];
}

function pickBestHunterEmail(rows: HunterEmail[], target: Target): string | null {
  if (!rows.length) return null;

  const scored = rows
    .filter((row) => typeof row.value === "string" && row.value.includes("@"))
    .map((row) => {
      const email = row.value as string;
      let score = (row.confidence ?? 0) / 100;

      if (target.kind === "person") {
        const fn = (row.first_name || "").toLowerCase();
        const ln = (row.last_name || "").toLowerCase();
        if (target.firstName && fn === target.firstName.toLowerCase()) score += 0.25;
        if (target.lastName && ln === target.lastName.toLowerCase()) score += 0.25;
      } else {
        const local = email.split("@")[0] || "";
        if (["info", "hello", "team", "partners", "contact", "investments"].includes(local)) score += 0.15;
      }

      score += scoreEmail(target, email, "Hunter") / 10;
      return { email, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.email ?? null;
}

async function callCustomProvider(
  provider: string,
  url: string | undefined,
  apiKey: string | undefined,
  keyHeader: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  domainHint?: string | null,
): Promise<ProviderResult | null> {
  if (!url || !apiKey) return null;
  const r = await fetchJson(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [keyHeader]: apiKey,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
  if (!r.ok) return null;
  const emails = emailsFromUnknown(r.data, domainHint);
  if (!emails.length) return null;
  return { provider, emails };
}

async function providerPeopleDataLabs(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.pdlApiKey) return null;

  if (target.kind === "person") {
    const payload: Record<string, unknown> = {
      first_name: target.firstName,
      last_name: target.lastName,
      name: target.fullName,
      company: target.firmName,
    };
    if (target.linkedinUrl) payload.profile = target.linkedinUrl;

    const r = await fetchJson(
      "https://api.peopledatalabs.com/v5/person/enrich",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.pdlApiKey,
        },
        body: JSON.stringify(payload),
      },
      cfg.timeoutMs,
    );
    if (!r.ok) return null;
    const emails = emailsFromUnknown(r.data, target.firmDomain);
    return emails.length ? { provider: "People Data Labs", emails } : null;
  }

  const website = target.websiteUrl || (target.domain ? `https://${target.domain}` : null);
  if (!website) return null;
  const url = new URL("https://api.peopledatalabs.com/v5/company/enrich");
  url.searchParams.set("website", website);
  const r = await fetchJson(
    url.toString(),
    {
      method: "GET",
      headers: {
        "x-api-key": cfg.pdlApiKey,
      },
    },
    cfg.timeoutMs,
  );
  if (!r.ok) return null;
  const emails = emailsFromUnknown(r.data, target.domain);
  return emails.length ? { provider: "People Data Labs", emails } : null;
}

async function providerApollo(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.apolloApiKey) return null;

  if (target.kind === "person") {
    const payload: Record<string, unknown> = {
      first_name: target.firstName,
      last_name: target.lastName,
      organization_name: target.firmName,
      reveal_personal_emails: true,
    };
    if (target.linkedinUrl) payload.linkedin_url = target.linkedinUrl;
    const r = await fetchJson(
      "https://api.apollo.io/api/v1/people/match",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apolloApiKey,
        },
        body: JSON.stringify(payload),
      },
      cfg.timeoutMs,
    );
    if (!r.ok) return null;
    const emails = emailsFromUnknown(r.data, target.firmDomain);
    return emails.length ? { provider: "Apollo", emails } : null;
  }

  const domain = target.domain;
  if (!domain) return null;
  const url = new URL("https://api.apollo.io/api/v1/organizations/enrich");
  url.searchParams.set("domain", domain);
  const r = await fetchJson(
    url.toString(),
    {
      method: "GET",
      headers: {
        "x-api-key": cfg.apolloApiKey,
      },
    },
    cfg.timeoutMs,
  );
  if (!r.ok) return null;
  const emails = emailsFromUnknown(r.data, target.domain);
  return emails.length ? { provider: "Apollo", emails } : null;
}

async function providerHunter(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.hunterApiKey) return null;

  const domain = target.kind === "person" ? target.firmDomain : target.domain;
  if (!domain) return null;

  const rows = await hunterDomainSearch(domain, cfg.hunterApiKey, cfg.timeoutMs);
  const best = pickBestHunterEmail(rows, target);
  return best ? { provider: "Hunter", emails: [best] } : null;
}

async function providerTavilySearch(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.tavilyApiKey) return null;
  const query =
    target.kind === "person"
      ? `${target.fullName} ${target.firmName} investor email`
      : `${target.firmName} investor relations email contact`;

  const r = await fetchJson(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: cfg.tavilyApiKey,
        query,
        search_depth: "advanced",
        max_results: 6,
        include_answer: false,
        include_raw_content: true,
      }),
    },
    cfg.timeoutMs,
  );
  if (!r.ok) return null;
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const emails = emailsFromUnknown(r.data, domainHint);
  return emails.length ? { provider: "Tavily", emails } : null;
}

async function providerExaSearch(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.exaApiKey) return null;
  const query =
    target.kind === "person"
      ? `${target.fullName} ${target.firmName} email`
      : `${target.firmName} contact email`;

  const r = await fetchJson(
    "https://api.exa.ai/search",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.exaApiKey,
      },
      body: JSON.stringify({
        query,
        type: "neural",
        numResults: 6,
        contents: { text: true },
      }),
    },
    cfg.timeoutMs,
  );
  if (!r.ok) return null;
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const emails = emailsFromUnknown(r.data, domainHint);
  return emails.length ? { provider: "Exa", emails } : null;
}

async function providerJinaReader(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.jinaApiKey) return null;
  const rawUrl =
    target.kind === "person"
      ? target.linkedinUrl || target.websiteUrl || (target.firmDomain ? `https://${target.firmDomain}` : null)
      : target.websiteUrl || target.linkedinUrl || (target.domain ? `https://${target.domain}` : null);
  if (!rawUrl) return null;

  const readerUrl = `https://r.jina.ai/http://${rawUrl.replace(/^https?:\/\//i, "")}`;
  const r = await fetchJson(
    readerUrl,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.jinaApiKey}`,
      },
    },
    cfg.timeoutMs,
  );
  if (!r.ok) return null;
  const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const emails = extractEmails(text, domainHint);
  return emails.length ? { provider: "Jina", emails } : null;
}

async function providerGroq(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.groqApiKey) return null;
  const subject =
    target.kind === "person"
      ? `${target.fullName} at ${target.firmName}`
      : `${target.firmName}`;
  const hint =
    target.kind === "person"
      ? `Return possible work emails for ${subject}. Prefer domain ${target.firmDomain || "unknown"}.`
      : `Return possible contact emails for ${subject}. Prefer domain ${target.domain || "unknown"}.`;

  const r = await fetchJson(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${cfg.groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Return only JSON with an emails array." },
          { role: "user", content: hint },
        ],
        temperature: 0,
      }),
    },
    cfg.timeoutMs,
  );

  if (!r.ok) return null;
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const emails = emailsFromUnknown(r.data, domainHint);
  return emails.length ? { provider: "Groq", emails } : null;
}

async function providerGemini(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.geminiApiKey) return null;
  const prompt =
    target.kind === "person"
      ? `Provide likely professional emails for ${target.fullName} at ${target.firmName}. Return JSON {"emails": []}.`
      : `Provide likely public contact emails for ${target.firmName}. Return JSON {"emails": []}.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cfg.geminiApiKey}`;
  const r = await fetchJson(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    },
    cfg.timeoutMs,
  );
  if (!r.ok) return null;
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const emails = emailsFromUnknown(r.data, domainHint);
  return emails.length ? { provider: "Gemini" , emails } : null;
}

async function providerDeepSeek(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  if (!cfg.deepseekApiKey) return null;

  const prompt =
    target.kind === "person"
      ? `Provide likely professional emails for ${target.fullName} at ${target.firmName}. Return only JSON: {"emails": []}. Prefer domain ${target.firmDomain || "unknown"}.`
      : `Provide likely public contact emails for ${target.firmName}. Return only JSON: {"emails": []}. Prefer domain ${target.domain || "unknown"}.`;

  const r = await fetchJson(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${cfg.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Return only JSON with an emails array." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    },
    cfg.timeoutMs,
  );

  if (!r.ok) return null;
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const emails = emailsFromUnknown(r.data, domainHint);
  return emails.length ? { provider: "DeepSeek", emails } : null;
}

async function providerCustomWaterfall(target: Target, cfg: EnvConfig): Promise<ProviderResult | null> {
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const basePayload =
    target.kind === "person"
      ? {
          type: "person",
          full_name: target.fullName,
          first_name: target.firstName,
          last_name: target.lastName,
          firm_name: target.firmName,
          domain: target.firmDomain,
          website_url: target.websiteUrl,
          linkedin_url: target.linkedinUrl,
        }
      : {
          type: "firm",
          firm_name: target.firmName,
          domain: target.domain,
          website_url: target.websiteUrl,
          linkedin_url: target.linkedinUrl,
        };

  const ordered: ProviderCall[] = [
    { name: "Apollo", run: () => providerApollo(target, cfg) },
    { name: "People Data Labs", run: () => providerPeopleDataLabs(target, cfg) },
    { name: "Hunter", run: () => providerHunter(target, cfg) },
    {
      name: "Lusha",
      run: () => callCustomProvider(
        "Lusha",
        target.kind === "person" ? cfg.lushaPersonUrl : cfg.lushaFirmUrl,
        cfg.lushaApiKey,
        "api_key",
        basePayload,
        cfg.timeoutMs,
        domainHint,
      ),
    },
    {
      name: "Clay",
      run: () => callCustomProvider(
        "Clay",
        target.kind === "person" ? cfg.clayPersonUrl : cfg.clayFirmUrl,
        cfg.clayApiKey,
        "Authorization",
        basePayload,
        cfg.timeoutMs,
        domainHint,
      ),
    },
    { name: "Exa", run: () => providerExaSearch(target, cfg) },
    { name: "Jina", run: () => providerJinaReader(target, cfg) },
    {
      name: "Linkup",
      run: () => callCustomProvider(
        "Linkup",
        cfg.linkupSearchUrl,
        cfg.linkupApiKey,
        "Authorization",
        {
          query:
            target.kind === "person"
              ? `${target.fullName} ${target.firmName} email`
              : `${target.firmName} email contact`,
        },
        cfg.timeoutMs,
        domainHint,
      ),
    },
    {
      name: "Scrapeless",
      run: () => callCustomProvider(
        "Scrapeless",
        target.kind === "person" ? cfg.scrapelessPersonUrl : cfg.scrapelessFirmUrl,
        cfg.scrapelessApiKey,
        "Authorization",
        basePayload,
        cfg.timeoutMs,
        domainHint,
      ),
    },
    { name: "Groq", run: () => providerGroq(target, cfg) },
    { name: "Gemini", run: () => providerGemini(target, cfg) },
    { name: "DeepSeek", run: () => providerDeepSeek(target, cfg) },
    { name: "Tavily", run: () => providerTavilySearch(target, cfg) },
  ];

  for (const call of ordered) {
    try {
      const result = await call.run();
      if (result?.emails.length) return result;
    } catch {
      // Continue waterfall when a provider is unavailable or errors.
    }
  }

  return null;
}

async function collectProviderResults(target: Target, cfg: EnvConfig): Promise<ProviderResult[]> {
  const domainHint = target.kind === "person" ? target.firmDomain : target.domain;
  const basePayload =
    target.kind === "person"
      ? {
          type: "person",
          full_name: target.fullName,
          first_name: target.firstName,
          last_name: target.lastName,
          firm_name: target.firmName,
          domain: target.firmDomain,
          website_url: target.websiteUrl,
          linkedin_url: target.linkedinUrl,
        }
      : {
          type: "firm",
          firm_name: target.firmName,
          domain: target.domain,
          website_url: target.websiteUrl,
          linkedin_url: target.linkedinUrl,
        };

  const ordered: ProviderCall[] = [
    { name: "Apollo", run: () => providerApollo(target, cfg) },
    { name: "People Data Labs", run: () => providerPeopleDataLabs(target, cfg) },
    { name: "Hunter", run: () => providerHunter(target, cfg) },
    {
      name: "Lusha",
      run: () => callCustomProvider(
        "Lusha",
        target.kind === "person" ? cfg.lushaPersonUrl : cfg.lushaFirmUrl,
        cfg.lushaApiKey,
        "api_key",
        basePayload,
        cfg.timeoutMs,
        domainHint,
      ),
    },
    {
      name: "Clay",
      run: () => callCustomProvider(
        "Clay",
        target.kind === "person" ? cfg.clayPersonUrl : cfg.clayFirmUrl,
        cfg.clayApiKey,
        "Authorization",
        basePayload,
        cfg.timeoutMs,
        domainHint,
      ),
    },
    { name: "Exa", run: () => providerExaSearch(target, cfg) },
    { name: "Jina", run: () => providerJinaReader(target, cfg) },
    {
      name: "Linkup",
      run: () => callCustomProvider(
        "Linkup",
        cfg.linkupSearchUrl,
        cfg.linkupApiKey,
        "Authorization",
        {
          query:
            target.kind === "person"
              ? `${target.fullName} ${target.firmName} email`
              : `${target.firmName} email contact`,
        },
        cfg.timeoutMs,
        domainHint,
      ),
    },
    {
      name: "Scrapeless",
      run: () => callCustomProvider(
        "Scrapeless",
        target.kind === "person" ? cfg.scrapelessPersonUrl : cfg.scrapelessFirmUrl,
        cfg.scrapelessApiKey,
        "Authorization",
        basePayload,
        cfg.timeoutMs,
        domainHint,
      ),
    },
    { name: "Groq", run: () => providerGroq(target, cfg) },
    { name: "Gemini", run: () => providerGemini(target, cfg) },
    { name: "DeepSeek", run: () => providerDeepSeek(target, cfg) },
    { name: "Tavily", run: () => providerTavilySearch(target, cfg) },
  ];

  const out: ProviderResult[] = [];
  for (const call of ordered) {
    try {
      const result = await call.run();
      if (result?.emails.length) out.push(result);
    } catch {
      // ignore provider failure in waterfall mode
    }
  }

  return out;
}

async function backfillPeople(prisma: PrismaClient, cfg: EnvConfig, batch: BatchState) {
  const where: Prisma.VCPersonWhereInput = {
    deleted_at: null,
    OR: [{ email: null }, { email: "" }],
    ...(cfg.sourceFilter ? { data_source: cfg.sourceFilter } : {}),
  };

  const rows = await prisma.vCPerson.findMany({
    where,
    include: {
      firm: {
        select: {
          firm_name: true,
          website_url: true,
          linkedin_url: true,
        },
      },
    },
    take: cfg.maxPeople,
    orderBy: { id: "asc" },
  });

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const target: PersonTarget = {
      kind: "person",
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: `${row.first_name} ${row.last_name}`.trim(),
      firmName: row.firm.firm_name,
      firmDomain: sanitizeDomain(row.firm.website_url),
      websiteUrl: row.website_url,
      linkedinUrl: row.linkedin_url,
    };

    const providerResults = await collectProviderResults(target, cfg);
    if (!providerResults.length) {
      skipped++;
      if (cfg.delayMs > 0) await sleep(cfg.delayMs);
      continue;
    }

    const evaluated = evaluateCandidates(target, providerResults, batch, cfg);
    if (cfg.dryRun) printDryRunRows(target, evaluated.evaluations, evaluated.chosen || null);
    if (!evaluated.chosen) {
      skipped++;
      if (cfg.delayMs > 0) await sleep(cfg.delayMs);
      continue;
    }

    const best = evaluated.chosen.email;

    try {
      const gravatarProfile = await fetchGravatarProfile(best, cfg.timeoutMs);
      const nextAvatarUrl =
        row.avatar_url?.trim() ||
        gravatarProfile?.avatarUrl ||
        gravatarProfile?.thumbnailUrl ||
        null;

      if (!cfg.dryRun) {
        await prisma.vCPerson.update({
          where: { id: row.id },
          data: {
            email: best,
            avatar_url: nextAvatarUrl,
          },
        });
      }
      updated++;
      console.log(
        `person ✓ ${target.fullName} (${target.firmName}) -> ${best}${
          nextAvatarUrl && !row.avatar_url?.trim() ? " + gravatar_photo" : ""
        } [${evaluated.chosen.provider}] score=${evaluated.chosen.score} reason=${evaluated.chosen.decisionReason}`,
      );
    } catch {
      failed++;
      console.log(`person ✗ ${target.fullName} (${target.firmName}) failed write`);
    }

    if (cfg.delayMs > 0) await sleep(cfg.delayMs);
  }

  return { total: rows.length, updated, failed, skipped };
}

async function backfillFirms(prisma: PrismaClient, cfg: EnvConfig, batch: BatchState) {
  const where: Prisma.VCFirmWhereInput = {
    deleted_at: null,
    OR: [{ email: null }, { email: "" }],
    ...(cfg.sourceFilter ? { people: { some: { data_source: cfg.sourceFilter } } } : {}),
  };

  const rows = await prisma.vCFirm.findMany({
    where,
    select: {
      id: true,
      firm_name: true,
      website_url: true,
      linkedin_url: true,
    },
    take: cfg.maxFirms,
    orderBy: { id: "asc" },
  });

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const target: FirmTarget = {
      kind: "firm",
      id: row.id,
      firmName: row.firm_name,
      domain: sanitizeDomain(row.website_url),
      websiteUrl: row.website_url,
      linkedinUrl: row.linkedin_url,
    };

    const providerResults = await collectProviderResults(target, cfg);
    if (!providerResults.length) {
      skipped++;
      if (cfg.delayMs > 0) await sleep(cfg.delayMs);
      continue;
    }

    const evaluated = evaluateCandidates(target, providerResults, batch, cfg);
    if (cfg.dryRun) printDryRunRows(target, evaluated.evaluations, evaluated.chosen || null);
    if (!evaluated.chosen) {
      skipped++;
      if (cfg.delayMs > 0) await sleep(cfg.delayMs);
      continue;
    }

    const best = evaluated.chosen.email;

    try {
      if (!cfg.dryRun) {
        await prisma.vCFirm.update({ where: { id: row.id }, data: { email: best } });
      }
      updated++;
      console.log(`firm   ✓ ${target.firmName} -> ${best} [${evaluated.chosen.provider}] score=${evaluated.chosen.score} reason=${evaluated.chosen.decisionReason}`);
    } catch {
      failed++;
      console.log(`firm   ✗ ${target.firmName} failed write`);
    }

    if (cfg.delayMs > 0) await sleep(cfg.delayMs);
  }

  return { total: rows.length, updated, failed, skipped };
}

async function main() {
  const cwd = process.cwd();
  const envPath = join(cwd, ".env");
  const envLocalPath = join(cwd, ".env.local");

  console.log(`[env-debug] cwd=${cwd}`);
  console.log(`[env-debug] attempting env files: ${envPath}, ${envLocalPath}`);
  console.log(`[env-debug] exists .env=${existsSync(envPath)}`);
  console.log(`[env-debug] exists .env.local=${existsSync(envLocalPath)}`);

  const envEntries = parseEnvKeys(envPath);
  const envLocalEntries = parseEnvKeys(envLocalPath);
  const envLoadedCount = countKeysLoadedFromFile(envEntries);
  const envLocalLoadedCount = countKeysLoadedFromFile(envLocalEntries);
  console.log(`[env-debug] .env keys parseable=${envEntries.length}, will_load=${envLoadedCount}`);
  console.log(`[env-debug] .env.local keys parseable=${envLocalEntries.length}, will_load=${envLocalLoadedCount}`);
  console.log("[env-debug] override policy: existing non-empty process.env values are NOT overridden");

  loadEnvFiles();
  printProviderPresenceBooleans();
  validateEnvLocalFormat(envLocalPath);
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const cfg = getConfig();
  const prisma = new PrismaClient();
  try {
    console.log("Starting email enrichment waterfall...");
    console.log(
      `Config: people=${cfg.maxPeople}, firms=${cfg.maxFirms}, delayMs=${cfg.delayMs}, timeoutMs=${cfg.timeoutMs}, dryRun=${cfg.dryRun}`,
    );
    const providers = configuredProviders(cfg);
    console.log(`Active providers: ${providers.length ? providers.join(", ") : "none"}`);

    if (providers.length === 0) {
      console.error(
        "\nERROR: No provider API keys are configured. Add at least one key to .env.local\n" +
        "  e.g.  TAVILY_API_KEY=tvly-xxxx\n" +
        "Then rerun the script."
      );
      process.exit(1);
    }

    const batch: BatchState = { chosenEmailToOrg: new Map() };
    if (cfg.dryRun) {
      console.log("dryrun | kind | target | candidate_email | provider | score | validation | domain_match | chosen_vs_rejected | reason");
    }

    const peopleStats = await backfillPeople(prisma, cfg, batch);
    const firmStats = await backfillFirms(prisma, cfg, batch);

    console.log("\nDone.");
    console.log(
      `People: total=${peopleStats.total}, updated=${peopleStats.updated}, skipped=${peopleStats.skipped}, failed=${peopleStats.failed}`,
    );
    console.log(
      `Firms: total=${firmStats.total}, updated=${firmStats.updated}, skipped=${firmStats.skipped}, failed=${firmStats.failed}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

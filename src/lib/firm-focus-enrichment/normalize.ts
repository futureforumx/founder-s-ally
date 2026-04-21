import { canonicalizeStages, STAGE_DISPLAY } from "../../backfill/parsers/stage-parser";
import type { UnderrepresentedFoundersFocus } from "./types";

const STAGE_REGEXES: Array<{ canon: string; rx: RegExp }> = [
  { canon: "pre_seed", rx: /\bpre[\s-]?seed\b/i },
  { canon: "seed", rx: /\bseed\b/i },
  { canon: "series_a", rx: /\bseries[\s-]?a\b/i },
  { canon: "series_b", rx: /\bseries[\s-]?b\b/i },
  { canon: "series_c", rx: /\bseries[\s-]?c\b/i },
  { canon: "growth", rx: /\b(growth|late[\s-]?stage|pre[\s-]?ipo)\b/i },
  { canon: "early_stage", rx: /\bearly[\s-]?stage\b/i },
  { canon: "multi_stage", rx: /\bmulti[\s-]?stage\b/i },
];

const SECTOR_RULES: Array<{ canon: string; rx: RegExp }> = [
  { canon: "ai", rx: /\b(ai|artificial intelligence|machine learning|ml)\b/i },
  { canon: "fintech", rx: /\bfintech|financial technology|payments|banking\b/i },
  { canon: "healthcare", rx: /\bhealth(?:care|tech)?|digital health|medtech|medical\b/i },
  { canon: "enterprise_software", rx: /\benterprise software|b2b software|saas|workflow\b/i },
  { canon: "consumer", rx: /\bconsumer|marketplace|d2c|prosumer\b/i },
  { canon: "climate", rx: /\bclimate|decarboni[sz]ation|sustainab(?:le|ility)|energy transition\b/i },
  { canon: "developer_tools", rx: /\bdeveloper tools|devtools|developer infrastructure|infra(?:structure)?\b/i },
  { canon: "future_of_work", rx: /\bfuture of work|workforce|productivity\b/i },
  { canon: "cybersecurity", rx: /\bcyber(?:security)?|security software|identity\b/i },
  { canon: "supply_chain", rx: /\bsupply chain|logistics|procurement\b/i },
  { canon: "climate", rx: /\bcarbon|industrial climate\b/i },
  { canon: "defense", rx: /\bdefen[cs]e|national security|dual[- ]use\b/i },
  { canon: "industrial", rx: /\bindustrial|manufacturing|robotics\b/i },
  { canon: "bio", rx: /\bbiotech|bio\b/i },
];

const THEME_RULES: Array<{ canon: string; rx: RegExp }> = [
  { canon: "agentic_ai", rx: /\bagentic ai|agents?\b/i },
  { canon: "vertical_ai", rx: /\bvertical ai\b/i },
  { canon: "enterprise_ai", rx: /\benterprise ai\b/i },
  { canon: "workflow_automation", rx: /\bworkflow automation|automation\b/i },
  { canon: "healthcare_systems", rx: /\bhealthcare systems|provider systems|payer systems\b/i },
  { canon: "enterprise_productivity", rx: /\benterprise productivity|future of work|productivity\b/i },
  { canon: "underrepresented_founders", rx: /\bunderrepresented founders?|diverse founders?|women founders?|black founders?|latinx founders?\b/i },
  { canon: "medical_devices", rx: /\bmedical devices?\b/i },
  { canon: "ai_enabled_devices", rx: /\bai[- ]enabled devices?\b/i },
  { canon: "supply_chain", rx: /\bsupply chain\b/i },
  { canon: "future_of_work", rx: /\bfuture of work\b/i },
  { canon: "consumer_apps", rx: /\bconsumer apps?\b/i },
  { canon: "human_centric_apps", rx: /\bhuman[- ]centric apps?\b/i },
  { canon: "health_wellness", rx: /\bwellness\b/i },
];

const GEO_RULES: Array<{ canon: string; rx: RegExp }> = [
  { canon: "us", rx: /\b(u\.?s\.?a?\.?|united states|american)\b/i },
  { canon: "north_america", rx: /\bnorth america\b/i },
  { canon: "europe", rx: /\beurope|european\b/i },
  { canon: "uk", rx: /\bu\.?k\.?|united kingdom|britain|british\b/i },
  { canon: "latam", rx: /\blatam|latin america\b/i },
  { canon: "india", rx: /\bindia|indian\b/i },
  { canon: "mena", rx: /\bmena|middle east|north africa\b/i },
  { canon: "southeast_asia", rx: /\bsoutheast asia|sea\b/i },
  { canon: "global", rx: /\bglobal|worldwide|international\b/i },
  { canon: "remote_first", rx: /\bremote[- ]first\b/i },
];

const FUND_ORDINALS: Record<string, string> = {
  first: "I",
  second: "II",
  third: "III",
  fourth: "IV",
  fifth: "V",
  sixth: "VI",
  seventh: "VII",
  eighth: "VIII",
  ninth: "IX",
  tenth: "X",
};

export function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function uniqDisplay(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function normalizeStageFocus(text: string): string[] {
  const out = new Set<string>();
  for (const rule of STAGE_REGEXES) {
    if (rule.rx.test(text)) out.add(rule.canon);
  }
  const detailed = [...out].filter((value) =>
    ["pre_seed", "seed", "series_a", "series_b", "series_c", "growth"].includes(value),
  );
  if (detailed.length >= 3) out.add("multi_stage");
  if (detailed.some((value) => ["pre_seed", "seed", "series_a"].includes(value))) out.add("early_stage");
  return [...out];
}

export function toFirmRecordStageFocus(canonical: string[]): string[] {
  const displayStages = canonical
    .filter((value) => ["pre_seed", "seed", "series_a", "series_b", "series_c", "growth"].includes(value))
    .map((value) => {
      const mapped = canonicalizeStages([value.replace(/_/g, " ")]);
      if (!mapped.length) {
        if (value === "pre_seed") return "Pre-Seed";
        if (value === "seed") return "Seed";
        if (value === "series_a") return "Series A";
        if (value === "series_b" || value === "series_c") return "Series B+";
        if (value === "growth") return "Growth";
      }
      return STAGE_DISPLAY[mapped[0]];
    })
    .filter(Boolean) as string[];

  return uniqDisplay(displayStages);
}

export function normalizeSectorFocus(text: string): string[] {
  return uniq(SECTOR_RULES.filter((rule) => rule.rx.test(text)).map((rule) => rule.canon));
}

export function normalizeThemes(text: string): string[] {
  return uniq(THEME_RULES.filter((rule) => rule.rx.test(text)).map((rule) => rule.canon));
}

export function normalizeGeoFocus(text: string): string[] {
  return uniq(GEO_RULES.filter((rule) => rule.rx.test(text)).map((rule) => rule.canon));
}

export function parseMoneyToUsd(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "").trim();
  const match = normalized.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*([mbk]|bn|billion|million|thousand)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "b" || unit === "bn" || unit === "billion") return Math.round(amount * 1_000_000_000);
  if (unit === "m" || unit === "million") return Math.round(amount * 1_000_000);
  if (unit === "k" || unit === "thousand") return Math.round(amount * 1_000);
  return Math.round(amount);
}

export function detectUnderrepresentedFoundersFocus(text: string): UnderrepresentedFoundersFocus {
  const lowered = text.toLowerCase();
  const match = lowered.match(
    /\b(underrepresented founders?|diverse founders?|women founders?|black founders?|latinx founders?|underserved founders?)\b/i,
  );
  if (!match) {
    return { value: null, label: null, rationale: null };
  }
  return {
    value: true,
    label: match[1],
    rationale: `Detected explicit focus language: ${match[1]}`,
  };
}

export function inferFundNameFromText(firmName: string, text: string): string | null {
  const explicitMatch = text.match(
    /\b([A-Z][A-Za-z0-9&+\-]*(?:\s+[A-Z][A-Za-z0-9&+\-]*)*\s+(?:Fund|Leaders|Growth|Opportunities|Futures)\s+[IVXLCM0-9]+)\b/,
  );
  if (explicitMatch?.[1]) return explicitMatch[1].trim();

  const ordinalMatch = text.match(/\b(?:close[sd]?|announc(?:ed|es|ing)|launch(?:ed|es|ing)|raised?)\s+(?:its\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+fund\b/i);
  if (ordinalMatch?.[1]) {
    const roman = FUND_ORDINALS[ordinalMatch[1].toLowerCase()];
    if (roman) return `${firmName} Fund ${roman}`;
  }

  const namedOrdinalMatch = text.match(/\b(?:Fund|Leaders|Growth|Futures)\s+([IVXLCM0-9]+)\b/);
  if (namedOrdinalMatch?.[1]) {
    return `${firmName} ${text.includes("Leaders") ? "Leaders" : "Fund"} ${namedOrdinalMatch[1]}`.trim();
  }

  return null;
}

export function normalizeDateString(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

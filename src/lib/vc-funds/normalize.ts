import type { ExtractedFundAnnouncement, VcFundStatus } from "./types";

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
  XV: 15,
  XVI: 16,
  XVII: 17,
  XVIII: 18,
  XIX: 19,
  XX: 20,
};

const FUND_TYPE_KEYWORDS: Array<{ type: string; pattern: RegExp }> = [
  { type: "opportunity", pattern: /\bopportunity\b/i },
  { type: "growth", pattern: /\bgrowth\b/i },
  { type: "seed", pattern: /\bseed\b/i },
  { type: "scout", pattern: /\bscout\b/i },
  { type: "rolling", pattern: /\brolling\b/i },
  { type: "micro-fund", pattern: /\bmicro\b|\bmicro[- ]fund\b/i },
  { type: "venture", pattern: /\bventure\b|\bfund\b/i },
];

const LEGAL_SUFFIX_RE =
  /\b(l\.?p\.?|llc|llp|inc\.?|ltd\.?|corp\.?|plc|gmbh|sarl|fund,?\s*l\.?p\.?)\b/gi;
const BRAND_STOPWORD_RE =
  /\b(ventures?|venture|capital|partners?|partner|vc|seed|fund|group|holdings?|management|investments?)\b/gi;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeFirmName(raw: string): string {
  return normalizeWhitespace(
    raw
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " "),
  );
}

export function normalizeFundName(raw: string): string {
  const upper = raw.toUpperCase();
  const romanPattern = Object.keys(ROMAN_VALUES)
    .sort((a, b) => b.length - a.length)
    .join("|");

  return normalizeWhitespace(
    upper
      .replace(new RegExp(`\\b(${romanPattern})\\b`, "g"), (match) => String(ROMAN_VALUES[match] ?? match))
      .toLowerCase()
      .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
      .replace(LEGAL_SUFFIX_RE, " ")
      .replace(/\bfund\s+(\d+)/g, "$1")
      .replace(/\bvehicle\b/g, "fund")
      .replace(/[^a-z0-9\s]/g, " "),
  );
}

export function normalizeBrandCore(raw: string): string {
  return normalizeWhitespace(
    normalizeFirmName(raw)
      .replace(BRAND_STOPWORD_RE, " ")
      .replace(/\b(the|and)\b/g, " "),
  );
}

export function extractFundSequenceNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = normalizeFundName(raw);
  const matches = Array.from(normalized.matchAll(/\b(\d+)\b/g));
  if (matches.length === 0) return null;
  const candidate = Number(matches[matches.length - 1][1]);
  return Number.isFinite(candidate) && candidate >= 1 && candidate <= 50 ? candidate : null;
}

export function inferFundType(input: Pick<ExtractedFundAnnouncement, "fundType" | "fundName" | "fundLabel" | "rawText">): string | null {
  const text = [input.fundType, input.fundName, input.fundLabel, input.rawText].filter(Boolean).join(" ");
  if (!text) return null;
  for (const entry of FUND_TYPE_KEYWORDS) {
    if (entry.pattern.test(text)) return entry.type;
  }
  return null;
}

export function inferFundStatus(input: Pick<ExtractedFundAnnouncement, "closeDate" | "targetSizeUsd" | "finalSizeUsd" | "rawText">): VcFundStatus {
  const text = (input.rawText || "").toLowerCase();
  if (input.closeDate || /\bfinal close\b|\bclosed\b/.test(text)) return "final_close";
  if (/\bfirst close\b/.test(text)) return "first_close";
  if (input.finalSizeUsd != null) return "final_close";
  if (input.targetSizeUsd != null || /\btarget\b/.test(text)) return "target";
  if (/\bactive\b|\bdeploy/i.test(text)) return "inferred_active";
  return "announced";
}

export function buildFundNormalizedKey(args: {
  firmRecordId: string;
  fundName: string;
  vintageYear?: number | null;
}): string {
  const suffix = args.vintageYear ? String(args.vintageYear) : "unknown";
  return `${args.firmRecordId}:${normalizeFundName(args.fundName)}:${suffix}`;
}

export function contentHash(parts: Array<string | number | null | undefined>): string {
  const raw = parts.map((part) => (part == null ? "" : String(part))).join("|");
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) | 0;
  }
  return `h${Math.abs(hash)}`;
}

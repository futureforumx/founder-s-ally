import type { IntelligenceCategory, NormalizedItem } from "./types.ts";

const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "to", "in", "on", "at", "by", "with", "from", "raises",
  "announces", "launch", "launches", "new", "series",
]);

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeText(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
}

export function normalizeRawToItem(input: {
  title: string;
  excerpt?: string | null;
  body?: string | null;
  sourceUrl?: string | null;
  publishedAt?: string | null;
}): NormalizedItem {
  const blob = [input.title, input.excerpt, input.body].filter(Boolean).join(" ");
  const { category, eventType } = classifyFromText(blob);
  const hints = extractCapitalizedPhrases(input.title + " " + (input.excerpt || ""));
  return {
    title: input.title.trim(),
    summary: (input.excerpt || input.body || input.title).trim().slice(0, 400),
    sourceUrl: input.sourceUrl ?? null,
    publishedAt: input.publishedAt ?? null,
    entityHints: hints,
    likelyCategory: category,
    likelyEventType: eventType,
  };
}

function extractCapitalizedPhrases(text: string): string[] {
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1].length > 2) out.push(m[1]);
  }
  return [...new Set(out)].slice(0, 8);
}

/** Rule-based classification — extend KEYWORD_RULES for new patterns. */
const KEYWORD_RULES: {
  patterns: RegExp[];
  eventType: string;
  category: IntelligenceCategory;
}[] = [
  { patterns: [/fund\s+v\b/i, /closes?\s+\$?\d/i, /final close/i], eventType: "new_fund_closed", category: "investors" },
  { patterns: [/partner\b.*join/i, /joins?\s+.*as\s+partner/i], eventType: "partner_joined_firm", category: "investors" },
  { patterns: [/seed\b/i, /series\s+[a-z]\b/i, /raises?\s+\$?\d/i, /funding/i], eventType: "funding_round_announced", category: "investors" },
  { patterns: [/acqui/i, /to acquire/i], eventType: "acquisition_announced", category: "market" },
  { patterns: [/layoff/i, /workforce reduction/i], eventType: "layoffs_announced", category: "market" },
  { patterns: [/price|pricing|per seat|per user/i], eventType: "pricing_changed", category: "market" },
  { patterns: [/open source|open-source|github\.com/i], eventType: "open_source_release", category: "tech" },
  { patterns: [/outage|incident|sev-?\d/i], eventType: "outage_reported", category: "tech" },
  { patterns: [/api\b|model release|frontier model/i], eventType: "product_launched", category: "tech" },
  { patterns: [/regulation|sec\b|eu ai act|policy/i], eventType: "regulatory_update", category: "regulatory" },
  { patterns: [/vp\b|cto|cfo|chief|president|departs?|steps?\s+down/i], eventType: "executive_departed", category: "network" },
  { patterns: [/stealth/i], eventType: "stealth_company_detected", category: "network" },
  { patterns: [/partnership|teams?\s+up|integrates?\s+with/i], eventType: "partnership_announced", category: "market" },
];

export function classifyFromText(text: string): { category: IntelligenceCategory; eventType: string } {
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { category: rule.category, eventType: rule.eventType };
    }
  }
  return { category: "market", eventType: "product_launched" };
}

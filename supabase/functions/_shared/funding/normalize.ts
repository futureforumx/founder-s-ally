/**
 * Normalization utilities for the funding-ingestion pipeline.
 * All functions are pure (no I/O) and deterministic.
 */

import type { RoundTypeNormalized } from "./types.ts";

// ── Company name normalization ────────────────────────────────────────────────

const COMPANY_SUFFIXES = /\b(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|incorporated|technologies|technology|tech|group|labs|lab|ai|platform|platforms|solutions|services|software|systems|studio|studios|media|digital|ventures|capital|global|international|holdings|partners|consulting)\b\.?$/gi;

/**
 * Normalize a company name for deduplication matching.
 * Returns lowercase, stripped of legal suffixes and punctuation.
 */
export function normalizeCompanyName(raw: string | null): string {
  if (!raw || !raw.trim()) return "";
  return raw
    .trim()
    .replace(/\s+/g, " ")
    // Remove common suffixes
    .replace(COMPANY_SUFFIXES, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

// ── Investor name normalization ──────────────────────────────────────────────

const INVESTOR_SUFFIXES = /\b(capital|ventures|vc|fund|partners|investments|management|asset|growth|equity|advisors|inc\.?|llc\.?|ltd\.?)\.?$/gi;

export function normalizeInvestorName(raw: string | null): string {
  if (!raw || !raw.trim()) return "";
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(INVESTOR_SUFFIXES, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// ── Round type normalization ──────────────────────────────────────────────────

const ROUND_MAP: Array<[RegExp, RoundTypeNormalized]> = [
  [/pre[\s-]?seed/i,                       "pre_seed"],
  [/seed\+|seed\s*extension/i,             "seed"],
  [/\bseed\b/i,                            "seed"],
  [/series\s*[Aa][\+]?/i,                  "series_a"],
  [/series\s*[Bb][\+]?/i,                  "series_b"],
  [/series\s*[Cc][\+]?/i,                  "series_c"],
  [/series\s*[Dd][\+]?/i,                  "series_d"],
  [/series\s*[Ee][\+]?/i,                  "series_e"],
  [/series\s*[F-Zf-z][\+]?/i,             "growth"],
  [/growth\s*(equity|round|stage)?/i,      "growth"],
  [/late[\s-]stage/i,                      "growth"],
  [/venture\s*round/i,                     "unknown"],
  [/strategic\s*(investment|round)?/i,     "strategic"],
  [/debt|note|convertible|safe\b|mezzanine|revenue[\s-]based/i, "debt"],
  [/grant|award/i,                         "grant"],
  [/angel/i,                               "pre_seed"],
  [/ipo|public/i,                          "other"],
  [/acquisition|acqui-?hire/i,             "other"],
];

export function normalizeRoundType(raw: string | null): RoundTypeNormalized {
  if (!raw || !raw.trim()) return "unknown";
  for (const [re, norm] of ROUND_MAP) {
    if (re.test(raw)) return norm;
  }
  return "unknown";
}

// ── Amount parsing ────────────────────────────────────────────────────────────

/**
 * Parse a free-text amount string (e.g. "$50M", "€10 million", "undisclosed")
 * into minor units (cents / 100-units) and currency.
 * Returns null if amount is undisclosed or unparseable.
 */
export function parseAmount(
  raw: string | null
): { minor_units: number | null; currency: string } {
  if (!raw || !raw.trim()) return { minor_units: null, currency: "USD" };
  const s = raw.trim().toLowerCase();
  if (/undisclosed|not disclosed|tbd|n\/a|unknown/i.test(s)) {
    return { minor_units: null, currency: "USD" };
  }

  const currencyMap: Record<string, string> = {
    "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY",
    "cad": "CAD", "aud": "AUD", "sgd": "SGD", "inr": "INR",
  };

  let currency = "USD";
  for (const [sym, code] of Object.entries(currencyMap)) {
    if (s.includes(sym)) {
      currency = code;
      break;
    }
  }

  // Extract numeric part
  const numMatch = s.match(/([\d,]+\.?\d*)\s*([kmb](?:illion)?)?/i);
  if (!numMatch) return { minor_units: null, currency };

  let value = parseFloat(numMatch[1].replace(/,/g, ""));
  if (isNaN(value)) return { minor_units: null, currency };

  const multiplierStr = (numMatch[2] || "").toLowerCase();
  if (multiplierStr.startsWith("b")) value *= 1_000_000_000;
  else if (multiplierStr.startsWith("m")) value *= 1_000_000;
  else if (multiplierStr.startsWith("k")) value *= 1_000;

  // Store as minor units (cents × 100 means dollars × 100 for USD)
  // Convention: amount_minor_units = whole currency × 100 (i.e. cents)
  const minor_units = Math.round(value * 100);
  return { minor_units, currency };
}

// ── Date normalization ────────────────────────────────────────────────────────

/**
 * Normalize various date formats to ISO YYYY-MM-DD.
 * Returns null if unparseable.
 */
export function normalizeDate(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // fall through
  }
  return null;
}

// ── Domain extraction ─────────────────────────────────────────────────────────

export function extractDomain(website: string | null): string | null {
  if (!website || !website.trim()) return null;
  try {
    const url = new URL(
      website.startsWith("http") ? website : `https://${website}`
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ── Sector normalization ──────────────────────────────────────────────────────

const SECTOR_MAP: Array<[RegExp, string]> = [
  [/fintech|payments?|banking|finance|financial|lending|insurtech|wealthtech|defi|crypto|blockchain/i, "fintech"],
  [/health|medtech|biotech|pharma|clinical|therapeutics|genomics|digital health/i, "healthtech"],
  [/saas|b2b\s*software|enterprise software|vertical saas/i, "saas"],
  [/ai\s*\/?\s*ml|artificial intelligence|machine learning|deep learning|llm|generative/i, "ai_ml"],
  [/climate|cleantech|sustainability|green|renewable|carbon|energy/i, "climatetech"],
  [/proptech|real estate|realty/i, "proptech"],
  [/edtech|education|learning/i, "edtech"],
  [/ecommerce|e-commerce|retail tech|d2c|direct.to.consumer/i, "ecommerce"],
  [/logistics|supply chain|delivery|shipping|freight/i, "logistics"],
  [/security|cybersec|infosec|devsecops/i, "cybersecurity"],
  [/devtools|developer tools|dev.?tools|infrastructure|cloud/i, "devtools"],
  [/foodtech|food|agtech|agri|agriculture/i, "agrifood"],
  [/hrtech|hr tech|future of work|workforce|talent/i, "hrtech"],
  [/media|entertainment|creator economy|content/i, "media"],
  [/legaltech|legal|regtech|compliance/i, "legaltech"],
  [/gaming|games|metaverse|vr|ar/i, "gaming"],
  [/space|aerospace|defense/i, "deep_tech"],
  [/biotech|biology|life sciences/i, "biotech"],
];

export function normalizeSector(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  for (const [re, norm] of SECTOR_MAP) {
    if (re.test(raw)) return norm;
  }
  return raw.toLowerCase().trim().replace(/\s+/g, "_") || null;
}

// ── URL normalization ─────────────────────────────────────────────────────────

export function normalizeUrl(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    return url.toString();
  } catch {
    return s;
  }
}

// ── Dedupe key generation ─────────────────────────────────────────────────────

/**
 * Build a stable dedupe key from normalized fields.
 * Rounds announced_date down to the nearest 7-day window to absorb
 * reporting lag across sources.
 */
export function buildDedupeKey(
  normalizedCompanyName: string,
  roundTypeNormalized: string,
  announcedDate: string | null
): string {
  const company = normalizedCompanyName.trim().toLowerCase().replace(/\s+/g, "_");
  const round = (roundTypeNormalized || "unknown").toLowerCase();

  let dateWindow = "nodate";
  if (announcedDate) {
    // Snap to Monday of the week
    const d = new Date(announcedDate);
    const day = d.getUTCDay(); // 0=Sun, 1=Mon, …
    const mondayOffset = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + mondayOffset);
    dateWindow = d.toISOString().slice(0, 10);
  }

  return `${company}::${round}::${dateWindow}`;
}

// ── TechCrunch funding classifier ─────────────────────────────────────────────

const TC_FUNDING_SIGNALS = [
  /raises?\s+\$[\d,.]+/i,
  /series\s*[a-z]/i,
  /seed\s+(funding|round|capital)/i,
  /funding\s+round/i,
  /secures?\s+\$[\d,.]+/i,
  /closes?\s+\$[\d,.]+\s*(million|billion|[mb])/i,
  /venture\s+capital/i,
  /led\s+by\s+\w+\s+(capital|ventures|fund|invest)/i,
  /\$[\d,.]+[mb]\s+(seed|series|raise|round|funding)/i,
];

const TC_ANTI_SIGNALS = [
  /opinion|analysis|commentary|review|how\s+to|guide:|podcast|interview|weekly\s+recap|roundup/i,
  /layoffs?|lays?\s+off|laid\s+off/i,
  /acquisition(?!.*raises)/i,
  /ipo\s+(filing|registration)/i,
  // VC firms raising their own funds — not startup funding rounds
  /raises?\s+\$[\d,.]+\s*[mb]?\s*(?:billion|million)?\s+(?:fund|to\s+back|for\s+(?:new|its|a)\s)/i,
  /\b(?:fund\s+(?:i{1,3}|[ivx]+|[1-9]|ii?i?))\b/i,
  // Speculation / "in talks" articles — not confirmed raises
  /in\s+talks?\s+to\s+(?:raise|close|secure)/i,
];

/**
 * Classify whether a TechCrunch article is a real funding announcement.
 * Returns a confidence 0–1 and a boolean verdict.
 */
export function classifyTechCrunchArticle(
  title: string,
  snippet: string
): { isFunding: boolean; confidence: number } {
  const text = `${title} ${snippet}`;

  const antiHits = TC_ANTI_SIGNALS.filter((re) => re.test(text)).length;
  if (antiHits > 0) return { isFunding: false, confidence: 0.1 };

  const hits = TC_FUNDING_SIGNALS.filter((re) => re.test(text)).length;
  if (hits >= 3) return { isFunding: true, confidence: 0.92 };
  if (hits === 2) return { isFunding: true, confidence: 0.78 };
  if (hits === 1) return { isFunding: true, confidence: 0.55 };
  return { isFunding: false, confidence: 0.2 };
}

// ── VC Stack rumor classifier ─────────────────────────────────────────────────

export function classifyVcStackItem(
  title: string,
  snippet: string
): { isRumor: boolean; confidence: number } {
  const text = `${title} ${snippet}`.toLowerCase();
  const rumorSignals = [
    /rumou?r/i,
    /reportedly/i,
    /sources?\s+say/i,
    /unconfirmed/i,
    /may\s+(be\s+)?(raising|close)/i,
    /in\s+talks?\s+to/i,
    /looking\s+to\s+raise/i,
  ];
  const confirmedSignals = [
    /announces?/i,
    /closes?/i,
    /confirms?/i,
    /officially/i,
    /raises?\s+\$/i,
  ];

  const rumorHits = rumorSignals.filter((re) => re.test(text)).length;
  const confirmedHits = confirmedSignals.filter((re) => re.test(text)).length;

  if (confirmedHits > rumorHits) {
    return { isRumor: false, confidence: 0.75 };
  }
  if (rumorHits > 0) {
    return { isRumor: true, confidence: 0.5 + rumorHits * 0.1 };
  }
  // VC Stack is a mixed feed — default to rumor with low confidence
  return { isRumor: true, confidence: 0.45 };
}

// ── Generic HTML helpers ──────────────────────────────────────────────────────

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

export function absUrl(href: string, baseUrl: string): string {
  if (!href) return baseUrl;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

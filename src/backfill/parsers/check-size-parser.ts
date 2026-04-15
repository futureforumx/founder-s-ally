/**
 * check-size-parser.ts
 * =====================
 * Parses free-text check sizes like "$250K–$2M", "Up to $10M", "$1-5M".
 */

export interface CheckSize { min?: number; max?: number; }

const SCALES: Array<{ rx: RegExp; mult: number }> = [
  { rx: /\bbn?\b|billion/i, mult: 1_000_000_000 },
  { rx: /\bm(m|n)?\b|million/i, mult: 1_000_000 },
  { rx: /\bk\b|thousand/i, mult: 1_000 },
];

function toNumber(str: string): number | null {
  const cleaned = str.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function applyScale(str: string, value: number): number {
  for (const { rx, mult } of SCALES) if (rx.test(str)) return Math.round(value * mult);
  return Math.round(value);
}

/**
 * parseCheckSize("$250K–$2M")     → { min: 250_000, max: 2_000_000 }
 * parseCheckSize("Up to $10M")    → { max: 10_000_000 }
 * parseCheckSize("$500K")         → { min: 500_000, max: 500_000 }
 * parseCheckSize("~$1-5M")        → { min: 1_000_000, max: 5_000_000 }
 */
export function parseCheckSize(input: string | null | undefined): CheckSize {
  if (!input) return {};
  const s = input.replace(/,/g, "");

  // Range with two dollar signs: "$1M - $5M" or "$1M–$5M"
  const rangeDoubled = s.match(/\$?\s*([\d.]+)\s*([bkmn]{1,2}|billion|million|thousand)?\s*[-–—to]+\s*\$?\s*([\d.]+)\s*([bkmn]{1,2}|billion|million|thousand)?/i);
  if (rangeDoubled) {
    const [, lowNum, lowScale, highNum, highScale] = rangeDoubled;
    // If one scale missing, use the other (e.g. "$1-5M" → both million)
    const scale = highScale || lowScale || "";
    const min = applyScale((lowScale || scale), toNumber(lowNum) ?? 0);
    const max = applyScale((highScale || scale), toNumber(highNum) ?? 0);
    return { min: min || undefined, max: max || undefined };
  }

  // "Up to $10M" / "max $5M"
  const upTo = s.match(/\b(up to|max|maximum|no more than)\b[^\d]*([\d.]+)\s*([bkmn]{1,2}|billion|million|thousand)?/i);
  if (upTo) {
    const [, , num, scale] = upTo;
    const max = applyScale(scale || "", toNumber(num) ?? 0);
    return { max: max || undefined };
  }

  // "Starting at $500K" / "min $1M"
  const from = s.match(/\b(starting at|min|minimum|from)\b[^\d]*([\d.]+)\s*([bkmn]{1,2}|billion|million|thousand)?/i);
  if (from) {
    const [, , num, scale] = from;
    const min = applyScale(scale || "", toNumber(num) ?? 0);
    return { min: min || undefined };
  }

  // Single value — treat as point estimate
  const single = s.match(/\$?\s*([\d.]+)\s*([bkmn]{1,2}|billion|million|thousand)/i);
  if (single) {
    const [, num, scale] = single;
    const v = applyScale(scale, toNumber(num) ?? 0);
    if (v) return { min: v, max: v };
  }

  return {};
}

/** Format as "$250K–$2M" for UI display. */
export function formatCheckSize(size: CheckSize): string {
  const fmt = (n?: number): string => {
    if (!n || !isFinite(n)) return "";
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
  };
  if (size.min && size.max && size.min !== size.max) return `${fmt(size.min)}–${fmt(size.max)}`;
  if (size.max && !size.min) return `Up to ${fmt(size.max)}`;
  if (size.min) return fmt(size.min);
  return "";
}

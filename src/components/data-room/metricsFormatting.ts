/**
 * Shared parse/format helpers for the Data Room > Metrics fields.
 * Mirrors the "smart number" conventions used in CompanyProfile.tsx / GrowthMetrics.tsx
 * (accepts k/m/b suffixes, commas, basic math on blur) so the whole app feels consistent.
 */

export function evaluateSmartMath(input: string): number | null {
  if (!input || typeof input !== "string") return null;
  const cleanExpression = input
    .replace(/[$,kKmM]/g, (match) => {
      if (match.toLowerCase() === "k") return "*1000";
      if (match.toLowerCase() === "m") return "*1000000";
      return "";
    })
    .replace(/[^0-9.+\-*/()]/g, "");
  if (!cleanExpression) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${cleanExpression}`)();
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/** Parses "1.2m", "1,200,000", "45k", etc. into a raw number. */
export function parseSmartNumber(value: string): number {
  if (!value) return 0;
  const math = evaluateSmartMath(value);
  if (math !== null) return math;
  const cleaned = value.toString().toLowerCase().replace(/[^0-9.kmb]/g, "");
  const match = cleaned.match(/^([\d.]+)([kmb]?)$/);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === "k") num *= 1_000;
  if (suffix === "m") num *= 1_000_000;
  if (suffix === "b") num *= 1_000_000_000;
  return num;
}

export function formatWithCommas(num: number, maxFractionDigits = 0): string {
  if (isNaN(num)) return "";
  return num.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
}

/** Whole-dollar amounts (TAM/SAM/SOM, burn rate, cash on hand, etc). */
export function smartBlurCurrency(raw: string): string {
  const n = parseSmartNumber(raw);
  return n ? formatWithCommas(Math.round(n)) : "";
}

/** Percentages — keeps up to one decimal place (NRR, churn, gross margin can be fractional). */
export function smartBlurPercent(raw: string): string {
  const n = parseSmartNumber(raw);
  if (!n && n !== 0) return "";
  if (!raw) return "";
  const rounded = Math.round(n * 10) / 10;
  return formatWithCommas(rounded, 1);
}

/** Plain integers (headcount, MAU/DAU, CAC payback days). */
export function smartBlurInteger(raw: string): string {
  const n = parseSmartNumber(raw);
  return n ? formatWithCommas(Math.round(n)) : "";
}

/** Multiplier fields (burn multiple) — up to one decimal, "x" suffix added by the input UI. */
export function smartBlurMultiplier(raw: string): string {
  const cleaned = raw.replace(/x$/i, "").trim();
  const n = parseSmartNumber(cleaned);
  if (!n && n !== 0) return "";
  const rounded = Math.round(n * 10) / 10;
  return formatWithCommas(rounded, 1);
}

/** MAU -> DAU (divide by 30) and DAU -> MAU (multiply by 30). */
export function convertActiveUsers(value: string, from: "mau" | "dau", to: "mau" | "dau"): string {
  if (from === to) return value;
  const n = parseSmartNumber(value);
  if (!n) return "";
  const converted = from === "mau" ? n / 30 : n * 30;
  return formatWithCommas(Math.round(converted));
}

/** Months -> days (x30) and days -> months (/30, one decimal). */
export function convertRunway(value: string, from: "days" | "months", to: "days" | "months"): string {
  if (from === to) return value;
  const n = parseSmartNumber(value);
  if (!n) return "";
  if (from === "months" && to === "days") return formatWithCommas(Math.round(n * 30));
  const months = Math.round((n / 30) * 10) / 10;
  return formatWithCommas(months, 1);
}

/** LTV : CAC ratio, computed live from the other two fields — never stored directly. */
export function computeLtvCacRatio(ltv: string, cac: string): number | null {
  const ltvNum = parseSmartNumber(ltv);
  const cacNum = parseSmartNumber(cac);
  if (!ltvNum || !cacNum) return null;
  return ltvNum / cacNum;
}

export function formatRatio(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${(Math.round(ratio * 10) / 10).toFixed(1)}x`;
}

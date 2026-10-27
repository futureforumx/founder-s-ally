/** Display-only K/M scaling for funding-round money raised. Stored values stay whole USD. */

export type MoneyRaisedUnit = "K" | "M";

const THOUSAND = 1_000;
const MILLION = 1_000_000;
/** A million figure is "short" when it needs at most two decimal places (2.5, 1.25). */
const SHORT_MILLION_DECIMALS = 2;

export function sanitizeMoneyRaisedInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const whole = cleaned.slice(0, dot);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 4);
  return `${whole}.${fraction}`;
}

/** Full dollars for a blurred field. Empty stays empty; commas group the zeros. */
export function formatMoneyRaisedDollars(amountUsd: number | null | undefined): string {
  if (amountUsd == null || !Number.isFinite(amountUsd)) return "";
  return Math.round(amountUsd).toLocaleString("en-US");
}

export function usdFromMoneyRaisedEntry(text: string, unit: MoneyRaisedUnit): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === ".") return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const multiplier = unit === "M" ? MILLION : THOUSAND;
  return Math.round(amount * multiplier);
}

function formatScaled(amount: number, divisor: number): string {
  const scaled = Math.round((amount / divisor) * 1_000_000) / 1_000_000;
  if (!Number.isFinite(scaled)) return "";
  const [whole, fraction = ""] = Math.abs(scaled).toFixed(6).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const body = trimmed ? `${whole}.${trimmed}` : whole;
  return scaled < 0 ? `-${body}` : body;
}

function wholeDollars(amountUsd: number): number | null {
  const dollars = Math.round(amountUsd);
  return Math.abs(amountUsd - dollars) <= 0.001 ? dollars : null;
}

/** Millions stay short only when the USD amount is a multiple of 1,000 and rounds cleanly to 2 decimals. */
function isShortMillionAmount(dollars: number): boolean {
  if (dollars < MILLION || dollars % THOUSAND !== 0) return false;
  const factor = 10 ** SHORT_MILLION_DECIMALS;
  const short = Math.round((dollars / MILLION) * factor) / factor;
  return Math.abs(short * MILLION - dollars) < 0.001;
}

function coerceUsd(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function moneyRaisedEntryFromUsd(amountUsd: number | string | null | undefined): { text: string; unit: MoneyRaisedUnit } {
  const amount = coerceUsd(amountUsd);
  if (amount == null) return { text: "", unit: "M" };
  const dollars = wholeDollars(amount);
  if (dollars != null && isShortMillionAmount(dollars)) {
    return { text: formatScaled(dollars, MILLION), unit: "M" };
  }
  if (amount >= THOUSAND) {
    return { text: formatScaled(dollars ?? amount, THOUSAND), unit: "K" };
  }
  return { text: formatScaled(dollars ?? amount, 1), unit: "K" };
}

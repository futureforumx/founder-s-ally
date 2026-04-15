export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInvestorName(name: string): string {
  return normalizeCompanyName(name);
}

/** Parse strings like $45M, $1.2B, $500K, €20M → USD minor units (cents). Assumes USD if symbol $. */
export function parseMoneyToUsdMinorUnits(input: string | null | undefined): {
  amount_raw: string | null;
  amount_minor_units: bigint | null;
  currency: string;
} {
  if (!input) return { amount_raw: null, amount_minor_units: null, currency: "USD" };
  const t = input.replace(/\u00a0/g, " ").trim();
  const currency = /€|EUR/i.test(t) ? "EUR" : /£|GBP/i.test(t) ? "GBP" : "USD";
  const m = t.match(/(?:\$|€|£)?\s*([\d,.]+)\s*([KMBkmb]|million|billion)?/i);
  if (!m) return { amount_raw: t, amount_minor_units: null, currency };
  const num = parseFloat(m[1]!.replace(/,/g, ""));
  if (Number.isNaN(num)) return { amount_raw: t, amount_minor_units: null, currency };
  const suf = (m[2] ?? "").toLowerCase();
  let mult = 1;
  if (suf === "k") mult = 1_000;
  else if (suf === "m" || suf === "million") mult = 1_000_000;
  else if (suf === "b" || suf === "billion") mult = 1_000_000_000;
  const major = num * mult;
  const cents = BigInt(Math.round(major * 100));
  return { amount_raw: t, amount_minor_units: cents, currency };
}

/** Light normalization for sector tags (not a full taxonomy). */
export function normalizeSector(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length ? s.slice(0, 120) : null;
}

export function normalizeRound(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/series\s*([a-z])/i);
  if (m) return `Series ${m[1]!.toUpperCase()}`;
  if (/pre[-\s]?seed/i.test(s)) return "Pre-Seed";
  if (/seed/i.test(s) && !/series/i.test(s)) return "Seed";
  if (/bridge/i.test(s)) return "Bridge";
  if (/venture/i.test(s)) return "Venture";
  return s;
}

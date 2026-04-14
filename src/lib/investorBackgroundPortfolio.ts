import { safeTrim } from "@/lib/utils";

/** Appended to `firm_investors.background_summary` when persisting scraped portfolio lists. */
export const PORTFOLIO_COMPANIES_JSON_MARKER = "\n__VEKTA_PORTFOLIO_COMPANIES_JSON__\n";

export function splitBackgroundSummaryPortfolio(raw: string | null | undefined): {
  narrative: string | null;
  companies: string[];
} {
  const s = safeTrim(raw);
  if (!s) return { narrative: null, companies: [] };
  const idx = s.indexOf(PORTFOLIO_COMPANIES_JSON_MARKER);
  if (idx < 0) return { narrative: s, companies: [] };
  const narrative = safeTrim(s.slice(0, idx)) || null;
  const jsonPart = s.slice(idx + PORTFOLIO_COMPANIES_JSON_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && safeTrim(x))
      : [];
    return { narrative, companies: arr.map((x) => safeTrim(x)).filter(Boolean) };
  } catch {
    return { narrative: safeTrim(s.slice(0, idx)) || null, companies: [] };
  }
}

export function appendPortfolioCompaniesJson(
  narrative: string | null | undefined,
  companies: string[],
  maxLen = 8000,
): string | null {
  const clean = companies.map((c) => safeTrim(c)).filter(Boolean);
  if (!clean.length) return safeTrim(narrative) || null;
  const base = safeTrim(narrative);
  const suffix = `${PORTFOLIO_COMPANIES_JSON_MARKER}${JSON.stringify(clean)}`;
  const out = `${base}${suffix}`.trim();
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

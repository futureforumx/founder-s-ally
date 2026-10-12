import {
  BUSINESS_MODEL_OPTIONS,
  GEO_OPTIONS,
  SECTOR_OPTIONS,
  STAGE_OPTIONS,
  type TaxonomyOption,
} from "@/constants/taxonomy";

/**
 * Scores investors against the fields on the Data Room's Company Details card.
 *
 * Only three firm_records columns carry enough data to be worth scoring:
 * `thesis_verticals` (~72% populated), `stage_focus` (~97%) and `geo_focus` (~14%).
 * `business_model_focus`, `company_type_focus` and `sub_sectors` are empty across
 * the table, so monetization and customer signals are matched against
 * `thesis_verticals` too — it carries tags like "SaaS", "Marketplaces" and
 * "Enterprise" alongside sector tags.
 */

export interface FitInvestor {
  id: string;
  firm_name: string;
  logo_url: string | null;
  website_url: string | null;
  thesis_verticals: string[];
  stage_focus: string[];
  geo_focus: string[];
}

export interface CompanyFitInput {
  stage?: string | null;
  sector?: string | null;
  industry?: string | null;
  businessModel?: string[] | null;
  targetCustomer?: string[] | null;
  geo?: string | null;
}

export interface InvestorFit extends FitInvestor {
  score: number;
  reasons: string[];
}

/** Columns `rankInvestorFits` needs, for a scoped `select()`. */
export const INVESTOR_FIT_COLUMNS =
  "id,firm_name,logo_url,website_url,thesis_verticals,stage_focus,geo_focus";

const WEIGHTS = {
  industry: 30,
  sector: 25,
  stage: 20,
  monetization: 12,
  customer: 5,
  geo: 8,
} as const;

/**
 * `stage_focus` uses its own vocabulary, and the earliest rounds a founder can
 * pick don't have a one-to-one counterpart in it.
 */
const STAGE_FOCUS_EQUIVALENTS: Record<string, string[]> = {
  Accelerator: ["Friends and Family", "Pre-Seed"],
  "Pre-Seed": ["Pre-Seed", "Friends and Family"],
  Seed: ["Seed"],
  "Series A": ["Series A"],
  "Series B": ["Series B", "Series B+"],
  "Series C+": ["Series C+", "Growth"],
};

function lower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function words(value: string): string[] {
  return value.split(/[\s\-/&,]+/).filter((w) => w.length > 2);
}

/** Loose two-way containment, so "Digital Health" lines up with "digital health IT". */
function tagsOverlap(a: string, b: string): boolean {
  const x = lower(a);
  const y = lower(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  return words(x).some((w) => y.includes(w)) || words(y).some((w) => x.includes(w));
}

function optionTokens(options: TaxonomyOption[], label: string): string[] {
  const option = options.find((o) => o.label === label);
  return option ? [option.label, ...option.search_tags] : [label];
}

/** The investor vertical that best explains a match, for the reason line. */
function matchingVertical(verticals: string[], tokens: string[]): string | null {
  return verticals.find((v) => tokens.some((t) => tagsOverlap(v, t))) ?? null;
}

/** Messy free-text geography ("us", "USA", "United Kingdom") onto a GEO_OPTIONS label. */
export function normalizeGeoLabel(raw: string): string | null {
  const value = lower(raw);
  if (!value) return null;
  const match = GEO_OPTIONS.find(
    (o) => lower(o.label) === value || o.search_tags.some((t) => lower(t) === value),
  );
  if (match) return match.label;
  return (
    GEO_OPTIONS.find((o) => o.search_tags.some((t) => tagsOverlap(t, value)))?.label ?? null
  );
}

/** `stage_focus` values that should count as a match for a company's round. */
export function stageFocusFor(stage: string | null | undefined): string[] | null {
  const value = (stage ?? "").trim();
  if (!value) return null;
  return STAGE_FOCUS_EQUIVALENTS[value] ?? [value];
}

/**
 * ILIKE patterns for `match_investors_for_company`, which prefilters candidates
 * in Postgres so the client doesn't download every live firm.
 */
export function buildVerticalPatterns(company: CompanyFitInput): string[] | null {
  const tokens = new Set<string>();

  const add = (value: string) => {
    const t = lower(value);
    // One- and two-letter fragments match nearly everything.
    if (t.length > 2) tokens.add(t);
  };

  const industry = (company.industry ?? "").trim();
  if (industry) {
    add(industry);
    words(industry).forEach(add);
  }

  const sector = (company.sector ?? "").trim();
  if (sector) optionTokens(SECTOR_OPTIONS, sector).forEach(add);

  const monetization = (company.businessModel ?? []).filter(Boolean)[0];
  if (monetization) optionTokens(BUSINESS_MODEL_OPTIONS, monetization).forEach(add);

  (company.targetCustomer ?? []).filter(Boolean).forEach(add);

  if (tokens.size === 0) return null;
  return [...tokens].map((t) => `%${t}%`);
}

export function scoreInvestorFit(investor: FitInvestor, company: CompanyFitInput): InvestorFit {
  const verticals = (investor.thesis_verticals ?? []).filter(Boolean);
  const reasons: string[] = [];
  let score = 0;

  const industry = (company.industry ?? "").trim();
  if (industry) {
    const hit = matchingVertical(verticals, [industry, ...words(industry)]);
    if (hit) {
      score += WEIGHTS.industry;
      reasons.push(`Invests in ${hit}`);
    }
  }

  const sector = (company.sector ?? "").trim();
  if (sector) {
    const hit = matchingVertical(verticals, optionTokens(SECTOR_OPTIONS, sector));
    // Only credit the sector separately when it isn't just restating the industry.
    if (hit && !reasons.some((r) => r.includes(hit))) {
      score += WEIGHTS.sector;
      reasons.push(`${sector} focus`);
    }
  }

  const stage = (company.stage ?? "").trim();
  if (stage) {
    const accepted = STAGE_FOCUS_EQUIVALENTS[stage] ?? optionTokens(STAGE_OPTIONS, stage);
    const stages = (investor.stage_focus ?? []).map(String);
    if (stages.some((s) => accepted.some((a) => lower(a) === lower(s)))) {
      score += WEIGHTS.stage;
      reasons.push(`Backs ${stage}`);
    }
  }

  const monetization = (company.businessModel ?? []).filter(Boolean)[0];
  if (monetization) {
    const hit = matchingVertical(verticals, optionTokens(BUSINESS_MODEL_OPTIONS, monetization));
    if (hit && !reasons.some((r) => r.includes(hit))) {
      score += WEIGHTS.monetization;
      reasons.push(`${monetization} experience`);
    }
  }

  const customers = (company.targetCustomer ?? []).filter(Boolean);
  for (const customer of customers) {
    const hit = matchingVertical(verticals, [customer]);
    if (hit && !reasons.some((r) => r.includes(hit))) {
      score += WEIGHTS.customer;
      reasons.push(`${customer} portfolio`);
      break;
    }
  }

  const geo = (company.geo ?? "").trim();
  if (geo) {
    const investorGeos = (investor.geo_focus ?? [])
      .map((g) => normalizeGeoLabel(String(g)))
      .filter(Boolean) as string[];
    // A global mandate covers any company geography.
    if (investorGeos.includes(geo) || investorGeos.includes("Global")) {
      score += WEIGHTS.geo;
      reasons.push(investorGeos.includes(geo) ? `Active in ${geo}` : "Global mandate");
    }
  }

  return { ...investor, score: Math.min(score, 100), reasons };
}

/** True once there's enough on the profile for a ranking to mean anything. */
export function hasFitInputs(company: CompanyFitInput): boolean {
  return Boolean(
    (company.sector ?? "").trim() ||
      (company.industry ?? "").trim() ||
      (company.stage ?? "").trim(),
  );
}

export function rankInvestorFits(
  investors: FitInvestor[],
  company: CompanyFitInput,
  limit = 5,
): InvestorFit[] {
  return investors
    .map((investor) => scoreInvestorFit(investor, company))
    // A score with no reason behind it isn't a match worth showing.
    .filter((fit) => fit.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.firm_name.localeCompare(b.firm_name))
    .slice(0, limit);
}

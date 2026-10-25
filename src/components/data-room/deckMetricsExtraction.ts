/**
 * Reads Data Room > Metrics values out of the text of a deck uploaded in the Files tab.
 *
 * Two sources feed the same normalizer: regex extraction that runs in the browser as soon
 * as a PDF/TXT is parsed, and the optional `metrics` object `audit-deck` returns when an
 * AI provider is reachable. Both are merged into the saved metrics through
 * `metricsPrefillPatch`, which only ever writes fields the founder has left blank.
 */
import type { CompanyMetricsData } from "@/hooks/useCompanyMetrics";
import {
  smartBlurCurrency,
  smartBlurInteger,
  smartBlurMultiplier,
  smartBlurPercent,
} from "./metricsFormatting";

export type ExtractedMetrics = Partial<CompanyMetricsData>;

type MetricField = keyof CompanyMetricsData;
/** Every field except the free-text background and the two unit toggles. */
type NumericField = Exclude<MetricField, "background" | "activeUsersMode" | "runwayUnit">;

const FIELD_LABELS: Record<MetricField, string> = {
  headcount: "Headcount",
  background: "Background",
  tam: "TAM",
  sam: "SAM",
  som: "SOM",
  nrr: "NRR",
  activeUsers: "Active users",
  activeUsersMode: "Active users",
  churnRate: "Churn rate",
  burnMultiple: "Burn multiple",
  cac: "CAC",
  ltv: "LTV",
  cacPaybackDays: "CAC payback",
  monthlyBurnRate: "Monthly burn rate",
  runway: "Runway",
  runwayUnit: "Runway",
  grossMargin: "Gross margin",
  cashOnHand: "Cash on hand",
  totalDebt: "Total debt",
};

/**
 * Plausibility range for each field, in the unit the field is stored in. A number outside
 * its range means the regex latched onto the wrong figure (a slide number, a year, a
 * LTV:CAC ratio), so the match is discarded and the next candidate is tried.
 */
const FIELD_SPECS: Record<NumericField, { kind: "currency" | "percent" | "integer" | "multiplier"; min: number; max: number }> = {
  headcount: { kind: "integer", min: 1, max: 500_000 },
  tam: { kind: "currency", min: 100_000, max: 1e14 },
  sam: { kind: "currency", min: 10_000, max: 1e14 },
  som: { kind: "currency", min: 1_000, max: 1e14 },
  nrr: { kind: "percent", min: 1, max: 500 },
  activeUsers: { kind: "integer", min: 1, max: 5e9 },
  churnRate: { kind: "percent", min: 0, max: 100 },
  burnMultiple: { kind: "multiplier", min: 0, max: 100 },
  cac: { kind: "currency", min: 1, max: 1e8 },
  ltv: { kind: "currency", min: 1, max: 1e9 },
  cacPaybackDays: { kind: "integer", min: 1, max: 3650 },
  monthlyBurnRate: { kind: "currency", min: 1, max: 1e9 },
  runway: { kind: "integer", min: 1, max: 3650 },
  grossMargin: { kind: "percent", min: 0, max: 100 },
  cashOnHand: { kind: "currency", min: 1, max: 1e12 },
  totalDebt: { kind: "currency", min: 1, max: 1e12 },
};

/** Formats through the same helpers the Metrics inputs use on blur, so prefilled and typed values look identical. */
function formatField(field: NumericField, value: number): string {
  const spec = FIELD_SPECS[field];
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) return "";
  const raw = String(value);
  switch (spec.kind) {
    case "currency":
      return smartBlurCurrency(raw);
    case "percent":
      return smartBlurPercent(raw);
    case "multiplier":
      return smartBlurMultiplier(raw);
    default:
      return smartBlurInteger(raw);
  }
}

// ── Pattern vocabulary ──

const SCALES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
};

/** Label and value are often split by a colon, a bullet, a filler word, or a line break. */
const GAP = String.raw`[ \t]*(?:\r?\n[ \t]*)?`;
const LEAD = `(?:${GAP}(?:[:=|~>\\-\u2013\u2014\u2022\u00b7]|\\b(?:is|was|are|of|at|about|around|approx|approximately|estimated|currently|today|now|sits|stands|runs|comes|lands|averages)\\b))*${GAP}`;
/** `$12.4B`, `12.4 billion`, `1,200`, `85k`. The scale suffix never swallows the start of a following word. */
const AMOUNT = `(?<cur>\\$)?[ \\t]*(?<num>\\d[\\d,]*(?:\\.\\d+)?)(?!\\d)[ \\t]*(?<scale>(?:thousand|million|billion|trillion|mm|mn|bn|k|m|b|t)(?![a-z]))?`;
/** Percentages cap at three digits so a stray year ("2027") can never be read as a rate. */
const PERCENT = `(?<num>\\d{1,3}(?:\\.\\d+)?)(?!\\d)[ \\t]*(?<pct>%)?`;
const DURATION = `(?<num>\\d[\\d,]*(?:\\.\\d+)?)(?!\\d)${GAP}(?<unit>days?|weeks?|wks?|months?|mos?|mths?|years?|yrs?)?`;

/** `TAM: $12B` — label first. */
function after(aliases: string, value: string): string {
  return `\\b(?:${aliases})\\b${LEAD}${value}`;
}

/** `$12B TAM` — value first. */
function before(value: string, aliases: string): string {
  return `${value}${GAP}(?:\\b(?:in|of|per|total|monthly|annual)\\b${GAP})?\\b(?:${aliases})\\b`;
}

function labelled(aliases: string, value: string): string[] {
  return [after(aliases, value), before(value, aliases)];
}

function parseAmount(groups: Record<string, string | undefined> | undefined): number | null {
  const num = groups?.num;
  if (!num) return null;
  const base = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const scale = groups?.scale ? SCALES[groups.scale.toLowerCase()] ?? 1 : 1;
  return base * scale;
}

/** A figure written as `$4` or `4B` carries a magnitude; a bare `4` next to "TAM" is usually a slide reference. */
function hasMagnitude(groups: Record<string, string | undefined> | undefined): boolean {
  return Boolean(groups?.cur || groups?.scale);
}

// ── Field patterns ──

const HEADCOUNT = [
  after("headcount|head count|team size|employees|ftes?|full[- ]time employees", AMOUNT),
  `\\bteam${GAP}of\\b${GAP}${AMOUNT}`,
  before(AMOUNT, "full[- ]time employees|employees|ftes?|team members|staff"),
];
const TAM = labelled("tam|total addressable market|total market size", AMOUNT);
const SAM = labelled("sam|serviceable addressable market|serviceable available market|addressable market", AMOUNT);
const SOM = labelled("som|serviceable obtainable market|obtainable market", AMOUNT);
const NRR = labelled("nrr|ndr|net revenue retention|net dollar retention|net retention", PERCENT);
const MAU = labelled("mau|maus|monthly active users?", AMOUNT);
const DAU = labelled("dau|daus|daily active users?", AMOUNT);
const CHURN = labelled("churn rate|monthly churn|annual churn|logo churn|customer churn|churn", PERCENT);
const BURN_MULTIPLE = labelled("burn multiple", `(?<num>\\d+(?:\\.\\d+)?)(?!\\d)[ \\t]*x?`);
const CAC = labelled("cac|customer acquisition cost|cost to acquire a customer", AMOUNT);
const LTV = labelled("ltv|cltv|lifetime value|life[- ]time value|customer lifetime value", AMOUNT);
const GROSS_MARGIN = labelled("gross margins?|gross profit margins?|gm", PERCENT);
const CASH = [
  ...labelled("cash on hand|cash balance|cash reserves|cash position|cash in bank|cash in the bank|cash available", AMOUNT),
  `${AMOUNT}${GAP}\\bin${GAP}(?:the${GAP})?bank\\b`,
];
const DEBT = labelled("total debt|debt outstanding|outstanding debt|venture debt|debt facility|debt", AMOUNT);
const RUNWAY = [
  `\\brunway\\b${LEAD}${DURATION}`,
  `${DURATION}${GAP}(?:\\bof\\b${GAP})?\\brunway\\b`,
];
const CAC_PAYBACK = [
  `\\b(?:cac${GAP})?payback(?:${GAP}(?:period|time))?\\b${LEAD}${DURATION}`,
  `${DURATION}${GAP}(?:\\bto\\b${GAP})?\\bpayback\\b`,
];
const BURN_RATE = [
  `(?:(?<lead>monthly|annual|annualised|annualized|yearly)${GAP})?\\b(?:net${GAP}|gross${GAP}|cash${GAP}|operating${GAP})?burn(?:${GAP}rate)?\\b(?!${GAP}multiple)${LEAD}${AMOUNT}${GAP}(?<period>\\/${GAP}(?:months?|mos?|m|years?|yrs?|y)\\b|per${GAP}(?:month|year|mo|yr)\\b|a${GAP}(?:month|year)\\b|monthly|annually|annual)?`,
  `${AMOUNT}${GAP}(?<lead>monthly|annual|annualised|annualized|yearly|per${GAP}month|per${GAP}year|\\/${GAP}(?:mo|month|yr|year))?${GAP}(?:net${GAP}|gross${GAP}|cash${GAP})?\\bburn\\b(?!${GAP}multiple)`,
];

const TEAM_SECTION = /\b(team|founders?|leadership|who we are|advisors?)\b/i;

interface DeckSection {
  heading: string;
  body: string;
}

/**
 * Splits deck text into sections so prose can be attributed to a slide. Handles the
 * `[Slide 03]` markers from the pdf.js fallback, markdown headings from pdf-inspector,
 * and plain paragraphs from a .txt upload.
 */
function splitSections(text: string): DeckSection[] {
  const chunks = /\[slide\s+\d+/i.test(text)
    ? text.split(/\[slide\s+\d+[^\]]*\]/i)
    : /^#{1,6}\s+\S/m.test(text)
      ? text.split(/^(?=#{1,6}\s+\S)/m)
      : text.split(/\n{2,}/);

  return chunks
    .map((chunk) => {
      const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return {
        heading: (lines[0] ?? "").replace(/^#+\s*/, "").replace(/[*_`|]/g, "").trim(),
        body: lines.slice(1).join("\n"),
      };
    })
    .filter((section) => section.heading || section.body);
}

/** Strips deck/markdown furniture so the text reads as a sentence in the Background textarea. */
function cleanProse(body: string): string {
  return body
    .replace(/\|/g, " ")
    .replace(/^[\s>*\-\u2022\u00b7#]+/gm, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BACKGROUND_MAX_CHARS = 600;
/** A line that is nothing but a labelled figure, such as "Headcount: 14" or "ARR: $1.2M". */
const METRIC_LINE = /^[A-Za-z][A-Za-z \t/%&-]{0,30}:\s*[$~]?\d[\d.,]*\s*[a-z%]{0,10}$/i;

function extractBackground(text: string): string {
  for (const section of splitSections(text)) {
    if (!TEAM_SECTION.test(section.heading)) continue;
    // Figures on the team slide already have their own fields; keep the bios.
    const prose = cleanProse(
      section.body
        .split(/\r?\n/)
        .filter((line) => !METRIC_LINE.test(line.trim()))
        .join("\n"),
    );
    if (prose.length < 40) continue;
    if (prose.length <= BACKGROUND_MAX_CHARS) return prose;
    const cut = prose.slice(0, BACKGROUND_MAX_CHARS);
    return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
  }
  return "";
}

/** First match across the given patterns that parses into a plausible value for the field. */
function findAmount(
  text: string,
  field: NumericField,
  patterns: string[],
  options: { requireMagnitude?: boolean } = {},
): number | null {
  const { min, max } = FIELD_SPECS[field];
  for (const pattern of patterns) {
    for (const match of text.matchAll(new RegExp(pattern, "gi"))) {
      if (options.requireMagnitude && !hasMagnitude(match.groups)) continue;
      const value = parseAmount(match.groups);
      if (value === null || value < min || value > max) continue;
      return value;
    }
  }
  return null;
}

const DAYS_PER_UNIT: Record<string, number> = { day: 1, week: 7, month: 30, mo: 30, mth: 30, year: 365, yr: 365, wk: 7 };

function durationUnit(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/s$/, "");
  return key in DAYS_PER_UNIT ? key : null;
}

const MONTH_UNITS = ["month", "mo", "mth"];
const YEAR_UNITS = ["year", "yr"];

/** Runway is stored as a number plus its own unit toggle, so months stay months. */
function findRunway(text: string): { runway: string; runwayUnit: CompanyMetricsData["runwayUnit"] } | null {
  for (const pattern of RUNWAY) {
    for (const match of text.matchAll(new RegExp(pattern, "gi"))) {
      const value = parseAmount(match.groups);
      if (value === null) continue;
      const unit = durationUnit(match.groups?.unit);

      // Runway is quoted in months far more often than anything else, so an
      // unlabelled figure is months unless it is too large to be one.
      const months = YEAR_UNITS.includes(unit ?? "")
        ? value * 12
        : (unit === null && value <= 120) || MONTH_UNITS.includes(unit ?? "")
          ? value
          : null;

      const amount = months ?? value * DAYS_PER_UNIT[unit ?? "day"];
      const formatted = formatField("runway", amount);
      if (formatted) return { runway: formatted, runwayUnit: months === null ? "days" : "months" };
    }
  }
  return null;
}

/** CAC payback is stored in days, however the deck phrased it. */
function findCacPaybackDays(text: string): number | null {
  for (const pattern of CAC_PAYBACK) {
    for (const match of text.matchAll(new RegExp(pattern, "gi"))) {
      const value = parseAmount(match.groups);
      if (value === null) continue;
      const unit = durationUnit(match.groups?.unit);
      // Payback is usually quoted in months; a bare number large enough to be a
      // day count is treated as one.
      const days = unit ? value * DAYS_PER_UNIT[unit] : value <= 36 ? value * 30 : value;
      const { min, max } = FIELD_SPECS.cacPaybackDays;
      if (days < min || days > max) continue;
      return Math.round(days);
    }
  }
  return null;
}

/** Burn is normalised to a monthly figure; an annual number is divided back down. */
function findMonthlyBurn(text: string): number | null {
  const { min, max } = FIELD_SPECS.monthlyBurnRate;
  for (const pattern of BURN_RATE) {
    for (const match of text.matchAll(new RegExp(pattern, "gi"))) {
      if (!hasMagnitude(match.groups)) continue;
      const value = parseAmount(match.groups);
      if (value === null) continue;
      const period = `${match.groups?.lead ?? ""} ${match.groups?.period ?? ""}`;
      const monthly = /ann|year|yr|\/\s*y/i.test(period) ? value / 12 : value;
      if (monthly < min || monthly > max) continue;
      return monthly;
    }
  }
  return null;
}

/** Pulls every metric the deck states outright. Anything ambiguous is left out. */
export function extractMetricsFromDeckText(deckText: string): ExtractedMetrics {
  const text = deckText.replace(/\u00a0/g, " ");
  const extracted: ExtractedMetrics = {};

  const set = (field: NumericField, value: number | null) => {
    if (value === null) return;
    const formatted = formatField(field, value);
    if (formatted) extracted[field] = formatted;
  };

  set("headcount", findAmount(text, "headcount", HEADCOUNT));
  set("tam", findAmount(text, "tam", TAM, { requireMagnitude: true }));
  set("sam", findAmount(text, "sam", SAM, { requireMagnitude: true }));
  set("som", findAmount(text, "som", SOM, { requireMagnitude: true }));
  set("nrr", findAmount(text, "nrr", NRR));
  set("churnRate", findAmount(text, "churnRate", CHURN));
  set("burnMultiple", findAmount(text, "burnMultiple", BURN_MULTIPLE));
  set("cac", findAmount(text, "cac", CAC, { requireMagnitude: true }));
  set("ltv", findAmount(text, "ltv", LTV, { requireMagnitude: true }));
  set("cacPaybackDays", findCacPaybackDays(text));
  set("monthlyBurnRate", findMonthlyBurn(text));
  set("grossMargin", findAmount(text, "grossMargin", GROSS_MARGIN));
  set("cashOnHand", findAmount(text, "cashOnHand", CASH, { requireMagnitude: true }));
  set("totalDebt", findAmount(text, "totalDebt", DEBT, { requireMagnitude: true }));

  const monthlyUsers = findAmount(text, "activeUsers", MAU);
  const dailyUsers = monthlyUsers === null ? findAmount(text, "activeUsers", DAU) : null;
  if (monthlyUsers !== null || dailyUsers !== null) {
    set("activeUsers", monthlyUsers ?? dailyUsers);
    if (extracted.activeUsers) extracted.activeUsersMode = monthlyUsers !== null ? "mau" : "dau";
  }

  const runway = findRunway(text);
  if (runway) {
    extracted.runway = runway.runway;
    extracted.runwayUnit = runway.runwayUnit;
  }

  const background = extractBackground(text);
  if (background) extracted.background = background;

  return extracted;
}

/**
 * Normalises the `metrics` object `audit-deck` returns. The function is asked for plain
 * numbers in fixed units, but values still arrive as `"$12.4B"` or `"18 months"` often
 * enough that everything is re-parsed here.
 */
export function metricsFromAuditResponse(raw: unknown): ExtractedMetrics {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const extracted: ExtractedMetrics = {};

  const numberFrom = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const match = value.match(new RegExp(AMOUNT, "i"));
    return match ? parseAmount(match.groups) : null;
  };

  const set = (field: NumericField) => {
    const value = numberFrom(source[field]);
    if (value === null) return;
    const formatted = formatField(field, value);
    if (formatted) extracted[field] = formatted;
  };

  (
    [
      "headcount",
      "tam",
      "sam",
      "som",
      "nrr",
      "activeUsers",
      "churnRate",
      "burnMultiple",
      "cac",
      "ltv",
      "cacPaybackDays",
      "monthlyBurnRate",
      "runway",
      "grossMargin",
      "cashOnHand",
      "totalDebt",
    ] as NumericField[]
  ).forEach(set);

  if (extracted.activeUsers) {
    extracted.activeUsersMode = String(source.activeUsersMode ?? "").toLowerCase() === "dau" ? "dau" : "mau";
  }
  if (extracted.runway) {
    extracted.runwayUnit = String(source.runwayUnit ?? "").toLowerCase() === "days" ? "days" : "months";
  }
  if (typeof source.background === "string") {
    const background = cleanProse(source.background);
    if (background.length >= 20) extracted.background = background.slice(0, BACKGROUND_MAX_CHARS);
  }

  return extracted;
}

/** Combines two extractions, preferring `primary` field by field. */
export function mergeExtractedMetrics(primary: ExtractedMetrics, secondary: ExtractedMetrics): ExtractedMetrics {
  // A unit toggle only means something next to the number it describes, so each one
  // follows whichever source supplied that number.
  const users = primary.activeUsers ? primary : secondary;
  const runway = primary.runway ? primary : secondary;
  return {
    ...secondary,
    ...primary,
    ...(users.activeUsersMode ? { activeUsersMode: users.activeUsersMode } : {}),
    ...(runway.runwayUnit ? { runwayUnit: runway.runwayUnit } : {}),
  };
}

/**
 * Narrows an extraction down to the fields the founder hasn't filled in, so re-uploading a
 * deck never overwrites hand-entered numbers.
 */
export function metricsPrefillPatch(
  current: CompanyMetricsData,
  incoming: ExtractedMetrics,
): { patch: ExtractedMetrics; labels: string[] } {
  const patch: ExtractedMetrics = {};
  const labels: string[] = [];

  for (const [field, value] of Object.entries(incoming) as [MetricField, string | undefined][]) {
    if (!value || field === "activeUsersMode" || field === "runwayUnit") continue;
    if (current[field]?.trim()) continue;
    (patch as Record<string, string>)[field] = value;
    labels.push(FIELD_LABELS[field]);
  }

  // A unit toggle is only written alongside the number it describes.
  if (patch.activeUsers && incoming.activeUsersMode) patch.activeUsersMode = incoming.activeUsersMode;
  if (patch.runway && incoming.runwayUnit) patch.runwayUnit = incoming.runwayUnit;

  return { patch, labels };
}

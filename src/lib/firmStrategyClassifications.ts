/**
 * Strategy classifications on `firm_records.strategy_classifications` (Postgres enum array).
 * A firm may match multiple strategies.
 */
export const FIRM_STRATEGY_CLASSIFICATIONS = [
  "THESIS_DRIVEN",
  "GENERALIST",
  "OPERATOR_LED",
  "PLATFORM_SERVICES_HEAVY",
  "EVERGREEN_LONG_DURATION",
  "IMPACT_ESG_DRIVEN",
  "GEOGRAPHY_SPECIALIST",
  "FOUNDER_PROFILE_DRIVEN",
] as const;

export type FirmStrategyClassification = (typeof FIRM_STRATEGY_CLASSIFICATIONS)[number];

export const STRATEGY_CLASSIFICATION_LABELS: Record<FirmStrategyClassification, string> = {
  THESIS_DRIVEN: "Thesis-driven",
  GENERALIST: "Generalist",
  OPERATOR_LED: "Operator-led",
  PLATFORM_SERVICES_HEAVY: "Platform / services-heavy",
  EVERGREEN_LONG_DURATION: "Evergreen / long-duration",
  IMPACT_ESG_DRIVEN: "Impact / ESG-driven",
  GEOGRAPHY_SPECIALIST: "Geography-specialist",
  FOUNDER_PROFILE_DRIVEN: "Founder-profile-driven",
};

/** Short definitions for tooltips / admin copy. */
export const STRATEGY_CLASSIFICATION_DEFINITIONS: Record<FirmStrategyClassification, string> = {
  THESIS_DRIVEN:
    "Explicit, narrow theses (e.g., vertical AI for industrials, B2B SaaS only), usually with published focus areas and deep prepared conviction in a few lanes.",
  GENERALIST:
    "Broad sector coverage (e.g., tech across B2B and B2C), optimizing for diversification and opportunistic deal flow rather than a tight thesis.",
  OPERATOR_LED:
    "Partners are former founders or executives; pitch is hands-on help with GTM, hiring, and product—not just capital.",
  PLATFORM_SERVICES_HEAVY:
    "Large internal platform teams (talent, GTM, marketing, data) that provide structured post-investment services.",
  EVERGREEN_LONG_DURATION:
    "No fixed fund life; capital is recycled, with more flexible time horizons and exit pressure.",
  IMPACT_ESG_DRIVEN:
    "Explicit non-financial objectives (climate, social impact, etc.) and formal impact measurement requirements.",
  GEOGRAPHY_SPECIALIST:
    "Focused on one region or diaspora (e.g., Nordics, Latin America, US/India cross-border), often with local networks.",
  FOUNDER_PROFILE_DRIVEN:
    "Optimizes for specific founder traits (repeat founders, technical founders, underrepresented founders, etc.).",
};

export function isFirmStrategyClassification(s: string): s is FirmStrategyClassification {
  return (FIRM_STRATEGY_CLASSIFICATIONS as readonly string[]).includes(s);
}

export function formatStrategyClassificationLabel(raw: string): string {
  if (isFirmStrategyClassification(raw)) return STRATEGY_CLASSIFICATION_LABELS[raw];
  return raw.replace(/_/g, " ");
}

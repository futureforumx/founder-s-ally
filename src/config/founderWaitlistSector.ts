/**
 * Canonical sector values for `/access` founder flow (waitlist signup).
 * Submitted strings must match these exactly; labels are UI-only.
 *
 * Display order is optimized for founder friction (common categories first).
 */
export const FOUNDER_WAITLIST_SECTOR_VALUES = [
  "ai_ml",
  "enterprise_saas",
  "fintech",
  "healthcare",
  "developer_tools",
  "data_analytics",
  "infrastructure_cloud",
  "cybersecurity",
  "marketplaces",
  "consumer",
  "ecommerce_retail",
  "climate_energy",
  "future_of_work",
  "education",
  "media_creator_economy",
  "logistics_supply_chain",
  "proptech_real_estate",
  "legal_govtech",
  "robotics_hardware",
  "biotech_life_sciences",
  "other",
] as const;

export type FounderWaitlistSectorValue = (typeof FOUNDER_WAITLIST_SECTOR_VALUES)[number];

const CANONICAL_SET = new Set<string>(FOUNDER_WAITLIST_SECTOR_VALUES);

export function isFounderWaitlistSectorValue(v: string): v is FounderWaitlistSectorValue {
  return CANONICAL_SET.has(v);
}

/** Display label for a canonical slug, or null if unknown. */
export function getFounderWaitlistSectorLabel(slug: string): string | null {
  const hit = FOUNDER_WAITLIST_SECTOR_OPTIONS.find((o) => o.value === slug);
  return hit?.label ?? null;
}

/** Founder-facing labels → canonical values (order = dropdown order). */
export const FOUNDER_WAITLIST_SECTOR_OPTIONS: ReadonlyArray<{
  readonly label: string;
  readonly value: FounderWaitlistSectorValue;
}> = [
  { label: "AI / Machine Learning", value: "ai_ml" },
  { label: "Enterprise SaaS", value: "enterprise_saas" },
  { label: "Fintech", value: "fintech" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Developer Tools", value: "developer_tools" },
  { label: "Data / Analytics", value: "data_analytics" },
  { label: "Infrastructure / Cloud", value: "infrastructure_cloud" },
  { label: "Cybersecurity", value: "cybersecurity" },
  { label: "Marketplaces", value: "marketplaces" },
  { label: "Consumer", value: "consumer" },
  { label: "E-commerce / Retail", value: "ecommerce_retail" },
  { label: "Climate / Energy", value: "climate_energy" },
  { label: "Future of Work", value: "future_of_work" },
  { label: "Education", value: "education" },
  { label: "Media / Creator Economy", value: "media_creator_economy" },
  { label: "Logistics / Supply Chain", value: "logistics_supply_chain" },
  { label: "Proptech / Real Estate", value: "proptech_real_estate" },
  { label: "Legal / GovTech", value: "legal_govtech" },
  { label: "Robotics / Hardware", value: "robotics_hardware" },
  { label: "Biotech / Life Sciences", value: "biotech_life_sciences" },
  { label: "Other", value: "other" },
];

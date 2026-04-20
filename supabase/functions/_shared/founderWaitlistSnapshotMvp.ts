/**
 * MVP founder waitlist post-signup snapshot (edge function only).
 * Keep in sync with `src/config/founderWaitlistSectorSignals.ts` for market lines where duplicated.
 */

export type FounderSnapshotInvestorMatch = {
  firmName: string;
  investorName?: string;
  reason: string;
  url?: string;
};

export type FounderWaitlistSnapshotPayload = {
  investorMatches: FounderSnapshotInvestorMatch[];
  marketSignal: { text: string; source?: string };
  nextStep: { text: string };
};

/** Canonical waitlist sector slug → substrings matched against firm text blobs (lowercased). */
export const SECTOR_KEYWORDS: Record<string, string[]> = {
  ai_ml: ["artificial intelligence", "machine learning", " generative", " llm", "genai", "deep learning"],
  enterprise_saas: ["enterprise", "saas", "b2b", "software", "workflow"],
  fintech: ["fintech", "financial", "payments", "banking", "lending", "embedded finance"],
  healthcare: ["health", "healthcare", "clinical", "medical", "biotech", "life science"],
  developer_tools: ["developer", "devtools", "api", "infrastructure", "platform engineering"],
  data_analytics: ["data", "analytics", "warehouse", "bi ", "business intelligence"],
  infrastructure_cloud: ["cloud", "infrastructure", "devops", "kubernetes", "security platform"],
  cybersecurity: ["security", "cyber", "zero trust", "identity", "threat"],
  marketplaces: ["marketplace", "two-sided", "platform network"],
  consumer: ["consumer", "d2c", "b2c", "brand"],
  ecommerce_retail: ["retail", "ecommerce", "commerce", "omnichannel"],
  climate_energy: ["climate", "energy", "cleantech", "carbon", "sustainability"],
  future_of_work: ["future of work", "workplace", "hr tech", "talent", "productivity"],
  education: ["education", "edtech", "learning", "training"],
  media_creator_economy: ["media", "creator", "content", "streaming", "entertainment"],
  logistics_supply_chain: ["logistics", "supply chain", "freight", "fulfillment"],
  proptech_real_estate: ["proptech", "real estate", "housing", "construction"],
  legal_govtech: ["legal", "govtech", "government", "compliance"],
  robotics_hardware: ["robotics", "hardware", "industrial", "automation"],
  biotech_life_sciences: ["biotech", "therapeutic", "pharma", "life science"],
  other: [],
};

const SIGNAL_FALLBACK =
  "Active investors are continuing to deploy capital in this sector.";

const SIGNAL_BY_SECTOR: Record<string, string> = {
  ai_ml: "AI funding activity is accelerating—top funds are actively deploying.",
  fintech: "Fintech deal activity is shifting toward infrastructure and embedded finance.",
  healthcare: "Healthcare investors are prioritizing automation and clinical workflows.",
  enterprise_saas: "SaaS investors are focusing on efficiency and AI-driven workflows.",
  developer_tools: "Developer tooling remains a top category for early-stage funding.",
};

export function marketSignalForSector(sector: string | null): { text: string; source: string } {
  const slug = (sector ?? "").trim();
  if (slug && SIGNAL_BY_SECTOR[slug]) {
    return { text: SIGNAL_BY_SECTOR[slug], source: "curated" };
  }
  if (slug) {
    return { text: SIGNAL_FALLBACK, source: "sector" };
  }
  return { text: SIGNAL_FALLBACK, source: "generic" };
}

export function nextStepForFounderStage(stage: string | null): { text: string } {
  const s = (stage ?? "").trim();
  if (s === "idea" || s === "pre-seed") {
    return {
      text: "Prioritize warm intros from operators and angels who know your space before scaling cold outreach.",
    };
  }
  if (s === "seed") {
    return {
      text: "Refine a focused target list of 25–40 funds that match your round size and sector thesis.",
    };
  }
  if (s === "series-a-plus") {
    return {
      text: "Position around traction, category timing, and deployment velocity when you open conversations.",
    };
  }
  return { text: "Refine your target investor list so outreach stays high-signal." };
}

export type FirmRow = {
  id: string;
  firm_name: string;
  thesis_verticals: string[] | null;
  description: string | null;
  elevator_pitch: string | null;
  preferred_stage: string | null;
  stage_min: string | null;
  stage_max: string | null;
  funding_intel_activity_score: number | null;
  is_actively_deploying: boolean | null;
  completeness_score: number | null;
  website_url: string | null;
  recent_focus: string | null;
};

function textBlob(r: FirmRow): string {
  const parts = [
    ...(r.thesis_verticals ?? []),
    r.description ?? "",
    r.elevator_pitch ?? "",
    r.preferred_stage ?? "",
    r.recent_focus ?? "",
    r.stage_min ?? "",
    r.stage_max ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

export function sectorRelevanceHits(sector: string | null, r: FirmRow): number {
  const haystack = textBlob(r);
  return sectorHits(sector, haystack);
}

function sectorHits(sector: string | null, haystack: string): number {
  const slug = (sector ?? "").trim();
  const keys = SECTOR_KEYWORDS[slug] ?? SECTOR_KEYWORDS.other;
  if (keys.length === 0) return 0;
  let n = 0;
  for (const k of keys) {
    if (haystack.includes(k.toLowerCase())) n += 1;
  }
  return n;
}

function stageFitScore(foundStage: string | null, haystack: string): number {
  const s = (foundStage ?? "").trim().toLowerCase();
  if (!s) return 0;
  if (s === "idea") {
    return /pre-?seed|angel|idea|early/.test(haystack) ? 4 : 1;
  }
  if (s === "pre-seed") {
    return /pre-?seed|seed|angel/.test(haystack) ? 4 : 2;
  }
  if (s === "seed") {
    return /seed/.test(haystack) ? 4 : 2;
  }
  if (s === "series-a-plus") {
    return /series|growth|late|expansion/.test(haystack) ? 4 : 2;
  }
  return 1;
}

export function scoreFirmRow(r: FirmRow, sector: string | null, stage: string | null): number {
  const hay = textBlob(r);
  const sec = sectorHits(sector, hay) * 6;
  const stg = stageFitScore(stage, hay) * 4;
  const act = (r.funding_intel_activity_score ?? 0) * 0.12;
  const deploy = r.is_actively_deploying ? 8 : 0;
  const complete = (r.completeness_score ?? 0) * 0.03;
  return sec + stg + act + deploy + complete;
}

export function buildReason(r: FirmRow, sector: string | null, generic = false): string {
  const hay = textBlob(r);
  const slug = (sector ?? "").trim();
  const keys = SECTOR_KEYWORDS[slug] ?? [];
  const hit = keys.find((k) => hay.includes(k.toLowerCase()));
  const stageHint = r.is_actively_deploying ? "Actively deploying capital." : "Strong directory profile.";
  if (generic) {
    return `Surfaced from Vekta’s live investor directory for founders at your stage. ${stageHint}`;
  }
  if (hit) {
    return `Thesis and focus align with “${hit.trim()}” in your space. ${stageHint}`;
  }
  return `High-signal fund profile for your stage. ${stageHint}`;
}

/** Enrichment / search pipeline text that was written into `firm_records.website_url` by mistake. */
const WEBSITE_URL_DENY_PHRASES: string[] = [
  "api returned",
  "returned successfully",
  "no search results",
  "search results found",
  "successfully, but",
  "no results",
  "not found",
  "error loading",
  "failed to",
];

function websiteUrlLooksLikeProseOrError(s: string): boolean {
  const lower = s.toLowerCase().trim();
  if (lower === "null" || lower === "undefined" || lower === "n/a" || lower === "none") return true;
  for (const p of WEBSITE_URL_DENY_PHRASES) {
    if (lower.includes(p)) return true;
  }
  // Embedded prose link, not a bare website field
  if (lower.includes("http://") && !lower.startsWith("http://") && !lower.startsWith("https://")) {
    return true;
  }
  // Sentences / status lines (real hosts rarely have multiple whitespace runs)
  if ((s.match(/\s/g) ?? []).length >= 2) return true;
  return false;
}

function isPlausibleHttpUrlForDisplay(href: string): boolean {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.trim().toLowerCase();
  if (!host || host.length > 253) return false;
  if (/[\s,;%]/.test(host)) return false;
  if (host !== "localhost" && host !== "127.0.0.1") {
    if (!host.includes(".")) return false;
    if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  }
  return true;
}

/** Returns a validated https URL for outbound links, or omits invalid / placeholder DB values. */
export function normalizeWebsiteUrl(raw: string | null): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t || t.length > 4096) return undefined;
  if (websiteUrlLooksLikeProseOrError(t)) return undefined;

  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  if (websiteUrlLooksLikeProseOrError(candidate.replace(/^https?:\/\//i, ""))) return undefined;

  try {
    const u = new URL(candidate);
    if (!isPlausibleHttpUrlForDisplay(u.href)) return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

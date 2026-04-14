import { safeTrim } from "@/lib/utils";

/**
 * generateFallbacks.ts
 *
 * Render-layer utilities that produce short, factual fallback text
 * from existing structured data when a bio or elevator pitch is missing.
 *
 * Rules:
 *  - Never invent facts — only rephrase fields already in the record.
 *  - Return null if there isn't enough data to say anything useful.
 *  - Keep output concise (1-2 sentences).
 */

/* ── Investor bio fallback ──────────────────────────────────────────────── */

interface InvestorFields {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  firm_name?: string | null;
  /** e.g. ["SaaS", "Fintech"] */
  personal_thesis_tags?: string[] | null;
  /** e.g. ["Seed", "Series A"] */
  stage_focus?: string[] | null;
  check_size_min?: number | null;
  check_size_max?: number | null;
  sweet_spot?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function generateInvestorBio(inv: InvestorFields): string | null {
  const name =
    safeTrim(inv.first_name) ||
    safeTrim(safeTrim(inv.full_name).split(" ")[0]) ||
    null;
  const title = safeTrim(inv.title);
  const firm = safeTrim(inv.firm_name);

  // Need at least a name + title or firm to say anything meaningful
  if (!title && !firm) return null;

  const parts: string[] = [];

  // Opening: "Jane is a Partner at Sequoia Capital."
  if (title && firm) {
    parts.push(`${name || "This investor"} is ${title} at ${firm}.`);
  } else if (title) {
    parts.push(`${name || "This investor"} is ${title}.`);
  } else if (firm) {
    parts.push(`${name || "This investor"} is a member of the team at ${firm}.`);
  }

  // Focus sentence — deduplicate tags that already appear as stages
  const stages = (inv.stage_focus ?? []).filter(Boolean).slice(0, 3);
  const stageSet = new Set(stages.map((s) => String(s).toLowerCase()));
  const tags = (inv.personal_thesis_tags ?? [])
    .filter(Boolean)
    .filter((t) => !stageSet.has(String(t).toLowerCase()))
    .slice(0, 4);

  if (stages.length > 0 && tags.length > 0) {
    parts.push(`Focuses on ${stages.join(", ")} investments in ${tags.join(", ")}.`);
  } else if (stages.length > 0) {
    parts.push(`Focuses on ${stages.join(", ")}.`);
  } else if (tags.length > 0) {
    parts.push(`Focuses on ${tags.join(", ")}.`);
  }

  // Check size
  if (inv.sweet_spot) {
    parts.push(`Typical check size around ${fmtUsd(inv.sweet_spot)}.`);
  } else if (inv.check_size_min && inv.check_size_min > 0 && inv.check_size_max) {
    parts.push(`Check sizes from ${fmtUsd(inv.check_size_min)} to ${fmtUsd(inv.check_size_max)}.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

/* ── Firm elevator pitch fallback ───────────────────────────────────────── */

interface FirmFields {
  firm_name?: string | null;
  description?: string | null;
  stage_focus?: string[] | null;
  thesis_verticals?: string[] | null;
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  entity_type?: string | null;
  min_check_size?: number | null;
  max_check_size?: number | null;
}

/**
 * Extracts the first sentence (up to ~160 chars) from the description,
 * or builds a short pitch from structured fields.
 */
export function generateElevatorPitch(firm: FirmFields): string | null {
  // Prefer extracting first sentence from description
  const desc = safeTrim(firm.description);
  if (desc && desc.length > 20) {
    // Find the first sentence boundary
    const sentenceEnd = desc.search(/[.!?]\s/);
    if (sentenceEnd > 0 && sentenceEnd < 200) {
      return desc.slice(0, sentenceEnd + 1);
    }
    // If description is short enough, use it directly
    if (desc.length <= 180) return desc;
    // Truncate at a word boundary
    const truncated = desc.slice(0, 160);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated) + "…";
  }

  // Fallback: build from structured fields
  const name = safeTrim(firm.firm_name);
  if (!name) return null;

  const stages = (firm.stage_focus ?? []).filter(Boolean).slice(0, 3);
  const verticals = (firm.thesis_verticals ?? []).filter(Boolean).slice(0, 4);
  const loc = [firm.hq_city, firm.hq_state, firm.hq_country].filter(Boolean).join(", ");

  if (stages.length === 0 && verticals.length === 0) return null;

  const parts: string[] = [];
  if (stages.length > 0 && verticals.length > 0) {
    parts.push(`${name} invests in ${stages.join(", ")} stage companies across ${verticals.join(", ")}.`);
  } else if (stages.length > 0) {
    parts.push(`${name} is a ${stages.join("/")} stage investment firm.`);
  } else {
    parts.push(`${name} invests across ${verticals.join(", ")}.`);
  }

  if (loc) parts.push(`Based in ${loc}.`);

  return parts.join(" ");
}

import {
  type FirmStrategyClassification,
  STRATEGY_CLASSIFICATION_LABELS,
  isFirmStrategyClassification,
} from "@/lib/firmStrategyClassifications";
import { formatFirmTypeLabel } from "@/lib/firmTypeLabels";

/** Order: more distinctive / user-facing signals first (excluding per-case geo + vertical handling). */
const STRATEGY_PILL_PRIORITY: readonly FirmStrategyClassification[] = [
  "IMPACT_ESG_DRIVEN",
  "THESIS_DRIVEN",
  "FOUNDER_PROFILE_DRIVEN",
  "OPERATOR_LED",
  "PLATFORM_SERVICES_HEAVY",
  "EVERGREEN_LONG_DURATION",
  "GEOGRAPHY_SPECIALIST",
  "GENERALIST",
] as const;

export interface InvestorFocusBadgeInput {
  strategy_classifications?: readonly string[] | null;
  thesis_orientation?: string | null;
  sector_scope?: string | null;
  thesis_verticals?: readonly string[] | null;
  geo_focus?: readonly string[] | null;
  /** VC JSON / seed sectors when `firm_records` verticals are missing */
  seed_sectors?: readonly string[] | null;
  fallbackFirmTypeKey?: string | null;
}

export interface InvestorFocusBadgeResult {
  /** Uppercase pill text for directory cards */
  pill: string;
  /** Longer explanation for tooltips */
  tooltip: string;
}

function cleanList(xs: readonly string[] | null | undefined): string[] {
  if (!xs?.length) return [];
  const out: string[] = [];
  for (const x of xs) {
    const s = String(x).trim();
    if (s) out.push(s);
  }
  return out;
}

/** "PropTech" / "deep-tech" → "DEEP TECH" style */
export function formatInvestorFocusVerticalPill(raw: string): string {
  const spaced = String(raw)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.toUpperCase();
}

function geoPill(geo: string[]): string | null {
  if (!geo.length) return null;
  if (geo.length === 1) return formatInvestorFocusVerticalPill(geo[0]);
  if (geo.length <= 3) return "GEO FOCUS";
  return "GEO FOCUS";
}

function orientationPill(orientation: string | null | undefined): string | null {
  const o = String(orientation ?? "").trim().toLowerCase();
  if (!o) return null;
  if (o === "generalist") return "GENERALIST";
  if (o === "geographic") return "GEOGRAPHY";
  if (o === "founder-first") return "FOUNDER-FIRST";
  if (o === "operator-led") return "OPERATOR-LED";
  if (o === "sector-focused") return "SECTOR FOCUS";
  if (o === "thesis-driven") return "THESIS-DRIVEN";
  return null;
}

function strategyShortPill(s: FirmStrategyClassification): string {
  switch (s) {
    case "IMPACT_ESG_DRIVEN":
      return "IMPACT";
    case "THESIS_DRIVEN":
      return "THESIS-DRIVEN";
    case "FOUNDER_PROFILE_DRIVEN":
      return "FOUNDER-FIRST";
    case "OPERATOR_LED":
      return "OPERATOR-LED";
    case "PLATFORM_SERVICES_HEAVY":
      return "PLATFORM";
    case "EVERGREEN_LONG_DURATION":
      return "EVERGREEN";
    case "GEOGRAPHY_SPECIALIST":
      return "GEOGRAPHY";
    case "GENERALIST":
      return "GENERALIST";
    default:
      return s.replace(/_/g, "-");
  }
}

function buildTooltip(parts: string[]): string {
  const body = parts.filter(Boolean).join(" ");
  return body.length > 0 ? body : "How we summarize this firm’s published investment posture.";
}

/**
 * Primary directory pill: thesis / impact / geo / generalist signals from `firm_records`,
 * or a single-lane vertical when the profile reads as specialist.
 */
export function computeInvestorFocusBadge(input: InvestorFocusBadgeInput): InvestorFocusBadgeResult {
  const strategies = cleanList(input.strategy_classifications).filter(isFirmStrategyClassification);
  const verticals = cleanList(input.thesis_verticals);
  const seeds = cleanList(input.seed_sectors);
  const geo = cleanList(input.geo_focus);
  const orientation = input.thesis_orientation ?? null;
  const scope = input.sector_scope ?? null;

  const verticalPool = verticals.length ? verticals : seeds.length === 1 ? seeds : [];

  const hasGeoStrategy = strategies.includes("GEOGRAPHY_SPECIALIST");
  if (hasGeoStrategy && geo.length) {
    const pill = geoPill(geo) ?? "GEOGRAPHY";
    return {
      pill,
      tooltip: buildTooltip([
        "Geography-led mandate from our structured strategy tags and geo focus fields.",
        geo.length ? `Regions: ${geo.slice(0, 6).join(", ")}${geo.length > 6 ? "…" : ""}.` : "",
      ]),
    };
  }

  const verticalSpecialistGate =
    scope === "Specialized" ||
    /sector-focused|thesis-driven/i.test(String(orientation ?? "")) ||
    strategies.includes("THESIS_DRIVEN");

  const maxLanes = 4;
  if (verticalSpecialistGate && verticalPool.length > 0 && verticalPool.length <= maxLanes) {
    const pill = formatInvestorFocusVerticalPill(verticalPool[0]);
    const rest = verticalPool.slice(1);
    return {
      pill,
      tooltip: buildTooltip([
        "Primary sector / thesis lane shown on the card when the firm is tagged as specialist or thesis-driven.",
        rest.length ? `Related lanes: ${rest.slice(0, 5).join(", ")}${rest.length > 5 ? "…" : ""}.` : "",
        orientation ? `Orientation: ${orientation}.` : "",
      ]),
    };
  }

  for (const s of STRATEGY_PILL_PRIORITY) {
    if (!strategies.includes(s)) continue;
    if (s === "GEOGRAPHY_SPECIALIST") {
      const pill = geo.length ? (geoPill(geo) ?? "GEOGRAPHY") : "GEOGRAPHY";
      return {
        pill,
        tooltip: buildTooltip([
          STRATEGY_CLASSIFICATION_LABELS[s],
          geo.length ? `Geo focus: ${geo.slice(0, 6).join(", ")}${geo.length > 6 ? "…" : ""}.` : "",
        ]),
      };
    }
    return {
      pill: strategyShortPill(s),
      tooltip: STRATEGY_CLASSIFICATION_LABELS[s],
    };
  }

  const oriPill = orientationPill(orientation);
  if (oriPill) {
    return {
      pill: oriPill,
      tooltip: buildTooltip([
        orientation ? `Thesis orientation: ${orientation}.` : "",
        verticalPool.length ? `Published lanes: ${verticalPool.slice(0, 6).join(", ")}${verticalPool.length > 6 ? "…" : ""}.` : "",
      ]),
    };
  }

  if (verticalPool.length === 1) {
    const pill = formatInvestorFocusVerticalPill(verticalPool[0]);
    return {
      pill,
      tooltip: buildTooltip(["Single published sector / thesis lane from available tags.", `Lane: ${verticalPool[0]}.`]),
    };
  }

  const fb = input.fallbackFirmTypeKey ?? "INSTITUTIONAL";
  const human = formatFirmTypeLabel(fb) || "Institutional";
  return {
    pill: human.toUpperCase(),
    tooltip: `No structured thesis tags yet — defaulting to firm structure (${human}).`,
  };
}

export function investorFocusBadgeFromDirectoryFields(entry: {
  _strategyClassifications?: readonly string[] | null;
  _thesisOrientation?: string | null;
  _sectorScope?: string | null;
  _thesisVerticals?: readonly string[] | null;
  _geoFocus?: readonly string[] | null;
  _seedSectors?: readonly string[] | null;
  _firmType?: string | null;
}): InvestorFocusBadgeResult {
  return computeInvestorFocusBadge({
    strategy_classifications: entry._strategyClassifications ?? null,
    thesis_orientation: entry._thesisOrientation ?? null,
    sector_scope: entry._sectorScope ?? null,
    thesis_verticals: entry._thesisVerticals ?? null,
    geo_focus: entry._geoFocus ?? null,
    seed_sectors: entry._seedSectors ?? null,
    fallbackFirmTypeKey: entry._firmType ?? null,
  });
}

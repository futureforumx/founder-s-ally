/**
 * Derives `firm_records` investment-focus columns from merged adapter profiles
 * + deterministic classifiers (theme/sector/impact/structure).
 */

import type { ExtractedProfile } from "../types";
import type { FirmStrategyClassification } from "@/lib/firmStrategyClassifications";
import { isFirmStrategyClassification } from "@/lib/firmStrategyClassifications";

/** True when directory “investment focus” fields are empty / incomplete on `firm_records`. */
export function needsInvestmentFocus(row: {
  strategy_classifications?: unknown;
  thesis_verticals?: unknown;
  thesis_orientation?: unknown;
  sector_scope?: unknown;
}): boolean {
  const strat = row.strategy_classifications;
  const emptyStrat = !Array.isArray(strat) || strat.length === 0;
  const tv = row.thesis_verticals;
  const emptyVert = !Array.isArray(tv) || tv.length === 0;
  const noOri = row.thesis_orientation == null || !String(row.thesis_orientation).trim();
  const noScope = row.sector_scope == null || !String(row.sector_scope).trim();
  return emptyStrat || emptyVert || noOri || noScope;
}

const THESIS_ORIENTATIONS = new Set([
  "Generalist",
  "Sector-Focused",
  "Thesis-Driven",
  "Founder-First",
  "Geographic",
  "Operator-led",
]);

const SECTOR_SCOPES = new Set(["Generalist", "Specialized"]);

/** Normalize enum strings to DB-safe labels (Postgres enums are case-sensitive). */
export function sanitizeThesisOrientation(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (THESIS_ORIENTATIONS.has(t)) return t;
  const lower = t.toLowerCase();
  const map: Record<string, string> = {
    generalist: "Generalist",
    "sector-focused": "Sector-Focused",
    "thesis-driven": "Thesis-Driven",
    "founder-first": "Founder-First",
    geographic: "Geographic",
    "operator-led": "Operator-led",
  };
  return map[lower] ?? null;
}

export function sanitizeSectorScope(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (SECTOR_SCOPES.has(t)) return t;
  const lower = t.toLowerCase();
  if (lower === "generalist") return "Generalist";
  if (lower === "specialized") return "Specialized";
  return null;
}

function uniqTrim(xs: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs ?? []) {
    const s = String(x).trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}

function textBlob(p: ExtractedProfile): string {
  return [p.description, p.elevator_pitch, p.raw_text].filter(Boolean).join(" \n ").toLowerCase();
}

/** Union themes + sectors as thesis vertical candidates (cap for DB + UI). */
export function deriveThesisVerticals(p: ExtractedProfile): string[] {
  return uniqTrim([...(p.themes ?? []), ...(p.sectors ?? [])]).slice(0, 12);
}

export function deriveSectorScope(verticals: string[]): "Generalist" | "Specialized" | null {
  if (!verticals.length) return null;
  if (verticals.length >= 5) return "Generalist";
  return "Specialized";
}

/**
 * Maps classifier outputs + tags to `firm_records.thesis_orientation` enum labels.
 */
export function deriveThesisOrientation(p: ExtractedProfile): string | null {
  const verts = deriveThesisVerticals(p);
  const geo = uniqTrim([...(p.geo_focus ?? []), ...(p.geographies ?? [])]);
  const tc = p.theme_classification;
  const sc = p.sector_classification;
  const blob = textBlob(p);

  if (/\boperator[\s-]led\b|\boperators\s+who\b|\bformer\s+(ceo|cfo|founder)\b/.test(blob))
    return "Operator-led";
  if (/\bfounder[\s-]first|\bfounder\s+friendly|\bbacking\s+founders\b/.test(blob)) return "Founder-First";

  const geoSignal =
    (geo.length >= 1 && geo.length <= 4 && verts.length <= 6) ||
    /\b(nordic|latam|southeast\s+asia|mena|dach|benelux)\b/.test(blob);
  if (geoSignal && (tc !== "generalist" || sc !== "generalist")) return "Geographic";
  if (geo.length >= 1 && geo.length <= 3 && verts.length === 0) return "Geographic";

  if (tc === "generalist" && sc === "generalist") return "Generalist";
  if (tc === "multi_theme" || sc === "multi_sector") return "Generalist";
  if (tc === "theme_driven" || sc === "sector_focused") return "Thesis-Driven";
  if (verts.length >= 1 && verts.length <= 3) return "Sector-Focused";
  if (verts.length >= 4 && verts.length <= 6) return "Sector-Focused";
  return verts.length ? "Generalist" : null;
}

export function deriveStrategyClassifications(p: ExtractedProfile): FirmStrategyClassification[] {
  const out = new Set<FirmStrategyClassification>();
  const verts = deriveThesisVerticals(p);
  const tc = p.theme_classification;
  const sc = p.sector_classification;
  const io = p.impact_orientation;
  const blob = textBlob(p);
  const geo = uniqTrim([...(p.geo_focus ?? []), ...(p.geographies ?? [])]);

  if (io === "primary" || io === "integrated") out.add("IMPACT_ESG_DRIVEN");
  if (/\bimpact\b|\besg\b|\bclimate\b|\bcarbon\b|\bnet[\s-]?zero\b/.test(blob)) out.add("IMPACT_ESG_DRIVEN");

  if (/\bevergreen\b|\bperpetual\b|\bno\s+fixed\s+fund\s+life\b/.test(blob)) out.add("EVERGREEN_LONG_DURATION");
  if (/\bplatform\s+team|\b(investment\s+)?platform\b|\bstudio[\s-]like\s+services\b/.test(blob))
    out.add("PLATFORM_SERVICES_HEAVY");
  if (/\boperator[\s-]led\b|\bhands[\s-]on\b|\boperating\s+partner\b/.test(blob)) out.add("OPERATOR_LED");
  if (/\bfounder[\s-]first|\bunderrepresented|\bdiverse\s+founders|\brepeat\s+founders\b/.test(blob))
    out.add("FOUNDER_PROFILE_DRIVEN");

  const geoSpecial =
    (geo.length >= 1 && geo.length <= 5) || /\b(nordics?|latam|mena|sea\b|southeast\s+asia|europe|us\/india)\b/.test(blob);
  if (geoSpecial) out.add("GEOGRAPHY_SPECIALIST");

  const thesisLane = tc === "theme_driven" || sc === "sector_focused";
  if (thesisLane && verts.length >= 1 && verts.length <= 4) out.add("THESIS_DRIVEN");

  if (verts.length >= 5 || (tc === "generalist" && sc === "generalist")) out.add("GENERALIST");

  if (out.has("GENERALIST") && out.has("THESIS_DRIVEN")) {
    if (verts.length >= 5) out.delete("THESIS_DRIVEN");
    else if (thesisLane && verts.length <= 4) out.delete("GENERALIST");
  }

  return [...out].filter(isFirmStrategyClassification);
}

/** Attach investment-focus columns for `profileToFirmPatch` / upsert. */
export function applyInvestmentIntelToProfile(p: ExtractedProfile): ExtractedProfile {
  const thesis_verticals = deriveThesisVerticals(p);
  let sector_scope = deriveSectorScope(thesis_verticals);
  const thesis_orientation = sanitizeThesisOrientation(deriveThesisOrientation(p));
  if (!sector_scope && thesis_orientation === "Generalist") sector_scope = "Generalist";
  let strategy_classifications = deriveStrategyClassifications(p);
  if (
    !strategy_classifications.length &&
    (thesis_verticals.length || Boolean(p.description?.trim() || p.elevator_pitch?.trim()))
  ) {
    strategy_classifications = ["GENERALIST"];
  }
  const sector_scope_safe = sanitizeSectorScope(sector_scope) ?? sector_scope ?? undefined;

  return {
    ...p,
    ...(thesis_verticals.length ? { thesis_verticals } : {}),
    ...(sector_scope_safe ? { sector_scope: sector_scope_safe } : {}),
    ...(thesis_orientation ? { thesis_orientation } : {}),
    ...(strategy_classifications.length ? { strategy_classifications } : {}),
  };
}

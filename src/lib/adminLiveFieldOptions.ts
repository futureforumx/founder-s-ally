import {
  classifyImpact,
  classifySector,
  classifyStage,
  classifyStructure,
  classifyTheme,
} from "@/backfill/parsers/firm-classification";
import { FIRM_TYPE_LABELS, formatFirmTypeLabel } from "@/lib/firmTypeLabels";
import { Constants } from "@/integrations/supabase/types";

export type AdminLiveFieldOption = {
  value: string;
  label: string;
  desc?: string;
};

export type AdminLiveFieldKind = "enum" | "score";

export type AdminLiveFieldRecommendation = {
  value: string;
  reason: string;
};

export type AdminLiveFieldSpec = {
  kind: AdminLiveFieldKind;
  options: AdminLiveFieldOption[];
  allowCustom: boolean;
};

const SCORE_BANDS: AdminLiveFieldOption[] = [
  { value: "0", label: "0 — None", desc: "no signal, none, empty" },
  { value: "25", label: "25 — Low", desc: "weak, slow, poor" },
  { value: "50", label: "50 — Moderate", desc: "average, typical, medium" },
  { value: "70", label: "70 — Good", desc: "solid, above average" },
  { value: "80", label: "80 — Strong", desc: "high, responsive, reputable" },
  { value: "90", label: "90 — Excellent", desc: "very high, top quartile" },
  { value: "100", label: "100 — Exceptional", desc: "best, outstanding, perfect" },
];

const SCORE_FIELDS = new Set([
  "reputation_score",
  "founder_reputation_score",
  "responsiveness_score",
  "match_score",
  "network_strength",
  "value_add_score",
  "industry_reputation",
  "completeness_score",
  "data_confidence_score",
  "funding_intel_activity_score",
  "news_sentiment_score",
  "social_sentiment_score",
  "volatility_score",
  "capital_freshness_boost_score",
  "fresh_capital_priority_score",
]);

const SCORE_SIBLINGS: Record<string, string[]> = {
  reputation_score: ["founder_reputation_score", "industry_reputation", "match_score", "value_add_score"],
  founder_reputation_score: ["reputation_score", "industry_reputation", "match_score"],
  industry_reputation: ["reputation_score", "founder_reputation_score"],
  responsiveness_score: ["reputation_score", "match_score", "value_add_score", "network_strength"],
  match_score: ["reputation_score", "value_add_score", "network_strength"],
  network_strength: ["match_score", "value_add_score", "reputation_score"],
  value_add_score: ["reputation_score", "match_score", "network_strength"],
};

const ENUM_LABELS: Record<string, Record<string, string>> = {
  sector_classification: {
    generalist: "Generalist",
    sector_focused: "Sector focused",
    multi_sector: "Multi-sector",
  },
  stage_classification: {
    early_stage: "Early stage",
    multi_stage: "Multi-stage",
    growth: "Growth",
    buyout: "Buyout",
  },
  theme_classification: {
    generalist: "Generalist",
    theme_driven: "Theme driven",
    multi_theme: "Multi-theme",
  },
  structure_classification: {
    partnership: "Partnership",
    solo_gp: "Solo GP",
    syndicate: "Syndicate",
    cvc: "Corporate (CVC)",
    family_office: "Family office",
    private_equity: "Private equity",
  },
  impact_orientation: {
    primary: "Primary",
    integrated: "Integrated",
    considered: "Considered",
    none: "None",
  },
};

const ENUM_ALIASES: Record<string, Record<string, string>> = {
  sector_classification: {
    general: "generalist",
    "sector agnostic": "generalist",
    "industry agnostic": "generalist",
    specialized: "sector_focused",
    specialist: "sector_focused",
    "sector-focused": "sector_focused",
    "sector focused": "sector_focused",
    focused: "sector_focused",
    "multi sector": "multi_sector",
    "multi-sector": "multi_sector",
    multi: "multi_sector",
  },
  stage_classification: {
    early: "early_stage",
    "early-stage": "early_stage",
    "early stage": "early_stage",
    seed: "early_stage",
    "multi-stage": "multi_stage",
    "multi stage": "multi_stage",
    growth: "growth",
    "late stage": "growth",
    buyout: "buyout",
    pe: "buyout",
  },
  theme_classification: {
    general: "generalist",
    thematic: "theme_driven",
    "theme-driven": "theme_driven",
    "theme driven": "theme_driven",
    "multi theme": "multi_theme",
    "multi-theme": "multi_theme",
  },
  structure_classification: {
    vc: "partnership",
    "venture capital": "partnership",
    "solo gp": "solo_gp",
    "family office": "family_office",
    "private equity": "private_equity",
    corporate: "cvc",
  },
  thesis_orientation: {
    general: "Generalist",
    "sector focused": "Sector-Focused",
    "sector-focused": "Sector-Focused",
    thesis: "Thesis-Driven",
    "thesis driven": "Thesis-Driven",
    "founder first": "Founder-First",
    geo: "Geographic",
    operator: "Operator-led",
  },
  sector_scope: {
    general: "Generalist",
    specialist: "Specialized",
    focused: "Specialized",
  },
  lead_or_follow: {
    either: "either",
    both: "either",
    coinvest: "follow",
    "co-invest": "follow",
  },
  lead_vs_follow: {
    either: "either",
    both: "either",
  },
};

const ENUM_DESCRIPTIONS: Record<string, Record<string, string>> = {
  sector_classification: {
    generalist: "Broad coverage across many industries",
    sector_focused: "Concentrated in one or two sectors",
    multi_sector: "A handful of sectors, not fully generalist",
  },
  stage_classification: {
    early_stage: "Pre-seed through Series A",
    multi_stage: "Invests across multiple stages",
    growth: "Growth / late-stage checks",
    buyout: "Control / buyout capital",
  },
};

const FIRM_TYPE_TO_ENTITY: Record<string, string> = {
  CVC: "Corporate (CVC)",
  FAMILY_OFFICE: "Family Office",
  ANGEL_NETWORK: "Angel",
  SOLO_GP: "Solo GP",
  MICRO_VC: "Micro",
  MICRO_FUND: "Micro",
  ACCELERATOR: "Accelerator / Studio",
  VENTURE_STUDIO: "Accelerator / Studio",
  INSTITUTIONAL: "Institutional",
  VC: "Institutional",
  PE: "Institutional",
};

const LEAD_FOLLOW_OPTIONS: AdminLiveFieldOption[] = [
  { value: "lead", label: "Lead", desc: "leads rounds" },
  { value: "follow", label: "Follow", desc: "follows / participates" },
  { value: "either", label: "Either", desc: "lead or follow" },
];

const ENRICHMENT_OPTIONS: AdminLiveFieldOption[] = [
  { value: "enriched", label: "Enriched" },
  { value: "partial", label: "Partial" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

const VERIFICATION_OPTIONS: AdminLiveFieldOption[] = [
  { value: "VERIFIED", label: "Verified" },
  { value: "UNVERIFIED", label: "Unverified" },
  { value: "STALE", label: "Stale" },
  { value: "DISPUTED", label: "Disputed" },
];

function titleFromSnake(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function optionsFromEnum(
  values: readonly string[],
  labels?: Record<string, string>,
  descriptions?: Record<string, string>,
): AdminLiveFieldOption[] {
  return values.map((value) => ({
    value,
    label: labels?.[value] ?? titleFromSnake(value),
    desc: descriptions?.[value],
  }));
}

function optionsFromRecord(record: Record<string, string>): AdminLiveFieldOption[] {
  return Object.entries(record).map(([value, label]) => ({ value, label }));
}

const FIELD_SPECS: Record<string, AdminLiveFieldSpec> = {
  sector_classification: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(
      Constants.public.Enums.sector_classification,
      ENUM_LABELS.sector_classification,
      ENUM_DESCRIPTIONS.sector_classification,
    ),
  },
  stage_classification: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(
      Constants.public.Enums.stage_classification,
      ENUM_LABELS.stage_classification,
      ENUM_DESCRIPTIONS.stage_classification,
    ),
  },
  theme_classification: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(
      Constants.public.Enums.theme_classification,
      ENUM_LABELS.theme_classification,
    ),
  },
  structure_classification: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(
      Constants.public.Enums.structure_classification,
      ENUM_LABELS.structure_classification,
    ),
  },
  thesis_orientation: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(Constants.public.Enums.thesis_orientation),
  },
  sector_scope: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(Constants.public.Enums.sector_scope_enum),
  },
  impact_orientation: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(
      Constants.public.Enums.impact_orientation,
      ENUM_LABELS.impact_orientation,
    ),
  },
  entity_type: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(Constants.public.Enums.entity_type),
  },
  firm_type: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromRecord(FIRM_TYPE_LABELS),
  },
  preferred_stage: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(Constants.public.Enums.stage_focus_enum),
  },
  hq_region: {
    kind: "enum",
    allowCustom: true,
    options: optionsFromEnum(Constants.public.Enums.us_region),
  },
  lead_or_follow: {
    kind: "enum",
    allowCustom: true,
    options: LEAD_FOLLOW_OPTIONS,
  },
  lead_vs_follow: {
    kind: "enum",
    allowCustom: true,
    options: LEAD_FOLLOW_OPTIONS,
  },
  enrichment_status: {
    kind: "enum",
    allowCustom: true,
    options: ENRICHMENT_OPTIONS,
  },
  verification_status: {
    kind: "enum",
    allowCustom: true,
    options: VERIFICATION_OPTIONS,
  },
};

export function getAdminLiveFieldSpec(fieldKey: string): AdminLiveFieldSpec | null {
  if (SCORE_FIELDS.has(fieldKey)) {
    return { kind: "score", allowCustom: true, options: SCORE_BANDS };
  }
  return FIELD_SPECS[fieldKey] ?? null;
}

function normalizeLookup(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function resolveAdminLiveFieldOption(
  spec: AdminLiveFieldSpec,
  fieldKey: string,
  raw: string,
): AdminLiveFieldOption | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const aliases = ENUM_ALIASES[fieldKey] ?? {};
  const aliasHit = aliases[normalizeLookup(trimmed)] ?? aliases[trimmed.toLowerCase()];
  const needle = aliasHit ?? trimmed;
  const lower = needle.toLowerCase();
  return (
    spec.options.find((opt) => opt.value === needle) ??
    spec.options.find((opt) => opt.value.toLowerCase() === lower) ??
    spec.options.find((opt) => opt.label.toLowerCase() === lower) ??
    spec.options.find((opt) => normalizeLookup(opt.label) === normalizeLookup(needle)) ??
    null
  );
}

export function parseAdminLiveFieldValue(
  fieldKey: string,
  raw: string,
): { ok: true; value: unknown } | { ok: false } {
  const spec = getAdminLiveFieldSpec(fieldKey);
  if (!spec) return { ok: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  if (spec.kind === "score") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, value: n };
  }

  const matched = resolveAdminLiveFieldOption(spec, fieldKey, trimmed);
  if (matched) return { ok: true, value: matched.value };
  if (!spec.allowCustom) return { ok: false };
  return { ok: true, value: trimmed };
}

export function formatAdminLiveFieldDisplay(fieldKey: string, value: unknown): string {
  if (value == null || value === "") return "";
  const spec = getAdminLiveFieldSpec(fieldKey);
  const raw = typeof value === "number" ? String(value) : String(value);
  if (!spec) return raw;
  if (fieldKey === "firm_type") return formatFirmTypeLabel(raw) || raw;
  const matched = spec.options.find((opt) => opt.value === raw || opt.value === String(value));
  return matched?.label ?? raw;
}

function recordText(record: Record<string, unknown>): string {
  return [
    record.description,
    record.elevator_pitch,
    record.tagline,
    record.investment_philosophy,
    record.bio,
    record.short_summary,
    record.sentiment_detail,
  ]
    .map((item) => asString(item))
    .filter(Boolean)
    .join("\n");
}

function recommendFromClassifier(
  fieldKey: string,
  record: Record<string, unknown>,
): AdminLiveFieldRecommendation | null {
  const input = {
    description: asString(record.description),
    elevator_pitch: asString(record.elevator_pitch),
    about_text: asString(record.bio) ?? asString(record.investment_philosophy),
    thesis_text: recordText(record),
    stage_focus: asStringList(record.stage_focus),
    stages: asStringList(record.preferred_stage),
    themes: [
      ...asStringList(record.investment_themes),
      ...asStringList(record.strategy_classifications),
    ],
    sectors: [
      ...asStringList(record.thesis_verticals),
      ...asStringList(record.sector_focus),
      ...asStringList(record.sub_sectors),
    ],
    firm_type_hint: asString(record.firm_type) ?? asString(record.entity_type),
    source_tags: [asString(record.firm_type), asString(record.entity_type)].filter(
      (item): item is string => Boolean(item),
    ),
  };

  if (fieldKey === "sector_classification") {
    const result = classifySector(input);
    if (!result) return null;
    return { value: result.value, reason: "From thesis, sectors, and description" };
  }
  if (fieldKey === "stage_classification") {
    const result = classifyStage(input);
    if (!result) return null;
    return { value: result.value, reason: "From preferred stage and description" };
  }
  if (fieldKey === "theme_classification") {
    const result = classifyTheme(input);
    if (!result) return null;
    return { value: result.value, reason: "From themes and description" };
  }
  if (fieldKey === "structure_classification") {
    const result = classifyStructure(input);
    if (!result) return null;
    return { value: result.value, reason: "From firm type and description" };
  }
  if (fieldKey === "impact_orientation") {
    const result = classifyImpact(input);
    if (!result) return null;
    return { value: result.value, reason: "From description language" };
  }
  return null;
}

function recommendScore(
  fieldKey: string,
  record: Record<string, unknown>,
): AdminLiveFieldRecommendation | null {
  const siblings = SCORE_SIBLINGS[fieldKey] ?? [];
  const values: number[] = [];
  const used: string[] = [];
  for (const key of siblings) {
    const n = asNumber(record[key]);
    if (n == null) continue;
    values.push(n);
    used.push(key.replace(/_/g, " "));
  }
  if (!values.length) return null;
  const avg = Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
  return {
    value: String(avg),
    reason: used.length === 1 ? `Based on ${used[0]}` : `Based on ${used.slice(0, 2).join(" and ")}`,
  };
}

export function recommendAdminLiveField(
  fieldKey: string,
  record: Record<string, unknown>,
): AdminLiveFieldRecommendation | null {
  const spec = getAdminLiveFieldSpec(fieldKey);
  if (!spec) return null;

  if (spec.kind === "score") return recommendScore(fieldKey, record);

  if (fieldKey === "thesis_orientation") {
    const sector = asString(record.sector_classification);
    if (sector === "generalist") return { value: "Generalist", reason: "Matches sector classification" };
    if (sector === "sector_focused") return { value: "Sector-Focused", reason: "Matches sector classification" };
    if (sector === "multi_sector") return { value: "Thesis-Driven", reason: "Matches sector classification" };
    const inferred = recommendFromClassifier("sector_classification", record);
    if (!inferred) return null;
    const value =
      inferred.value === "generalist"
        ? "Generalist"
        : inferred.value === "sector_focused"
          ? "Sector-Focused"
          : "Thesis-Driven";
    return { value, reason: "From thesis and sectors" };
  }

  if (fieldKey === "sector_scope") {
    const sector = asString(record.sector_classification);
    if (sector === "generalist") return { value: "Generalist", reason: "Matches sector classification" };
    if (sector === "sector_focused" || sector === "multi_sector") {
      return { value: "Specialized", reason: "Matches sector classification" };
    }
  }

  if (fieldKey === "entity_type") {
    const firmType = asString(record.firm_type)?.toUpperCase();
    if (firmType && FIRM_TYPE_TO_ENTITY[firmType]) {
      return { value: FIRM_TYPE_TO_ENTITY[firmType], reason: "From firm type" };
    }
  }

  if (fieldKey === "firm_type") {
    const entity = asString(record.entity_type);
    if (entity === "Corporate (CVC)") return { value: "CVC", reason: "From entity type" };
    if (entity === "Family Office") return { value: "FAMILY_OFFICE", reason: "From entity type" };
    if (entity === "Solo GP") return { value: "SOLO_GP", reason: "From entity type" };
    if (entity === "Angel") return { value: "ANGEL_NETWORK", reason: "From entity type" };
    if (entity === "Micro") return { value: "MICRO_VC", reason: "From entity type" };
    if (entity === "Accelerator / Studio") return { value: "ACCELERATOR", reason: "From entity type" };
  }

  if (fieldKey === "lead_or_follow" || fieldKey === "lead_vs_follow") {
    const otherKey = fieldKey === "lead_or_follow" ? "lead_vs_follow" : "lead_or_follow";
    const other = asString(record[otherKey]);
    if (other) return { value: other.toLowerCase(), reason: "From the related lead/follow field" };
  }

  return recommendFromClassifier(fieldKey, record);
}

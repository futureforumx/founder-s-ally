import type { EntityType, FieldValueType, RecordRow, RefreshGroup } from "./types";
import { isEmptyValue } from "./normalize";

export interface FieldSpec {
  /** Canonical field name used by mappers and decisions. */
  field: string;
  /** Real column on the entity table (verified against generated Supabase types in tests). */
  column: string;
  type: FieldValueType;
  group: RefreshGroup;
  /** Counts toward the completeness metric. */
  completeness?: boolean;
  /** Never written automatically (enum / constrained columns, substantiation-sensitive flags). */
  reviewOnly?: boolean;
  /** Private contact data; only touched with --allow-contact-lookups and never exposed in reports. */
  contact?: boolean;
  /** Multi-value attribute merged (deduped union) rather than replaced. */
  multi?: boolean;
}

export interface ParentSpec {
  /** Column on this entity that references the parent row. */
  fkColumn: string;
  table: string;
  nameColumn: string;
  domainColumn: string | null;
  websiteColumn: string | null;
}

export interface EntitySpec {
  entity: EntityType;
  table: string;
  idColumn: string;
  nameColumn: string;
  domainColumn: string | null;
  websiteColumn: string | null;
  linkedinColumn: string | null;
  softDeleteColumn: string | null;
  /** Timestamp column bumped when the record is enriched; null when the table has no suitable column. */
  touchColumn: string | null;
  /** Numeric priority signal (higher = enrich first), when the table has one. */
  priorityColumn: string | null;
  parent: ParentSpec | null;
  fields: FieldSpec[];
}

const f = (
  field: string,
  type: FieldValueType,
  group: RefreshGroup,
  opts: Partial<Pick<FieldSpec, "column" | "completeness" | "reviewOnly" | "contact" | "multi">> = {},
): FieldSpec => ({ field, column: opts.column ?? field, type, group, ...opts });

const FIRM_FIELDS: FieldSpec[] = [
  f("website_url", "url", "firmographics", { completeness: true }),
  f("domain", "domain", "firmographics", { completeness: true }),
  f("logo_url", "url", "firmographics", { completeness: true }),
  f("description", "text", "firmographics", { completeness: true }),
  f("legal_name", "text", "firmographics"),
  f("linkedin_url", "url", "firmographics", { completeness: true }),
  f("x_url", "url", "firmographics"),
  f("hq_city", "text", "firmographics", { completeness: true }),
  f("hq_state", "text", "firmographics"),
  f("hq_country", "text", "firmographics", { completeness: true }),
  f("founded_year", "int", "firmographics", { completeness: true }),
  f("total_headcount", "int", "growth", { completeness: true }),
  f("sector_focus", "text[]", "criteria", { completeness: true, multi: true }),
  f("sub_sectors", "text[]", "criteria", { multi: true }),
  f("investment_themes", "text[]", "criteria", { multi: true }),
  f("stage_focus", "text[]", "criteria", { completeness: true, reviewOnly: true, multi: true }),
  f("co_investor_patterns", "text[]", "funding_deals", { completeness: true, multi: true }),
  f("deals_last_24m", "int", "funding_deals"),
  f("most_recent_investment_date", "date", "funding_deals", { completeness: true }),
  f("first_investment_date", "date", "funding_deals"),
  f("lead_investments_count", "int", "funding_deals"),
  f("last_5_investments", "json", "funding_deals", { completeness: true }),
  f("min_check_size", "number", "criteria", { completeness: true }),
  f("max_check_size", "number", "criteria", { completeness: true }),
  f("current_fund_name", "text", "criteria", { completeness: true }),
  f("aum_usd", "number", "criteria", { completeness: true }),
];

const INVESTOR_FIELDS: FieldSpec[] = [
  f("title", "text", "roles", { completeness: true }),
  f("seniority", "text", "roles"),
  f("bio", "text", "profiles", { completeness: true }),
  f("short_summary", "text", "profiles"),
  f("linkedin_url", "url", "profiles", { completeness: true }),
  f("x_url", "url", "profiles"),
  f("personal_website", "url", "profiles"),
  f("email", "text", "roles", { completeness: true, contact: true }),
  f("city", "text", "profiles", { completeness: true }),
  f("state", "text", "profiles"),
  f("country", "text", "profiles", { completeness: true }),
  f("prior_firms", "text[]", "profiles", { completeness: true, multi: true }),
  f("prior_roles", "json", "profiles"),
  f("education_summary", "text", "profiles", { completeness: true }),
  f("domain_expertise", "text[]", "profiles", { multi: true }),
  f("sector_focus", "text[]", "criteria", { completeness: true, multi: true }),
  f("stage_focus", "text[]", "criteria", { completeness: true, multi: true }),
  f("geographic_focus", "text[]", "criteria", { multi: true }),
  f("investing_themes", "text[]", "criteria", { multi: true }),
  f("check_size_min", "number", "criteria"),
  f("check_size_max", "number", "criteria"),
  f("board_seats", "text[]", "roles", { reviewOnly: true, multi: true }),
  f("portfolio_companies", "text[]", "funding_deals", { reviewOnly: true, multi: true }),
  f("founder_background", "text", "profiles"),
  f("operator_background", "text", "profiles"),
];

const COMPANY_FIELDS: FieldSpec[] = [
  f("company_url", "url", "firmographics", { completeness: true }),
  f("domain", "domain", "firmographics", { completeness: true }),
  f("logo_url", "url", "firmographics", { completeness: true }),
  f("description_short", "text", "firmographics", { completeness: true }),
  f("description_long", "text", "firmographics"),
  f("linkedin_url", "url", "firmographics", { completeness: true }),
  f("x_url", "url", "firmographics"),
  f("crunchbase_url", "url", "firmographics"),
  f("hq_city", "text", "firmographics", { completeness: true }),
  f("hq_state", "text", "firmographics"),
  f("hq_country", "text", "firmographics", { completeness: true }),
  f("founded_year", "int", "firmographics", { completeness: true }),
  f("headcount", "int", "growth", { completeness: true }),
  f("headcount_growth_pct", "number", "growth"),
  f("total_raised_usd", "number", "funding_deals", { completeness: true }),
  f("last_round_type", "text", "funding_deals", { completeness: true }),
  f("last_round_date", "date", "funding_deals", { completeness: true }),
  f("last_round_size_usd", "number", "funding_deals"),
  f("last_funding_date", "date", "funding_deals"),
  f("valuation_usd", "number", "funding_deals"),
  f("investor_names", "text[]", "funding_deals", { completeness: true, multi: true }),
  f("lead_investor_names", "text[]", "funding_deals", { multi: true }),
  f("tech_stack", "text[]", "growth", { multi: true }),
  f("market_category", "text", "criteria"),
  f("sector", "text", "criteria", { completeness: true, reviewOnly: true }),
  f("stage", "text", "funding_deals", { completeness: true, reviewOnly: true }),
  f("business_model", "text", "criteria", { reviewOnly: true }),
];

const FOUNDER_FIELDS: FieldSpec[] = [
  f("role", "text", "roles", { completeness: true }),
  f("email", "text", "roles", { completeness: true, contact: true }),
  f("linkedin_url", "url", "profiles", { completeness: true }),
  f("x_url", "url", "profiles"),
  f("location", "text", "profiles", { completeness: true }),
  f("operator_background", "text", "profiles"),
  f("prior_companies", "text[]", "profiles", { completeness: true, multi: true }),
  f("prior_exits", "text[]", "profiles", { reviewOnly: true, multi: true }),
  f("has_prior_exit", "boolean", "profiles", { reviewOnly: true }),
  f("is_repeat_founder", "boolean", "profiles", { reviewOnly: true }),
  f("domain_expertise", "text[]", "profiles", { multi: true }),
  f("education_highlight", "text", "profiles", { completeness: true }),
];

const OPERATOR_FIELDS: FieldSpec[] = [
  f("title", "text", "roles", { completeness: true }),
  f("bio", "text", "profiles", { completeness: true }),
  f("email", "text", "roles", { completeness: true, contact: true }),
  f("linkedin_url", "url", "profiles", { completeness: true }),
  f("x_url", "url", "profiles"),
  f("website_url", "url", "profiles"),
  f("city", "text", "profiles", { completeness: true }),
  f("state", "text", "profiles"),
  f("country", "text", "profiles", { completeness: true }),
  f("expertise", "text[]", "profiles", { completeness: true, multi: true }),
  f("prior_companies", "text[]", "profiles", { completeness: true, multi: true }),
  f("sector_focus", "text[]", "criteria", { multi: true }),
];

export const ENTITY_SPECS: Record<EntityType, EntitySpec> = {
  firm: {
    entity: "firm",
    table: "firm_records",
    idColumn: "id",
    nameColumn: "firm_name",
    domainColumn: "domain",
    websiteColumn: "website_url",
    linkedinColumn: "linkedin_url",
    softDeleteColumn: "deleted_at",
    touchColumn: "last_enriched_at",
    priorityColumn: "match_score",
    parent: null,
    fields: FIRM_FIELDS,
  },
  investor: {
    entity: "investor",
    table: "firm_investors",
    idColumn: "id",
    nameColumn: "full_name",
    domainColumn: null,
    websiteColumn: "personal_website",
    linkedinColumn: "linkedin_url",
    softDeleteColumn: "deleted_at",
    touchColumn: "last_enriched_at",
    priorityColumn: "match_score",
    parent: { fkColumn: "firm_id", table: "firm_records", nameColumn: "firm_name", domainColumn: "domain", websiteColumn: "website_url" },
    fields: INVESTOR_FIELDS,
  },
  company: {
    entity: "company",
    table: "startups",
    idColumn: "id",
    nameColumn: "company_name",
    domainColumn: "domain",
    websiteColumn: "company_url",
    linkedinColumn: "linkedin_url",
    softDeleteColumn: "deleted_at",
    touchColumn: null,
    priorityColumn: "momentum_score",
    parent: null,
    fields: COMPANY_FIELDS,
  },
  founder: {
    entity: "founder",
    table: "startup_founders",
    idColumn: "id",
    nameColumn: "full_name",
    domainColumn: null,
    websiteColumn: null,
    linkedinColumn: "linkedin_url",
    softDeleteColumn: null,
    touchColumn: null,
    priorityColumn: "track_record_score",
    parent: { fkColumn: "startup_id", table: "startups", nameColumn: "company_name", domainColumn: "domain", websiteColumn: "company_url" },
    fields: FOUNDER_FIELDS,
  },
  operator: {
    entity: "operator",
    table: "operator_profiles",
    idColumn: "id",
    nameColumn: "full_name",
    domainColumn: null,
    websiteColumn: "website_url",
    linkedinColumn: "linkedin_url",
    softDeleteColumn: "deleted_at",
    touchColumn: "last_enriched_at",
    priorityColumn: null,
    parent: null,
    fields: OPERATOR_FIELDS,
  },
};

export function entitySpec(entity: EntityType): EntitySpec {
  return ENTITY_SPECS[entity];
}

export function fieldSpec(entity: EntityType, field: string): FieldSpec | undefined {
  return ENTITY_SPECS[entity].fields.find((x) => x.field === field);
}

/** Every column that must exist on the entity table for the registry to be valid. */
export function registryColumns(entity: EntityType): string[] {
  const spec = ENTITY_SPECS[entity];
  const cols = new Set<string>([spec.idColumn, spec.nameColumn]);
  for (const c of [spec.domainColumn, spec.websiteColumn, spec.linkedinColumn, spec.softDeleteColumn, spec.touchColumn, spec.priorityColumn]) {
    if (c) cols.add(c);
  }
  if (spec.parent) cols.add(spec.parent.fkColumn);
  for (const fs of spec.fields) cols.add(fs.column);
  return [...cols];
}

export function selectColumns(entity: EntityType): string {
  return registryColumns(entity).join(",");
}

export function completenessFields(entity: EntityType, includeContact = true): FieldSpec[] {
  return ENTITY_SPECS[entity].fields.filter((x) => x.completeness && (includeContact || !x.contact));
}

/** 0..100 share of completeness fields that are populated. */
export function completenessScore(entity: EntityType, row: RecordRow): number {
  const fields = completenessFields(entity);
  if (!fields.length) return 100;
  const filled = fields.filter((x) => !isEmptyValue(row[x.column])).length;
  return Math.round((filled / fields.length) * 1000) / 10;
}

export function missingFields(entity: EntityType, row: RecordRow, opts: { includeContact?: boolean } = {}): FieldSpec[] {
  return completenessFields(entity, opts.includeContact ?? true).filter((x) => isEmptyValue(row[x.column]));
}

/** Refresh intervals in days. Env: ALEXANDRIA_REFRESH_DAYS_<GROUP_UPPERCASE>. */
export const DEFAULT_REFRESH_DAYS: Record<RefreshGroup, number> = {
  funding_deals: 1,
  roles: 30,
  criteria: 45,
  growth: 30,
  profiles: 75,
  firmographics: 135,
};

export function refreshIntervalDays(group: RefreshGroup, env: Record<string, string | undefined> = process.env): number {
  const raw = env[`ALEXANDRIA_REFRESH_DAYS_${group.toUpperCase()}`];
  const n = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REFRESH_DAYS[group];
}

/** Groups whose last refresh is older than their interval (or never refreshed). */
export function staleGroups(
  entity: EntityType,
  fieldLastRefreshed: Record<string, string> | null | undefined,
  now: Date,
  env: Record<string, string | undefined> = process.env,
): RefreshGroup[] {
  const groups = new Set<RefreshGroup>(ENTITY_SPECS[entity].fields.map((x) => x.group));
  const out: RefreshGroup[] = [];
  for (const g of groups) {
    const last = fieldLastRefreshed?.[g];
    if (!last) {
      out.push(g);
      continue;
    }
    const ageDays = (now.getTime() - new Date(last).getTime()) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays >= refreshIntervalDays(g, env)) out.push(g);
  }
  return out;
}

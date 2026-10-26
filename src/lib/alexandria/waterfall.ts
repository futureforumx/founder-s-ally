import type { Catalog } from "./catalog";
import type { EntitySpec, FieldSpec } from "./fieldRegistry";
import type { EntityIdentity } from "./identity";
import { looksLikePersonName, normalizeLinkedinUrl } from "./normalize";
import type { EntityType, JobOptions, ProviderCallPlan, RecordRow } from "./types";

/**
 * Cost-aware provider waterfall. Stages run in order; an escalation stage only runs while material
 * fields are still missing after the earlier stages. Within a stage calls are independent.
 *
 * Order is by listed price (all prices come from the verified catalog snapshot, never hard-coded here):
 *   Fireround (5) -> FullEnrich (5) -> Data Legion (10, capture-only) -> Apollo (30, terms-gated) -> PDL (50).
 */

export interface Stage {
  name: string;
  /** Run only while material fields remain uncovered. */
  escalation: boolean;
  calls: ProviderCallPlan[];
}

export interface PlanInput {
  entity: EntityType;
  spec: EntitySpec;
  row: RecordRow;
  identity: EntityIdentity;
  /** Registry fields the job wants (missing and/or stale). */
  targets: FieldSpec[];
  options: Pick<JobOptions, "allowContactLookups" | "providers">;
  catalog: Catalog;
  /** Providers the run already knows it must not call (terms pending). */
  isBlocked: (provider: string) => boolean;
}

export interface PlanResult {
  stages: Stage[];
  skipped: Array<{ provider: string; capability: string; reason: string }>;
  /** Cost if every stage ran (upper bound shown in dry runs). */
  worstCaseCredits: number;
  /** Cost of the non-escalation stages only. */
  baseCredits: number;
}

function providerAllowed(provider: string, options: PlanInput["options"]): boolean {
  return !options.providers || options.providers.includes(provider);
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
}

/** Fields (by registry name) a call can fill. Used both for planning and for escalation checks. */
const COVERS: Record<string, Record<EntityType, string[]>> = {
  "fireround/investors/profile": {
    firm: ["domain", "description", "hq_city", "hq_state", "hq_country", "co_investor_patterns", "most_recent_investment_date", "last_5_investments", "sector_focus", "stage_focus"],
    investor: [], company: [], founder: [], operator: [],
  },
  "fireround/companies/profile": {
    company: ["domain", "description_short", "description_long", "hq_city", "hq_state", "hq_country", "sector", "total_raised_usd", "last_round_type", "last_round_date", "last_round_size_usd", "investor_names", "lead_investor_names"],
    firm: [], investor: [], founder: [], operator: [],
  },
  "fullenrich/companies/lookup": {
    firm: ["domain", "website_url", "description", "logo_url", "founded_year", "total_headcount", "linkedin_url", "x_url", "hq_city", "hq_state", "hq_country"],
    company: ["domain", "company_url", "description_short", "description_long", "logo_url", "founded_year", "headcount", "linkedin_url", "x_url", "tech_stack", "hq_city", "hq_state", "hq_country"],
    investor: [], founder: [], operator: [],
  },
  "fullenrich/people/lookup": {
    investor: ["title", "bio", "linkedin_url", "city", "state", "country", "prior_firms", "education_summary", "domain_expertise"],
    founder: ["role", "linkedin_url", "location", "prior_companies", "education_highlight", "domain_expertise"],
    operator: ["title", "bio", "linkedin_url", "city", "state", "country", "prior_companies", "expertise"],
    firm: [], company: [],
  },
  "fullenrich/contacts/work-email": {
    investor: ["email"], founder: ["email"], operator: ["email"], firm: [], company: [],
  },
  "apollo/companies/enrich": {
    firm: ["website_url", "domain", "total_headcount"],
    company: ["company_url", "domain", "headcount", "total_raised_usd", "last_round_type", "tech_stack"],
    investor: [], founder: [], operator: [],
  },
  "apollo/people/match": {
    investor: ["title", "linkedin_url", "prior_firms", "email"],
    founder: ["role", "linkedin_url", "prior_companies", "email"],
    operator: ["title", "linkedin_url", "prior_companies", "email"],
    firm: [], company: [],
  },
  "people-data-labs/company/enrich": {
    firm: ["domain", "website_url", "total_headcount", "hq_city", "hq_country"],
    company: ["domain", "company_url", "headcount", "total_raised_usd", "hq_city", "hq_state", "hq_country"],
    investor: [], founder: [], operator: [],
  },
};

export function coveredFields(provider: string, capability: string, entity: EntityType): string[] {
  return COVERS[`${provider}/${capability}`]?.[entity] ?? [];
}

export function planWaterfall(input: PlanInput): PlanResult {
  const { entity, spec, row, identity, catalog, options } = input;
  const targetNames = new Set(input.targets.map((t) => t.field));
  const stages: Stage[] = [];
  const skipped: PlanResult["skipped"] = [];

  const addCall = (stage: Stage, provider: string, capability: string, callOptions: Record<string, unknown>, note?: string, contact = false) => {
    if (!providerAllowed(provider, options)) {
      skipped.push({ provider, capability, reason: "provider_not_selected" });
      return;
    }
    if (!catalog.has(provider, capability)) {
      skipped.push({ provider, capability, reason: "not_in_verified_catalog" });
      return;
    }
    if (input.isBlocked(provider) || catalog.termsRequired(provider) === true) {
      skipped.push({ provider, capability, reason: "provider_terms_not_accepted" });
      return;
    }
    const covers = coveredFields(provider, capability, entity).filter((f) => targetNames.has(f));
    if (!covers.length) {
      skipped.push({ provider, capability, reason: "no_target_fields_covered" });
      return;
    }
    if (contact && !options.allowContactLookups) {
      skipped.push({ provider, capability, reason: "contact_lookup_not_authorized" });
      return;
    }
    stage.calls.push({ provider, capability, options: callOptions, covers, estimatedCredits: catalog.price(provider, capability, 1), contact, note });
  };

  const linkedin =
    identity.linkedinSlug && spec.linkedinColumn
      ? (normalizeLinkedinUrl(row[spec.linkedinColumn], entity === "firm" || entity === "company" ? "company" : "in") ?? "")
      : "";
  const domain = identity.domain;
  const name = identity.name;

  if (entity === "firm" || entity === "company") {
    const cheap: Stage = { name: "primary", escalation: false, calls: [] };
    const second: Stage = { name: "firmographics", escalation: false, calls: [] };
    const fallback: Stage = { name: "fallback", escalation: true, calls: [] };

    // investors/profile documents "the investor's name" as an accepted id, and its not_found response says "name or site";
    // companies/profile documents the domain. A known domain is the more precise key.
    if (entity === "firm" && (domain || name)) {
      addCall(cheap, "fireround", "investors/profile", { id: domain ?? name }, domain ? "matched by site; identity verified against returned domain" : "matched by name; identity verified against returned domain");
    } else if (entity === "company") {
      const fireId = domain ?? name;
      if (fireId) addCall(cheap, "fireround", "companies/profile", { id: fireId }, domain ? "matched by domain" : "matched by name only");
    }

    if (domain) addCall(second, "fullenrich", "companies/lookup", { domain });
    else if (linkedin) addCall(second, "fullenrich", "companies/lookup", { professional_network_url: linkedin });

    // Fallbacks need a strong identifier; a bare name is the identifier most likely to miss.
    if (domain) {
      addCall(fallback, "apollo", "companies/enrich", { domain });
      addCall(fallback, "people-data-labs", "company/enrich", { website: domain });
    } else if (linkedin) {
      addCall(fallback, "apollo", "companies/enrich", { linkedin_url: linkedin });
      addCall(fallback, "people-data-labs", "company/enrich", { profile: linkedin });
    }
    if (options.providers?.includes("datalegion") && domain) {
      addCall(fallback, "datalegion", "companies/enrich-base", { domain }, "capture-only until response shape is verified");
    }
    for (const s of [cheap, second, fallback]) if (s.calls.length) stages.push(s);
  } else {
    const profile: Stage = { name: "profile", escalation: false, calls: [] };
    const fallback: Stage = { name: "fallback", escalation: true, calls: [] };
    const contactStage: Stage = { name: "contact", escalation: false, calls: [] };

    const employerDomain = identity.parentDomain;
    if (linkedin) {
      addCall(profile, "fullenrich", "people/lookup", { person_professional_network_url: linkedin });
      addCall(fallback, "apollo", "people/match", { linkedin_url: linkedin });
    } else if (name && employerDomain && looksLikePersonName(name)) {
      addCall(profile, "fullenrich", "people/lookup", { person_name: name, company_domain: employerDomain });
      addCall(fallback, "apollo", "people/match", { name, domain: employerDomain });
    } else if (name && employerDomain) {
      skipped.push({ provider: "fullenrich", capability: "people/lookup", reason: "not_a_person_name: the name looks like a role, organisation or page artefact; skipped before any paid call" });
    } else {
      skipped.push({ provider: "fullenrich", capability: "people/lookup", reason: "insufficient_identifiers: needs LinkedIn URL or name + verified employer domain" });
    }

    if (linkedin) {
      addCall(contactStage, "fullenrich", "contacts/work-email", { linkedin_url: linkedin }, "work email only; requires --allow-contact-lookups", true);
    } else if (name && employerDomain && looksLikePersonName(name)) {
      const { first, last } = splitName(name);
      if (first && last) addCall(contactStage, "fullenrich", "contacts/work-email", { first_name: first, last_name: last, domain: employerDomain }, "work email only; requires --allow-contact-lookups", true);
    }
    for (const s of [profile, fallback, contactStage]) if (s.calls.length) stages.push(s);
  }

  let base = 0;
  let worst = 0;
  for (const s of stages) {
    const cost = s.calls.reduce((n, c) => n + c.estimatedCredits, 0);
    worst += cost;
    if (!s.escalation) base += cost;
  }
  return { stages, skipped, worstCaseCredits: worst, baseCredits: base };
}

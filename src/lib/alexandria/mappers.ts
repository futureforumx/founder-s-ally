import { normalizeCountry, normalizeDomain, normalizeLinkedinUrl, normalizeUrl } from "./normalize";
import type { ProviderEntity } from "./identity";
import type { EntityType, Fact, FactKind, VerificationStatus } from "./types";

/**
 * Provider response -> facts. Every mapper reads only fields listed in the verified Alexandria
 * contract (catalog.snapshot.json). Values inside nested `object` / `object[]` fields are not
 * documented, so facts derived from them carry `shapeDocumented: false` and cannot reach "high"
 * confidence until a pilot run (--capture-shapes) has been reviewed and the capability is listed in
 * ALEXANDRIA_TRUSTED_SHAPES.
 */

export interface MapContext {
  entity: EntityType;
  retrievedAt: string;
  /** "provider/capability" strings whose nested shapes were verified in a pilot. */
  trustedShapes: ReadonlySet<string>;
}

export interface RelationshipClaim {
  kind: "FIRM_INVESTED_IN_COMPANY";
  companyName: string;
  companyDomain: string | null;
  companyExternalId: string | null;
  roundType: string | null;
  amountUsd: number | null;
  announcedOn: string | null;
  role: "lead" | "participant" | "unknown";
  shapeDocumented: boolean;
  provider: string;
  capability: string;
}

export interface MapResult {
  facts: Fact[];
  providerEntity: ProviderEntity | null;
  relationships: RelationshipClaim[];
  notes: string[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** Walks a dotted path through nested objects; arrays are not traversed. */
function dig(o: unknown, ...paths: string[]): unknown {
  for (const p of paths) {
    let cur: unknown = o;
    for (const seg of p.split(".")) {
      if (!isObj(cur)) {
        cur = undefined;
        break;
      }
      cur = cur[seg];
    }
    if (cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

/** Records live under the contract's `response.key` when present; some responses are already unwrapped. */
export function extractRecords(data: unknown, key?: string | null): Obj[] {
  const inner = isObj(data) && key && key in data ? data[key] : data;
  if (Array.isArray(inner)) return inner.filter(isObj);
  if (isObj(inner)) return [inner];
  return [];
}

function asObjArray(v: unknown): Obj[] {
  return Array.isArray(v) ? v.filter(isObj) : [];
}

class FactSink {
  facts: Fact[] = [];
  constructor(
    private readonly provider: string,
    private readonly capability: string,
    private readonly ctx: MapContext,
  ) {}

  private trusted(): boolean {
    return this.ctx.trustedShapes.has(`${this.provider}/${this.capability}`);
  }

  add(
    field: string,
    value: unknown,
    opts: { documented: boolean; verification?: VerificationStatus; kind?: FactKind; sourceUrl?: string | null; evidence?: string | null; likelihood?: number | null } ,
  ): void {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return;
    this.facts.push({
      field,
      value,
      provider: this.provider,
      capability: this.capability,
      kind: opts.kind ?? "explicit",
      verification: opts.verification ?? "provider_reported",
      shapeDocumented: opts.documented || this.trusted(),
      sourceUrl: opts.sourceUrl ?? null,
      evidence: opts.evidence ?? null,
      retrievedAt: this.ctx.retrievedAt,
      providerLikelihood: opts.likelihood ?? null,
    });
  }
}

const EMPTY: MapResult = { facts: [], providerEntity: null, relationships: [], notes: [] };

/** "San Francisco, CA, United States" -> city/state/country; one-part strings are ambiguous and ignored. */
export function parseLocationString(s: string | null): { city: string | null; state: string | null; country: string | null } | null {
  if (!s) return null;
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const country = normalizeCountry(parts[parts.length - 1]);
  const city = parts[0] || null;
  const state = parts.length >= 3 ? parts[1] : null;
  return { city, state, country };
}

function locationFromObject(o: unknown): { city: string | null; state: string | null; country: string | null } | null {
  if (!isObj(o)) return null;
  const city = str(o.city) ?? str(o.locality);
  const state = str(o.state) ?? str(o.region);
  const country = normalizeCountry(str(o.country) ?? str(o.country_name));
  if (!city && !country) return null;
  return { city, state, country };
}

function socialUrl(social: unknown, ...names: string[]): string | null {
  if (!isObj(social)) {
    if (Array.isArray(social)) {
      for (const item of social) {
        if (!isObj(item)) continue;
        const net = (str(item.network) ?? str(item.type) ?? str(item.name) ?? "").toLowerCase();
        if (names.some((n) => net.includes(n))) return str(item.url) ?? str(item.link);
      }
    }
    return null;
  }
  for (const n of names) {
    const v = social[n];
    if (typeof v === "string") return v;
    if (isObj(v)) return str(v.url) ?? str(v.link) ?? str(v.profile_url);
  }
  return null;
}

function usd(millions: number | null): number | null {
  return millions === null ? null : Math.round(millions * 1_000_000);
}

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function names(list: unknown, keys = ["name", "investor_name", "company_name", "title"]): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else if (isObj(item)) {
      for (const k of keys) {
        const v = str(item[k]) ?? (isObj(item.investor) ? str(item.investor.name) : null) ?? (isObj(item.company) ? str(item.company.name) : null);
        if (v) {
          out.push(v);
          break;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fireround
// ---------------------------------------------------------------------------

function mapFireroundInvestorProfile(rec: Obj, sink: FactSink, ctx: MapContext, relationships: RelationshipClaim[]): ProviderEntity {
  const domain = normalizeDomain(rec.domain);
  const hq = parseLocationString(str(rec.headquarters));
  const entity: ProviderEntity = { name: str(rec.name), domain, country: hq?.country ?? null, city: hq?.city ?? null };

  if (ctx.entity === "firm") {
    sink.add("domain", domain, { documented: true });
    sink.add("description", str(rec.description), { documented: true });
    if (hq) {
      sink.add("hq_city", hq.city, { documented: false });
      sink.add("hq_state", hq.state, { documented: false });
      sink.add("hq_country", hq.country, { documented: false });
    }
    const sectors = names(rec.sectors);
    if (sectors.length) {
      // Sectors a firm has backed describe activity, not its stated thesis.
      sink.add("sector_focus", sectors.slice(0, 8), { documented: false, kind: "inferred", verification: "derived" });
    }
    const stages = names(rec.stages);
    if (stages.length) sink.add("stage_focus", stages.slice(0, 8), { documented: false, kind: "inferred", verification: "derived" });
    const coInvestors = names(rec.co_investors);
    if (coInvestors.length) sink.add("co_investor_patterns", coInvestors.slice(0, 15), { documented: false });

    const rounds = asObjArray(rec.recent_rounds);
    const dated = rounds
      .map((r) => ({ r, date: isoDate(r.date) ?? isoDate(r.announced_on) ?? isoDate(r.announced_at) ?? isoDate(r.closed_at) }))
      .filter((x) => x.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (dated.length) sink.add("most_recent_investment_date", dated[0].date, { documented: false });

    const last5 = rounds.slice(0, 5).map((r) => ({
      company_name: str(r.company_name) ?? str(r.company) ?? (isObj(r.company) ? str(r.company.name) : null) ?? str(r.name),
      date: isoDate(r.date) ?? isoDate(r.announced_on) ?? isoDate(r.announced_at),
      round: str(r.round) ?? str(r.round_type) ?? str(r.stage) ?? str(r.type),
      role: str(r.role),
    })).filter((x) => x.company_name);
    if (last5.length) sink.add("last_5_investments", last5, { documented: false });

    for (const r of rounds) {
      const companyName = str(r.company_name) ?? str(r.company) ?? (isObj(r.company) ? str(r.company.name) : null) ?? str(r.name);
      if (!companyName) continue;
      const role = (str(r.role) ?? "").toLowerCase();
      relationships.push({
        kind: "FIRM_INVESTED_IN_COMPANY",
        companyName,
        companyDomain: normalizeDomain(r.company_domain ?? (isObj(r.company) ? r.company.domain : undefined) ?? r.domain),
        companyExternalId: str(r.company_id) ?? (isObj(r.company) ? str(r.company.id) : null),
        roundType: str(r.round) ?? str(r.round_type) ?? str(r.stage) ?? str(r.type),
        amountUsd: num(r.amount_usd) ?? num(r.amount),
        announcedOn: isoDate(r.date) ?? isoDate(r.announced_on) ?? isoDate(r.announced_at),
        role: role.includes("lead") ? "lead" : role ? "participant" : "unknown",
        shapeDocumented: ctx.trustedShapes.has("fireround/investors/profile"),
        provider: "fireround",
        capability: "investors/profile",
      });
    }
  }
  return entity;
}

function mapFireroundCompanyProfile(rec: Obj, sink: FactSink, ctx: MapContext): ProviderEntity {
  const domain = normalizeDomain(rec.domain);
  const hq = parseLocationString(str(rec.headquarters));
  const entity: ProviderEntity = { name: str(rec.name), domain, country: hq?.country ?? null, city: hq?.city ?? null };
  if (ctx.entity !== "company") return entity;

  sink.add("domain", domain, { documented: true });
  const description = str(rec.description);
  sink.add("description_long", description, { documented: true });
  if (description && description.length <= 280) sink.add("description_short", description, { documented: true });
  if (hq) {
    sink.add("hq_city", hq.city, { documented: false });
    sink.add("hq_state", hq.state, { documented: false });
    sink.add("hq_country", hq.country, { documented: false });
  }
  sink.add("sector", str(rec.sector), { documented: true });
  sink.add("total_raised_usd", usd(num(rec.total_raised_usd_millions)), { documented: true });

  if (isObj(rec.latest_round)) {
    const lr = rec.latest_round;
    sink.add("last_round_type", str(lr.round) ?? str(lr.round_type) ?? str(lr.stage) ?? str(lr.type), { documented: false });
    sink.add("last_round_date", isoDate(lr.date) ?? isoDate(lr.announced_on) ?? isoDate(lr.announced_at), { documented: false });
    const amount = num(lr.amount_usd) ?? num(lr.amount);
    if (amount !== null) sink.add("last_round_size_usd", amount, { documented: false });
  }

  const investors = asObjArray(rec.investors);
  const investorNames = names(investors);
  if (investorNames.length) sink.add("investor_names", investorNames.slice(0, 40), { documented: false });
  const leads = investors.filter((i) => i.lead === true || String(i.role ?? "").toLowerCase().includes("lead"));
  if (leads.length) sink.add("lead_investor_names", names(leads).slice(0, 15), { documented: false });
  return entity;
}

// ---------------------------------------------------------------------------
// FullEnrich
// ---------------------------------------------------------------------------

function mapFullEnrichCompany(rec: Obj, sink: FactSink, ctx: MapContext): ProviderEntity {
  const domain = normalizeDomain(rec.domain) ?? normalizeDomain(rec.website);
  const linkedin = normalizeLinkedinUrl(socialUrl(rec.social_profiles, "linkedin", "professional_network"), "company");
  const hq = isObj(rec.locations) ? locationFromObject(rec.locations.headquarters ?? rec.locations.hq ?? rec.locations.primary) : null;
  const entity: ProviderEntity = { name: str(rec.name), domain, website: str(rec.website), linkedin, country: hq?.country ?? null, city: hq?.city ?? null };

  const description = str(rec.description);
  const websiteUrl = normalizeUrl(rec.website);
  const headcount = num(rec.headcount);
  const founded = num(rec.year_founded);

  if (ctx.entity === "firm") {
    sink.add("domain", domain, { documented: true });
    sink.add("website_url", websiteUrl, { documented: true });
    sink.add("description", description, { documented: true });
    sink.add("logo_url", str(rec.logo_url), { documented: true });
    sink.add("founded_year", founded, { documented: true });
    sink.add("total_headcount", headcount, { documented: true });
    sink.add("linkedin_url", linkedin, { documented: false });
    sink.add("x_url", socialUrl(rec.social_profiles, "x", "twitter"), { documented: false });
  } else if (ctx.entity === "company") {
    sink.add("domain", domain, { documented: true });
    sink.add("company_url", websiteUrl, { documented: true });
    sink.add("description_long", description, { documented: true });
    if (description && description.length <= 280) sink.add("description_short", description, { documented: true });
    sink.add("logo_url", str(rec.logo_url), { documented: true });
    sink.add("founded_year", founded, { documented: true });
    sink.add("headcount", headcount, { documented: true });
    sink.add("linkedin_url", linkedin, { documented: false });
    sink.add("x_url", socialUrl(rec.social_profiles, "x", "twitter"), { documented: false });
    const tech = names(rec.technologies);
    if (tech.length) sink.add("tech_stack", tech.slice(0, 40), { documented: false });
  }
  if (hq && (ctx.entity === "firm" || ctx.entity === "company")) {
    sink.add("hq_city", hq.city, { documented: false });
    sink.add("hq_state", hq.state, { documented: false });
    sink.add("hq_country", hq.country, { documented: false });
  }
  return entity;
}

function employmentCurrent(employment: unknown): Obj | null {
  if (!isObj(employment)) return null;
  const current = employment.current ?? employment.primary;
  if (isObj(current)) return current;
  return null;
}

function mapPersonLike(
  rec: { name: string | null; headline: string | null; bio: string | null; linkedin: string | null; location: ReturnType<typeof locationFromObject>; title: string | null; employerName: string | null; employerDomain: string | null; priorCompanies: string[]; education: string | null; skills: string[]; likelihood?: number | null },
  sink: FactSink,
  ctx: MapContext,
  documented: { bio: boolean },
): ProviderEntity {
  const entity: ProviderEntity = {
    name: rec.name,
    linkedin: rec.linkedin,
    employerName: rec.employerName,
    employerDomain: rec.employerDomain,
    pastEmployerNames: rec.priorCompanies,
    country: rec.location?.country ?? null,
    city: rec.location?.city ?? null,
    likelihood: rec.likelihood ?? null,
  };
  const like = rec.likelihood ?? null;
  const e = ctx.entity;
  sink.add("linkedin_url", rec.linkedin, { documented: false, likelihood: like });
  if (e === "investor" || e === "operator") {
    sink.add("title", rec.title ?? rec.headline, { documented: false, likelihood: like });
    sink.add("bio", rec.bio, { documented: documented.bio, likelihood: like });
    sink.add("city", rec.location?.city, { documented: false, likelihood: like });
    sink.add("state", rec.location?.state, { documented: false, likelihood: like });
    sink.add("country", rec.location?.country, { documented: false, likelihood: like });
  }
  if (e === "investor") {
    sink.add("prior_firms", rec.priorCompanies.slice(0, 20), { documented: false, likelihood: like });
    sink.add("education_summary", rec.education, { documented: false, likelihood: like });
    sink.add("domain_expertise", rec.skills.slice(0, 15), { documented: false, likelihood: like });
  }
  if (e === "operator") {
    sink.add("prior_companies", rec.priorCompanies.slice(0, 20), { documented: false, likelihood: like });
    sink.add("expertise", rec.skills.slice(0, 15), { documented: false, likelihood: like });
  }
  if (e === "founder") {
    sink.add("role", rec.title ?? rec.headline, { documented: false, likelihood: like });
    sink.add("prior_companies", rec.priorCompanies.slice(0, 20), { documented: false, likelihood: like });
    sink.add("education_highlight", rec.education, { documented: false, likelihood: like });
    sink.add("domain_expertise", rec.skills.slice(0, 15), { documented: false, likelihood: like });
    if (rec.location) sink.add("location", [rec.location.city, rec.location.state, rec.location.country].filter(Boolean).join(", "), { documented: false, likelihood: like });
  }
  return entity;
}

function educationSummary(educations: unknown): string | null {
  const list = asObjArray(educations);
  const parts = list
    .map((ed) => str(ed.school_name) ?? str(ed.school) ?? str(ed.institution) ?? str(ed.name))
    .filter((x): x is string => Boolean(x));
  return parts.length ? parts.slice(0, 3).join("; ") : null;
}

function priorCompanyNames(employment: unknown, currentName: string | null): string[] {
  if (!isObj(employment)) return [];
  const all = asObjArray(employment.all ?? employment.history ?? employment.past);
  const out = names(all.map((j) => (isObj(j.company) ? { name: j.company.name } : { name: j.company_name ?? j.company })), ["name"]);
  return out.filter((n) => !currentName || n.toLowerCase() !== currentName.toLowerCase());
}

function mapFullEnrichPerson(rec: Obj, sink: FactSink, ctx: MapContext): ProviderEntity {
  const current = employmentCurrent(rec.employment);
  const employerName = current ? str(isObj(current.company) ? current.company.name : current.company_name ?? current.company) : null;
  const employerDomain = current && isObj(current.company) ? normalizeDomain(current.company.domain) : null;
  return mapPersonLike(
    {
      name: str(rec.full_name) ?? ([str(rec.first_name), str(rec.last_name)].filter(Boolean).join(" ") || null),
      headline: str(rec.headline),
      bio: str(rec.description),
      linkedin: normalizeLinkedinUrl(socialUrl(rec.social_profiles, "linkedin", "professional_network"), "in"),
      location: locationFromObject(rec.location),
      title: current ? str(current.title) ?? str(current.job_title) : null,
      employerName,
      employerDomain,
      priorCompanies: priorCompanyNames(rec.employment, employerName),
      education: educationSummary(rec.educations),
      skills: Array.isArray(rec.skills) ? rec.skills.filter((s): s is string => typeof s === "string") : [],
    },
    sink,
    ctx,
    { bio: true },
  );
}

function mapFullEnrichWorkEmail(rec: Obj, sink: FactSink): ProviderEntity | null {
  const info = isObj(rec.contact_info) ? rec.contact_info : null;
  const most = info && isObj(info.most_probable_work_email) ? info.most_probable_work_email : info && isObj(info.work_email) ? info.work_email : null;
  const email = most ? str(most.email) : null;
  const status = most ? (str(most.status) ?? "").toLowerCase() : "";
  if (!email) return null;
  sink.add("email", email, {
    documented: false,
    verification: /valid|verified|deliverable/.test(status) && !/in?valid|undeliverable/.test(status) ? "provider_verified" : "provider_reported",
  });
  return null;
}

// ---------------------------------------------------------------------------
// Apollo (only reachable after the org has accepted Apollo's terms)
// ---------------------------------------------------------------------------

function mapApolloCompany(rec: Obj, sink: FactSink, ctx: MapContext): ProviderEntity {
  const website = normalizeUrl(rec.website_url);
  const domain = normalizeDomain(rec.website_url);
  const entity: ProviderEntity = { name: str(rec.name), domain, website: str(rec.website_url) };
  if (ctx.entity === "company") {
    sink.add("company_url", website, { documented: true });
    sink.add("domain", domain, { documented: true });
    sink.add("headcount", num(rec.estimated_num_employees), { documented: true });
    sink.add("total_raised_usd", num(rec.total_funding), { documented: true });
    sink.add("last_round_type", str(rec.latest_funding_stage), { documented: true });
    const tech = Array.isArray(rec.technology_names) ? rec.technology_names.filter((s): s is string => typeof s === "string") : [];
    if (tech.length) sink.add("tech_stack", tech.slice(0, 40), { documented: true });
  } else if (ctx.entity === "firm") {
    sink.add("website_url", website, { documented: true });
    sink.add("domain", domain, { documented: true });
    sink.add("total_headcount", num(rec.estimated_num_employees), { documented: true });
  }
  return entity;
}

function mapApolloPerson(rec: Obj, sink: FactSink, ctx: MapContext): ProviderEntity {
  const org = isObj(rec.organization) ? rec.organization : null;
  const history = asObjArray(rec.employment_history);
  const employerName = org ? str(org.name) : null;
  const prior = names(history.map((h) => ({ name: h.organization_name ?? h.company })), ["name"]).filter((n) => !employerName || n.toLowerCase() !== employerName.toLowerCase());
  const entity = mapPersonLike(
    {
      name: str(rec.name),
      headline: null,
      bio: null,
      linkedin: normalizeLinkedinUrl(rec.linkedin_url, "in"),
      location: null,
      title: str(rec.title),
      employerName,
      employerDomain: org ? normalizeDomain(org.website_url ?? org.primary_domain) : null,
      priorCompanies: prior,
      education: null,
      skills: [],
    },
    sink,
    ctx,
    { bio: false },
  );
  const email = str(rec.email);
  if (email) sink.add("email", email, { documented: true, verification: "provider_reported" });
  return entity;
}

// ---------------------------------------------------------------------------
// People Data Labs
// ---------------------------------------------------------------------------

function mapPdlCompany(data: Obj, sink: FactSink, ctx: MapContext): ProviderEntity {
  const likelihood = num(data.likelihood);
  const normalizedLikelihood = likelihood === null ? null : likelihood > 1 ? likelihood / 10 : likelihood;
  const domain = normalizeDomain(data.website);
  const loc = locationFromObject(data.location);
  const entity: ProviderEntity = { name: str(data.name), domain, website: str(data.website), country: loc?.country ?? null, city: loc?.city ?? null, likelihood: normalizedLikelihood };
  const like = normalizedLikelihood;
  if (ctx.entity === "company") {
    sink.add("domain", domain, { documented: true, likelihood: like });
    sink.add("company_url", normalizeUrl(data.website), { documented: true, likelihood: like });
    sink.add("headcount", num(data.employee_count), { documented: true, likelihood: like });
    sink.add("total_raised_usd", num(data.total_funding_raised), { documented: true, likelihood: like });
    if (loc) {
      sink.add("hq_city", loc.city, { documented: false, likelihood: like });
      sink.add("hq_state", loc.state, { documented: false, likelihood: like });
      sink.add("hq_country", loc.country, { documented: false, likelihood: like });
    }
  } else if (ctx.entity === "firm") {
    sink.add("domain", domain, { documented: true, likelihood: like });
    sink.add("website_url", normalizeUrl(data.website), { documented: true, likelihood: like });
    sink.add("total_headcount", num(data.employee_count), { documented: true, likelihood: like });
    if (loc) {
      sink.add("hq_city", loc.city, { documented: false, likelihood: like });
      sink.add("hq_country", loc.country, { documented: false, likelihood: like });
    }
  }
  return entity;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function mapResponse(provider: string, capability: string, data: unknown, responseKey: string | null | undefined, ctx: MapContext): MapResult {
  const sink = new FactSink(provider, capability, ctx);
  const relationships: RelationshipClaim[] = [];
  const notes: string[] = [];
  const records = extractRecords(data, responseKey);
  const rec = records[0];
  if (!rec) return { ...EMPTY, notes: ["empty or unrecognised response"] };

  let providerEntity: ProviderEntity | null = null;
  const key = `${provider}/${capability}`;
  try {
    switch (key) {
      case "fireround/investors/profile":
        providerEntity = mapFireroundInvestorProfile(rec, sink, ctx, relationships);
        break;
      case "fireround/companies/profile":
        providerEntity = mapFireroundCompanyProfile(rec, sink, ctx);
        break;
      case "fullenrich/companies/lookup":
        providerEntity = mapFullEnrichCompany(rec, sink, ctx);
        break;
      case "fullenrich/people/lookup":
        providerEntity = mapFullEnrichPerson(rec, sink, ctx);
        break;
      case "fullenrich/contacts/work-email":
        providerEntity = mapFullEnrichWorkEmail(rec, sink);
        break;
      case "apollo/companies/enrich":
        providerEntity = mapApolloCompany(rec, sink, ctx);
        break;
      case "apollo/people/match":
        providerEntity = mapApolloPerson(rec, sink, ctx);
        break;
      case "people-data-labs/company/enrich":
        providerEntity = mapPdlCompany(rec, sink, ctx);
        break;
      case "datalegion/companies/enrich-base":
      case "datalegion/people/enrich-base-no-contact":
        notes.push("datalegion response is capture-only: nested company/person shape is undocumented; run --capture-shapes first");
        break;
      default:
        notes.push(`no mapper for ${key}`);
    }
  } catch (err) {
    notes.push(`mapper error for ${key}: ${err instanceof Error ? err.message : String(err)}`);
    return { facts: [], providerEntity: null, relationships: [], notes };
  }

  return { facts: sink.facts, providerEntity, relationships, notes };
}

/** Shape-only description of a response (keys and types, never values) for pilot capture. */
export function shapeSkeleton(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length ? [shapeSkeleton(value[0], depth + 1)] : [];
  if (isObj(value)) {
    if (depth >= 5) return "object";
    const out: Obj = {};
    for (const k of Object.keys(value).sort()) out[k] = shapeSkeleton(value[k], depth + 1);
    return out;
  }
  return typeof value;
}

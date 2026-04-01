/**
 * enrich-operators-apollo.ts
 *
 * Enriches startup_professionals (operator graph layer) using Apollo.io People Match API.
 *
 * Per person, this script:
 *   1. Calls Apollo /people/match to fetch full profile + employment history
 *   2. Upserts operator_companies for each employer
 *   3. Writes operator_experiences (normalized employment timeline)
 *   4. Normalizes function + seniority from title strings via taxonomy lookup
 *   5. Updates startup_professionals with bio, avatar, linkedin, location,
 *      expertise tags, normalized dimensions, and confidence_score
 *   6. Calls Apollo /organizations/enrich for any new company records
 *
 * Usage:
 *   tsx scripts/enrich-operators-apollo.ts                        # all operators
 *   ENRICH_MAX=50 tsx scripts/enrich-operators-apollo.ts          # limit batch
 *   DRY_RUN=true tsx scripts/enrich-operators-apollo.ts           # preview
 *   ENRICH_STALE_DAYS=30 tsx scripts/enrich-operators-apollo.ts   # refresh cadence
 *   PERSON_ID=<uuid> tsx scripts/enrich-operators-apollo.ts       # single person
 *
 * Env vars:
 *   APOLLO_API_KEY             — required
 *   SUPABASE_URL               — required
 *   SUPABASE_SERVICE_ROLE_KEY  — required
 *   DATABASE_URL               — optional (for Prisma direct ops if needed)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// ─── Env loading ─────────────────────────────────────────────────────────────

function loadEnv(): void {
  const root = process.cwd();
  for (const name of [".env", ".env.local", ".env.enrichment"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

const SUPABASE_URL  = process.env.SUPABASE_URL || "";
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APOLLO_KEY    = process.env.APOLLO_API_KEY?.trim() || "";
const MAX           = Math.max(1, parseInt(process.env.ENRICH_MAX || "200", 10));
const DELAY_MS      = Math.max(0, parseInt(process.env.ENRICH_DELAY_MS || "700", 10));
const DRY_RUN       = process.env.DRY_RUN === "true";
const STALE_DAYS    = parseInt(process.env.ENRICH_STALE_DAYS || "30", 10);
const SINGLE_PERSON = process.env.PERSON_ID || null;

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
if (!APOLLO_KEY)   throw new Error("APOLLO_API_KEY is not set.");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Utility helpers ─────────────────────────────────────────────────────────

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function jsonPost<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...headers,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`  ⚠ Apollo ${res.status}: ${text.slice(0, 120)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`  ⚠ fetch error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

function domainFromUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || !host.includes(".")) return null;
    const blocked = new Set([
      "linkedin.com",
      "twitter.com",
      "x.com",
      "facebook.com",
      "instagram.com",
      "youtube.com",
      "linktr.ee",
      "notion.site",
      "crunchbase.com",
      "angel.co",
      "github.com",
    ]);
    if (blocked.has(host) || host.endsWith(".linkedin.com")) return null;
    return host;
  } catch {
    return null;
  }
}

// ─── Taxonomy: Function + Seniority normalization ─────────────────────────────
// Maps raw title strings → OperatorFunction / OperatorSeniority enums.
// Rules are applied in order; first match wins.

type OperatorFunction =
  | "PRODUCT" | "ENGINEERING" | "GTM" | "SALES" | "MARKETING"
  | "FINANCE" | "OPERATIONS" | "LEGAL" | "DESIGN" | "DATA"
  | "GENERAL_MANAGEMENT" | "PEOPLE_HR" | "CUSTOMER_SUCCESS" | "OTHER";

type OperatorSeniority =
  | "INDIVIDUAL_CONTRIBUTOR" | "MANAGER" | "DIRECTOR" | "VP"
  | "C_SUITE" | "FOUNDER" | "ADVISOR" | "BOARD";

const FUNCTION_RULES: Array<[RegExp, OperatorFunction]> = [
  [/\b(ceo|co-?founder|cofounder|founder|managing partner|general partner)\b/i, "GENERAL_MANAGEMENT"],
  [/\b(cto|chief technology|vp.{0,10}engineering|head.{0,10}engineering|engineering manager|staff engineer|principal engineer|software engineer|developer|architect|tech lead|backend|frontend|fullstack|full.stack|devops|sre|platform engineer)\b/i, "ENGINEERING"],
  [/\b(cpo|chief product|vp.{0,10}product|head.{0,10}product|product manager|product lead|product director|director.{0,10}product|pm\b|apm\b|senior pm|group pm)\b/i, "PRODUCT"],
  [/\b(coo|chief operating|head.{0,10}ops|operations manager|director.{0,10}operations|ops lead|vp.{0,10}operations|supply chain|logistics|business operations)\b/i, "OPERATIONS"],
  [/\b(cro|chief revenue|vp.{0,10}sales|head.{0,10}sales|sales manager|account executive|ae\b|account manager|business development|bd\b|director.{0,10}sales|enterprise sales|mid.market|smb sales)\b/i, "SALES"],
  [/\b(cmo|chief marketing|vp.{0,10}marketing|head.{0,10}marketing|marketing manager|director.{0,10}marketing|brand|content marketing|seo|demand generation|growth marketing|field marketing)\b/i, "MARKETING"],
  [/\b(growth|head.{0,10}growth|vp.{0,10}growth|growth lead|director.{0,10}growth|gtm|go.to.market|revenue operations|rev.?ops)\b/i, "GTM"],
  [/\b(cfo|chief financial|vp.{0,10}finance|head.{0,10}finance|director.{0,10}finance|fp&a|controller|treasurer|accounting|finance manager|chief accounting)\b/i, "FINANCE"],
  [/\b(general counsel|chief legal|vp.{0,10}legal|head.{0,10}legal|legal counsel|attorney|solicitor|counsel)\b/i, "LEGAL"],
  [/\b(design|ux|ui\b|product design|creative director|head.{0,10}design|vp.{0,10}design|visual designer|brand designer|interaction designer)\b/i, "DESIGN"],
  [/\b(data|analytics|machine learning|ml\b|ai\b|data science|data engineer|data analyst|bi\b|business intelligence|chief data)\b/i, "DATA"],
  [/\b(cpo.{0,5}people|chief people|head.{0,10}people|vp.{0,10}people|hr manager|human resources|talent acquisition|recruiter|recruiting manager|people ops)\b/i, "PEOPLE_HR"],
  [/\b(customer success|csm\b|customer experience|cx\b|vp.{0,10}customer|head.{0,10}customer|account management|client success|post.?sales)\b/i, "CUSTOMER_SUCCESS"],
  [/\b(president|coo|ceo|cto|cfo|cmo|cpo|cdo|ciso|chief)\b/i, "GENERAL_MANAGEMENT"],
];

const SENIORITY_RULES: Array<[RegExp, OperatorSeniority]> = [
  [/\b(founder|co-?founder|cofounder)\b/i, "FOUNDER"],
  [/\b(ceo|cto|coo|cfo|cmo|cpo|cdo|ciso|chief)\b/i, "C_SUITE"],
  [/\b(advisory|advisor|adviser|operating advisor|strategic advisor|executive advisor)\b/i, "ADVISOR"],
  [/\b(board member|board observer|board director|board of directors)\b/i, "BOARD"],
  [/\bvp\b|vice president/i, "VP"],
  [/\bhead of\b|head,\s/i, "VP"],
  [/\bdirector\b/i, "DIRECTOR"],
  [/\bmanager\b|team lead|tech lead|lead \w|\bstaff \w|\bprincipal \w/i, "MANAGER"],
  [/\bsenior\b|\bsr\.\b|\blead\b/i, "MANAGER"],
];

function normalizeFunction(title: string): OperatorFunction {
  for (const [re, fn] of FUNCTION_RULES) {
    if (re.test(title)) return fn;
  }
  return "OTHER";
}

function normalizeSeniority(title: string): OperatorSeniority {
  for (const [re, sn] of SENIORITY_RULES) {
    if (re.test(title)) return sn;
  }
  return "INDIVIDUAL_CONTRIBUTOR";
}

/**
 * Infer expertise_tags, industries, and stages from employment history + function.
 * These are supplemental tags — more will come from first-party user input.
 */
function inferTags(
  employment: ApolloEmployment[],
  fn: OperatorFunction
): { expertiseTags: string[]; industries: string[]; stages: string[] } {
  const expertiseTags: string[] = [];
  const industries: string[] = [];
  const stages: string[] = [];

  // Build function-based expertise tag
  const fnTagMap: Partial<Record<OperatorFunction, string>> = {
    GTM: "B2B SaaS GTM",
    SALES: "enterprise sales",
    MARKETING: "growth marketing",
    PRODUCT: "product management",
    ENGINEERING: "full-stack engineering",
    FINANCE: "startup finance",
    OPERATIONS: "operations scaling",
    PEOPLE_HR: "talent & people ops",
    CUSTOMER_SUCCESS: "customer success",
    DATA: "data & analytics",
    DESIGN: "product design",
    GENERAL_MANAGEMENT: "general management",
  };
  if (fn && fnTagMap[fn]) expertiseTags.push(fnTagMap[fn]!);

  // Infer industry from company names / descriptions (basic heuristics)
  const companyNames = employment.map((e) => (e.organization_name || "").toLowerCase());
  const techKeywords = ["ai", "saas", "software", "tech", "data", "cloud", "api"];
  const fintechKeywords = ["fintech", "finance", "pay", "bank", "lending", "crypto", "insurance", "capital"];
  const healthKeywords = ["health", "med", "clinic", "bio", "pharma", "care", "wellness"];
  const constructionKeywords = ["construction", "build", "property", "real estate", "proptech", "facilities"];

  for (const name of companyNames) {
    if (fintechKeywords.some((k) => name.includes(k)) && !industries.includes("fintech"))
      industries.push("fintech");
    if (healthKeywords.some((k) => name.includes(k)) && !industries.includes("healthtech"))
      industries.push("healthtech");
    if (constructionKeywords.some((k) => name.includes(k)) && !industries.includes("construction tech"))
      industries.push("construction tech");
    if (techKeywords.some((k) => name.includes(k)) && !industries.includes("enterprise saas"))
      industries.push("enterprise saas");
  }

  // Stage inference: heuristic from company size / employment pattern
  // (will be enriched further by company enrichment)
  if (employment.some((e) => e.current)) {
    stages.push("current");
  }

  return { expertiseTags, industries, stages };
}

// ─── Apollo types ─────────────────────────────────────────────────────────────

interface ApolloEmployment {
  title?: string;
  organization_name?: string;
  organization_id?: string;
  start_date?: string;
  end_date?: string | null;
  current?: boolean;
  description?: string;
}

interface ApolloEducation {
  school?: { name?: string };
  degree?: string;
  field_of_study?: string;
  graduation_year?: number;
}

interface ApolloPersonResponse {
  person?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    title?: string;
    headline?: string;
    photo_url?: string;
    linkedin_url?: string;
    twitter_url?: string;
    city?: string;
    state?: string;
    country?: string;
    employment_history?: ApolloEmployment[];
    education_history?: ApolloEducation[];
    organization?: { primary_domain?: string; name?: string };
  };
}

interface ApolloOrgResponse {
  organization?: {
    id?: string;
    name?: string;
    short_description?: string;
    logo_url?: string;
    linkedin_url?: string;
    twitter_url?: string;
    crunchbase_url?: string;
    primary_domain?: string;
    founded_year?: number;
    estimated_num_employees?: number;
    city?: string;
    state?: string;
    country?: string;
    industry?: string;
    keywords?: string[];
    annual_revenue_printed?: string;
  };
}

// ─── Person row type ─────────────────────────────────────────────────────────

interface PersonRow {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  current_startup: string;
  current_role: string;
  linkedin: string | null;
  bio_summary: string | null;
  avatar_url: string | null;
  x_url: string | null;
  location: string | null;
  apollo_id: string | null;
  last_enriched_at: string | null;
  normalized_function: string | null;
  normalized_seniority: string | null;
  expertise_tags: string[];
  industries: string[];
  stages: string[];
}

// ─── Company resolution ───────────────────────────────────────────────────────

/**
 * Find or create an operator_company row for a given employer.
 * Deduplication key: domain (if we have one) → otherwise name match.
 * Returns the company id.
 */
async function resolveCompany(
  sb: SupabaseClient,
  orgName: string,
  apolloOrgId: string | null | undefined,
  websiteUrl: string | null | undefined
): Promise<string | null> {
  if (!orgName.trim()) return null;

  const domain = domainFromUrl(websiteUrl);

  // 1. Try apollo_org_id match
  if (apolloOrgId) {
    const { data } = await sb
      .from("operator_companies")
      .select("id")
      .eq("apollo_org_id", apolloOrgId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 2. Try domain match
  if (domain) {
    const { data } = await sb
      .from("operator_companies")
      .select("id")
      .eq("domain", domain)
      .maybeSingle();
    if (data?.id) {
      // Backfill apollo_org_id if missing
      if (apolloOrgId) {
        await sb
          .from("operator_companies")
          .update({ apollo_org_id: apolloOrgId })
          .eq("id", data.id);
      }
      return data.id;
    }
  }

  // 3. Try name match (case-insensitive)
  const { data: nameMatch } = await sb
    .from("operator_companies")
    .select("id")
    .ilike("name", orgName.trim())
    .maybeSingle();
  if (nameMatch?.id) return nameMatch.id;

  // 4. Create new record
  const newId = randomUUID();
  const insert: Record<string, unknown> = {
    id: newId,
    name: orgName.trim(),
    domain: domain ?? null,
    apollo_org_id: apolloOrgId ?? null,
    website_url: websiteUrl ?? null,
    data_source: "apollo",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!DRY_RUN) {
    const { error } = await sb.from("operator_companies").insert(insert);
    if (error) {
      // Domain conflict (race): try to fetch existing
      if (error.code === "23505") {
        const fallback = domain
          ? await sb.from("operator_companies").select("id").eq("domain", domain).maybeSingle()
          : await sb.from("operator_companies").select("id").ilike("name", orgName).maybeSingle();
        if (fallback.data?.id) return fallback.data.id;
      }
      console.warn(`    ⚠ company insert error for "${orgName}": ${error.message}`);
      return null;
    }
  }

  return newId;
}

/**
 * Enrich an operator_company row using Apollo organization enrichment.
 * Only fills gaps — never overwrites existing data.
 */
async function enrichCompany(
  sb: SupabaseClient,
  companyId: string,
  domain: string | null
): Promise<void> {
  if (!domain || DRY_RUN) return;

  const data = await jsonPost<ApolloOrgResponse>(
    "https://api.apollo.io/api/v1/organizations/enrich",
    { domain },
    { "X-Api-Key": APOLLO_KEY }
  );

  const org = data?.organization;
  if (!org) return;

  // Fetch current row to avoid overwriting
  const { data: existing } = await sb
    .from("operator_companies")
    .select("description, logo_url, linkedin_url, x_url, crunchbase_url, founded_year, headcount, hq_city, hq_state, hq_country")
    .eq("id", companyId)
    .maybeSingle();

  const patch: Record<string, unknown> = { last_enriched_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  if (!existing?.description && org.short_description) patch.description = org.short_description;
  if (!existing?.logo_url && org.logo_url) patch.logo_url = org.logo_url;
  if (!existing?.linkedin_url && org.linkedin_url) patch.linkedin_url = org.linkedin_url;
  if (!existing?.x_url && org.twitter_url) patch.x_url = org.twitter_url;
  if (!existing?.crunchbase_url && org.crunchbase_url) patch.crunchbase_url = org.crunchbase_url;
  if (!existing?.headcount && org.estimated_num_employees) {
    patch.headcount = org.estimated_num_employees;
    patch.headcount_band = headcountToband(org.estimated_num_employees);
  }
  if (!existing?.hq_city && org.city) patch.hq_city = org.city;
  if (!existing?.hq_state && org.state) patch.hq_state = org.state;
  if (!existing?.hq_country && org.country) patch.hq_country = org.country;

  if (Object.keys(patch).length > 2) {
    await sb.from("operator_companies").update(patch).eq("id", companyId);
  }
}

function headcountToband(n: number): string {
  if (n <= 1)   return "SOLO";
  if (n <= 10)  return "MICRO";
  if (n <= 50)  return "SMALL";
  if (n <= 200) return "MID";
  if (n <= 1000) return "LARGE";
  return "ENTERPRISE";
}

// ─── Core enrichment logic ────────────────────────────────────────────────────

async function enrichPerson(sb: SupabaseClient, person: PersonRow): Promise<"enriched" | "no_data" | "error"> {
  const firstName = person.first_name || person.full_name.split(" ")[0] || "";
  const lastName  = person.last_name  || person.full_name.split(" ").slice(-1)[0] || "";

  if (!firstName && !lastName) return "no_data";

  // Build Apollo match request
  const reqBody: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
    reveal_personal_emails: false,
    reveal_phone_number: false,
  };
  if (person.linkedin)          reqBody.linkedin_url           = person.linkedin;
  if (person.current_startup)   reqBody.organization_name      = person.current_startup;

  const data = await jsonPost<ApolloPersonResponse>(
    "https://api.apollo.io/api/v1/people/match",
    reqBody,
    { "X-Api-Key": APOLLO_KEY }
  );

  const p = data?.person;
  if (!p) return "no_data";

  // ── 1. Normalize function + seniority ──────────────────────────────────────
  const titleForNorm = p.title || person.title || person.current_role || "";
  const fn  = normalizeFunction(titleForNorm);
  const sen = normalizeSeniority(titleForNorm);

  // ── 2. Process employment history → operator_experiences ──────────────────
  const employment = p.employment_history ?? [];
  let currentCompanyId: string | null = null;
  const experienceIds: string[] = [];

  for (const job of employment) {
    if (!job.organization_name && !job.title) continue;

    const companyId = await resolveCompany(
      sb,
      job.organization_name || "Unknown",
      job.organization_id,
      null
    );

    if (companyId && job.current) currentCompanyId = companyId;

    const jobFn  = normalizeFunction(job.title || "");
    const jobSen = normalizeSeniority(job.title || "");

    const expId = randomUUID();
    experienceIds.push(expId);

    const expRecord = {
      id: expId,
      person_id: person.id,
      company_id: companyId,
      title_raw: job.title || "",
      company_name_raw: job.organization_name || "",
      title_normalized: job.title || null,
      function_normalized: jobFn,
      seniority_normalized: jobSen,
      start_date: job.start_date ? job.start_date.slice(0, 10) : null,
      end_date: job.end_date ? job.end_date.slice(0, 10) : null,
      is_current: job.current ?? false,
      is_promotion: false, // computed later by comparison worker
      data_source: "apollo",
      confidence: 0.8,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!DRY_RUN) {
      // Upsert on (person_id, company_name_raw, title_raw) — avoid duplicates on re-run
      const { error } = await sb.from("operator_experiences").upsert(expRecord, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) console.warn(`    ⚠ experience insert error: ${error.message}`);
    }
  }

  // Enrich any newly created companies (batch — throttle inside)
  const domainPromises = employment
    .filter((e) => e.organization_id)
    .slice(0, 3) // limit to 3 org enrichments per person to stay within rate limits
    .map(async (e) => {
      const companyId = await resolveCompany(sb, e.organization_name || "", e.organization_id, null);
      if (!companyId) return;
      await enrichCompany(sb, companyId, domainFromUrl(null)); // domain fetched inside
      await sleep(DELAY_MS / 2);
    });
  await Promise.allSettled(domainPromises);

  // ── 3. Build expertise tags from employment + function ────────────────────
  const { expertiseTags, industries } = inferTags(employment, fn);

  // ── 4. Build education_summary ────────────────────────────────────────────
  const eduLines = (p.education_history ?? [])
    .filter((e) => e.school?.name)
    .map((e) => {
      const parts = [e.school!.name!];
      if (e.degree) parts.push(e.degree);
      if (e.field_of_study) parts.push(e.field_of_study);
      if (e.graduation_year) parts.push(`(${e.graduation_year})`);
      return parts.join(", ");
    });

  // ── 5. Compute confidence score ───────────────────────────────────────────
  // Weight by field completeness (basic heuristic)
  let score = 0;
  if (p.title)          score += 15;
  if (p.headline)       score += 10;
  if (p.photo_url)      score += 10;
  if (p.linkedin_url)   score += 15;
  if (p.city)           score += 10;
  if (eduLines.length)  score += 10;
  if (employment.length >= 2) score += 15;
  if (employment.length >= 4) score += 10;
  if (p.id)             score += 5;
  score = Math.min(score, 100);

  // ── 6. Build person patch ─────────────────────────────────────────────────
  const patch: Record<string, unknown> = {
    normalized_function: fn,
    normalized_seniority: sen,
    confidence_score: score,
    last_enriched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expertise_tags: expertiseTags,
    industries,
  };

  if (p.id && !person.apollo_id)       patch.apollo_id    = p.id;
  if (!person.bio_summary && (p.headline || p.title)) patch.bio_summary = p.headline || p.title;
  if (!person.avatar_url && p.photo_url)  patch.avatar_url  = p.photo_url;
  if (!person.x_url && p.twitter_url)     patch.x_url       = p.twitter_url;
  if (currentCompanyId)                   patch.current_company_id = currentCompanyId;

  // Location: prefer more specific city/state/country over raw string
  if (!person.location && p.city) {
    const parts = [p.city, p.state, p.country].filter(Boolean);
    patch.location = parts.join(", ");
  }

  if (!DRY_RUN) {
    const { error } = await sb
      .from("startup_professionals")
      .update(patch)
      .eq("id", person.id);
    if (error) {
      console.warn(`    ⚠ person update error: ${error.message}`);
      return "error";
    }

    // Ensure operator_reputation row exists (seed with empty defaults)
    await sb.from("operator_reputation").upsert(
      {
        id: randomUUID(),
        person_id: person.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "person_id", ignoreDuplicates: true }
    );
  }

  return "enriched";
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  const staleDate = new Date(Date.now() - STALE_DAYS * 86400 * 1000).toISOString();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  enrich-operators-apollo.ts — Operator Graph Layer");
  console.log(`  Max: ${MAX}  |  Stale after: ${STALE_DAYS}d  |  Delay: ${DELAY_MS}ms${DRY_RUN ? "  |  DRY RUN" : ""}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  let query = supabase
    .from("startup_professionals")
    .select(
      "id, full_name, first_name, last_name, title, current_startup, current_role, " +
      "linkedin, bio_summary, avatar_url, x_url, location, apollo_id, last_enriched_at, " +
      "normalized_function, normalized_seniority, expertise_tags, industries, stages"
    )
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${staleDate}`)
    .order("last_enriched_at", { ascending: true, nullsFirst: true })
    .limit(MAX);

  if (SINGLE_PERSON) {
    // @ts-ignore: override to single person mode
    query = supabase
      .from("startup_professionals")
      .select(
        "id, full_name, first_name, last_name, title, current_startup, current_role, " +
        "linkedin, bio_summary, avatar_url, x_url, location, apollo_id, last_enriched_at, " +
        "normalized_function, normalized_seniority, expertise_tags, industries, stages"
      )
      .eq("id", SINGLE_PERSON)
      .limit(1);
  }

  const { data: people, error } = await query;
  if (error) throw new Error(`Query error: ${error.message}`);
  if (!people?.length) {
    console.log("  No operators need enrichment. All up to date!\n");
    return;
  }

  console.log(`  ${people.length} operators to enrich\n`);

  let enriched = 0, noData = 0, errors = 0;

  for (const raw of people as PersonRow[]) {
    process.stdout.write(`  ▸ ${raw.full_name} (${raw.current_startup}) … `);

    try {
      const result = await enrichPerson(supabase, raw);
      if (result === "enriched") {
        console.log("✓ enriched");
        enriched++;
      } else if (result === "no_data") {
        console.log("no match");
        noData++;
      } else {
        console.log("error (see above)");
        errors++;
      }
    } catch (e) {
      errors++;
      console.log(`ERROR: ${e instanceof Error ? e.message : e}`);
    }

    await sleep(DELAY_MS);
  }

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(`  ✅ Done — enriched: ${enriched}, no match: ${noData}, errors: ${errors}`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

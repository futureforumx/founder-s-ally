/**
 * seed-operator-profiles.ts
 *
 * Populates public.operator_profiles for the Network operators directory.
 *
 * Sources (in order):
 *   1. roles — current CEO / CTO / COO (canonical graph; one row per person via people_id upsert)
 *   2. people — executives whose title matches operator patterns (non-founder role types)
 *   3. firm_investors — partners with operating/advisory titles (upsert on source + source_id)
 *
 * Directory filters (see useCommunityGridData) require:
 *   deleted_at is null, is_available = true, ready_for_live = true
 *
 * Usage:
 *   tsx scripts/seed-operator-profiles.ts
 *   DRY_RUN=true tsx scripts/seed-operator-profiles.ts
 *   SEED_MAX=2500 tsx scripts/seed-operator-profiles.ts
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * DB: unique indexes operator_profiles_people_id_unique and operator_profiles_source_source_id_unique
 *     (migration 20260415180500_operator_profiles_upsert_uniques.sql)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnv();

const DRY_RUN = process.env.DRY_RUN === "true";
const SEED_MAX = parseInt(process.env.SEED_MAX || "4000", 10);
const ROLE_PAGE = 800;

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPERATOR_TITLE_PATTERNS = [
  /\b(CTO|Chief Technology Officer)\b/i,
  /\b(COO|Chief Operating Officer)\b/i,
  /\b(CEO|Chief Executive Officer)\b/i,
  /\b(CMO|Chief Marketing Officer)\b/i,
  /\b(CFO|Chief Financial Officer)\b/i,
  /\b(CPO|Chief Product Officer)\b/i,
  /\b(CRO|Chief Revenue Officer)\b/i,
  /\b(VP|Vice President)\b/i,
  /\bHead of\b/i,
  /\bDirector\b/i,
  /\bGeneral Manager\b/i,
  /\bOperating Partner\b/i,
  /\bFractional\b/i,
  /\bAdvisor\b/i,
];

function isOperatorTitle(title: string): boolean {
  return OPERATOR_TITLE_PATTERNS.some((p) => p.test(title));
}

function engagementType(title: string, roleType: string | null): string {
  const t = `${title} ${roleType ?? ""}`;
  if (/fractional/i.test(t)) return "fractional";
  if (/advisor|advisory/i.test(t)) return "advisory";
  if (/board/i.test(t)) return "board";
  return "full-time";
}

function roleTypeRank(roleType: string | null | undefined): number {
  const r = (roleType ?? "").toLowerCase();
  if (r === "ceo") return 3;
  if (r === "cto") return 2;
  if (r === "coo") return 1;
  return 0;
}

/** Minimum bar for Network directory — matches product “live” without over-stripping. */
function publishableOperatorFields(partial: {
  full_name: string;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
}) {
  let score = 30;
  if (safeStr(partial.title)) score += 25;
  if (safeStr(partial.bio)) score += 25;
  if (safeStr(partial.avatar_url)) score += 10;
  if (safeStr(partial.linkedin_url)) score += 10;
  score = Math.min(100, score);
  const hasCore = safeStr(partial.full_name) && safeStr(partial.title);
  return {
    ready_for_live: hasCore,
    is_available: true,
    enrichment_status: safeStr(partial.bio) ? "complete" : "partial",
    completeness_score: score,
  };
}

function safeStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function stageFromOrg(org: { investmentStage?: string | null; fundingStatus?: string | null } | null | undefined): string | null {
  if (!org) return null;
  const inv = safeStr(org.investmentStage);
  if (inv) return inv;
  const fs = safeStr(org.fundingStatus);
  return fs || null;
}

/** PostgREST multi-row upsert requires a stable key set per row to avoid column/value drift. */
function normalizeOperatorRow(r: Record<string, unknown>): Record<string, unknown> {
  const textArr = (v: unknown): string[] | null => {
    if (v == null) return null;
    if (Array.isArray(v)) {
      const out = v.map((x) => String(x)).filter(Boolean);
      return out.length ? out : null;
    }
    return null;
  };

  return {
    full_name: r.full_name,
    first_name: r.first_name ?? null,
    last_name: r.last_name ?? null,
    title: r.title ?? null,
    bio: r.bio ?? null,
    avatar_url: r.avatar_url ?? null,
    linkedin_url: r.linkedin_url ?? null,
    x_url: r.x_url ?? null,
    website_url: r.website_url ?? null,
    email: r.email ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    country: r.country ?? null,
    engagement_type: r.engagement_type ?? null,
    sector_focus: textArr(r.sector_focus),
    stage_focus: r.stage_focus ?? null,
    expertise: textArr(r.expertise),
    prior_companies: textArr(r.prior_companies),
    current_company_name: r.current_company_name ?? null,
    is_available: Boolean(r.is_available),
    source: r.source ?? null,
    source_id: r.source_id ?? null,
    people_id: r.people_id ?? null,
    ready_for_live: Boolean(r.ready_for_live),
    enrichment_status: String(r.enrichment_status ?? "pending"),
    completeness_score: Number.isFinite(Number(r.completeness_score)) ? Number(r.completeness_score) : 0,
    deleted_at: r.deleted_at ?? null,
  };
}

async function seedFromExecutiveRoles(): Promise<{ inserted: number; skipped: number; errors: number }> {
  console.log("\n── Source 1: roles (current CEO / CTO / COO) ──");

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let offset = 0;

  while (offset < SEED_MAX) {
    const { data: roles, error } = await sb
      .from("roles")
      .select(
        `
        id,
        "personId",
        title,
        "roleType",
        person:people(
          id,
          "canonicalName",
          "firstName",
          "lastName",
          "linkedinUrl",
          "twitterUrl",
          "avatarUrl",
          bio,
          city,
          country
        ),
        organization:organizations("canonicalName", industry, city, country, "investmentStage", "fundingStatus")
      `,
      )
      .in("roleType", ["ceo", "cto", "coo"])
      .eq("isCurrent", true)
      .not("personId", "is", null)
      .order("personId", { ascending: true })
      .range(offset, offset + ROLE_PAGE - 1);

    if (error) {
      console.error("  ✗ roles fetch:", error.message);
      break;
    }
    const batch = roles ?? [];
    if (batch.length === 0) break;

    const bestByPerson = new Map<string, any>();
    for (const r of batch as any[]) {
      const pid = r.personId;
      if (!pid) continue;
      const prev = bestByPerson.get(pid);
      if (!prev || roleTypeRank(r.roleType) > roleTypeRank(prev.roleType)) bestByPerson.set(pid, r);
    }

    const rows: Record<string, unknown>[] = [];
    for (const r of bestByPerson.values()) {
      const p = r.person;
      if (!p?.id) continue;
      const org = r.organization;
      const fullName = safeStr(p.canonicalName) || `${safeStr(p.firstName)} ${safeStr(p.lastName)}`.trim();
      if (!fullName) continue;
      const title = safeStr(r.title) || safeStr(r.roleType)?.toUpperCase() || "Executive";

      const recordBase = {
        full_name: fullName,
        first_name: p.firstName || null,
        last_name: p.lastName || null,
        title,
        bio: p.bio || null,
        avatar_url: p.avatarUrl || null,
        linkedin_url: p.linkedinUrl || null,
        x_url: p.twitterUrl || null,
        city: p.city || org?.city || null,
        country: p.country || org?.country || null,
        engagement_type: engagementType(title, r.roleType),
        sector_focus: org?.industry ? [org.industry] : null,
        stage_focus: stageFromOrg(org),
        expertise: Array.isArray(p.expertise) && p.expertise.length ? p.expertise : null,
        prior_companies: org?.canonicalName ? [org.canonicalName] : null,
        current_company_name: org?.canonicalName ?? null,
        people_id: p.id,
        source: "roles_executive",
        source_id: String(p.id),
      };

      const pub = publishableOperatorFields({
        full_name: fullName,
        title,
        bio: recordBase.bio as string | null,
        avatar_url: recordBase.avatar_url as string | null,
        linkedin_url: recordBase.linkedin_url as string | null,
      });

      rows.push(normalizeOperatorRow({ ...recordBase, ...pub }));
    }

    if (DRY_RUN) {
      console.log(`  [DRY] batch @${offset}: ${rows.length} profiles`);
      inserted += rows.length;
    } else if (rows.length) {
      const { error: upErr } = await sb.from("operator_profiles").upsert(rows, {
        onConflict: "people_id",
        ignoreDuplicates: false,
      });
      if (upErr) {
        console.error(`  ✗ upsert batch @${offset}:`, upErr.message);
        errors++;
      } else {
        inserted += rows.length;
      }
    }

    offset += batch.length;
    if (batch.length < ROLE_PAGE) break;
    if (inserted + skipped >= SEED_MAX) break;
  }

  console.log(`  ✅ Upserted ~${inserted} executive operator rows (errors: ${errors})`);
  return { inserted, skipped, errors };
}

async function seedFromPeopleTitles(): Promise<{ inserted: number; skipped: number }> {
  console.log("\n── Source 2: people (VP / Director / etc. titles, non-founder roles) ──");

  const { data: people, error } = await sb
    .from("people")
    .select(
      `
      id,
      "canonicalName",
      "firstName",
      "lastName",
      "linkedinUrl",
      "twitterUrl",
      "avatarUrl",
      bio,
      city,
      country,
      expertise,
      roles:roles(title, "roleType", "isCurrent", organization:organizations("canonicalName", industry, city, country, "investmentStage", "fundingStatus"))
    `,
    )
    .limit(Math.min(SEED_MAX, 5000));

  if (error || !people) {
    console.error("  ✗ people fetch:", error?.message);
    return { inserted: 0, skipped: 0 };
  }

  const operatorPeople = (people as any[]).filter((p) => {
    const roles = p.roles || [];
    return roles.some(
      (r: any) =>
        r.title &&
        isOperatorTitle(r.title) &&
        !["founder", "cofounder"].includes(String(r.roleType || "").toLowerCase()),
    );
  });

  console.log(`  Found ${operatorPeople.length} people matching title heuristics`);

  let inserted = 0;
  let skipped = 0;

  const peopleRows: Record<string, unknown>[] = [];
  for (const p of operatorPeople) {
    const operatorRole = (p.roles || []).find(
      (r: any) =>
        r.title &&
        isOperatorTitle(r.title) &&
        !["founder", "cofounder"].includes(String(r.roleType || "").toLowerCase()),
    );
    const org = operatorRole?.organization;
    const fullName = safeStr(p.canonicalName) || `${safeStr(p.firstName)} ${safeStr(p.lastName)}`.trim();
    const title = operatorRole?.title || null;
    if (!fullName || !title) {
      skipped++;
      continue;
    }

    const recordBase = {
      full_name: fullName,
      first_name: p.firstName || null,
      last_name: p.lastName || null,
      title,
      bio: p.bio || null,
      avatar_url: p.avatarUrl || null,
      linkedin_url: p.linkedinUrl || null,
      x_url: p.twitterUrl || null,
      city: p.city || org?.city || null,
      country: p.country || org?.country || null,
      engagement_type: engagementType(title, operatorRole?.roleType ?? null),
      sector_focus: org?.industry ? [org.industry] : null,
      stage_focus: stageFromOrg(org),
      expertise: Array.isArray(p.expertise) && p.expertise.length ? p.expertise : null,
      prior_companies: org?.canonicalName ? [org.canonicalName] : null,
      current_company_name: org?.canonicalName ?? null,
      people_id: p.id,
      source: "yc_people",
      source_id: String(p.id),
    };

    const pub = publishableOperatorFields({
      full_name: fullName,
      title,
      bio: recordBase.bio as string | null,
      avatar_url: recordBase.avatar_url as string | null,
      linkedin_url: recordBase.linkedin_url as string | null,
    });

    peopleRows.push(normalizeOperatorRow({ ...recordBase, ...pub }));
  }

  if (DRY_RUN) {
    inserted = peopleRows.length;
    console.log(`  [DRY] ${inserted} people rows`);
  } else {
    const CHUNK = 150;
    for (let i = 0; i < peopleRows.length; i += CHUNK) {
      const chunk = peopleRows.slice(i, i + CHUNK);
      const { error: upErr } = await sb.from("operator_profiles").upsert(chunk, {
        onConflict: "people_id",
        ignoreDuplicates: false,
      });
      if (upErr) {
        console.error(`  ✗ people chunk @${i}:`, upErr.message);
        skipped += chunk.length;
      } else {
        inserted += chunk.length;
      }
    }
  }

  console.log(`  ✅ People title path: upserted ${inserted}, skipped ${skipped}`);
  return { inserted, skipped };
}

async function seedFromFirmInvestors(): Promise<{ inserted: number; skipped: number }> {
  console.log("\n── Source 3: firm_investors (operating / venture / advisory partners) ──");

  const { data: investors, error } = await sb
    .from("firm_investors")
    .select(
      `
      id, full_name, first_name, last_name, title, bio,
      avatar_url, linkedin_url, x_url, website_url,
      city, state, country, sector_focus, stage_focus,
      check_size_min, check_size_max, background_summary,
      firm:firm_records(firm_name, hq_city, thesis_verticals)
    `,
    )
    .not("title", "is", null)
    .limit(Math.min(SEED_MAX, 3000));

  if (error || !investors) {
    console.error("  ✗ firm_investors fetch:", error?.message);
    return { inserted: 0, skipped: 0 };
  }

  const operatorInvestors = (investors as any[]).filter(
    (inv) =>
      inv.title &&
      (/operating partner/i.test(inv.title) ||
        /venture partner/i.test(inv.title) ||
        /entrepreneur.in.residence|EIR\b/i.test(inv.title) ||
        /fractional/i.test(inv.title) ||
        /advisor/i.test(inv.title)),
  );

  console.log(`  Found ${operatorInvestors.length} firm_investors rows`);

  let inserted = 0;
  let skipped = 0;

  const invRows: Record<string, unknown>[] = [];
  for (const inv of operatorInvestors) {
    const title = inv.title as string;
    const recordBase = {
      full_name: inv.full_name as string,
      first_name: inv.first_name || null,
      last_name: inv.last_name || null,
      title,
      bio: inv.bio || inv.background_summary || null,
      avatar_url: inv.avatar_url || null,
      linkedin_url: inv.linkedin_url || null,
      x_url: inv.x_url || null,
      website_url: inv.website_url || null,
      city: inv.city || inv.firm?.hq_city || null,
      state: inv.state || null,
      country: inv.country || null,
      engagement_type: engagementType(title, null),
      sector_focus:
        inv.sector_focus?.length ? inv.sector_focus : inv.firm?.thesis_verticals?.length
          ? inv.firm.thesis_verticals
          : null,
      stage_focus: inv.stage_focus || null,
      expertise: null,
      prior_companies: inv.firm?.firm_name ? [inv.firm.firm_name] : null,
      current_company_name: inv.firm?.firm_name ?? null,
      people_id: null as string | null,
      source: "firm_investors",
      source_id: String(inv.id),
    };

    const pub = publishableOperatorFields({
      full_name: recordBase.full_name,
      title,
      bio: recordBase.bio as string | null,
      avatar_url: recordBase.avatar_url as string | null,
      linkedin_url: recordBase.linkedin_url as string | null,
    });

    invRows.push(normalizeOperatorRow({ ...recordBase, ...pub }));
  }

  if (DRY_RUN) {
    inserted = invRows.length;
  } else {
    const CHUNK = 100;
    for (let i = 0; i < invRows.length; i += CHUNK) {
      const chunk = invRows.slice(i, i + CHUNK);
      const { error: upErr } = await sb.from("operator_profiles").upsert(chunk, {
        onConflict: "source,source_id",
        ignoreDuplicates: false,
      });
      if (upErr) {
        console.error(`  ✗ firm_investors chunk @${i}:`, upErr.message);
        skipped += chunk.length;
      } else {
        inserted += chunk.length;
      }
    }
  }

  console.log(`  ✅ firm_investors path: upserted ${inserted}, skipped ${skipped}`);
  return { inserted, skipped };
}

async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  Operator Profiles Seeder");
  console.log(`  DRY_RUN=${DRY_RUN}  SEED_MAX=${SEED_MAX}`);
  console.log("════════════════════════════════════════════════════════════════");

  const a = await seedFromExecutiveRoles();
  const b = await seedFromPeopleTitles();
  const c = await seedFromFirmInvestors();

  const total = a.inserted + b.inserted + c.inserted;
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`  ✅ Done — rows touched (upserts): ~${total}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);

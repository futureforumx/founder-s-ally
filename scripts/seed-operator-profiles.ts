/**
 * seed-operator-profiles.ts
 *
 * Seeds operator_profiles from two sources:
 *   1. people table — YC executives with CTO/COO/CMO/VP/Director roles (non-founder operators)
 *   2. firm_investors table — VC partners who were formerly operators (has prior background)
 *
 * Usage:
 *   tsx scripts/seed-operator-profiles.ts
 *   DRY_RUN=true tsx scripts/seed-operator-profiles.ts
 *   SEED_MAX=500 tsx scripts/seed-operator-profiles.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ── Env ──────────────────────────────────────────────────────────────────────

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
const SEED_MAX = parseInt(process.env.SEED_MAX || "2000", 10);

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Operator title detection ──────────────────────────────────────────────────

const OPERATOR_TITLE_PATTERNS = [
  /\b(CTO|Chief Technology Officer)\b/i,
  /\b(COO|Chief Operating Officer)\b/i,
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
  return OPERATOR_TITLE_PATTERNS.some(p => p.test(title));
}

function engagementType(title: string): string {
  if (/fractional/i.test(title)) return "fractional";
  if (/advisor|advisory/i.test(title)) return "advisory";
  if (/board/i.test(title)) return "board";
  return "full-time";
}

// ── Source 1: people table with executive roles ───────────────────────────────

async function seedFromPeople(): Promise<number> {
  console.log("\n── Source 1: people table (executive roles) ──");

  const { data: people, error } = await (sb as any)
    .from("people")
    .select(`
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
      roles:roles(
        title,
        "roleType",
        "isCurrent",
        organization:organizations("canonicalName", industry, city, country)
      )
    `)
    .limit(SEED_MAX);

  if (error || !people) {
    console.error("  ✗ Failed to fetch people:", error?.message);
    return 0;
  }

  // Filter to executives/operators (non-founder roles)
  const operatorPeople = (people as any[]).filter(p => {
    const roles = p.roles || [];
    return roles.some((r: any) =>
      r.title && isOperatorTitle(r.title) && !["founder", "cofounder"].includes(r.roleType)
    );
  });

  console.log(`  Found ${operatorPeople.length} people with operator titles`);

  let inserted = 0;
  let skipped = 0;

  for (const p of operatorPeople) {
    const operatorRole = (p.roles || []).find((r: any) =>
      r.title && isOperatorTitle(r.title) && !["founder", "cofounder"].includes(r.roleType)
    );
    const org = operatorRole?.organization;

    const record = {
      full_name: p.canonicalName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
      first_name: p.firstName || null,
      last_name: p.lastName || null,
      title: operatorRole?.title || null,
      bio: p.bio || null,
      avatar_url: p.avatarUrl || null,
      linkedin_url: p.linkedinUrl || null,
      x_url: p.twitterUrl || null,
      city: p.city || org?.city || null,
      country: p.country || org?.country || null,
      engagement_type: operatorRole?.title ? engagementType(operatorRole.title) : "full-time",
      sector_focus: org?.industry ? [org.industry] : null,
      expertise: p.expertise?.length ? p.expertise : null,
      prior_companies: org?.canonicalName ? [org.canonicalName] : null,
      is_available: false, // default — they're currently employed
      source: "yc_people",
      people_id: p.id,
    };

    if (DRY_RUN) {
      console.log(`  [DRY] ${record.full_name} — ${record.title}`);
      inserted++;
      continue;
    }

    const { error: upsertErr } = await (sb as any)
      .from("operator_profiles")
      .upsert(record, { onConflict: "people_id", ignoreDuplicates: false });

    if (upsertErr) {
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`  ✅ Seeded ${inserted}, skipped ${skipped}`);
  return inserted;
}

// ── Source 2: firm_investors with operator-style titles ───────────────────────

async function seedFromFirmInvestors(): Promise<number> {
  console.log("\n── Source 2: firm_investors (operator-background partners) ──");

  const { data: investors, error } = await (sb as any)
    .from("firm_investors")
    .select(`
      id, full_name, first_name, last_name, title, bio,
      avatar_url, linkedin_url, x_url, website_url,
      city, state, country, sector_focus, stage_focus,
      check_size_min, check_size_max, background_summary,
      firm:firm_records(firm_name, hq_city, thesis_verticals)
    `)
    .not("title", "is", null)
    .limit(SEED_MAX);

  if (error || !investors) {
    console.error("  ✗ Failed to fetch firm_investors:", error?.message);
    return 0;
  }

  // Filter to those with operator-style titles (Operating Partner, Venture Partner, EIR, etc.)
  const operatorInvestors = (investors as any[]).filter(inv =>
    inv.title && (
      /operating partner/i.test(inv.title) ||
      /venture partner/i.test(inv.title) ||
      /entrepreneur.in.residence|EIR\b/i.test(inv.title) ||
      /fractional/i.test(inv.title) ||
      /advisor/i.test(inv.title)
    )
  );

  console.log(`  Found ${operatorInvestors.length} VC investors with operator titles`);

  let inserted = 0;
  let skipped = 0;

  for (const inv of operatorInvestors) {
    const record = {
      full_name: inv.full_name,
      first_name: inv.first_name || null,
      last_name: inv.last_name || null,
      title: inv.title || null,
      bio: inv.bio || inv.background_summary || null,
      avatar_url: inv.avatar_url || null,
      linkedin_url: inv.linkedin_url || null,
      x_url: inv.x_url || null,
      website_url: inv.website_url || null,
      city: inv.city || inv.firm?.hq_city || null,
      state: inv.state || null,
      country: inv.country || null,
      engagement_type: engagementType(inv.title || ""),
      sector_focus: inv.sector_focus?.length ? inv.sector_focus
        : (inv.firm?.thesis_verticals?.length ? inv.firm.thesis_verticals : null),
      stage_focus: inv.stage_focus || null,
      expertise: null,
      prior_companies: inv.firm?.firm_name ? [inv.firm.firm_name] : null,
      is_available: true,
      source: "firm_investors",
    };

    if (DRY_RUN) {
      console.log(`  [DRY] ${record.full_name} — ${record.title}`);
      inserted++;
      continue;
    }

    const { error: upsertErr } = await (sb as any)
      .from("operator_profiles")
      .upsert(record, { onConflict: "full_name,source", ignoreDuplicates: true });

    if (upsertErr) {
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`  ✅ Seeded ${inserted}, skipped ${skipped}`);
  return inserted;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  Operator Profiles Seeder");
  console.log(`  DRY_RUN=${DRY_RUN}  MAX=${SEED_MAX}`);
  console.log("════════════════════════════════════════════════════════════════");

  const t1 = await seedFromPeople();
  const t2 = await seedFromFirmInvestors();

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`  ✅ Done — total seeded: ${t1 + t2}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);

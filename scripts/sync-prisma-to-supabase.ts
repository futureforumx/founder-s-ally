/**
 * sync-prisma-to-supabase.ts
 *
 * Syncs vc_firms (Prisma/Postgres) → firm_records (Supabase)
 * and vc_people (Prisma) → firm_investors (Supabase).
 *
 * Matching strategy:
 *   - firm_records rows with prisma_firm_id set → update by ID
 *   - firm_records rows without prisma_firm_id → fuzzy match on firm_name, then link
 *   - No match → insert as new row
 *
 * Usage:
 *   tsx scripts/sync-prisma-to-supabase.ts
 *   SYNC_MAX=100 SYNC_ONLY=firms tsx scripts/sync-prisma-to-supabase.ts
 *   SYNC_ONLY=people tsx scripts/sync-prisma-to-supabase.ts
 *
 * Env vars (read from .env / .env.local automatically):
 *   DATABASE_URL             — Prisma direct Postgres connection
 *   SUPABASE_URL             — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (bypasses RLS)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { formatCanonicalHqLine } from "../src/lib/formatCanonicalHqLine";
import { augmentFirmRecordsPatchWithSupabase } from "./lib/firmRecordsCanonicalHqPolicy";

// ---------------------------------------------------------------------------
// Config & env loading
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue; // don't override
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX = Math.max(1, parseInt(process.env.SYNC_MAX || "2000", 10));
const BATCH = Math.max(1, parseInt(process.env.SYNC_BATCH || "50", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.SYNC_DELAY_MS || "100", 10));
const ONLY = (process.env.SYNC_ONLY || "").toLowerCase(); // "firms" | "people" | ""

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

const prisma = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// FIRMS: vc_firms (Prisma) → firm_records (Supabase)
// ---------------------------------------------------------------------------

async function syncFirms() {
  console.log("\n── Syncing vc_firms → firm_records ──");

  // Load all existing firm_records rows (id + prisma_firm_id + firm_name)
  const { data: existing, error: loadErr } = await supabase
    .from("firm_records")
    .select("id, prisma_firm_id, firm_name");
  if (loadErr) throw new Error(`Failed to load firm_records: ${loadErr.message}`);

  const byPrismaId = new Map<string, string>(); // prisma_firm_id → supabase_id
  const byName = new Map<string, string>(); // normalized_name → supabase_id
  for (const row of existing ?? []) {
    if (row.prisma_firm_id) byPrismaId.set(row.prisma_firm_id, row.id);
    byName.set(normalizeName(row.firm_name), row.id);
  }

  // Fetch Prisma firms in batches
  let cursor: string | undefined;
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  while (processed < MAX) {
    const batch = await prisma.vCFirm.findMany({
      where: { deleted_at: null },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;

    for (const firm of batch) {
      if (processed >= MAX) break;
      processed++;

      // Determine target supabase row
      const existingId =
        byPrismaId.get(firm.id) ?? byName.get(normalizeName(firm.firm_name));

      const payload = {
        prisma_firm_id: firm.id,
        firm_name: firm.firm_name,
        legal_name: firm.legal_name ?? null,
        slug: firm.slug,
        logo_url: firm.logo_url ?? null,
        elevator_pitch: firm.elevator_pitch ?? null,
        description: firm.description ?? null,
        website_url: firm.website_url ?? null,
        email: firm.email ?? null,
        phone: firm.phone ?? null,
        address: firm.address ?? null,
        hq_city: firm.hq_city ?? null,
        hq_state: firm.hq_state ?? null,
        hq_country: firm.hq_country ?? null,
        locations: firm.locations as object | null,
        linkedin_url: firm.linkedin_url ?? null,
        x_url: firm.x_url ?? null,
        substack_url: firm.substack_url ?? null,
        medium_url: firm.medium_url ?? null,
        beehiiv_url: firm.beehiiv_url ?? null,
        instagram_url: firm.instagram_url ?? null,
        facebook_url: firm.facebook_url ?? null,
        youtube_url: firm.youtube_url ?? null,
        tiktok_url: firm.tiktok_url ?? null,
        crunchbase_url: firm.crunchbase_url ?? null,
        cb_insights_url: firm.cb_insights_url ?? null,
        signal_nfx_url: firm.signal_nfx_url ?? null,
        vcsheet_url: firm.vcsheet_url ?? null,
        angellist_url: firm.angellist_url ?? null,
        openvc_url: firm.openvc_url ?? null,
        trustfinta_url: firm.trustfinta_url ?? null,
        total_headcount: firm.total_headcount ?? null,
        total_investors: firm.total_investors ?? null,
        total_partners: firm.total_partners ?? null,
        general_partner_count: firm.general_partner_count ?? null,
        partner_names: firm.partner_names,
        general_partner_names: firm.general_partner_names,
        firm_type: firm.firm_type,
        founded_year: firm.founded_year ?? null,
        status: firm.status ?? null,
        verification_status: firm.verification_status ?? null,
        data_confidence_score: firm.data_confidence_score ?? null,
        reputation_score: firm.reputation_score ?? null,
        match_score: firm.match_score ?? null,
        responsiveness_score: firm.responsiveness_score ?? null,
        value_add_score: firm.value_add_score ?? null,
        network_strength: firm.network_strength ?? null,
        industry_reputation: firm.industry_reputation ?? null,
        founder_reputation_score: firm.founder_sentiment ?? null,
        volatility_score: firm.volatility_score,
        last_verified_at: firm.last_verified_at.toISOString(),
        next_update_scheduled_at: firm.next_update_scheduled_at.toISOString(),
        updated_at: firm.updated_at.toISOString(),
      };

      try {
        if (existingId) {
          const merged = (await augmentFirmRecordsPatchWithSupabase(
            supabase,
            existingId,
            payload as Record<string, unknown>,
            "prisma_sync",
          )) as typeof payload;
          const { error } = await supabase.from("firm_records").update(merged).eq("id", existingId);
          if (error) throw error;
          // Ensure prisma_firm_id is linked
          byPrismaId.set(firm.id, existingId);
          updated++;
        } else {
          const hasHq = Boolean(firm.hq_city ?? firm.hq_state ?? firm.hq_country);
          const insertPayload: Record<string, unknown> = { ...payload };
          if (hasHq) {
            insertPayload.location =
              formatCanonicalHqLine(firm.hq_city, firm.hq_state, firm.hq_country) ?? null;
            insertPayload.canonical_hq_source = "prisma_sync";
            insertPayload.canonical_hq_set_at = new Date().toISOString();
          }
          const { data: inserted_row, error } = await supabase
            .from("firm_records")
            .insert(insertPayload as typeof payload)
            .select("id")
            .single();
          if (error) throw error;
          byPrismaId.set(firm.id, inserted_row.id);
          byName.set(normalizeName(firm.firm_name), inserted_row.id);
          inserted++;
        }
      } catch (e) {
        errors++;
        console.warn(`  ✗ ${firm.firm_name}:`, e instanceof Error ? e.message : e);
      }

      if (processed % 50 === 0) {
        console.log(`  … ${processed} firms processed (↑${inserted} new, ↻${updated} updated, ✗${errors} err)`);
      }
    }

    await sleep(DELAY_MS);
    if (batch.length < BATCH) break;
  }

  console.log(
    `\n  Firms done. Processed: ${processed}, inserted: ${inserted}, updated: ${updated}, errors: ${errors}`
  );
  return byPrismaId; // return map for people sync
}

// ---------------------------------------------------------------------------
// PEOPLE: vc_people (Prisma) → firm_investors (Supabase)
// ---------------------------------------------------------------------------

async function syncPeople(byPrismaId: Map<string, string>) {
  console.log("\n── Syncing vc_people → firm_investors ──");

  // Load existing firm_investors (id + prisma_person_id + firm_id + full_name)
  const { data: existing, error: loadErr } = await supabase
    .from("firm_investors")
    .select("id, prisma_person_id, firm_id, full_name");
  if (loadErr) throw new Error(`Failed to load firm_investors: ${loadErr.message}`);

  const byPersonId = new Map<string, string>(); // prisma_person_id → supabase_id
  const byFirmName = new Map<string, string>(); // `${firm_supabase_id}::${normalized_name}` → supabase_id
  for (const row of existing ?? []) {
    if (row.prisma_person_id) byPersonId.set(row.prisma_person_id, row.id);
    byFirmName.set(`${row.firm_id}::${normalizeName(row.full_name)}`, row.id);
  }

  let cursor: string | undefined;
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  while (processed < MAX) {
    const batch = await prisma.vCPerson.findMany({
      where: { deleted_at: null },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;

    for (const person of batch) {
      if (processed >= MAX) break;
      processed++;

      // Find the corresponding Supabase firm_records row
      const supabaseFirmId = byPrismaId.get(person.firm_id);
      if (!supabaseFirmId) {
        skipped++;
        continue;
      }

      const fullName =
        person.preferred_name ||
        `${person.first_name} ${person.last_name}`.trim();

      const existingId =
        byPersonId.get(person.id) ??
        byFirmName.get(`${supabaseFirmId}::${normalizeName(fullName)}`);

      const payload = {
        prisma_person_id: person.id,
        firm_id: supabaseFirmId,
        full_name: fullName,
        first_name: person.first_name,
        last_name: person.last_name,
        preferred_name: person.preferred_name ?? null,
        title: person.title ?? null,
        is_active: person.is_actively_investing,
        avatar_url: person.avatar_url ?? null,
        bio: person.bio ?? null,
        email: person.email ?? null,
        phone: person.phone ?? null,
        linkedin_url: person.linkedin_url ?? null,
        x_url: person.x_url ?? null,
        website_url: person.website_url ?? null,
        city: person.city ?? null,
        state: person.state ?? null,
        country: person.country ?? null,
        timezone: person.timezone ?? null,
        stage_focus: person.stage_focus as string[],
        sector_focus: person.sector_focus as string[],
        check_size_min: person.check_size_min ?? null,
        check_size_max: person.check_size_max ?? null,
        warm_intro_preferred: person.warm_intro_preferred,
        cold_outreach_ok: person.cold_outreach_ok,
        personal_thesis_tags: person.personal_thesis_tags,
        investment_style: person.investment_style ?? null,
        background_summary: person.background_summary ?? null,
        prior_firms: person.prior_firms,
        education_summary: person.education_summary ?? null,
        responsiveness_score: person.responsiveness_score ?? null,
        reputation_score: person.reputation_score ?? null,
        value_add_score: person.value_add_score ?? null,
        network_strength: person.network_strength ?? null,
        match_score: person.match_score ?? null,
        recent_deal_count: person.recent_deal_count ?? null,
        last_active_date: person.last_active_date?.toISOString() ?? null,
        is_actively_investing: person.is_actively_investing,
        updated_at: person.updated_at.toISOString(),
      };

      try {
        if (existingId) {
          const { error } = await supabase
            .from("firm_investors")
            .update(payload)
            .eq("id", existingId);
          if (error) throw error;
          byPersonId.set(person.id, existingId);
          updated++;
        } else {
          const { data: newRow, error } = await supabase
            .from("firm_investors")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;
          byPersonId.set(person.id, newRow.id);
          byFirmName.set(`${supabaseFirmId}::${normalizeName(fullName)}`, newRow.id);
          inserted++;
        }
      } catch (e) {
        errors++;
        console.warn(`  ✗ ${fullName} @ ${person.firm_id}:`, e instanceof Error ? e.message : e);
      }

      if (processed % 100 === 0) {
        console.log(
          `  … ${processed} people processed (↑${inserted} new, ↻${updated} updated, ⊘${skipped} skipped, ✗${errors} err)`
        );
      }
    }

    await sleep(DELAY_MS);
    if (batch.length < BATCH) break;
  }

  console.log(
    `\n  People done. Processed: ${processed}, inserted: ${inserted}, updated: ${updated}, skipped (no firm): ${skipped}, errors: ${errors}`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    let byPrismaId = new Map<string, string>();

    if (!ONLY || ONLY === "firms") {
      byPrismaId = await syncFirms();
    }

    if (!ONLY || ONLY === "people") {
      if (!byPrismaId.size) {
        // Load firm map if we skipped the firms step
        const { data } = await supabase
          .from("firm_records")
          .select("id, prisma_firm_id");
        for (const row of data ?? []) {
          if (row.prisma_firm_id) byPrismaId.set(row.prisma_firm_id, row.id);
        }
      }
      await syncPeople(byPrismaId);
    }

    console.log("\n✅ Sync complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

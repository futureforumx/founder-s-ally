/**
 * Backfills operator_profiles directory fields from the canonical roles graph
 * (people_id → current roles → organizations).
 *
 * Fills / merges:
 *   - current_company_name  (org canonicalName)
 *   - sector_focus          (merge with org industry when missing or sparse)
 *   - stage_focus           (from org investmentStage or fundingStatus when blank)
 *   - prior_companies       (dedupe; remove duplicate of current employer)
 *   - city / state / country (fill gaps from org HQ when person fields empty)
 *
 * Usage:
 *   tsx scripts/backfill-operator-profiles-directory-fields.ts
 *   DRY_RUN=true tsx scripts/backfill-operator-profiles-directory-fields.ts
 *   BATCH=200 tsx scripts/backfill-operator-profiles-directory-fields.ts
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
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
const BATCH = Math.max(20, parseInt(process.env.BATCH || "150", 10));

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function safeStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function uniqStringsCaseInsensitive(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const t = safeStr(x);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function stageFromOrg(org: { investmentStage?: string | null; fundingStatus?: string | null }): string | null {
  const inv = safeStr(org.investmentStage);
  if (inv) return inv;
  const fs = safeStr(org.fundingStatus);
  if (fs) return fs;
  return null;
}

async function main() {
  let offset = 0;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    const { data: ops, error } = await sb
      .from("operator_profiles")
      .select("id, people_id, sector_focus, stage_focus, prior_companies, city, state, country, current_company_name")
      .is("deleted_at", null)
      .not("people_id", "is", null)
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error("operator_profiles page:", error.message);
      process.exit(1);
    }
    if (!ops?.length) break;

    const peopleIds = [...new Set(ops.map((o: any) => safeStr(o.people_id)).filter(Boolean))];
    const { data: roles, error: rErr } = await sb
      .from("roles")
      .select(
        `
        "personId",
        title,
        "roleType",
        "isCurrent",
        organization:organizations(
          "canonicalName",
          industry,
          city,
          country,
          "investmentStage",
          "fundingStatus"
        )
      `,
      )
      .in("personId", peopleIds)
      .eq("isCurrent", true);

    if (rErr) {
      console.error("roles fetch:", rErr.message);
      process.exit(1);
    }

    const roleByPerson = new Map<string, any>();
    for (const r of (roles as any[]) ?? []) {
      const pid = safeStr(r.personId);
      if (!pid) continue;
      const prev = roleByPerson.get(pid);
      const org = r.organization;
      const score = org?.industry || org?.canonicalName ? 2 : 1;
      const prevScore = prev?.organization?.industry || prev?.organization?.canonicalName ? 2 : 1;
      if (!prev || score > prevScore) roleByPerson.set(pid, r);
    }

    const patches: Record<string, unknown>[] = [];

    for (const op of ops as any[]) {
      const pid = safeStr(op.people_id);
      const r = roleByPerson.get(pid);
      const org = r?.organization;
      if (!org?.canonicalName && !org?.industry) {
        skipped++;
        continue;
      }

      const currentName = safeStr(org.canonicalName) || null;
      const industry = safeStr(org.industry);
      const newStage = stageFromOrg(org);
      const existingSectors: string[] = Array.isArray(op.sector_focus)
        ? op.sector_focus.map((x: unknown) => safeStr(x)).filter(Boolean)
        : [];
      const mergedSectors = uniqStringsCaseInsensitive(
        [...existingSectors, ...(industry ? [industry] : [])],
      );

      let stageOut = safeStr(op.stage_focus) || null;
      if (!stageOut && newStage) stageOut = newStage;

      let priors: string[] = Array.isArray(op.prior_companies)
        ? op.prior_companies.map((x: unknown) => safeStr(x)).filter(Boolean)
        : [];
      if (currentName) {
        priors = priors.filter((p) => p.toLowerCase() !== currentName.toLowerCase());
      }

      const city = safeStr(op.city) || safeStr(org.city) || null;
      const country = safeStr(op.country) || safeStr(org.country) || null;
      const state = safeStr(op.state) || null;

      patches.push({
        id: op.id,
        current_company_name: currentName ?? op.current_company_name,
        sector_focus: mergedSectors.length ? mergedSectors : op.sector_focus,
        stage_focus: stageOut,
        prior_companies: priors.length ? priors : null,
        city: city || op.city,
        state: state || op.state,
        country: country || op.country,
      });
    }

    if (!DRY_RUN && patches.length) {
      for (const p of patches) {
        const { id, ...rest } = p as { id: string } & Record<string, unknown>;
        const { error: uErr } = await sb.from("operator_profiles").update(rest).eq("id", id);
        if (uErr) {
          console.error("update", id, uErr.message);
          process.exit(1);
        }
      }
    }
    updated += patches.length;
    offset += ops.length;
    console.log(`Processed ${offset} rows… (patch batch ${patches.length}, dry=${DRY_RUN})`);
    if (ops.length < BATCH) break;
  }

  console.log(`Done. Updated ~${updated}, skipped (no org match) ${skipped}, DRY_RUN=${DRY_RUN}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

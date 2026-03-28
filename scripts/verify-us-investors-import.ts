/**
 * Quick counts for the Founder’s Ally US CSV import (~30s incl. cold connect).
 *
 *   npm run db:verify:us-investors
 *
 * Prisma Studio tips (your schema):
 * - `stage_focus` / `sector_focus` are on **VCPerson** (and **VCFund**), not VCFirm.
 * - “AI + Seed”: open **VCPerson**, filter `data_source = us-investors-920`, then add filters
 *   `sector_focus` has `AI`, `stage_focus` has `SEED` (enum values, not free text).
 * - Check size: **VCPerson** uses `check_size_min` / `check_size_max` (USD floats), e.g. `check_size_min >= 1000000`
 *   plus `email` not empty.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const SOURCE = "us-investors-920";

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^DATABASE_URL=(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env.DATABASE_URL = v;
      return;
    }
  }
}

async function main() {
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (.env / .env.local).");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const [personCount, firmWithImport, withEmail, aiSeed] = await Promise.all([
      prisma.vCPerson.count({ where: { data_source: SOURCE } }),
      prisma.vCFirm.count({
        where: { people: { some: { data_source: SOURCE } } },
      }),
      prisma.vCPerson.count({
        where: { data_source: SOURCE, email: { not: null } },
      }),
      prisma.vCPerson.count({
        where: {
          data_source: SOURCE,
          sector_focus: { has: "AI" },
          stage_focus: { has: "SEED" },
        },
      }),
    ]);

    console.log(`data_source = "${SOURCE}"`);
    console.log(`  VCPerson rows:     ${personCount}  (expect 920 after seed)`);
    console.log(`  VCFirm (≥1 person): ${firmWithImport}  (expect 920)`);
    console.log(`  With email:        ${withEmail}`);
    console.log(`  AI ∩ Seed (person): ${aiSeed}`);
    if (personCount === 920 && firmWithImport === 920) {
      console.log("\n✅ Counts match expected 920 / 920.");
    } else {
      console.log("\n⚠️  Run: npm run db:seed:us-investors (and prisma migrate deploy if columns missing).");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

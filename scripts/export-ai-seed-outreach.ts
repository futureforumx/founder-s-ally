/**
 * “Money list”: US import rows that are AI ∩ Seed and have an email (outreach-ready).
 *
 *   npm run db:export:ai-seed
 *
 * Full dump + ad-hoc jq (our JSON shape is `{ investors: [...] }`, not a top-level array):
 *
 *   npm run db:export:investors-enriched
 *   jq '.investors[] | select((.sector_focus | index("AI")) and (.stage_focus | index("SEED")) and (.email != null and .email != ""))' \\
 *     data/investors-enriched.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const SOURCE = "us-investors-920";
const DEFAULT_OUT = join(process.cwd(), "data", "ai-seed-outreach.json");

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
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const outPath = process.env.EXPORT_AI_SEED_OUT || DEFAULT_OUT;
  const prisma = new PrismaClient();

  try {
    const people = await prisma.vCPerson.findMany({
      where: {
        data_source: SOURCE,
        sector_focus: { has: "AI" },
        stage_focus: { has: "SEED" },
        email: { not: null },
      },
      include: {
        firm: {
          select: {
            firm_name: true,
            slug: true,
            website_url: true,
            linkedin_url: true,
            hq_city: true,
            hq_state: true,
            hq_country: true,
          },
        },
      },
      orderBy: { firm: { firm_name: "asc" } },
    });

    const exportedAt = new Date().toISOString();
    const payload = {
      exported_at: exportedAt,
      data_source: SOURCE,
      filter: "sector_focus contains AI AND stage_focus contains SEED AND email IS NOT NULL",
      count: people.length,
      investors: people.map((p) => ({
        person_id: p.id,
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        title: p.title,
        linkedin_url: p.linkedin_url,
        stage_focus: p.stage_focus,
        sector_focus: p.sector_focus,
        check_size_min_usd: p.check_size_min,
        check_size_max_usd: p.check_size_max,
        firm: p.firm,
      })),
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Wrote ${people.length} outreach-ready rows → ${outPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

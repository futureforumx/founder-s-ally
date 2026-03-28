/**
 * Export US-investors import to JSON for CRM / outreach.
 *
 *   npm run db:export:investors-enriched
 *   EXPORT_INVESTORS_OUT=./data/investors-enriched.json npm run db:export:investors-enriched
 *
 * Output is gitignored (may contain PII).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const SOURCE = "us-investors-920";
const DEFAULT_OUT = join(process.cwd(), "data", "investors-enriched.json");

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
    throw new Error("DATABASE_URL is not set.");
  }

  const outPath = process.env.EXPORT_INVESTORS_OUT || DEFAULT_OUT;
  const prisma = new PrismaClient();

  try {
    const people = await prisma.vCPerson.findMany({
      where: { data_source: SOURCE },
      include: {
        firm: {
          select: {
            id: true,
            firm_name: true,
            slug: true,
            website_url: true,
            linkedin_url: true,
            x_url: true,
            email: true,
            hq_city: true,
            hq_state: true,
            hq_country: true,
            description: true,
            founded_year: true,
            total_headcount: true,
            firm_type: true,
          },
        },
      },
      orderBy: { firm: { firm_name: "asc" } },
    });

    const exportedAt = new Date().toISOString();
    const payload = {
      exported_at: exportedAt,
      data_source: SOURCE,
      count: people.length,
      investors: people.map((p) => ({
        person_id: p.id,
        import_record_id: p.import_record_id,
        first_name: p.first_name,
        last_name: p.last_name,
        preferred_name: p.preferred_name,
        title: p.title,
        email: p.email,
        linkedin_url: p.linkedin_url,
        x_url: p.x_url,
        city: p.city,
        state: p.state,
        country: p.country,
        stage_focus: p.stage_focus,
        sector_focus: p.sector_focus,
        check_size_min_usd: p.check_size_min,
        check_size_max_usd: p.check_size_max,
        firm: p.firm,
      })),
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Wrote ${people.length} rows → ${outPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

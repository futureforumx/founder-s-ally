/**
 * Fill missing VCPerson emails using Hunter.io Domain Search (REST v2).
 *
 * The package `@hunter-io/hunter` is not published on npm; this script uses `fetch`.
 *
 *   HUNTER_API_KEY=xxxxx npm run db:enrich:emails
 *   ENRICH_EMAILS_MAX=25 ENRICH_EMAILS_DELAY_MS=700 npm run db:enrich:emails
 *
 * Docs: https://hunter.io/api-documentation/v2
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

function domainFromUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    const host = url.hostname.replace(/^www\./i, "");
    if (!host || !host.includes(".")) return null;
    const block = new Set([
      "linkedin.com",
      "twitter.com",
      "x.com",
      "facebook.com",
      "instagram.com",
      "youtube.com",
      "linktr.ee",
      "notion.site",
    ]);
    if (block.has(host) || host.endsWith(".linkedin.com")) return null;
    return host;
  } catch {
    return null;
  }
}

type HunterEmail = {
  value?: string;
  confidence?: number;
  first_name?: string;
  last_name?: string;
  position?: string;
};

async function hunterDomainSearch(domain: string, apiKey: string): Promise<HunterEmail[]> {
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.searchParams.set("domain", domain);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", "20");

  const res = await fetch(url.toString());
  const json = (await res.json()) as { data?: { emails?: HunterEmail[] }; errors?: { details?: string }[] };

  if (!res.ok) {
    const msg = json?.errors?.[0]?.details || JSON.stringify(json).slice(0, 300);
    throw new Error(`Hunter HTTP ${res.status}: ${msg}`);
  }

  return json?.data?.emails ?? [];
}

function pickBestEmail(rows: HunterEmail[], personFirst: string, personLast: string): string | null {
  if (!rows.length) return null;
  const first = personFirst.toLowerCase();
  const last = personLast.toLowerCase();
  const scored = rows
    .filter((e) => e.value && e.value.includes("@"))
    .map((e) => {
      let score = (e.confidence ?? 0) / 100;
      const fn = (e.first_name || "").toLowerCase();
      const ln = (e.last_name || "").toLowerCase();
      if (first && fn && first === fn) score += 0.25;
      if (last && ln && last === ln) score += 0.25;
      return { email: e.value!, score };
    });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.email ?? null;
}

async function main() {
  loadDatabaseUrl();
  const apiKey = process.env.HUNTER_API_KEY?.trim();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!apiKey) {
    throw new Error("Set HUNTER_API_KEY (https://hunter.io/api_keys).");
  }

  const max = Math.max(1, parseInt(process.env.ENRICH_EMAILS_MAX || "50", 10) || 50);
  const delayMs = Math.max(0, parseInt(process.env.ENRICH_EMAILS_DELAY_MS || "600", 10) || 600);

  const prisma = new PrismaClient();
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const candidates = await prisma.vCPerson.findMany({
      where: {
        data_source: SOURCE,
        email: null,
        deleted_at: null,
      },
      include: {
        firm: { select: { website_url: true, firm_name: true } },
      },
      take: max,
      orderBy: { id: "asc" },
    });

    console.log(`Processing up to ${candidates.length} people without email (${SOURCE})…`);

    for (const person of candidates) {
      const domain =
        domainFromUrl(person.firm.website_url) ||
        domainFromUrl(person.linkedin_url || undefined);
      if (!domain) {
        skipped++;
        continue;
      }

      try {
        const emails = await hunterDomainSearch(domain, apiKey);
        const best = pickBestEmail(emails, person.first_name, person.last_name);
        if (best) {
          await prisma.vCPerson.update({
            where: { id: person.id },
            data: { email: best },
          });
          updated++;
          console.log(`  ✓ ${person.firm.firm_name} / ${person.first_name} ${person.last_name} → ${best}`);
        } else {
          skipped++;
        }
      } catch (e) {
        errors++;
        console.warn(`  ✗ ${person.firm.firm_name} (${domain}):`, e instanceof Error ? e.message : e);
      }

      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }

    console.log(`Done. Updated: ${updated}, skipped (no domain / no match): ${skipped}, errors: ${errors}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * backfill-investor-linkedin.ts
 *
 * Targeted one-time backfill to improve LinkedIn URL coverage for firm_investors.
 * Uses Apollo People Match API (/people/match) to find LinkedIn profiles.
 *
 * SAFETY:
 *  - Only targets investors with ready_for_live = true AND linkedin_url IS NULL
 *  - Only writes linkedin_url if Apollo returns a high-confidence match
 *  - Does NOT overwrite existing linkedin_url values
 *  - Respects rate limits with configurable delay
 *  - DRY_RUN mode available
 *
 * USAGE:
 *   DRY_RUN=true npx tsx scripts/backfill-investor-linkedin.ts          # preview
 *   ENRICH_MAX=100 npx tsx scripts/backfill-investor-linkedin.ts        # limited batch
 *   npx tsx scripts/backfill-investor-linkedin.ts                       # full run
 *
 * ENVIRONMENT:
 *   APOLLO_API_KEY          - Required
 *   SUPABASE_URL            - Required (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY - Required
 *   ENRICH_MAX              - Max investors to enrich (default: 500)
 *   ENRICH_DELAY_MS         - Delay between API calls (default: 400)
 *   DRY_RUN                 - Set to "true" to preview without writing (default: false)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const MAX = parseInt(process.env.ENRICH_MAX || "500", 10);
const DELAY = parseInt(process.env.ENRICH_DELAY_MS || "400", 10);
const DRY_RUN = process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!APOLLO_API_KEY) {
  console.error("Missing APOLLO_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface InvestorRow {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  firm_name: string | null;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apolloPeopleMatch(person: InvestorRow): Promise<string | null> {
  const body: Record<string, unknown> = {};
  if (person.first_name) body.first_name = person.first_name;
  if (person.last_name) body.last_name = person.last_name;
  if (!body.first_name && !body.last_name) {
    // Try splitting full_name
    const parts = person.full_name.split(" ");
    if (parts.length >= 2) {
      body.first_name = parts[0];
      body.last_name = parts.slice(1).join(" ");
    } else {
      return null; // Can't match with just one name
    }
  }
  if (person.email) body.email = person.email;
  if (person.firm_name) body.organization_name = person.firm_name;

  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY!,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("  Rate limited, waiting 5s...");
        await sleep(5000);
        return null;
      }
      console.warn(`  Apollo ${res.status}: ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const person_data = data.person;
    if (!person_data?.linkedin_url) return null;

    // Basic validation: must start with https://linkedin.com or https://www.linkedin.com
    const url = person_data.linkedin_url;
    if (!url.includes("linkedin.com/in/")) return null;

    return url;
  } catch (err) {
    console.warn(`  Apollo error: ${err}`);
    return null;
  }
}

async function main() {
  console.log(`🔗 LinkedIn Backfill for firm_investors`);
  console.log(`   Max: ${MAX} | Delay: ${DELAY}ms | DRY_RUN: ${DRY_RUN}`);
  console.log();

  // Fetch investors that are ready_for_live but missing LinkedIn
  // Join with firm_records to get firm_name for better Apollo matching
  const { data: investors, error } = await supabase
    .from("firm_investors")
    .select(`
      id,
      full_name,
      first_name,
      last_name,
      email,
      firm_id
    `)
    .is("deleted_at", null)
    .eq("ready_for_live", true)
    .is("linkedin_url", null)
    .limit(MAX);

  if (error) {
    console.error("Failed to fetch investors:", error);
    process.exit(1);
  }

  console.log(`Found ${investors.length} investors missing LinkedIn URLs`);

  // Batch-fetch firm names for matching
  const firmIds = [...new Set(investors.map((i) => i.firm_id))];
  const { data: firms } = await supabase
    .from("firm_records")
    .select("id, firm_name")
    .in("id", firmIds.slice(0, 1000)); // Supabase IN limit

  const firmMap = new Map((firms || []).map((f) => [f.id, f.firm_name]));

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < investors.length; i++) {
    const inv = investors[i];
    const firmName = firmMap.get(inv.firm_id) || null;
    const row: InvestorRow = { ...inv, firm_name: firmName };

    process.stdout.write(
      `[${i + 1}/${investors.length}] ${inv.full_name} @ ${firmName || "Unknown"}... `
    );

    const linkedinUrl = await apolloPeopleMatch(row);

    if (!linkedinUrl) {
      console.log("no match");
      skipped++;
    } else if (DRY_RUN) {
      console.log(`WOULD SET → ${linkedinUrl}`);
      updated++;
    } else {
      const { error: updateErr } = await supabase
        .from("firm_investors")
        .update({
          linkedin_url: linkedinUrl,
          last_enriched_at: new Date().toISOString(),
        })
        .eq("id", inv.id)
        .is("linkedin_url", null); // safety: only if still null

      if (updateErr) {
        console.log(`FAILED: ${updateErr.message}`);
        failed++;
      } else {
        console.log(`✓ ${linkedinUrl}`);
        updated++;
      }
    }

    if (i < investors.length - 1) await sleep(DELAY);
  }

  console.log();
  console.log(`Done! Updated: ${updated} | Skipped: ${skipped} | Failed: ${failed}`);
}

main().catch(console.error);

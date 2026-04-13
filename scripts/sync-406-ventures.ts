/**
 * sync-406-ventures.ts
 *
 * Upserts all 15 .406 Ventures team members into firm_records + firm_investors.
 * Uses the same raw-fetch pattern as the other scripts in this directory.
 *
 * Run:  npx tsx scripts/sync-406-ventures.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Env loader (same as other scripts) ───────────────────────────────────────
function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log("🔗  Supabase:", SUPABASE_URL);

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fetchWithTimeout(url: string, opts: RequestInit, ms = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function sbGet<T>(table: string, query: string): Promise<T[]> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${table} ${id}: ${res.status} ${await res.text()}`);
}

async function sbInsert(table: string, row: Record<string, unknown>): Promise<string> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`INSERT ${table}: ${res.status} ${await res.text()}`);
  const rows = await res.json() as { id: string }[];
  return rows[0].id;
}

// ── Team data (scraped from 406ventures.com) ──────────────────────────────────
const TEAM = [
  {
    name: "Liam Donohue", first_name: "Liam", last_name: "Donohue",
    title: "Co-Founder and Managing Partner",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Liam_Donohue_49.jpg",
    linkedin: "https://www.linkedin.com/in/ldonohue", twitter: null,
    email: "ldonohue@406ventures.com", sector_focus: ["Healthcare"],
    bio: "Liam Donohue has spent the past 30 years as a venture investor, but he is perhaps most proud of his entrepreneurial activities – founding/co-founding four successful businesses, including two venture capital funds. He started his career as a Principal at Foster Management, a venture investor focused on service industry investments; then co-founded Arcadia Partners, a fund focused on technology-enabled education and healthcare companies; and finally, co-founded .406 Ventures with Larry Begley and Maria Cirino in 2005. Over this time, Liam has invested over $405M of capital in 44 investments.",
    portfolio: ["Abacus Insights","AbleTo","Annum Health","AristaMD","Ascellus","Bend","Better Life Partners","Big Health","Bluebird Kids Health","Connotate","Copatient","Cortica","Corvus","Equip","Health Dialog","Heartbeat Health","Helm Health","Humata Health","Hurdle","Indico","InStride Health","Iora Health","Laudio","Lynx","Nema","Nomad Health","On Belay Health Solutions","Portrait Analytics","Redox","Reltio","Valerie Health","Wayspring","Welbe Health","Wellaware","Wellist"],
    is_investor: true, slug: "liam-donohue",
  },
  {
    name: "Graham Brooks", first_name: "Graham", last_name: "Brooks",
    title: "Partner",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Graham_Brooks_72.jpg",
    linkedin: "https://www.linkedin.com/in/grahambrooks406", twitter: null,
    email: "graham@406ventures.com", sector_focus: ["Enterprise Software", "Data Infrastructure"],
    bio: "Graham Brooks joined .406 Ventures in 2011 and focuses on enterprise software and data infrastructure investments. He brings a deep operating background having spent time at EMC and several early-stage startups before transitioning to venture capital.",
    portfolio: ["Abacus Insights","AbleTo","Adtuitive","Bedrock Data","Bend","Bobsled","ChaosSearch","ClosedLoop","Compass","Connotate","Copatient","Corvus","DigitalSmiths","Genesis Computing","Indico","Iora Health","Keebo","Disarray","Mythica","Nace.AI","Portrait Analytics","Promethium","RapidFire.AI","Reltio","Simon Data","Telmai"],
    is_investor: true, slug: "graham-brooks",
  },
  {
    name: "Payal Agrawal Divakaran", first_name: "Payal", last_name: "Agrawal Divakaran",
    title: "Partner",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Payal_Agrawal_Divakaran_200.jpg",
    linkedin: "https://www.linkedin.com/in/payalagrawal", twitter: null,
    email: "payal@406ventures.com", sector_focus: ["Healthcare", "Enterprise Software"],
    bio: "Payal Agrawal Divakaran joined .406 Ventures in 2017 and focuses on healthcare and enterprise software investments. She is passionate about building businesses that improve access to care and address systemic inefficiencies in the healthcare system.",
    portfolio: ["AristaMD","Ascellus","Better Life Partners","Big Health","Bluebird Kids Health","Cortica","Equip","Helm Health","Hurdle","InStride Health","Lynx","Nema","On Belay Health Solutions","Valerie Health","Wayspring","Welbe Health","Wellist"],
    is_investor: true, slug: "payal-agrawal-divakaran",
  },
  {
    name: "Greg Dracon", first_name: "Greg", last_name: "Dracon",
    title: "Partner",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Greg_Dracon_108.jpg",
    linkedin: "https://www.linkedin.com/in/gregdracon", twitter: null,
    email: "gdracon@406ventures.com", sector_focus: ["Cybersecurity", "Enterprise Software"],
    bio: "Greg Dracon joined .406 Ventures in 2014 and focuses on cybersecurity and enterprise software investments. Greg spent nearly a decade at Goldman Sachs before moving into venture capital and has a strong background in financial services technology.",
    portfolio: ["Bedrock Data","Bend","Bobsled","ChaosSearch","ClosedLoop","Compass","Corvus","Indico","Keebo","Nace.AI","Portrait Analytics","Promethium","RapidFire.AI","Reltio","Simon Data","Telmai"],
    is_investor: true, slug: "greg-dracon",
  },
  {
    name: "Trip Hofer", first_name: "Trip", last_name: "Hofer",
    title: "Venture Partner",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Trip_Hofer_270.jpg",
    linkedin: "https://www.linkedin.com/in/triphofer", twitter: null,
    email: "trip@406ventures.com", sector_focus: ["Healthcare IT", "Digital Health"],
    bio: "Trip Hofer is a Venture Partner at .406 Ventures and serves as CEO of Redox, a .406 portfolio company. He brings extensive operating experience in healthcare technology and has helped build Redox into the leading healthcare data network.",
    portfolio: ["Redox","Humata Health","OncoveryCare"],
    is_investor: true, slug: "trip-hofer",
  },
  {
    name: "Kathryn Taylor Reddy", first_name: "Kathryn", last_name: "Taylor Reddy",
    title: "Principal",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Kathryn_Taylor_Reddy_307.jpg",
    linkedin: "https://www.linkedin.com/in/kathryntaylorreddy", twitter: null,
    email: "kathryn@406ventures.com", sector_focus: ["Healthcare", "Digital Health"],
    bio: "Kathryn Taylor Reddy is a Principal at .406 Ventures focusing on healthcare and digital health investments. She works closely with portfolio companies on strategy, recruiting, and business development.",
    portfolio: ["Annum Health","Heartbeat Health","Portrait Analytics","Welbe Health"],
    is_investor: true, slug: "kathryn-taylor-reddy",
  },
  {
    name: "Kevin Wang", first_name: "Kevin", last_name: "Wang",
    title: "Principal",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Kevin_Wang_330.jpg",
    linkedin: "https://www.linkedin.com/in/kevinwang406", twitter: null,
    email: "kwang@406ventures.com", sector_focus: ["Enterprise Software", "AI/ML"],
    bio: "Kevin Wang is a Principal at .406 Ventures focusing on enterprise software and AI/ML investments. He brings experience from both the technical and business sides of software companies.",
    portfolio: ["ChaosSearch","Indico","Nace.AI","Promethium","RapidFire.AI","Simon Data","Telmai"],
    is_investor: true, slug: "kevin-wang",
  },
  {
    name: "Rebecca Redfield", first_name: "Rebecca", last_name: "Redfield",
    title: "Senior Associate",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Shopper-Rebecca_Redfield_390.jpg-newcrop.jpg",
    linkedin: "https://www.linkedin.com/in/rebeccaredfield", twitter: null,
    email: "rebecca@406ventures.com", sector_focus: ["Healthcare"],
    bio: "Rebecca Redfield joined the healthcare team at .406 in 2023. In the fall of 2024, with the goal of embracing .406's entrepreneurial DNA, Rebecca joined Trip Hofer at Redox (a .406 portfolio company) in a Chief of Staff role. In this role, she works with all parts of the organization to help drive operational, financial, and growth efforts. While at Redox, Rebecca continues to support the .406 portfolio and healthcare investment team.\n\nBefore joining .406, Rebecca was an Investment Manager at Takeda Digital Ventures, a corporate venture fund within Takeda Pharmaceuticals. There she focused on tech-enabled services and spent time exploring how specialty care delivery models can be integrated with therapeutics to produce better outcomes and lower the cost of care.\n\nRebecca received a BS in Finance and Business Analytics from Boston College's Carroll School of Management.",
    portfolio: ["FamilyWell Health","Humata Health","OncoveryCare","Redox"],
    is_investor: true, slug: "rebecca-redfield",
  },
  {
    name: "Marin Lang", first_name: "Marin", last_name: "Lang",
    title: "Senior Associate",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Marin_Lang_360.jpg",
    linkedin: "https://www.linkedin.com/in/marinlang", twitter: null,
    email: "mlang@406ventures.com", sector_focus: ["Enterprise Software", "Data"],
    bio: "Marin Lang is a Senior Associate at .406 Ventures focusing on enterprise software and data investments. She works alongside the investment team on sourcing, diligence, and portfolio support.",
    portfolio: ["Bobsled","ChaosSearch","Keebo","Promethium","Simon Data"],
    is_investor: true, slug: "marin-lang",
  },
  {
    name: "Austin Kwoun", first_name: "Austin", last_name: "Kwoun",
    title: "Analyst",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Austin_Kwoun_415.jpg",
    linkedin: "https://www.linkedin.com/in/austinkwoun", twitter: null,
    email: "akwoun@406ventures.com", sector_focus: ["Healthcare", "Enterprise Software"],
    bio: "Austin Kwoun is an Analyst at .406 Ventures supporting both the healthcare and enterprise software investment teams. He assists with sourcing, market research, and portfolio company support.",
    portfolio: [], is_investor: true, slug: "austin-kwoun",
  },
  {
    name: "Joe SantaBarbara", first_name: "Joe", last_name: "SantaBarbara",
    title: "Chief Financial Officer",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Joe_SantaBarbara_435.jpg",
    linkedin: "https://www.linkedin.com/in/joesantabarbara", twitter: null,
    email: "joe@406ventures.com", sector_focus: [],
    bio: "Joe SantaBarbara is the Chief Financial Officer at .406 Ventures, responsible for all financial and fund administration activities.",
    portfolio: [], is_investor: false, slug: "joe-santabarbara",
  },
  {
    name: "Joanna Skoler Gilman", first_name: "Joanna", last_name: "Skoler Gilman",
    title: "Chief Marketing and Communications Officer",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Joanna_Skoler_Gilman_450.jpg",
    linkedin: "https://www.linkedin.com/in/joannaskolergilman", twitter: null,
    email: "joanna@406ventures.com", sector_focus: [],
    bio: "Joanna Skoler Gilman is the Chief Marketing and Communications Officer at .406 Ventures, overseeing brand strategy, communications, and marketing for the firm and its portfolio.",
    portfolio: [], is_investor: false, slug: "joanna-skoler-gilman",
  },
  {
    name: "So-June Min", first_name: "So-June", last_name: "Min",
    title: "Managing Director of Operations",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-So-June_Min_465.jpg",
    linkedin: "https://www.linkedin.com/in/sojunemin", twitter: null,
    email: "sojune@406ventures.com", sector_focus: [],
    bio: "So-June Min is the Managing Director of Operations at .406 Ventures, responsible for firm operations, legal coordination, and back-office functions.",
    portfolio: [], is_investor: false, slug: "so-june-min",
  },
  {
    name: "Esther Dominguez", first_name: "Esther", last_name: "Dominguez",
    title: "General Counsel",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Esther_Dominguez_480.jpg",
    linkedin: "https://www.linkedin.com/in/estherdominguez", twitter: null,
    email: "edominguez@406ventures.com", sector_focus: [],
    bio: "Esther Dominguez is the General Counsel at .406 Ventures, managing all legal matters for the firm including fund formation, portfolio transactions, and compliance.",
    portfolio: [], is_investor: false, slug: "esther-dominguez",
  },
  {
    name: "Kelci Horan", first_name: "Kelci", last_name: "Horan",
    title: "Office Manager and Executive Assistant",
    headshot: "https://www.406ventures.com/wp-content/uploads/2025/03/Crop-Shopper-Kelci_Horan_495.jpg",
    linkedin: null, twitter: null,
    email: "khoran@406ventures.com", sector_focus: [],
    bio: "Kelci Horan is the Office Manager and Executive Assistant at .406 Ventures, supporting the team with day-to-day operations and executive coordination.",
    portfolio: [], is_investor: false, slug: "kelci-horan",
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 0. Connectivity check
  console.log("🌐  Testing connectivity…");
  try {
    const ping = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/`, { headers: HEADERS }, 8000);
    console.log(`✅  Supabase REST reachable (HTTP ${ping.status})`);
    if (!ping.ok) {
      const body = await ping.text();
      console.error("❌  Unexpected response:", body);
      process.exit(1);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = msg.includes("abort") || msg.includes("AbortError");
    console.error(`\n❌  Cannot reach Supabase REST API${isAbort ? " (timed out)" : ""}: ${msg}`);
    console.error("\n   Possible causes:");
    console.error("   1. VPN or firewall blocking Node.js outbound HTTPS on your Mac");
    console.error("   2. The Supabase project is in a degraded state");
    console.error(`\n   Test manually: curl -m 8 "${SUPABASE_URL}/rest/v1/" -H "apikey: ${SERVICE_KEY.slice(0,20)}..."`);
    process.exit(1);
  }

  // 1. Find or create the firm
  console.log("🔍  Looking up .406 Ventures…");
  const existing = await sbGet<{ id: string; firm_name: string }>(
    "firm_records",
    "select=id,firm_name&firm_name=ilike.*406*&deleted_at=is.null&limit=5"
  );

  let firmId: string;
  if (existing.length > 0) {
    firmId = existing[0].id;
    console.log(`✅  Found: ${existing[0].firm_name} (${firmId})`);

    // Patch firm with website/logo in case it's missing
    await sbPatch("firm_records", firmId, {
      website_url: "https://www.406ventures.com",
      hq_city: "Boston",
      hq_state: "MA",
      hq_country: "USA",
      logo_url: "https://www.406ventures.com/wp-content/themes/ics-theme/assets/images/406-Ventures_logo.svg",
      updated_at: new Date().toISOString(),
    }).catch(() => {}); // non-fatal
  } else {
    console.log("➕  Not found — creating firm record…");
    firmId = await sbInsert("firm_records", {
      id: randomUUID(),
      firm_name: ".406 Ventures",
      website_url: "https://www.406ventures.com",
      hq_city: "Boston",
      hq_state: "MA",
      hq_country: "USA",
      thesis_verticals: ["Healthcare", "Enterprise Software", "Cybersecurity"],
      logo_url: "https://www.406ventures.com/wp-content/themes/ics-theme/assets/images/406-Ventures_logo.svg",
      is_actively_deploying: true,
      status: "active",
      aliases: [".406", "406 Ventures", "dot406"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log(`✅  Created firm (${firmId})`);
  }

  // 2. Fetch existing investors for this firm (to diff)
  const currentInvestors = await sbGet<{ id: string; full_name: string }>(
    "firm_investors",
    `select=id,full_name&firm_id=eq.${firmId}&deleted_at=is.null`
  );
  const existingByName = new Map(currentInvestors.map(p => [p.full_name.toLowerCase(), p.id]));

  // 3. Upsert each team member
  console.log(`\n📤  Upserting ${TEAM.length} team members into firm ${firmId}…\n`);
  let ok = 0, fail = 0;

  for (const person of TEAM) {
    const row: Record<string, unknown> = {
      firm_id: firmId,
      full_name: person.name,
      first_name: person.first_name,
      last_name: person.last_name,
      title: person.title,
      avatar_url: person.headshot,
      linkedin_url: person.linkedin,
      x_url: person.twitter,
      email: person.email,
      sector_focus: person.sector_focus.length > 0 ? person.sector_focus : null,
      bio: person.bio,
      website_url: `https://www.406ventures.com/team-member/${person.slug}/`,
      is_active: true,
      is_actively_investing: person.is_investor,
      cold_outreach_ok: false,
      warm_intro_preferred: true,
      updated_at: new Date().toISOString(),
    };

    try {
      const existingId = existingByName.get(person.name.toLowerCase());
      if (existingId) {
        await sbPatch("firm_investors", existingId, row);
        console.log(`  ✅  updated  ${person.name}`);
      } else {
        row.id = randomUUID();
        row.created_at = new Date().toISOString();
        await sbInsert("firm_investors", row);
        console.log(`  ✅  inserted ${person.name}`);
      }
      ok++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // If ready_for_live column exists, add it and retry
      if (msg.includes("ready_for_live") || msg.includes("column")) {
        console.warn(`  ⚠️   ${person.name}: column issue — ${msg}`);
      } else {
        console.error(`  ❌  ${person.name}: ${msg}`);
      }
      fail++;
    }
  }

  console.log(`\n🎉  Done — ${ok} succeeded, ${fail} failed`);
  console.log(`\n   Firm ID: ${firmId}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

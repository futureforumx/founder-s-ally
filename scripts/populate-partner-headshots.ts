/**
 * populate-partner-headshots.ts
 *
 * 1. Creates firm_investors rows from mock data + lead_partner names on firms
 * 2. Resolves headshots via Unavatar (aggregates Gravatar, LinkedIn, X, etc.)
 * 3. Updates avatar_url on each partner record
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/populate-partner-headshots.ts
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ──
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ── Partner seed data ──
// Comprehensive partner list with known social handles for avatar resolution
interface PartnerSeed {
  full_name: string;
  first_name: string;
  last_name: string;
  title: string;
  firm_name: string; // used to match to firm_records
  linkedin_url?: string;
  x_url?: string;
  email?: string;
  bio?: string;
  sector_focus?: string[];
}

const PARTNER_SEEDS: PartnerSeed[] = [
  // Andreessen Horowitz
  { full_name: "Marc Andreessen", first_name: "Marc", last_name: "Andreessen", title: "Co-Founder & General Partner", firm_name: "Andreessen Horowitz", linkedin_url: "https://linkedin.com/in/pmarca", x_url: "https://x.com/pmarca", sector_focus: ["Software", "Crypto", "AI"], bio: "Software is eating the world. Backs bold founders building transformative technology platforms." },
  { full_name: "Martin Casado", first_name: "Martin", last_name: "Casado", title: "General Partner", firm_name: "Andreessen Horowitz", linkedin_url: "https://linkedin.com/in/martincasado", x_url: "https://x.com/martin_casado", sector_focus: ["Enterprise", "Cloud Infrastructure"], bio: "Co-founder of Nicira (acq. by VMware). Focuses on enterprise infrastructure and cloud." },
  { full_name: "Vijay Pande", first_name: "Vijay", last_name: "Pande", title: "General Partner", firm_name: "Andreessen Horowitz", linkedin_url: "https://linkedin.com/in/vijaypande", sector_focus: ["Bio", "Health"], bio: "Stanford professor turned investor. Deep conviction in computational biology and AI-driven drug discovery." },
  { full_name: "Sonali De Rycker", first_name: "Sonali", last_name: "De Rycker", title: "General Partner", firm_name: "Accel", linkedin_url: "https://linkedin.com/in/sonalide", sector_focus: ["European Tech", "SaaS"], bio: "Leading Accel's European investments in breakout SaaS and marketplace companies." },

  // Sequoia Capital
  { full_name: "Alfred Lin", first_name: "Alfred", last_name: "Lin", title: "Partner", firm_name: "Sequoia Capital", linkedin_url: "https://linkedin.com/in/alfredlin", x_url: "https://x.com/Alfred_Lin", sector_focus: ["B2B SaaS", "Enterprise"], bio: "Former COO of Zappos. Backs founders who obsess over unit economics and long-term defensibility." },
  { full_name: "Jess Lee", first_name: "Jess", last_name: "Lee", title: "Partner", firm_name: "Sequoia Capital", linkedin_url: "https://linkedin.com/in/jessicaclee", x_url: "https://x.com/jesskah", sector_focus: ["Consumer", "Marketplace"], bio: "Focused on consumer experiences that create new behaviors. Former CEO of Polyvore." },
  { full_name: "Pat Grady", first_name: "Pat", last_name: "Grady", title: "Partner", firm_name: "Sequoia Capital", linkedin_url: "https://linkedin.com/in/patgrady", sector_focus: ["Cloud Infrastructure", "DevTools"], bio: "Invests at the intersection of developer experience and infrastructure." },

  // Y Combinator
  { full_name: "Garry Tan", first_name: "Garry", last_name: "Tan", title: "President & CEO", firm_name: "Y Combinator", linkedin_url: "https://linkedin.com/in/garrytan", x_url: "https://x.com/garrytan", sector_focus: ["Early Stage", "Deep Tech"], bio: "President and CEO of Y Combinator. Co-founded Initialized Capital and Posterous." },
  { full_name: "Michael Seibel", first_name: "Michael", last_name: "Seibel", title: "Managing Director", firm_name: "Y Combinator", linkedin_url: "https://linkedin.com/in/mwseibel", x_url: "https://x.com/maboroshi", sector_focus: ["Consumer", "SaaS"], bio: "Co-founder of Twitch and Socialcam. Managing Director at Y Combinator." },

  // First Round Capital
  { full_name: "Bill Trenchard", first_name: "Bill", last_name: "Trenchard", title: "Partner", firm_name: "First Round Capital", linkedin_url: "https://linkedin.com/in/billtrenchard", sector_focus: ["SaaS", "Marketplace"], bio: "Operator-investor focused on go-to-market strategies for early-stage startups." },
  { full_name: "Todd Jackson", first_name: "Todd", last_name: "Jackson", title: "Partner", firm_name: "First Round Capital", linkedin_url: "https://linkedin.com/in/tjackson", x_url: "https://x.com/tjackson", sector_focus: ["Consumer", "SaaS"], bio: "Former VP Product at Dropbox and Twitter. Looks for elegant products that solve real pain points." },

  // General Catalyst
  { full_name: "Hemant Taneja", first_name: "Hemant", last_name: "Taneja", title: "Managing Director", firm_name: "General Catalyst", linkedin_url: "https://linkedin.com/in/hemanttaneja", x_url: "https://x.com/heaborns", sector_focus: ["Health", "AI", "Climate"], bio: "CEO of General Catalyst. Backs 'responsible innovation' across healthcare, education, and climate." },
  { full_name: "Deep Nishar", first_name: "Deep", last_name: "Nishar", title: "Managing Director", firm_name: "General Catalyst", linkedin_url: "https://linkedin.com/in/deepnishar", sector_focus: ["Enterprise", "AI"], bio: "Former SVP of Products at LinkedIn. Focuses on AI-first enterprise applications." },

  // Lightspeed Venture Partners
  { full_name: "Mercedes Bent", first_name: "Mercedes", last_name: "Bent", title: "Partner", firm_name: "Lightspeed Venture Partners", linkedin_url: "https://linkedin.com/in/mercedesbent", x_url: "https://x.com/mercedesbent", sector_focus: ["Consumer", "Fintech"], bio: "Invests in consumer internet and fintech companies at the earliest stages." },
  { full_name: "Gaurav Gupta", first_name: "Gaurav", last_name: "Gupta", title: "Partner", firm_name: "Lightspeed Venture Partners", linkedin_url: "https://linkedin.com/in/gauravgupta1", sector_focus: ["Enterprise", "SaaS"], bio: "Focuses on enterprise software and infrastructure companies." },

  // Founders Fund
  { full_name: "Keith Rabois", first_name: "Keith", last_name: "Rabois", title: "Managing Director", firm_name: "Founders Fund", linkedin_url: "https://linkedin.com/in/keithrabois", x_url: "https://x.com/rabois", sector_focus: ["Fintech", "Real Estate"], bio: "Operator-investor who built PayPal, LinkedIn, Square. Backs contrarian founders in regulated industries." },
  { full_name: "Lauren Gross", first_name: "Lauren", last_name: "Gross", title: "Partner", firm_name: "Founders Fund", linkedin_url: "https://linkedin.com/in/laurengross", sector_focus: ["Consumer", "Gaming"], bio: "Invests at the intersection of consumer, gaming, and frontier technology." },

  // Accel
  { full_name: "Arun Mathew", first_name: "Arun", last_name: "Mathew", title: "Partner", firm_name: "Accel", linkedin_url: "https://linkedin.com/in/arunmathew", sector_focus: ["SaaS", "Infrastructure"], bio: "Backs breakthrough B2B companies at the seed and Series A stage." },

  // Bessemer Venture Partners
  { full_name: "Mary D'Arcy", first_name: "Mary", last_name: "D'Arcy", title: "Partner", firm_name: "Bessemer Venture Partners", linkedin_url: "https://linkedin.com/in/marydarcy", sector_focus: ["Cloud", "SaaS"], bio: "Focuses on cloud infrastructure and enterprise SaaS at scale." },
  { full_name: "Byron Deeter", first_name: "Byron", last_name: "Deeter", title: "Partner", firm_name: "Bessemer Venture Partners", linkedin_url: "https://linkedin.com/in/byrondeeter", x_url: "https://x.com/bdeeter", sector_focus: ["Cloud", "Security"], bio: "Creator of the Bessemer Cloud Index. Leads cloud and cybersecurity investments." },

  // NEA
  { full_name: "Scott Sandell", first_name: "Scott", last_name: "Sandell", title: "Chairman", firm_name: "NEA", linkedin_url: "https://linkedin.com/in/scottsandell", sector_focus: ["Technology", "Healthcare"], bio: "Chairman of NEA. Decades of experience investing across technology and healthcare." },

  // Initialized Capital
  { full_name: "Alexis Ohanian", first_name: "Alexis", last_name: "Ohanian", title: "General Partner", firm_name: "Initialized Capital", linkedin_url: "https://linkedin.com/in/alexisohanian", x_url: "https://x.com/alexisohanian", sector_focus: ["Consumer", "Community"], bio: "Co-founder of Reddit. Backs mission-driven founders building for the next generation of the internet." },

  // Kleiner Perkins
  { full_name: "Mamoon Hamid", first_name: "Mamoon", last_name: "Hamid", title: "Partner", firm_name: "Kleiner Perkins", linkedin_url: "https://linkedin.com/in/mamoonha", x_url: "https://x.com/mamaborons", sector_focus: ["Enterprise", "SaaS"], bio: "Early investor in Slack and other enterprise platforms. Focuses on category-defining enterprise companies." },
  { full_name: "Ilya Fushman", first_name: "Ilya", last_name: "Fushman", title: "Partner", firm_name: "Kleiner Perkins", linkedin_url: "https://linkedin.com/in/ilyafushman", sector_focus: ["Enterprise", "Cloud"], bio: "Former VP Product at Dropbox. Invests in enterprise and developer-first companies." },
];

// ── Headshot resolution ──

async function resolveHeadshot(partner: PartnerSeed): Promise<string | null> {
  // Try multiple Unavatar sources in order
  const candidates: string[] = [];

  // X/Twitter handle → best quality photos
  if (partner.x_url) {
    const handle = partner.x_url.split("/").filter(Boolean).pop()?.replace("@", "");
    if (handle) candidates.push(`https://unavatar.io/x/${encodeURIComponent(handle)}`);
  }

  // LinkedIn
  if (partner.linkedin_url) {
    candidates.push(`https://unavatar.io/${encodeURIComponent(partner.linkedin_url)}`);
  }

  // Name-based (Unavatar tries multiple sources)
  candidates.push(`https://unavatar.io/${encodeURIComponent(partner.full_name)}`);

  // Email-based
  if (partner.email) {
    candidates.push(`https://unavatar.io/${encodeURIComponent(partner.email)}`);
  }

  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (resp.ok) {
        const contentType = resp.headers.get("content-type") || "";
        // Make sure it's actually an image, not a fallback
        if (contentType.startsWith("image/")) {
          // Check it's not the default fallback (which is usually small)
          const contentLength = parseInt(resp.headers.get("content-length") || "0", 10);
          if (contentLength > 1000) {
            console.log(`  ✓ Found headshot via: ${url.substring(0, 60)}...`);
            return url;
          }
        }
      }
    } catch {
      // Skip failed attempts
    }
  }

  // Try GitHub as a last resort for well-known tech investors
  const githubHandle = partner.full_name.toLowerCase().replace(/[^a-z]/g, "");
  try {
    const ghUrl = `https://github.com/${githubHandle}.png`;
    const resp = await fetch(ghUrl, { method: "HEAD", redirect: "follow" });
    if (resp.ok) {
      const cl = parseInt(resp.headers.get("content-length") || "0", 10);
      if (cl > 1000) {
        console.log(`  ✓ Found headshot via GitHub: ${githubHandle}`);
        return ghUrl;
      }
    }
  } catch {}

  console.log(`  ✗ No headshot found for ${partner.full_name}`);
  return null;
}

// ── Main ──

async function main() {
  console.log("=== Populate Partner Headshots ===\n");

  // 1. Get all firms from firm_records
  const { data: firms, error: firmsErr } = await supabase
    .from("firm_records")
    .select("id, firm_name, lead_partner");

  if (firmsErr) {
    console.error("Failed to fetch firms:", firmsErr);
    process.exit(1);
  }

  console.log(`Found ${firms!.length} firms in firm_records\n`);

  // Build firm name → id lookup (case-insensitive)
  const firmLookup = new Map<string, string>();
  for (const f of firms!) {
    firmLookup.set(f.firm_name.toLowerCase().trim(), f.id);
  }

  // 2. Check existing partners
  const { data: existing } = await supabase
    .from("firm_investors")
    .select("id, full_name, firm_id, avatar_url");

  const existingNames = new Set(
    (existing ?? []).map((p) => `${p.full_name.toLowerCase()}|${p.firm_id}`)
  );

  console.log(`Existing partners in DB: ${existing?.length ?? 0}\n`);

  // 3. Insert partners + resolve headshots
  let created = 0;
  let avatarsSet = 0;

  for (const seed of PARTNER_SEEDS) {
    const firmId = firmLookup.get(seed.firm_name.toLowerCase().trim());
    if (!firmId) {
      console.log(`⚠ Skipping ${seed.full_name} — firm "${seed.firm_name}" not in DB`);
      continue;
    }

    const key = `${seed.full_name.toLowerCase()}|${firmId}`;
    const existingPartner = (existing ?? []).find(
      (p) => p.full_name.toLowerCase() === seed.full_name.toLowerCase() && p.firm_id === firmId
    );

    console.log(`\n→ ${seed.full_name} @ ${seed.firm_name}`);

    // Resolve headshot
    const avatarUrl = await resolveHeadshot(seed);

    if (existingPartner) {
      // Update existing partner
      if (avatarUrl && !existingPartner.avatar_url) {
        const { error: upErr } = await supabase
          .from("firm_investors")
          .update({
            avatar_url: avatarUrl,
            first_name: seed.first_name,
            last_name: seed.last_name,
            linkedin_url: seed.linkedin_url || null,
            x_url: seed.x_url || null,
            bio: seed.bio || null,
            sector_focus: seed.sector_focus || [],
          })
          .eq("id", existingPartner.id);

        if (upErr) console.error(`  ✗ Update failed:`, upErr.message);
        else { avatarsSet++; console.log(`  ✓ Updated avatar`); }
      } else {
        console.log(`  — Already exists${existingPartner.avatar_url ? " (has avatar)" : ""}`);
      }
    } else {
      // Insert new partner
      const { error: insErr } = await supabase
        .from("firm_investors")
        .insert({
          firm_id: firmId,
          full_name: seed.full_name,
          first_name: seed.first_name,
          last_name: seed.last_name,
          title: seed.title,
          is_active: true,
          avatar_url: avatarUrl,
          linkedin_url: seed.linkedin_url || null,
          x_url: seed.x_url || null,
          email: seed.email || null,
          bio: seed.bio || null,
          sector_focus: seed.sector_focus || [],
        });

      if (insErr) {
        console.error(`  ✗ Insert failed:`, insErr.message);
      } else {
        created++;
        if (avatarUrl) avatarsSet++;
        console.log(`  ✓ Created${avatarUrl ? " (with avatar)" : ""}`);
      }
    }

    // Small delay to be nice to Unavatar
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n=== Done ===`);
  console.log(`Partners created: ${created}`);
  console.log(`Avatars resolved: ${avatarsSet}`);

  // Final count
  const { count } = await supabase
    .from("firm_investors")
    .select("id", { count: "exact", head: true });
  console.log(`Total partners in DB: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

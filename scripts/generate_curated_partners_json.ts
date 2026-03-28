/**
 * Build data/curated-investors/partners.json from public sources (Sequoia WP API + static Accel/BVP rosters).
 *
 *   npx tsx scripts/generate_curated_partners_json.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Row = {
  name: string;
  title?: string;
  email?: string;
  firm: { name: string; slug: string; url?: string };
  linkedin?: string;
  profile_url?: string;
  source?: string;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

const SEQUOIA_FIRM = {
  name: "Sequoia Capital",
  slug: "sequoia-capital",
  url: "https://sequoiacap.com",
} as const;

const ACCEL_FIRM = {
  name: "Accel",
  slug: "accel",
  url: "https://www.accel.com",
} as const;

const BVP_FIRM = {
  name: "Bessemer Venture Partners",
  slug: "bessemer",
  url: "https://www.bvp.com",
} as const;

const BENCHMARK_FIRM = {
  name: "Benchmark",
  slug: "benchmark",
  url: "https://www.benchmark.com",
} as const;

/** When Sequoia API obfuscates email (Early-XX@ / Growth-XX@), use known public handles. */
const SEQUOIA_EMAIL_BY_NAME: Record<string, string> = {
  "Alfred Lin": "alfred@sequoiacap.com",
  "Roelof Botha": "roelof@sequoiacap.com",
  "Bryan Schreier": "bryan@sequoiacap.com",
  "Bogomil Balkansky": "bogomil@sequoiacap.com",
};

async function fetchSequoiaRows(): Promise<Row[]> {
  const res = await fetch("https://sequoiacap.com/wp-json/wp/v2/team-member?per_page=100");
  if (!res.ok) throw new Error(`Sequoia API ${res.status}`);
  const j = (await res.json()) as Array<{
    title: { rendered: string };
    link: string;
    acf?: {
      title?: string;
      email_address?: string;
      roles?: number[];
    };
  }>;

  const rows: Row[] = [];
  for (const x of j) {
    const rawRoles = x.acf?.roles;
    const roles = Array.isArray(rawRoles) ? rawRoles : rawRoles != null ? [Number(rawRoles)] : [];
    if (!roles.includes(22) && !roles.includes(21)) continue;

    const name = x.title.rendered.trim();
    let email = (x.acf?.email_address ?? "").trim();
    if (/early-|growth-/i.test(email)) email = "";
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) email = "";
    if (SEQUOIA_EMAIL_BY_NAME[name]) email = SEQUOIA_EMAIL_BY_NAME[name];

    const job = (x.acf?.title ?? "").trim();
    rows.push({
      name,
      ...(job ? { title: job } : { title: "Partner" }),
      ...(email ? { email } : {}),
      firm: { ...SEQUOIA_FIRM },
      profile_url: x.link,
      source: "https://sequoiacap.com/our-team/",
    });
  }
  return rows;
}

/** Accel global investing team (names from public /people listing; profile slugs match /team/{slug}). */
const ACCEL_INVESTOR_NAMES = [
  "Casey Aylward",
  "Mahendran Balachandran",
  "Luca Bocchio",
  "Philippe Botteri",
  "Andrew Braccia",
  "Andrei Brasoveanu",
  "Abhinav Chaturvedi",
  "Miles Clements",
  "Kevin Comolli",
  "Anand Daniel",
  "Sonali De Rycker",
  "Christine Esserman",
  "Ben Fletcher",
  "Sameer Gandhi",
  "Sara Ittelson",
  "Dinesh Katiyar",
  "Shekhar Kirani",
  "Amit Kumar",
  "Daniel Levine",
  "Ping Li",
  "John Locke",
  "Zhenya Loginov",
  "Steve Loughlin",
  "Arun Mathew",
  "Subrata Mitra",
  "Vas Natarajan",
  "Harry Nelis",
  "Nate Niparko",
  "Prashanth Prakash",
  "Matt Robinson",
  "Barath Shankar Subramanian",
  "Prayank Swaroop",
  "Ryan Sweeney",
  "Jonathan Turner",
  "Matt Weigand",
  "Rich Wong",
  "Myrel Iturrey",
  "Nafis Jamal",
  "Gonzalo Mocorrea",
  "Ben Quazzo",
  "Kerry Wang",
  "Eric Wolford",
  "Ivan Zhou",
  "Jakob Buchmayer",
  "Dana Eliaz",
  "Kelly Kung",
  "Bilal Mobarik",
  "Tim Rawlinson",
  "Alex Reinert",
  "AJ Tennant",
  "Cecilia Wang",
  "Carlo Biggio",
  "Rishika Garg",
  "Rachit Parekh",
  "Anagh Prasad",
  "Manasi Shah",
  "Sarthak Singh",
  "Ayushi Gupta",
  "Shashank Gupta",
  "Astha Jakher",
  "Eknoor Malhotra",
  "Nayan Nandan",
  "Shourya Shrivastava",
  "Pratik Agarwal",
  "Kevin Efrusy",
  "Bruce Golden",
  "Arthur Patterson",
  "Jim Swartz",
] as const;

const ACCEL_EMAIL_BY_NAME: Record<string, string> = {
  "Andrew Braccia": "abraccia@accel.com",
  "Luca Bocchio": "luca@accel.com",
};

function accelRows(): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const name of ACCEL_INVESTOR_NAMES) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const slug = slugify(name);
    const email = ACCEL_EMAIL_BY_NAME[name];
    out.push({
      name,
      title: "Partner",
      ...(email ? { email } : {}),
      firm: { ...ACCEL_FIRM },
      profile_url: `https://www.accel.com/team/${slug}`,
      source: "https://www.accel.com/people",
    });
  }
  return out;
}

/** BVP investing partners (profile slugs from bvp.com/team). */
const BVP_INVESTOR_SLUGS: Array<{ slug: string; name: string; email?: string }> = [
  { slug: "kent-bennett", name: "Kent Bennett" },
  { slug: "charles-birnbaum", name: "Charles Birnbaum" },
  { slug: "david-cowan", name: "David Cowan" },
  { slug: "byron-deeter", name: "Byron Deeter" },
  { slug: "sameer-dholakia", name: "Sameer Dholakia" },
  { slug: "mike-droesch", name: "Mike Droesch" },
  { slug: "brian-feinstein", name: "Brian Feinstein" },
  { slug: "alex-ferrara", name: "Alex Ferrara" },
  { slug: "adam-fisher", name: "Adam Fisher" },
  { slug: "talia-goldberg", name: "Talia Goldberg" },
  { slug: "bob-goodman", name: "Bob Goodman" },
  { slug: "sofia-guerra", name: "Sofia Guerra" },
  { slug: "vishal-gupta", name: "Vishal Gupta" },
  { slug: "felda-hardymon", name: "Felda Hardymon" },
  { slug: "andrew-hedin", name: "Andrew Hedin" },
  { slug: "nithin-kaimal", name: "Nithin Kaimal" },
  { slug: "amit-karp", name: "Amit Karp" },
  { slug: "steve-kraus", name: "Steve Kraus" },
  { slug: "jeremy-levine", name: "Jeremy Levine" },
  { slug: "pankaj-mitra", name: "Pankaj Mitra" },
  { slug: "lauri-moore", name: "Lauri Moore" },
  { slug: "elliott-robinson", name: "Elliott Robinson" },
  { slug: "rob-stavis", name: "Rob Stavis" },
  { slug: "ariel-sterman", name: "Ariel Sterman" },
  { slug: "janelle-teng-wade", name: "Janelle Teng Wade" },
  { slug: "anant-vidur-puri", name: "Anant Vidur Puri" },
  { slug: "lance-co-ting-keh", name: "Lance Co Ting Keh" },
  { slug: "bryan-wu", name: "Bryan Wu" },
  { slug: "shrey-agarwal", name: "Shrey Agarwal" },
  { slug: "tess-hatch", name: "Tess Hatch", email: "tess@bvp.com" },
  { slug: "", name: "Ethan Kurzweil", email: "ethan@bvp.com" },
];

function bvpRows(): Row[] {
  return BVP_INVESTOR_SLUGS.map(({ slug, name, email }) => ({
    name,
    title: "Partner",
    ...(email ? { email } : {}),
    firm: { ...BVP_FIRM },
    ...(slug ? { profile_url: `https://www.bvp.com/team/${slug}` } : {}),
    source: "https://www.bvp.com/team",
  }));
}

/** General partners (public roster; no per-person URLs on benchmark.com). */
const BENCHMARK_PARTNERS = [
  "Bill Gurley",
  "Matt Cohler",
  "Peter Fenton",
  "Miles Grimshaw",
  "Eric Vishria",
  "Chetan Puttagunta",
  "Sarah Tavel",
] as const;

function benchmarkRows(): Row[] {
  return BENCHMARK_PARTNERS.map((name) => ({
    name,
    title: "General Partner",
    firm: { ...BENCHMARK_FIRM },
    source: "https://www.benchmark.com",
  }));
}

async function main() {
  const [sequoia, accel, bvp, benchmark] = await Promise.all([
    fetchSequoiaRows(),
    Promise.resolve(accelRows()),
    Promise.resolve(bvpRows()),
    Promise.resolve(benchmarkRows()),
  ]);

  const merged = [...sequoia, ...accel, ...bvp, ...benchmark];
  const outDir = join(process.cwd(), "data", "curated-investors");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "partners.json");
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(
    `Wrote ${merged.length} rows (${sequoia.length} Sequoia, ${accel.length} Accel, ${bvp.length} BVP, ${benchmark.length} Benchmark) → ${outPath}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

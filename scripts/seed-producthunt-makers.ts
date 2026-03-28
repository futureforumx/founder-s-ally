/**
 * Product Hunt makers from the public GraphQL API (free developer token).
 *
 * https://api.producthunt.com/v2/docs
 * Env: PRODUCTHUNT_ACCESS_TOKEN (or PRODUCTHUNT_TOKEN)
 *
 * Aggregates one row per maker username with phLaunchCount = posts they appeared on (this run).
 * Optional: PH_MAX_PAGES (default 15), PH_POSTS_PER_PAGE (max 20).
 */

import { PrismaClient } from "@prisma/client";
import { loadDatabaseUrl } from "./lib/loadDatabaseUrl";
import { splitFullName, toCreateInput, toUpdateInput, type ProfessionalSeedRow } from "./lib/startupProfessionalUpsert";

const UA =
  process.env.STARTUP_PROFESSIONALS_UA ??
  "VektaStartupProfessionals/1.0 (Product Hunt seed; public GraphQL)";

loadDatabaseUrl();
const prisma = new PrismaClient();

const ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

type PhResponse = {
  data?: {
    posts: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{
        node: {
          name: string;
          makers: Array<{ id: string; name: string; username: string }>;
        };
      }>;
    };
  };
  errors?: { message: string }[];
};

async function phQuery(token: string, cursor: string | null, first: number): Promise<PhResponse> {
  const query = `
    query Posts($cursor: String, $first: Int!) {
      posts(after: $cursor, first: $first, order: TRENDING) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            name
            makers { id name username }
          }
        }
      }
    }
  `;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": UA,
    },
    body: JSON.stringify({ query, variables: { cursor, first } }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Product Hunt ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as PhResponse;
}

async function main() {
  const token = (process.env.PRODUCTHUNT_ACCESS_TOKEN ?? process.env.PRODUCTHUNT_TOKEN ?? "").trim();
  if (!token) {
    console.log("Skip: set PRODUCTHUNT_ACCESS_TOKEN (free developer token from Product Hunt API).");
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const maxPages = Math.max(1, Number(process.env.PH_MAX_PAGES ?? "15") || 15);
  const first = Math.min(20, Math.max(1, Number(process.env.PH_POSTS_PER_PAGE ?? "20") || 20));

  const counts = new Map<string, { name: string; posts: Set<string> }>();

  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const json = await phQuery(token, cursor, first);
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    const posts = json.data?.posts;
    if (!posts) throw new Error("Product Hunt: empty data.posts");

    for (const e of posts.edges) {
      const postName = e.node.name;
      for (const m of e.node.makers ?? []) {
        const key = m.username || m.id;
        if (!key) continue;
        let rec = counts.get(key);
        if (!rec) {
          rec = { name: m.name || m.username, posts: new Set() };
          counts.set(key, rec);
        }
        rec.posts.add(postName);
      }
    }

    if (!posts.pageInfo.hasNextPage || !posts.pageInfo.endCursor) break;
    cursor = posts.pageInfo.endCursor;
  }

  let ok = 0;
  let err = 0;
  for (const [username, { name, posts }] of counts) {
    const base = (name || username).replace(/\s+/g, " ").trim();
    const fullName = `${base} (@${username})`;
    const { first: fn, last: ln } = splitFullName(base);
    const row: ProfessionalSeedRow = {
      firstName: fn,
      lastName: ln || "",
      fullName,
      title: `Maker on Product Hunt (${posts.size} posts in sample)`,
      currentRole: "Maker",
      currentStartup: "Product Hunt",
      phMaker: true,
      phLaunchCount: posts.size,
      source: "ph",
      githubHandle: null,
    };
    try {
      await prisma.startupProfessional.upsert({
        where: {
          fullName_currentStartup: { fullName: row.fullName, currentStartup: row.currentStartup },
        },
        create: toCreateInput(row),
        update: toUpdateInput(row),
      });
      ok++;
    } catch {
      err++;
    }
  }
  console.log(`Product Hunt: upserted ${ok} makers, errors ${err} (from ${counts.size} unique usernames)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

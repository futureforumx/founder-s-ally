/**
 * GitHub “operators” via Search API (users), optional repo-star proxy.
 *
 * Public data; higher rate limits with GITHUB_TOKEN (classic PAT, no scopes needed for public).
 *
 * Env:
 *   GITHUB_USER_SEARCH_QUERY — query string WITHOUT "q=" prefix (default: type:user followers:>3000)
 *   GITHUB_SEARCH_MAX_PAGES — default 10 (100 users/page, API hard cap 1000 results)
 *   GITHUB_TOP_REPO_STARS — if "1" (default), set githubStars to max stargazers among first page of public repos
 */

import { PrismaClient } from "@prisma/client";
import { loadDatabaseUrl } from "./lib/loadDatabaseUrl";
import {
  mergeStartupProfessional,
  splitFullName,
  SOURCE_PRIORITY,
  looksLikeVcInvestor,
  type ProfessionalIngestPayload,
} from "./lib/startupProfessionalMerge";
import { enqueueDeadLetter, toErrorMessage, toJsonPayload } from "./lib/deadLetterQueue";

const UA = process.env.STARTUP_PROFESSIONALS_UA ?? "VektaStartupProfessionals/1.0 (GitHub public API)";

loadDatabaseUrl();
const prisma = new PrismaClient();

function authHeaders(): Record<string, string> {
  const tok = process.env.GITHUB_TOKEN?.trim();
  if (tok) return { Authorization: `Bearer ${tok}`, "User-Agent": UA };
  return { "User-Agent": UA };
}

async function ghGet(path: string): Promise<unknown> {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as unknown;
}

type GhUser = {
  login: string;
  name: string | null;
  bio: string | null;
  followers: number;
  location: string | null;
  html_url: string;
};

async function maxStarsFromRepos(login: string): Promise<number> {
  if (process.env.GITHUB_TOP_REPO_STARS === "0") return 0;
  const data = (await ghGet(
    `/users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated`,
  )) as { stargazers_count?: number }[];
  if (!Array.isArray(data)) return 0;
  return data.reduce((m, r) => Math.max(m, r.stargazers_count ?? 0), 0);
}

function roleFromBio(bio: string | null): string {
  if (!bio) return "Developer";
  const b = bio.slice(0, 120);
  if (/founder/i.test(b)) return "Founder";
  if (/cto/i.test(b)) return "CTO";
  if (/engineer/i.test(b)) return "Engineer";
  return "Operator";
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const q = (process.env.GITHUB_USER_SEARCH_QUERY ?? "type:user followers:>3000").trim();
  const maxPages = Math.min(10, Math.max(1, Number(process.env.GITHUB_SEARCH_MAX_PAGES ?? "10") || 10));

  const seen = new Set<string>();
  const logins: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const sp = new URLSearchParams({ q, per_page: "100", page: String(page) });
    const data = (await ghGet(`/search/users?${sp}`)) as {
      items?: { login: string }[];
      incomplete_results?: boolean;
    };
    const items = data.items ?? [];
    if (items.length === 0) break;
    for (const it of items) {
      if (seen.has(it.login)) continue;
      seen.add(it.login);
      logins.push(it.login);
    }
    if (items.length < 100) break;
  }

  console.log(`GitHub user search: ${logins.length} logins (query: ${q})`);

  let ok = 0;
  let err = 0;
  for (let i = 0; i < logins.length; i++) {
    const login = logins[i];
    try {
      const u = (await ghGet(`/users/${encodeURIComponent(login)}`)) as GhUser;
      if (process.env.GITHUB_SKIP_INVESTOR_HEURISTIC !== "0" && looksLikeVcInvestor(u.bio)) {
        continue;
      }
      const stars = await maxStarsFromRepos(login);
      const display = (u.name || u.login).trim();
      const { first, last } = splitFullName(display);
      const role = roleFromBio(u.bio);
      const row: ProfessionalIngestPayload = {
        firstName: first,
        lastName: last || "",
        fullName: display,
        title: `${role} @ ${u.login}`,
        currentRole: role,
        currentStartup: u.login.toLowerCase(),
        githubHandle: u.login,
        githubStars: stars,
        followers: u.followers,
        location: u.location,
        source: "github",
        sourcePriority: SOURCE_PRIORITY.github,
      };
      await mergeStartupProfessional(prisma, row);
      ok++;
    } catch (e) {
      console.warn(`[${login}] ${e instanceof Error ? e.message : e}`);
      await enqueueDeadLetter(prisma, {
        targetTable: "startup_professionals",
        failedOperation: "GitHub_Seed",
        errorMessage: toErrorMessage(e),
        rawPayload: toJsonPayload({ login }),
      });
      err++;
    }
    if ((i + 1) % 50 === 0) console.log(`… ${i + 1}/${logins.length} profiles`);
  }

  console.log(`GitHub: upserted ${ok}, errors ${err}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

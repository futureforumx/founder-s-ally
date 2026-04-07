/**
 * Import from NFX Signal’s public /investors HTML.
 *
 * The page embeds Apollo cache in `window.__APOLLO_STATE__`:
 *   • ~30 featured InvestorProfile rows → VCFirm + VCPerson (names, slugs, avatars).
 *   • 349 InvestorList rows (vertical + stage + investor_count) → JSON sidecar only (no public
 *     stable URL matches the internal `slug`; use for reference / filters).
 *
 * The GraphQL API (https://signal-api.nfx.com/graphql) returns 401 when unsigned in, so this
 * script does not scrape the full investor directory—only SSR data. Respect Signal’s terms.
 *
 *   SIGNAL_NFX_FETCH_ONLY=1 npm run db:seed:signal-nfx   → JSON only
 *   SIGNAL_NFX_HTML_PATH=./page.html npm run db:seed:signal-nfx  → parse saved HTML
 *
 * @see https://signal.nfx.com/investors
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type FirmType, type SourceType } from "@prisma/client";
import {
  fetchAndUploadHeadshot,
  isThirdPartyAvatarUrl,
  validateCanonicalAvatarUrl,
} from "./lib/r2-headshots";

const INVESTORS_URL = "https://signal.nfx.com/investors";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SIGNAL_NFX: SourceType = "SIGNAL_NFX";

type ApolloObj = Record<string, unknown> & { __typename?: string; __ref?: string };

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

/** Extract `window.__APOLLO_STATE__ = {...}` assignment (brace-balanced). */
export function extractApolloStateJson(html: string): string | null {
  const needle = "window.__APOLLO_STATE__";
  const i = html.indexOf(needle);
  if (i === -1) return null;
  const eq = html.indexOf("=", i);
  const start = html.indexOf("{", eq);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let p = start; p < html.length; p++) {
    const c = html[p];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, p + 1);
    }
  }
  return null;
}

export function parseApolloState(html: string): Record<string, ApolloObj> {
  const raw = extractApolloStateJson(html);
  if (!raw) throw new Error("Could not find window.__APOLLO_STATE__ in HTML");
  return JSON.parse(raw) as Record<string, ApolloObj>;
}

/** Apollo cache pointers use either `{ __ref }` or `{ type: "id", id: "Typename:pk" }`. */
function refKey(ref: unknown): string | null {
  if (!ref || typeof ref !== "object") return null;
  const o = ref as Record<string, unknown>;
  if (typeof o.__ref === "string") return o.__ref;
  if (o.type === "id" && typeof o.id === "string") return o.id;
  return null;
}

function deref<T extends ApolloObj>(cache: Record<string, ApolloObj>, ref: unknown): T | null {
  const k = refKey(ref);
  if (!k) return null;
  return (cache[k] as T) ?? null;
}

function jsonArray(val: unknown): string[] {
  if (!val || typeof val !== "object") return [];
  const o = val as { type?: string; json?: unknown };
  if (o.type === "json" && Array.isArray(o.json)) return o.json.filter((x): x is string => typeof x === "string");
  return [];
}

export type SignalNfxListRow = {
  nfx_investor_list_id: string;
  slug: string;
  stage: string | null;
  vertical_name: string | null;
  investor_count: number | null;
};

export type SignalNfxFeaturedRow = {
  nfx_investor_profile_id: string;
  person_slug: string;
  person_name: string;
  first_name: string;
  last_name: string;
  firm_name: string;
  firm_slug: string;
  investor_profile_url: string;
  firm_profile_url: string;
  avatar_url: string | null;
};

export function extractSignalNfxData(cache: Record<string, ApolloObj>): {
  lists: SignalNfxListRow[];
  featured: SignalNfxFeaturedRow[];
} {
  const lists: SignalNfxListRow[] = [];
  const featured: SignalNfxFeaturedRow[] = [];

  for (const key of Object.keys(cache)) {
    if (!key.startsWith("InvestorList:")) continue;
    const node = cache[key];
    if (node.__typename !== "InvestorList") continue;
    const tag = deref<ApolloObj & { display_name?: string }>(cache, node.vertical);
    lists.push({
      nfx_investor_list_id: String(node.id ?? ""),
      slug: String(node.slug ?? ""),
      stage: node.stage != null ? String(node.stage) : null,
      vertical_name: tag?.display_name ?? null,
      investor_count: typeof node.investor_count === "number" ? node.investor_count : null,
    });
  }

  for (const key of Object.keys(cache)) {
    if (!key.startsWith("InvestorProfile:")) continue;
    const prof = cache[key];
    if (prof.__typename !== "InvestorProfile") continue;
    const firm = deref<ApolloObj & { name?: string; slug?: string }>(cache, prof.firm);
    const person = deref<ApolloObj & { name?: string; slug?: string; first_name?: string; last_name?: string }>(
      cache,
      prof.person,
    );
    if (!firm?.name || !firm.slug || !person?.slug) continue;
    const imgs = jsonArray(prof.image_urls);
    const first = String(person.first_name ?? "").trim() || person.name?.split(/\s+/)[0] || "Unknown";
    const last =
      String(person.last_name ?? "").trim() ||
      (person.name?.split(/\s+/).slice(1).join(" ") ?? "-");

    featured.push({
      nfx_investor_profile_id: String(prof.id ?? ""),
      person_slug: person.slug,
      person_name: String(person.name ?? `${first} ${last}`).trim(),
      first_name: first,
      last_name: last || "-",
      firm_name: String(firm.name),
      firm_slug: String(firm.slug),
      investor_profile_url: `https://signal.nfx.com/investor/${person.slug}`,
      firm_profile_url: `https://signal.nfx.com/firm/${firm.slug}`,
      avatar_url: imgs[0] ?? null,
    });
  }

  return { lists, featured };
}

async function loadHtml(): Promise<string> {
  const p = process.env.SIGNAL_NFX_HTML_PATH?.trim();
  if (p) return readFileSync(p, "utf8");
  const res = await fetch(INVESTORS_URL, { headers: { "User-Agent": UA, Accept: "text/html" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Signal investors page ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function main() {
  const html = await loadHtml();
  const cache = parseApolloState(html);
  const { lists, featured } = extractSignalNfxData(cache);
  console.log(`Signal NFX: ${lists.length} investor lists (metadata), ${featured.length} featured profiles in HTML.`);

  const fetchOnly = process.env.SIGNAL_NFX_FETCH_ONLY === "1";
  const outDir = join(process.cwd(), "data", "imports");
  const listsPath = process.env.SIGNAL_NFX_LISTS_JSON?.trim() || join(outDir, "signal-nfx-lists.json");
  const featuredPath = process.env.SIGNAL_NFX_FEATURED_JSON?.trim() || join(outDir, "signal-nfx-featured.json");
  const meta = { source: INVESTORS_URL, fetched_at: new Date().toISOString() };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(listsPath, JSON.stringify({ ...meta, lists }, null, 2), "utf8");
  writeFileSync(featuredPath, JSON.stringify({ ...meta, featured }, null, 2), "utf8");
  console.log(`Wrote ${listsPath}`);
  console.log(`Wrote ${featuredPath}`);

  if (fetchOnly) return;

  loadDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set. Use SIGNAL_NFX_FETCH_ONLY=1 for JSON export only.");
  }

  const prisma = new PrismaClient();
  const defaultFirmType = (process.env.SIGNAL_NFX_FIRM_TYPE as FirmType) || "VC";

  for (const row of featured) {
    const firmSlug = row.firm_slug.slice(0, 80);
    const firm = await prisma.vCFirm.upsert({
      where: { slug: firmSlug },
      create: {
        firm_name: row.firm_name,
        slug: firmSlug,
        firm_type: defaultFirmType,
        signal_nfx_url: row.firm_profile_url,
        logo_url: null,
      },
      update: {
        firm_name: row.firm_name,
        signal_nfx_url: row.firm_profile_url,
      },
    });

    const firmLink = await prisma.vCSourceLink.findFirst({
      where: {
        firm_id: firm.id,
        source_type: SIGNAL_NFX,
        url: row.firm_profile_url,
        deleted_at: null,
      },
    });
    if (!firmLink) {
      await prisma.vCSourceLink.create({
        data: {
          firm_id: firm.id,
          source_type: SIGNAL_NFX,
          label: `Signal — ${row.firm_name}`,
          url: row.firm_profile_url,
          last_verified_at: new Date(),
        },
      });
    }

    const existing = await prisma.vCPerson.findFirst({
      where: {
        firm_id: firm.id,
        deleted_at: null,
        first_name: row.first_name,
        last_name: row.last_name,
      },
    });

    // Canonicalize avatar: upload third-party URL to R2
    let canonicalAvatarUrl: string | null = null;
    const sourceAvatarUrl = row.avatar_url;
    if (sourceAvatarUrl) {
      const personId = existing?.id ?? `${row.firm_slug}_${row.person_slug}`;
      try {
        const upload = await fetchAndUploadHeadshot(sourceAvatarUrl, personId, { skipIfExists: true });
        if (upload.success && upload.r2_url) {
          canonicalAvatarUrl = upload.r2_url;
        } else {
          console.warn(`  avatar upload failed for ${row.person_name}: ${upload.error}`);
        }
      } catch (e) {
        console.warn(`  avatar upload error for ${row.person_name}: ${e instanceof Error ? e.message : e}`);
      }
    }

    const pData = {
      title: null as string | null,
      avatar_url: canonicalAvatarUrl,
      avatar_source_url: sourceAvatarUrl,
      avatar_source_type: "signal_nfx" as string,
      avatar_last_verified_at: canonicalAvatarUrl ? new Date() : null,
      avatar_confidence: canonicalAvatarUrl ? 0.8 : null,
      website_url: row.investor_profile_url,
    };

    if (existing) {
      // Only overwrite avatar if we got a new R2 URL, or existing is third-party
      const updateData = { ...pData };
      if (!canonicalAvatarUrl && existing.avatar_url && !isThirdPartyAvatarUrl(existing.avatar_url)) {
        // Keep existing canonical avatar if new upload failed
        delete (updateData as Record<string, unknown>).avatar_url;
      }
      await prisma.vCPerson.update({ where: { id: existing.id }, data: updateData });
    } else {
      await prisma.vCPerson.create({
        data: {
          firm_id: firm.id,
          first_name: row.first_name,
          last_name: row.last_name,
          ...pData,
        },
      });
    }

    const personLink = await prisma.vCSourceLink.findFirst({
      where: {
        firm_id: firm.id,
        source_type: SIGNAL_NFX,
        url: row.investor_profile_url,
        deleted_at: null,
      },
    });
    if (!personLink) {
      await prisma.vCSourceLink.create({
        data: {
          firm_id: firm.id,
          source_type: SIGNAL_NFX,
          label: `Signal — ${row.person_name}`,
          url: row.investor_profile_url,
          last_verified_at: new Date(),
        },
      });
    }
  }

  console.log(`Signal NFX DB: upserted ${featured.length} featured profiles (firms + people + links).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

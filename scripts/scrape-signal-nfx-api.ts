/**
 * scrape-signal-nfx-api.ts
 *
 * Direct GraphQL API scraper for Signal NFX — no browser required.
 * 32,828+ investors fetched via authenticated cursor pagination.
 *
 * Usage:
 *   npx tsx scripts/scrape-signal-nfx-api.ts
 *   SIGNAL_DRY_RUN=1 npx tsx scripts/scrape-signal-nfx-api.ts
 *   SIGNAL_PAGE_SIZE=200 npx tsx scripts/scrape-signal-nfx-api.ts
 *   SIGNAL_CONCURRENCY=5 npx tsx scripts/scrape-signal-nfx-api.ts
 *   SIGNAL_PHASE=fetch         # only fetch + save JSON, no DB
 *   SIGNAL_PHASE=upsert        # only upsert saved JSON to DB
 *   SIGNAL_PHASE=both          # default: fetch + upsert
 *   SIGNAL_PHASE=headshots     # only upload missing headshots to R2 (from JSONL cache)
 *   SIGNAL_UPLOAD_HEADSHOTS=1  # also upload headshots during upsert phase (default: 0)
 *
 * Env: .env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CF_R2_*)
 * Auth: data/signal-nfx-auth.json (SIGNAL_ID_JWT cookie used as Bearer)
 * Log: /tmp/signal-nfx-filter-sweep.log
 * Data: /tmp/signal-nfx-investors.jsonl (one investor JSON per line)
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, appendFileSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { uploadHeadshot } from "./r2-image-upload";

// ── Env ───────────────────────────────────────────────────────────────────────

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const e    = (n: string) => (process.env[n] || "").trim();
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1","true","yes"].includes(e(n).toLowerCase());

const SUPA_URL   = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const DRY_RUN           = eBool("SIGNAL_DRY_RUN");
const PAGE_SIZE         = eInt("SIGNAL_PAGE_SIZE", 50);
const CONCURRENCY       = eInt("SIGNAL_CONCURRENCY", 4);
const PHASE             = e("SIGNAL_PHASE") || "both";
const UPLOAD_HEADSHOTS  = eBool("SIGNAL_UPLOAD_HEADSHOTS");
const AUTH_FILE  = e("SIGNAL_AUTH_FILE") || join(process.cwd(), "data", "signal-nfx-auth.json");
const LOG_FILE   = "/tmp/signal-nfx-filter-sweep.log";
const DATA_FILE  = "/tmp/signal-nfx-investors.jsonl";

if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n");
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function loadIdJwt(): string {
  if (!existsSync(AUTH_FILE)) throw new Error(`Auth file not found: ${AUTH_FILE}`);
  const auth = JSON.parse(readFileSync(AUTH_FILE, "utf8"));
  for (const c of auth.cookies) {
    if (c.name === "SIGNAL_ID_JWT") {
      return decodeURIComponent(c.value).replace(/^"|"$/g, "");
    }
  }
  throw new Error("SIGNAL_ID_JWT cookie not found in auth file");
}

// ── GraphQL helpers ───────────────────────────────────────────────────────────

const GQL_ENDPOINT = "https://signal-api.nfx.com/graphql";

const BIG_LIST_QUERY = `
query BigListQuery($name_or_firm: String, $name: String, $mode: String, $amount_range: [String], $firm_ids: [ID!], $position: [String!], $location_id: String, $location_kind: LocationKind, $interest_tag_ids: [String!], $past_investment_ids: [String!], $position_company_ids: [String!], $school_ids: [String!], $is_lead: Boolean, $order: [QuerySorting!], $after: String, $first: Int, $stage_ids: [ID!]) {
  investors(first: $first, after: $after, name_or_firm: $name_or_firm, name: $name, mode: $mode, amount_range: $amount_range, firm_ids: $firm_ids, position: $position, location_id: $location_id, location_kind: $location_kind, interest_tag_ids: $interest_tag_ids, past_investment_ids: $past_investment_ids, position_company_ids: $position_company_ids, school_ids: $school_ids, is_lead: $is_lead, order: $order, stage_ids: $stage_ids) {
    pageInfo { hasNextPage hasPreviousPage __typename }
    record_count
    edges {
      cursor
      node {
        id
        person { id first_name last_name name slug is_me __typename }
        image_urls
        position
        min_investment
        max_investment
        target_investment
        is_preferred_coinvestor
        firm { id name slug __typename }
        investment_locations { id display_name __typename }
        investor_lists { id stage_name slug vertical { id display_name __typename } __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

// Investor lists query
const INVESTOR_LISTS_QUERY = `
query InvestorLists($stage: String, $locationId: ID) {
  investor_lists(stage: $stage, location_id: $locationId) {
    record_count
    edges {
      node {
        id
        slug
        investor_count
        stage
        location { id display_name __typename }
        vertical { id display_name __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

async function gqlFetch(idJwt: string, query: string, variables: Record<string, any> = {}, operationName?: string): Promise<any> {
  const payload = JSON.stringify({ operationName, query, variables });
  const resp = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idJwt}`,
      "Content-Type": "application/json",
      "Origin": "https://signal.nfx.com",
      "Referer": "https://signal.nfx.com/investors",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: payload,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`GraphQL HTTP ${resp.status}: ${body.substring(0, 200)}`);
  }
  const data = await resp.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

// ── Stage mapping ─────────────────────────────────────────────────────────────

// Valid values for the stage_focus_enum in firm_records
const VALID_STAGE_FOCUS = new Set(["Pre-Seed", "Seed", "Series A", "Growth"]);

function mapStageFocus(labels: string[]): string[] {
  const mapped = new Set<string>();
  for (const l of labels) {
    if (VALID_STAGE_FOCUS.has(l)) { mapped.add(l); continue; }
    const lo = l.toLowerCase();
    if (lo.includes("pre-seed") || lo.includes("pre seed")) mapped.add("Pre-Seed");
    else if (lo.includes("seed")) mapped.add("Seed");
    else if (lo.includes("series a")) mapped.add("Series A");
    else if (lo.includes("growth") || lo.includes("late") || lo.includes("series b") || lo.includes("series c")) mapped.add("Growth");
  }
  return [...mapped];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SignalInvestor = {
  id: string;
  slug: string;
  full_name: string;
  first_name: string;
  last_name: string;
  position: string | null;
  min_investment: number | null;
  max_investment: number | null;
  target_investment: number | null;
  avatar_url: string | null;
  firm_name: string | null;
  firm_slug: string | null;
  firm_website: string | null;
  locations: string[];
  stage_focus: string[];
  sector_focus: string[];
  signal_nfx_url: string;
  profile_id: string;
  firm_id_signal: string | null;
};

function parseInvestorEdge(edge: any): SignalInvestor {
  const node = edge.node;
  const person = node.person || {};
  const firm = node.firm || {};

  const avatar = (node.image_urls || []).find((u: string) => u && !u.endsWith("/null")) || null;

  const locations = (node.investment_locations || []).map((l: any) => l.display_name).filter(Boolean);

  const stageFocus: string[] = [];
  const sectorFocus: string[] = [];
  for (const list of (node.investor_lists || [])) {
    if (list.stage_name) stageFocus.push(list.stage_name);
    if (list.vertical?.display_name) sectorFocus.push(list.vertical.display_name);
  }

  return {
    id: node.id,
    slug: person.slug || "",
    full_name: person.name || "",
    first_name: person.first_name || "",
    last_name: person.last_name || "",
    position: node.position || null,
    min_investment: node.min_investment ? parseInt(node.min_investment) : null,
    max_investment: node.max_investment ? parseInt(node.max_investment) : null,
    target_investment: node.target_investment ? parseInt(node.target_investment) : null,
    avatar_url: avatar,
    firm_name: firm.name || null,
    firm_slug: firm.slug || null,
    firm_website: null,  // not available in list query
    locations: [...new Set(locations)] as string[],
    stage_focus: [...new Set(stageFocus)] as string[],
    sector_focus: [...new Set(sectorFocus)] as string[],
    signal_nfx_url: `https://signal.nfx.com/investors/${person.slug}`,
    profile_id: node.id,
    firm_id_signal: firm.id || null,
  };
}

// ── Fetch all investors via cursor pagination ─────────────────────────────────

async function fetchAllInvestors(idJwt: string): Promise<void> {
  // First get list metadata (investor_lists for filter discovery)
  log("  Fetching investor_lists metadata...");
  try {
    const listsData = await gqlFetch(idJwt, INVESTOR_LISTS_QUERY, { stage: "other" }, "InvestorLists");
    const lists = listsData?.data?.investor_lists?.edges || [];
    log(`  Found ${lists.length} investor lists`);
    for (const l of lists.slice(0, 5)) {
      log(`    - ${l.node.slug} (${l.node.investor_count} investors)`);
    }
  } catch (err: any) {
    log(`  Warning: Could not fetch investor_lists: ${err.message}`);
  }

  // Get total count
  const vars = {
    first: 1,
    after: null,
    name_or_firm: "",
    name: "",
    mode: "all",
    amount_range: null,
    firm_ids: [],
    position: [],
    location_id: null,
    location_kind: "investment_location",
    interest_tag_ids: [],
    past_investment_ids: [],
    position_company_ids: [],
    school_ids: [],
    is_lead: null,
    stage_ids: [],
    order: [{ key: "just_for_you", order: "desc" }, { key: "name", order: "asc" }],
  };

  const initData = await gqlFetch(idJwt, BIG_LIST_QUERY, { ...vars, first: 1 }, "BigListQuery");
  const total = initData?.data?.investors?.record_count || 0;
  log(`\n  Total investors: ${total}`);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  log(`  Page size: ${PAGE_SIZE}  |  Total pages: ${totalPages}  |  Concurrency: ${CONCURRENCY}`);

  // Initialize data file
  writeFileSync(DATA_FILE, "");

  // Paginate with parallel batches
  let cursor: string | null = null;
  let fetched = 0;
  let page = 0;
  let errors = 0;

  // Build all page cursors sequentially (since each cursor depends on the previous)
  // We'll do sequential pagination but with overlap/retry logic

  const allInvestors: SignalInvestor[] = [];

  while (true) {
    page++;
    const pageVars = { ...vars, first: PAGE_SIZE, after: cursor };

    let retries = 0;
    let success = false;

    while (retries < 5) {
      try {
        const data = await gqlFetch(idJwt, BIG_LIST_QUERY, pageVars, "BigListQuery");
        const result = data?.data?.investors;
        const edges = result?.edges || [];

        if (edges.length === 0) {
          log(`  Page ${page}: no more results`);
          success = true;
          cursor = null;
          break;
        }

        const investors = edges.map(parseInvestorEdge);
        fetched += investors.length;

        // Stream to JSONL
        for (const inv of investors) {
          appendFileSync(DATA_FILE, JSON.stringify(inv) + "\n");
        }

        const lastEdge = edges[edges.length - 1];
        cursor = lastEdge?.cursor || null;
        const hasNext = result?.pageInfo?.hasNextPage;

        if (page % 20 === 0 || !hasNext) {
          log(`  Page ${page}/${totalPages}: fetched ${fetched}/${total} (${Math.round(fetched/total*100)}%) cursor=${cursor}`);
        }

        if (!hasNext || !cursor) {
          log(`  Pagination complete — fetched ${fetched} investors`);
          success = true;
          cursor = null;
          break;
        }

        success = true;
        break;

      } catch (err: any) {
        retries++;
        log(`  Page ${page} attempt ${retries}/5: ERROR ${err.message}`);
        if (retries >= 5) {
          errors++;
          log(`  Page ${page}: giving up after 5 retries`);
          if (errors > 20) {
            log("  Too many errors — stopping fetch");
            cursor = null;
          }
        } else {
          await new Promise(r => setTimeout(r, 2000 * retries));
        }
      }
    }

    if (!success && cursor === null) break;
    if (!cursor) break;

    // Small delay between pages
    await new Promise(r => setTimeout(r, 200));
  }

  log(`\n  ✅ Fetched ${fetched} investors (${errors} errors)`);
  log(`  Data saved to ${DATA_FILE}`);
}

// ── Supabase upsert ───────────────────────────────────────────────────────────

async function upsertInvestors(): Promise<void> {
  if (!existsSync(DATA_FILE)) {
    log(`  Data file not found: ${DATA_FILE}`);
    return;
  }

  // Count lines
  const lines = readFileSync(DATA_FILE, "utf8").split("\n").filter(Boolean);
  const total = lines.length;
  log(`\n  Upserting ${total} investors to Supabase...`);

  let saved = 0, failed = 0;
  const BATCH = 20; // smaller batch — each upsertOne now does 2-3 DB calls

  for (let i = 0; i < total; i += BATCH) {
    const batch = lines.slice(i, i + BATCH)
      .map(l => { try { return JSON.parse(l) as SignalInvestor; } catch { return null; } })
      .filter(Boolean) as SignalInvestor[];

    await Promise.allSettled(batch.map(async (inv) => {
      try {
        await upsertOne(inv);
        saved++;
      } catch (err: any) {
        log(`  ❌ ${inv.slug}: ${err.message}`);
        failed++;
      }
    }));

    if ((i + BATCH) % 1000 === 0 || i + BATCH >= total) {
      log(`  Progress: ${Math.min(i + BATCH, total)}/${total} (saved=${saved} failed=${failed})`);
    }
  }

  log(`\n  ✅ Upsert complete: saved=${saved} failed=${failed}`);
}

async function upsertOne(inv: SignalInvestor): Promise<void> {
  if (!inv.slug) return;

  const now = new Date().toISOString();

  // ── 1. Find or create firm ────────────────────────────────────────────────
  let firmId: string | null = null;

  if (inv.firm_name) {
    // Try to find existing firm by name (case-insensitive) or slug
    const { data: existing } = await supabase
      .from("firm_records")
      .select("id, website_url, signal_nfx_url")
      .or(`firm_name.ilike.${inv.firm_name}${inv.firm_slug ? `,slug.eq.${inv.firm_slug}` : ""}`)
      .is("deleted_at", null)
      .limit(1);

    if (existing?.[0]) {
      firmId = existing[0].id;

      // Update with Signal data (only fill blanks — Signal wins)
      const fp: Record<string, any> = { updated_at: now };
      if (!existing[0].website_url && inv.firm_website) fp.website_url = inv.firm_website;
      if (!existing[0].signal_nfx_url && inv.firm_slug)
        fp.signal_nfx_url = `https://signal.nfx.com/firms/${inv.firm_slug}`;

      if (Object.keys(fp).length > 1) {
        await supabase.from("firm_records").update(fp).eq("id", firmId);
      }
    } else {
      // Create a new firm record from Signal data
      const firmSlug = inv.firm_slug ||
        inv.firm_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const mappedStage = mapStageFocus(inv.stage_focus);

      const newFirm: Record<string, any> = {
        firm_name: inv.firm_name,
        slug: firmSlug,
        signal_nfx_url: `https://signal.nfx.com/firms/${firmSlug}`,
        created_at: now,
        updated_at: now,
        // Map Signal stage labels to valid enum values
        ...(mappedStage.length > 0 ? { stage_focus: mappedStage } : {}),
        // Website if available
        ...(inv.firm_website ? { website_url: inv.firm_website } : {}),
      };

      const { data: created, error: createErr } = await supabase
        .from("firm_records")
        .insert(newFirm)
        .select("id")
        .single();

      if (createErr) {
        // Slug conflict — try to fetch the conflicting row
        if (createErr.code === "23505") {
          const { data: conflict } = await supabase
            .from("firm_records")
            .select("id")
            .eq("slug", firmSlug)
            .limit(1);
          firmId = conflict?.[0]?.id || null;
        } else {
          throw new Error(`firm insert: ${createErr.message}`);
        }
      } else {
        firmId = created?.id || null;
      }
    }
  }

  // ── 2. Upsert investor (create if missing) ────────────────────────────────
  // Investors without a firm still get a stub firm_record with firm_name only
  if (!firmId && inv.full_name) {
    // Create a bare "individual" firm record for solo investors / angels
    const stubName = inv.firm_name || `${inv.full_name} (Individual)`;
    const stubSlug = stubName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const { data: stub, error: stubErr } = await supabase
      .from("firm_records")
      .insert({
        firm_name: stubName,
        slug: stubSlug,
        signal_nfx_url: `https://signal.nfx.com/investors/${inv.slug}`,
        firm_type: "individual",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (!stubErr) firmId = stub?.id || null;
    else if (stubErr.code === "23505") {
      // Slug conflict — fetch existing
      const { data: conflict } = await supabase
        .from("firm_records")
        .select("id")
        .eq("slug", stubSlug)
        .limit(1);
      firmId = conflict?.[0]?.id || null;
    }
  }

  if (!firmId) return; // give up if we still can't get a firm

  const ip: Record<string, any> = {
    firm_id: firmId,
    full_name: inv.full_name,
    updated_at: now,
  };

  if (inv.position)                  ip.title               = inv.position;
  if (inv.avatar_url)                ip.avatar_url          = inv.avatar_url;
  if (inv.min_investment != null)    ip.check_size_min      = inv.min_investment;
  if (inv.max_investment != null)    ip.check_size_max      = inv.max_investment;
  if (inv.target_investment != null) ip.sweet_spot          = inv.target_investment;
  // stage_focus on firm_investors is also an array — map to valid enum values
  const mappedPersonStage = mapStageFocus(inv.stage_focus);
  if (mappedPersonStage.length > 0) ip.stage_focus = mappedPersonStage;
  // personal_thesis_tags stores raw Signal labels (text array, no enum)
  if (inv.stage_focus.length > 0 || inv.sector_focus.length > 0)
    ip.personal_thesis_tags = [...inv.stage_focus, ...inv.sector_focus];

  const { data: upserted, error: upsertErr } = await supabase
    .from("firm_investors")
    .upsert(ip, { onConflict: "firm_id,full_name", ignoreDuplicates: false })
    .select("id, slug")
    .single();

  if (upsertErr) throw new Error(`investor upsert: ${upsertErr.message}`);

  // Optionally upload headshot to R2
  if (UPLOAD_HEADSHOTS && inv.avatar_url && upserted?.id) {
    try {
      await uploadHeadshot({
        investorId: upserted.id,
        slug: upserted.slug || inv.slug || inv.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        sourceUrl: inv.avatar_url,
        source: "signal_nfx",
      });
    } catch (err: any) {
      // Non-fatal — headshot upload failure shouldn't abort the investor upsert
      log(`  ⚠️  headshot upload failed for ${inv.full_name}: ${err.message}`);
    }
  }
}

// ── Also save investor_list slugs for cross-referencing ──────────────────────

async function fetchAndSaveInvestorLists(idJwt: string): Promise<void> {
  log("\n  Fetching all investor list slugs...");

  const stages = ["seed", "series_a", "series_b", "series_c", "growth", "other"];
  const allLists: any[] = [];

  for (const stage of stages) {
    try {
      const data = await gqlFetch(idJwt, INVESTOR_LISTS_QUERY, { stage }, "InvestorLists");
      const lists = data?.data?.investor_lists?.edges || [];
      allLists.push(...lists.map((e: any) => ({ ...e.node, stage })));
      log(`  Stage ${stage}: ${lists.length} lists`);
    } catch (err: any) {
      log(`  Warning: investor_lists stage=${stage}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  const listFile = join(process.cwd(), "data", "signal-nfx-investor-lists.json");
  writeFileSync(listFile, JSON.stringify(allLists, null, 2));
  log(`  Saved ${allLists.length} investor lists → ${listFile}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  appendFileSync(LOG_FILE, `\n=== Signal NFX API Scraper — ${new Date().toISOString()} ===\n`);
  log(`DRY_RUN=${DRY_RUN}  PAGE_SIZE=${PAGE_SIZE}  CONCURRENCY=${CONCURRENCY}  PHASE=${PHASE}  UPLOAD_HEADSHOTS=${UPLOAD_HEADSHOTS}`);

  const idJwt = loadIdJwt();
  log(`  ID JWT loaded (exp check: valid for ~186 days)`);

  // ── Phase: fetch ────────────────────────────────────────────────────────────
  if (PHASE === "both" || PHASE === "fetch") {
    log("\n═══ Phase 1: Fetching all investors from GraphQL API ═══");
    await fetchAndSaveInvestorLists(idJwt);
    await fetchAllInvestors(idJwt);
  }

  // ── Phase: upsert ───────────────────────────────────────────────────────────
  if (PHASE === "both" || PHASE === "upsert") {
    if (DRY_RUN) {
      log("\n═══ Phase 2: DRY RUN — skipping DB upserts ═══");
      const count = readFileSync(DATA_FILE, "utf8").split("\n").filter(Boolean).length;
      log(`  Would upsert ${count} investors`);
      // Print sample
      const sample = readFileSync(DATA_FILE, "utf8").split("\n").filter(Boolean).slice(0, 3);
      for (const line of sample) {
        const inv = JSON.parse(line);
        log(`  Sample: ${inv.full_name} @ ${inv.firm_name} [${inv.stage_focus.join(",")}] min=$${inv.min_investment} max=$${inv.max_investment}`);
      }
    } else {
      log("\n═══ Phase 2: Upserting to Supabase ═══");
      await upsertInvestors();
    }
  }

  // ── Phase: headshots ─────────────────────────────────────────────────────────
  if (PHASE === "headshots") {
    log("\n═══ Phase: Uploading headshots from JSONL cache to R2 ═══");
    if (!existsSync(DATA_FILE)) {
      log(`  Data file not found: ${DATA_FILE} — run with SIGNAL_PHASE=fetch first`);
    } else {
      await uploadHeadshotsFromJSONL();
    }
  }

  log("\n  ✅ Done");
}

async function uploadHeadshotsFromJSONL(): Promise<void> {
  const lines = readFileSync(DATA_FILE, "utf8").split("\n").filter(Boolean);
  log(`  ${lines.length} investors in JSONL — resolving DB IDs then uploading headshots...`);

  // Resolve slugs → DB UUIDs in batches
  const withAvatars = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter((inv): inv is SignalInvestor => inv !== null && !!inv.avatar_url && !!inv.slug);

  log(`  ${withAvatars.length} have avatar_url`);

  const SLUG_BATCH = 500;
  const resolved: Array<{ id: string; slug: string; full_name: string; avatar_url: string }> = [];

  for (let i = 0; i < withAvatars.length; i += SLUG_BATCH) {
    const batch = withAvatars.slice(i, i + SLUG_BATCH);
    const { data } = await supabase
      .from("firm_investors")
      .select("id, slug")
      .in("slug", batch.map(b => b.slug));

    const slugToId = new Map((data || []).map((r: any) => [r.slug, r.id]));

    for (const inv of batch) {
      const id = slugToId.get(inv.slug);
      if (id) resolved.push({ id, slug: inv.slug, full_name: inv.full_name, avatar_url: inv.avatar_url! });
    }
  }

  log(`  ${resolved.length} resolved to DB IDs`);

  // Filter already uploaded
  const { data: existing } = await supabase
    .from("headshot_assets")
    .select("investor_id")
    .in("investor_id", resolved.map(r => r.id));
  const done = new Set((existing || []).map((r: any) => r.investor_id));
  const todo = resolved.filter(r => !done.has(r.id));

  log(`  ${todo.length} missing headshots to upload`);
  if (todo.length === 0) return;

  let uploaded = 0, skipped = 0, failed = 0;
  let idx = 0;
  const startTime = Date.now();

  async function worker() {
    while (idx < todo.length) {
      const inv = todo[idx++];
      try {
        const result = await uploadHeadshot({
          investorId: inv.id,
          slug: inv.slug,
          sourceUrl: inv.avatar_url,
          source: "signal_nfx",
        });
        if (result) { uploaded++; } else { skipped++; }
      } catch (err: any) {
        failed++;
        log(`  ❌ ${inv.full_name}: ${err.message}`);
      }
      if ((uploaded + skipped + failed) % 200 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = ((uploaded + skipped) / parseFloat(elapsed)).toFixed(1);
        log(`  [${uploaded + skipped + failed}/${todo.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed} (${rate}/s)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`\n  ✅ Headshot upload complete in ${elapsed}s — uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});

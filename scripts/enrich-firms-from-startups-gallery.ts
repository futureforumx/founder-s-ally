/**
 * Enrich VC firm_records (and portfolio rows) from startups.gallery.
 *
 * Data source: Framer search-index JSON (same metadata the site uses for search),
 * plus optional Playwright pass to read "Visit Website" links not present in JSON.
 *
 * Writes:
 *   - firm_records: website_url, logo_url (Google favicon fallback when site known),
 *     description, elevator_pitch — only fills fields that are empty / very short
 *   - firm_recent_deals: portfolio company names from gallery investor cards (h3),
 *     source_name = startups_gallery
 *   - startups: via upsertStartup() — company name, description, gallery URL;
 *     optional Playwright fills company_url when missing
 *
 * Usage:
 *   npx tsx scripts/enrich-firms-from-startups-gallery.ts
 *   DRY_RUN=1 npx tsx scripts/enrich-firms-from-startups-gallery.ts
 *   GALLERY_ENRICH_MAX=200 npx tsx scripts/enrich-firms-from-startups-gallery.ts
 *   GALLERY_MAX_COMPANIES=100 npx tsx scripts/enrich-firms-from-startups-gallery.ts
 *   GALLERY_SKIP_PLAYWRIGHT=1 npx tsx scripts/enrich-firms-from-startups-gallery.ts
 *   GALLERY_SKIP_STARTUPS=1 npx tsx scripts/enrich-firms-from-startups-gallery.ts
 *
 * Env: SUPABASE_URL / VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or anon for read-only dry)
 */

import { chromium, type Page } from "@playwright/test";
import {
  fetchStartupsGallerySearchIndex,
  splitInvestorsAndCompanies,
  slugifyFirmKey,
  pickInvestorDescription,
  pickInvestorPortfolioNames,
  pickCompanyDescription,
  displayNameFromInvestorEntry,
  displayNameFromCompanyEntry,
  STARTUPS_GALLERY_ORIGIN,
  type GalleryIndexEntry,
} from "./lib/startupsGalleryIndex";
import {
  initSupabase,
  upsertStartup,
  normalizeDomain,
  sleep,
  type StartupIngestPayload,
} from "./lib/startupScraper";

const sb = initSupabase();

const DRY = /^1|true|yes$/i.test((process.env.DRY_RUN ?? "").trim());
/** Max investor index entries to scan (0 = all). */
const MAX_INVESTORS = Math.max(0, parseInt(process.env.GALLERY_ENRICH_MAX || process.env.GALLERY_MAX_INVESTORS || "0", 10));
/** Max company upserts from index (0 = all). */
const MAX_COMPANIES = Math.max(0, parseInt(process.env.GALLERY_MAX_COMPANIES || "0", 10));
const SKIP_PW = process.env.GALLERY_SKIP_PLAYWRIGHT === "1";
const SKIP_STARTUPS = process.env.GALLERY_SKIP_STARTUPS === "1";
const PW_DELAY_MS = Math.max(0, parseInt(process.env.GALLERY_PLAYWRIGHT_DELAY_MS || "350", 10));

type FirmRow = {
  id: string;
  firm_name: string;
  slug: string | null;
  website_url: string | null;
  logo_url: string | null;
  description: string | null;
  elevator_pitch: string | null;
};

function ePitchFromDescription(desc: string): string {
  const t = desc.trim();
  const cut = t.search(/(?<=[.!?])\s+/);
  const first = cut > 40 && cut < 220 ? t.slice(0, cut).trim() : t.slice(0, 200).trim();
  return first.length < t.length ? `${first}…` : first;
}

function faviconUrlForWebsite(website: string): string | null {
  try {
    const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return null;
  }
}

function stripGalleryRef(url: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    u.searchParams.delete("ref");
    return u.toString();
  } catch {
    return url.trim();
  }
}

async function extractVisitWebsite(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const hit = anchors.find((a) => /visit website/i.test((a.textContent || "").trim()));
    const href = hit?.getAttribute("href")?.trim();
    if (!href || href === "#") return null;
    if (href.startsWith("http")) return href;
    if (href.startsWith("/")) return `https://startups.gallery${href}`;
    return null;
  });
}

function normalizeCompanyKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchFirmToGallerySlug(
  slug: string,
  displayName: string,
  firms: FirmRow[],
): FirmRow | null {
  const sn = slug.toLowerCase();
  for (const f of firms) {
    if (f.slug?.trim() && f.slug.trim().toLowerCase() === sn) return f;
  }
  const dn = slugifyFirmKey(displayName);
  if (dn === sn) {
    for (const f of firms) {
      if (slugifyFirmKey(f.firm_name) === sn) return f;
    }
  }
  for (const f of firms) {
    if (slugifyFirmKey(f.firm_name) === sn) return f;
  }
  return null;
}

async function loadAllFirms(): Promise<FirmRow[]> {
  const out: FirmRow[] = [];
  const batch = 800;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("firm_records")
      .select("id, firm_name, slug, website_url, logo_url, description, elevator_pitch")
      .is("deleted_at", null)
      .order("firm_name")
      .range(from, from + batch - 1);
    if (error) throw error;
    const rows = (data ?? []) as FirmRow[];
    out.push(...rows);
    if (rows.length < batch) break;
    from += batch;
  }
  return out;
}

async function insertPortfolioDeals(firmId: string, companyNames: string[], sourceUrl: string): Promise<number> {
  if (!companyNames.length || DRY) return 0;
  const { data: existing } = await sb
    .from("firm_recent_deals")
    .select("company_name, normalized_company_name")
    .eq("firm_id", firmId);
  const existingNorm = new Set(
    (existing ?? []).map((r: { normalized_company_name: string | null; company_name: string }) =>
      (r.normalized_company_name || normalizeCompanyKey(r.company_name)).toLowerCase(),
    ),
  );

  const rows = companyNames
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => !existingNorm.has(normalizeCompanyKey(name)))
    .map((company_name) => ({
      firm_id: firmId,
      company_name,
      normalized_company_name: normalizeCompanyKey(company_name),
      stage: null as string | null,
      amount: null as string | null,
      date_announced: null as string | null,
      source_name: "startups_gallery",
      source_url: sourceUrl,
      investment_status: "unknown" as const,
      is_notable: false,
    }));

  if (!rows.length) return 0;
  const { error } = await sb.from("firm_recent_deals").insert(rows);
  if (error) {
    console.warn(`  firm_recent_deals insert: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function patchFirmRecord(
  firm: FirmRow,
  patch: Partial<Pick<FirmRow, "website_url" | "logo_url" | "description" | "elevator_pitch">>,
): Promise<boolean> {
  if (DRY) return Object.keys(patch).length > 0;
  if (!Object.keys(patch).length) return false;
  const { error } = await sb.from("firm_records").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", firm.id);
  if (error) {
    console.warn(`  firm_records update ${firm.firm_name}: ${error.message}`);
    return false;
  }
  return true;
}

function buildFirmPatchFromGallery(args: {
  firm: FirmRow;
  description: string | null;
  website: string | null;
}): Partial<Pick<FirmRow, "website_url" | "logo_url" | "description" | "elevator_pitch">> {
  const { firm, description, website } = args;
  const patch: Partial<Pick<FirmRow, "website_url" | "logo_url" | "description" | "elevator_pitch">> = {};
  const cleanSite = stripGalleryRef(website);
  if (cleanSite && !firm.website_url?.trim()) {
    patch.website_url = cleanSite;
    if (!firm.logo_url?.trim()) {
      const fav = faviconUrlForWebsite(cleanSite);
      if (fav) patch.logo_url = fav;
    }
  }
  if (description) {
    const short = (firm.description ?? "").trim().length < 40;
    if (short) {
      patch.description = description;
      if (!firm.elevator_pitch?.trim()) {
        patch.elevator_pitch = ePitchFromDescription(description);
      }
    }
  }
  return patch;
}

async function main(): Promise<void> {
  console.log(
    `[startups.gallery] DRY_RUN=${DRY} SKIP_PLAYWRIGHT=${SKIP_PW} SKIP_STARTUPS=${SKIP_STARTUPS} ` +
      `MAX_INVESTORS=${MAX_INVESTORS || "∞"} MAX_COMPANIES=${MAX_COMPANIES || "∞"}`,
  );

  const rawIndex = await fetchStartupsGallerySearchIndex();
  const { investors, companies } = splitInvestorsAndCompanies(rawIndex);
  console.log(`[startups.gallery] index: ${investors.size} investors, ${companies.size} companies`);

  const firms = await loadAllFirms();
  console.log(`[startups.gallery] firm_records loaded: ${firms.length}`);

  let matched = 0;
  let firmsUpdated = 0;
  let dealsInserted = 0;
  let startupsUpserted = 0;

  const playwrightTargets: { kind: "investor" | "company"; path: string; firm?: FirmRow; name: string }[] = [];

  // ── Investors → firm_records + firm_recent_deals ───────────────────────────
  let invCount = 0;
  for (const [invSlug, { path, entry }] of investors) {
    invCount += 1;
    if (MAX_INVESTORS && invCount > MAX_INVESTORS) break;

    const display = displayNameFromInvestorEntry(entry);
    if (!display) continue;
    const firm = matchFirmToGallerySlug(invSlug, display, firms);
    if (!firm) continue;
    matched += 1;

    const pageUrl = `${STARTUPS_GALLERY_ORIGIN}${path}`;
    const desc = pickInvestorDescription(entry);
    const patch = buildFirmPatchFromGallery({ firm, description: desc, website: null });
    const portfolio = pickInvestorPortfolioNames(entry);

    if (Object.keys(patch).length) {
      if (await patchFirmRecord(firm, patch)) firmsUpdated += 1;
      if (patch.description) firm.description = patch.description;
      if (patch.elevator_pitch) firm.elevator_pitch = patch.elevator_pitch;
      if (patch.website_url) firm.website_url = patch.website_url;
      if (patch.logo_url) firm.logo_url = patch.logo_url;
    }
    dealsInserted += await insertPortfolioDeals(firm.id, portfolio, pageUrl);

    const needsWebsite = !firm.website_url?.trim() || !stripGalleryRef(firm.website_url)?.length;
    if (needsWebsite && !SKIP_PW) {
      playwrightTargets.push({ kind: "investor", path, firm, name: display });
    }
  }

  // ── Companies → startups table ─────────────────────────────────────────────
  if (!SKIP_STARTUPS) {
    let coCount = 0;
    for (const { path, entry } of companies.values()) {
      coCount += 1;
      if (MAX_COMPANIES && coCount > MAX_COMPANIES) break;
      const name = displayNameFromCompanyEntry(entry);
      if (!name) continue;
      const desc = pickCompanyDescription(entry);
      const payload: StartupIngestPayload = {
        company_name: name,
        data_source: "startups_gallery",
        description_short: desc,
        external_ids: { startups_gallery: `${STARTUPS_GALLERY_ORIGIN}${path}` },
      };
      if (DRY) {
        startupsUpserted += 1;
      } else {
        try {
          await upsertStartup(sb, payload);
          startupsUpserted += 1;
        } catch (e) {
          console.warn(`  upsertStartup ${name}: ${(e as Error).message}`);
        }
      }
      if (!SKIP_PW) {
        playwrightTargets.push({ kind: "company", path, name });
      }
    }
  }

  // ── Playwright: Visit Website → firm + startup domain ─────────────────────
  if (!SKIP_PW && playwrightTargets.length) {
    console.log(`[startups.gallery] Playwright: ${playwrightTargets.length} pages`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    try {
      for (const t of playwrightTargets) {
        const url = `${STARTUPS_GALLERY_ORIGIN}${t.path}`;
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
          await sleep(400);
          const href = await extractVisitWebsite(page);
          const clean = stripGalleryRef(href);
          if (!clean || clean.includes("startups.gallery")) continue;

          if (t.kind === "investor" && t.firm) {
            const fresh = firms.find((f) => f.id === t.firm!.id) ?? t.firm;
            const pwPatch: Partial<Pick<FirmRow, "website_url" | "logo_url">> = {};
            if (!fresh.website_url?.trim()) {
              pwPatch.website_url = clean;
              if (!fresh.logo_url?.trim()) {
                const fav = faviconUrlForWebsite(clean);
                if (fav) pwPatch.logo_url = fav;
              }
            }
            if (Object.keys(pwPatch).length) {
              if (await patchFirmRecord(fresh, pwPatch)) firmsUpdated += 1;
              if (pwPatch.website_url) fresh.website_url = pwPatch.website_url;
              if (pwPatch.logo_url) fresh.logo_url = pwPatch.logo_url;
            }
          } else if (t.kind === "company") {
            const entry = (rawIndex[t.path] ?? {}) as GalleryIndexEntry;
            const desc = pickCompanyDescription(entry);
            const payload: StartupIngestPayload = {
              company_name: t.name,
              data_source: "startups_gallery",
              company_url: clean,
              domain: normalizeDomain(clean),
              description_short: desc,
              external_ids: { startups_gallery: url },
            };
            if (!DRY) {
              try {
                await upsertStartup(sb, payload);
              } catch (e) {
                console.warn(`  upsertStartup PW ${t.name}: ${(e as Error).message}`);
              }
            }
          }
        } catch (e) {
          console.warn(`  PW ${url}: ${(e as Error).message}`);
        }
        if (PW_DELAY_MS) await sleep(PW_DELAY_MS);
      }
    } finally {
      await browser.close();
    }
  }

  console.log(
    `[startups.gallery] done — investors matched: ${matched}, firm_records patches: ${firmsUpdated}, ` +
      `new portfolio rows: ${dealsInserted}, startup upserts: ${startupsUpserted}`,
  );
}

main().catch((err) => {
  console.error("[startups.gallery] fatal:", err);
  process.exit(1);
});

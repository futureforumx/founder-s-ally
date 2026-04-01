/**
 * sync-headshots-unavatar.ts
 *
 * Resolves missing avatar_url for firm_investors using a waterfall of sources:
 *   1. Unavatar (aggregates LinkedIn, GitHub, Gravatar, etc.) via linkedin_url handle
 *   2. Unavatar via x_url (Twitter handle)
 *   3. Unavatar via email (Gravatar fallback)
 *
 * Only patches investors where avatar_url IS NULL.
 * Skips placeholder/fallback images (< 5 KB responses from Unavatar).
 *
 * Usage:
 *   npx tsx scripts/sync-headshots-unavatar.ts
 *   DRY_RUN=1 npx tsx scripts/sync-headshots-unavatar.ts
 *   MAX_INVESTORS=100 npx tsx scripts/sync-headshots-unavatar.ts
 *   DELAY_MS=300 npx tsx scripts/sync-headshots-unavatar.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Env ──────────────────────────────────────────────────────────────────────
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
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const DRY_RUN      = process.env.DRY_RUN === "1";
const MAX_INVESTORS = parseInt(process.env.MAX_INVESTORS || "5000");
const DELAY_MS      = parseInt(process.env.DELAY_MS || "150");
const UNAVATAR_BASE = "https://unavatar.io";

const SB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function linkedinHandle(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].replace(/\/$/, "") : null;
}

function twitterHandle(url: string): string | null {
  const m = url.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/i);
  if (!m) return null;
  const h = m[1].replace(/\/$/, "");
  if (["intent", "share", "hashtag", "search"].includes(h)) return null;
  return h;
}

/**
 * Probe Unavatar URL — returns the resolved image URL if the image is real
 * (content-length > 5 KB and not a placeholder SVG).
 */
async function probeUnavatar(url: string, timeoutMs = 6000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("svg")) return null; // placeholder
    const cl = parseInt(res.headers.get("content-length") || "0");
    if (cl > 0 && cl < 5000) return null; // too small — likely placeholder
    return res.url || url;
  } catch {
    return null;
  }
}

async function resolveAvatar(inv: Record<string, any>): Promise<string | null> {
  // 1. LinkedIn handle via Unavatar
  if (inv.linkedin_url) {
    const handle = linkedinHandle(inv.linkedin_url);
    if (handle) {
      const url = await probeUnavatar(`${UNAVATAR_BASE}/linkedin/${encodeURIComponent(handle)}`);
      if (url) return url;
    }
  }

  // 2. Twitter/X handle via Unavatar
  if (inv.x_url) {
    const handle = twitterHandle(inv.x_url);
    if (handle) {
      const url = await probeUnavatar(`${UNAVATAR_BASE}/twitter/${encodeURIComponent(handle)}`);
      if (url) return url;
    }
  }

  // 3. Email (Gravatar) via Unavatar
  if (inv.email) {
    const url = await probeUnavatar(`${UNAVATAR_BASE}/${encodeURIComponent(inv.email)}`);
    if (url) return url;
  }

  return null;
}

// ── Supabase ──────────────────────────────────────────────────────────────────
async function sbGet<T>(table: string, select: string, extra = ""): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=10000${extra}`, { headers: SB });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table: string, id: string, patch: Record<string, any>): Promise<boolean> {
  if (DRY_RUN) { console.log(`  [DRY] PATCH ${table}.${id}:`, JSON.stringify(patch)); return true; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify(patch),
  });
  return res.ok;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Headshot Waterfall (Unavatar)  ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`${"═".repeat(64)}`);
  console.log(`  Max investors: ${MAX_INVESTORS}  Delay: ${DELAY_MS}ms\n`);

  // Fetch investors missing avatar_url but with at least one social handle or email
  type InvRow = Record<string, any>;
  const all = await sbGet<InvRow>(
    "firm_investors",
    "id,first_name,last_name,full_name,linkedin_url,x_url,email,avatar_url",
    "&deleted_at=is.null&avatar_url=is.null"
  );

  // Only process those that have something to look up
  const candidates = all
    .filter(inv => inv.linkedin_url || inv.x_url || inv.email)
    .slice(0, MAX_INVESTORS);

  console.log(`  Investors missing avatar:  ${all.length}`);
  console.log(`  With social/email handle:  ${candidates.length}`);
  console.log(`  Processing:               ${Math.min(candidates.length, MAX_INVESTORS)}\n`);

  let resolved = 0, skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const inv = candidates[i];
    const name = [inv.first_name, inv.last_name].filter(Boolean).join(" ") || inv.full_name || inv.id;

    const avatarUrl = await resolveAvatar(inv);
    if (avatarUrl) {
      const ok = await sbPatch("firm_investors", inv.id, { avatar_url: avatarUrl });
      if (ok) {
        resolved++;
        const source = inv.linkedin_url ? "linkedin" : inv.x_url ? "twitter" : "email";
        console.log(`  ✓ [${i+1}/${candidates.length}] ${name} (${source})`);
      }
    } else {
      skipped++;
      if (skipped <= 10 || skipped % 50 === 0)
        console.log(`  — [${i+1}/${candidates.length}] ${name} (no image found)`);
    }

    if (i < candidates.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Resolved: ${resolved}  No image: ${skipped}`);
  console.log(`${"═".repeat(64)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

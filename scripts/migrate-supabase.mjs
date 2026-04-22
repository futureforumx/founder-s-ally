/**
 * migrate-supabase.mjs
 * Migrates all public schema data from a source Supabase project to a destination.
 * Run: node scripts/migrate-supabase.mjs
 */

const SRC_URL  = "https://kvgtgftfsrtnevpvugjq.supabase.co";
const SRC_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Z3RnZnRmc3J0bmV2cHZ1Z2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU0ODI1NSwiZXhwIjoyMDkwMTI0MjU1fQ.cKWhKLha10hTcMpU6SWklP6a__gvz1VD8WMa95Q8Jbo";

const DST_URL  = "https://zmnlsdohtwztneamvwaq.supabase.co";
const DST_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbmxzZG9odHd6dG5lYW12d2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE0NzcxMSwiZXhwIjoyMDg5NzIzNzExfQ.F_B5LAkujxUnK9EHlPsgruQqlIzN6vg_GUDcbF5kifc";

const HEADERS_SRC = { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}`, "Content-Type": "application/json" };
const HEADERS_DST = { apikey: DST_KEY, Authorization: `Bearer ${DST_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" };

async function rpc(baseUrl, key, fn, body = {}) {
  const r = await fetch(`${baseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`RPC ${fn} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function listTables() {
  const rows = await rpc(SRC_URL, SRC_KEY, "query_tables", {});
  return rows;
}

async function fetchAll(table, offset = 0, limit = 1000) {
  const r = await fetch(
    `${SRC_URL}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`,
    { headers: HEADERS_SRC }
  );
  if (!r.ok) throw new Error(`Fetch ${table} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function upsertBatch(table, rows) {
  const r = await fetch(`${DST_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: HEADERS_DST,
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text();
    // Table doesn't exist in destination — skip
    if (r.status === 404 || txt.includes("does not exist")) {
      console.warn(`  ⚠  Table ${table} not in destination — skipping`);
      return false;
    }
    throw new Error(`Upsert ${table} failed: ${r.status} ${txt}`);
  }
  return true;
}

async function getPublicTables() {
  // Query information_schema via RPC isn't available — use the PostgREST root to list tables
  const r = await fetch(`${SRC_URL}/rest/v1/`, { headers: HEADERS_SRC });
  if (!r.ok) throw new Error(`Could not fetch table list: ${r.status}`);
  const spec = await r.json();
  // PostgREST OpenAPI spec — paths like /TableName
  return Object.keys(spec.paths ?? {})
    .map(p => p.replace(/^\//, ""))
    .filter(t => t && !t.startsWith("rpc/"));
}

async function migrateTable(table) {
  let offset = 0;
  let total = 0;
  while (true) {
    const rows = await fetchAll(table, offset);
    if (!rows.length) break;
    const ok = await upsertBatch(table, rows);
    if (!ok) return;
    total += rows.length;
    offset += rows.length;
    if (rows.length < 1000) break;
    process.stdout.write(`  → ${total} rows...\r`);
  }
  if (total > 0) console.log(`  ✓ ${table}: ${total} rows`);
  else console.log(`  – ${table}: empty`);
}

async function main() {
  console.log("🔍 Discovering tables in source...");
  const tables = await getPublicTables();
  console.log(`   Found ${tables.length} tables: ${tables.join(", ")}\n`);

  for (const table of tables) {
    process.stdout.write(`  Migrating ${table}...\n`);
    try {
      await migrateTable(table);
    } catch (e) {
      console.error(`  ✗ ${table}: ${e.message}`);
    }
  }

  console.log("\n✅ Migration complete.");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

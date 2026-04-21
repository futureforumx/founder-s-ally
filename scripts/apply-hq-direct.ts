import { createClient } from "@supabase/supabase-js";

const URL  = "https://zmnlsdohtwztneamvwaq.supabase.co";
const KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbmxzZG9odHd6dG5lYW12d2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE0NzcxMSwiZXhwIjoyMDg5NzIzNzExfQ.F_B5LAkujxUnK9EHlPsgruQqlIzN6vg_GUDcbF5kifc";

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const FIRMS = [
  { name: "Corazon Capital", city: "Chicago",  state: "IL", location: "Chicago, IL"  },
  { name: "Lux Capital",     city: "New York", state: "NY", location: "New York, NY" },
  { name: "Antler",          city: "New York", state: "NY", location: "New York, NY" },
];

async function run() {
  for (const firm of FIRMS) {
    // 1. Check if firm exists
    const { data: rows, error: fetchErr } = await sb
      .from("firm_records")
      .select("id, firm_name, hq_city, hq_state, location, canonical_hq_locked")
      .ilike("firm_name", firm.name)
      .is("deleted_at", null);

    if (fetchErr) { console.error(`❌ ${firm.name} fetch error:`, fetchErr.message); continue; }
    if (!rows || rows.length === 0) { console.log(`⚠️  ${firm.name}: NOT FOUND in firm_records`); continue; }

    console.log(`Found ${rows.length} row(s) for "${firm.name}":`, rows.map(r => `${r.id} (locked=${r.canonical_hq_locked}, city=${r.hq_city})`));

    for (const row of rows) {
      const now = new Date().toISOString();

      // Step 1: unlock + set HQ values (the guard trigger allows this path)
      const { error: e1 } = await sb
        .from("firm_records")
        .update({
          hq_city:             firm.city,
          hq_state:            firm.state,
          hq_country:          null,
          location:            firm.location,
          canonical_hq_locked: false,
          canonical_hq_source: "manual_admin",
          canonical_hq_set_at: now,
          updated_at:          now,
        })
        .eq("id", row.id);

      if (e1) { console.error(`  ❌ Step 1 error for ${row.id}:`, e1.message); continue; }

      // Step 2: re-lock
      const { error: e2 } = await sb
        .from("firm_records")
        .update({ canonical_hq_locked: true, updated_at: new Date().toISOString() })
        .eq("id", row.id);

      if (e2) { console.error(`  ❌ Step 2 (re-lock) error for ${row.id}:`, e2.message); continue; }

      console.log(`  ✅ ${firm.name} → ${firm.location} (locked)`);
    }

    // Also update vc_firms if it exists
    const { data: vcRows, error: vcErr } = await sb
      .from("vc_firms")
      .select("id, firm_name, hq_city, hq_state")
      .ilike("firm_name", firm.name)
      .is("deleted_at", null);

    if (!vcErr && vcRows && vcRows.length > 0) {
      const { error: vcUpd } = await sb
        .from("vc_firms")
        .update({ hq_city: firm.city, hq_state: firm.state, hq_country: null, updated_at: new Date().toISOString() })
        .ilike("firm_name", firm.name)
        .is("deleted_at", null);
      if (vcUpd) console.error(`  ❌ vc_firms update error:`, vcUpd.message);
      else console.log(`  ✅ vc_firms updated (${vcRows.length} row(s))`);
    }
  }
}

run().catch(console.error);

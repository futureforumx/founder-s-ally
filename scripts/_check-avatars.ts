import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://zmnlsdohtwztneamvwaq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbmxzZG9odHd6dG5lYW12d2FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE0NzcxMSwiZXhwIjoyMDg5NzIzNzExfQ.F_B5LAkujxUnK9EHlPsgruQqlIzN6vg_GUDcbF5kifc"
);

async function main() {
  // vc_people
  const { count: vcTotal } = await sb.from("vc_people").select("*", { count: "exact", head: true });
  const { count: vcWithAvatar } = await sb.from("vc_people").select("*", { count: "exact", head: true }).not("avatar_url", "is", null);
  console.log(`vc_people: ${vcTotal} total | ${vcWithAvatar} with avatar_url`);

  const { data: vcSamples } = await sb.from("vc_people").select("full_name, avatar_url").not("avatar_url", "is", null).limit(5);
  vcSamples?.forEach((r: any) => console.log(" vc_people:", r.full_name, "->", r.avatar_url?.substring(0, 90)));

  // firm_investors
  const { count: fiTotal } = await sb.from("firm_investors").select("*", { count: "exact", head: true }).is("deleted_at", null);
  const { count: fiWithAvatar } = await sb.from("firm_investors").select("*", { count: "exact", head: true }).not("avatar_url", "is", null).is("deleted_at", null);
  console.log(`\nfirm_investors: ${fiTotal} total | ${fiWithAvatar} with avatar_url`);

  const { data: fiSamples } = await sb.from("firm_investors").select("full_name, avatar_url").not("avatar_url", "is", null).is("deleted_at", null).limit(5);
  fiSamples?.forEach((r: any) => console.log(" firm_investor:", r.full_name, "->", r.avatar_url?.substring(0, 90)));
}

main().catch(console.error);

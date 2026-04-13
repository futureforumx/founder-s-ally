import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}
const sb = createClient(supabaseUrl, supabaseKey);

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

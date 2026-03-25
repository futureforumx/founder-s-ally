import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin via user_roles table
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) throw new Error("Unauthorized");

    // Check user_roles table for admin/god permission
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("permission")
      .eq("user_id", caller.id)
      .maybeSingle();

    // Also allow legacy admin check via user_metadata
    const isAdmin = roleData?.permission === "admin" || roleData?.permission === "god" || caller.user_metadata?.role === "admin";
    if (!isAdmin) throw new Error("Admin access required");

    // Fetch all auth users using admin API
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw listError;

    // Fetch profiles
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, full_name, title, avatar_url, user_type, linkedin_url, twitter_url, location, created_at");

    // Fetch roles
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("user_id, permission");

    // Fetch activity
    const { data: activity } = await adminClient
      .from("user_activity")
      .select("user_id, total_time_seconds, api_calls_count, last_active_at");

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
    const roleMap = new Map((roles || []).map(r => [r.user_id, r.permission]));
    const activityMap = new Map((activity || []).map(a => [a.user_id, a]));

    const enrichedUsers = users.map(u => {
      const profile = profileMap.get(u.id);
      const act = activityMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at,
        full_name: profile?.full_name || u.user_metadata?.full_name || "",
        avatar_url: profile?.avatar_url || null,
        user_type: profile?.user_type || "founder",
        title: profile?.title || null,
        linkedin_url: profile?.linkedin_url || null,
        twitter_url: profile?.twitter_url || null,
        location: profile?.location || null,
        permission: roleMap.get(u.id) || "user",
        total_time_seconds: act?.total_time_seconds || 0,
        api_calls_count: act?.api_calls_count || 0,
        last_active_at: act?.last_active_at || null,
      };
    });

    return new Response(JSON.stringify({ users: enrichedUsers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

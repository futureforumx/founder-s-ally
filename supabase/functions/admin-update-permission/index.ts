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

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin/god
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("permission")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isAdmin = callerRole?.permission === "admin" || callerRole?.permission === "god" || caller.user_metadata?.role === "admin";
    if (!isAdmin) throw new Error("Admin access required");

    const { target_user_id, permission } = await req.json();
    if (!target_user_id || !["user", "manager", "admin", "god"].includes(permission)) {
      throw new Error("Invalid payload: need target_user_id and valid permission");
    }

    // Only god can assign god
    if (permission === "god" && callerRole?.permission !== "god" && caller.user_metadata?.role !== "admin") {
      throw new Error("Only GOD-level admins can assign GOD permission");
    }

    // Upsert role
    const { error: upsertError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: target_user_id, permission, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

    if (upsertError) throw upsertError;

    // Also update user_metadata for legacy compatibility
    await adminClient.auth.admin.updateUserById(target_user_id, {
      user_metadata: { role: permission === "user" ? "user" : permission },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

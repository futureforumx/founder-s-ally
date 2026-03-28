import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveEdgeUserId } from "../_shared/jwt-sub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Only these columns are written on company_analyses (ignore unknown keys). */
const COMPANY_ANALYSIS_KEYS = new Set([
  "company_name",
  "website_url",
  "deck_text",
  "stage",
  "sector",
  "executive_summary",
  "health_score",
  "mrr",
  "burn_rate",
  "runway",
  "ltv",
  "cac",
  "scraped_header",
  "scraped_value_prop",
  "scraped_pricing",
  "raw_ai_response",
]);

const PROFILE_KEYS = [
  "full_name",
  "title",
  "bio",
  "location",
  "avatar_url",
  "linkedin_url",
  "twitter_url",
  "user_type",
  "has_completed_onboarding",
  "has_seen_settings_tour",
  "company_id",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: {
    userId?: string;
    companyId?: string;
    companyFields?: Record<string, unknown>;
    profile?: Record<string, unknown>;
    preferences?: {
      onboarding_data?: Record<string, unknown>;
      privacy_settings?: Record<string, unknown>;
      notification_settings?: Record<string, unknown>;
    };
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const idRes = resolveEdgeUserId(req.headers.get("Authorization"), body.userId);
  if (!idRes.ok) {
    return new Response(JSON.stringify({ error: idRes.error }), {
      status: idRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sub = idRes.userId;

  if (!body.profile) {
    return new Response(JSON.stringify({ error: "profile payload is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Edge function missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(url, serviceKey);

  if (body.companyId && body.companyFields && typeof body.companyFields === "object") {
    const caPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.companyFields)) {
      if (COMPANY_ANALYSIS_KEYS.has(k) && v !== undefined) caPatch[k] = v;
    }

    if (Object.keys(caPatch).length > 0) {
      const { data: owned, error: ownErr } = await admin
        .from("company_analyses")
        .select("id")
        .eq("id", body.companyId)
        .eq("user_id", sub)
        .maybeSingle();

      if (ownErr) {
        return new Response(JSON.stringify({ error: ownErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!owned) {
        return new Response(JSON.stringify({ error: "Company not found or not owned by this user." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      caPatch.updated_at = new Date().toISOString();
      const { error: upCa } = await admin.from("company_analyses").update(caPatch).eq("id", body.companyId);
      if (upCa) {
        return new Response(JSON.stringify({ error: upCa.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  const p = body.profile;
  const profilePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of PROFILE_KEYS) {
    if (k in p && p[k] !== undefined) {
      profilePatch[k] = p[k];
    }
  }
  delete profilePatch.user_id;

  const { data: existingProf, error: selProfErr } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", sub)
    .maybeSingle();

  if (selProfErr) {
    return new Response(JSON.stringify({ error: selProfErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (existingProf) {
    const { error: upProf } = await admin.from("profiles").update(profilePatch).eq("user_id", sub);
    if (upProf) {
      return new Response(JSON.stringify({ error: upProf.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    const insertRow: Record<string, unknown> = {
      user_id: sub,
      full_name: "",
      title: null,
      bio: null,
      location: null,
      avatar_url: null,
      linkedin_url: null,
      twitter_url: null,
      user_type: "founder",
      has_completed_onboarding: false,
      has_seen_settings_tour: false,
      company_id: null,
      is_public: true,
      updated_at: new Date().toISOString(),
    };
    for (const k of PROFILE_KEYS) {
      if (k in p && p[k] !== undefined) {
        insertRow[k] = p[k];
      }
    }
    insertRow.user_id = sub;
    const { error: insProf } = await admin.from("profiles").insert(insertRow);
    if (insProf) {
      return new Response(JSON.stringify({ error: insProf.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (body.preferences) {
    const prefRow: Record<string, unknown> = {
      user_id: sub,
      updated_at: new Date().toISOString(),
      onboarding_data: body.preferences.onboarding_data ?? {},
      privacy_settings: body.preferences.privacy_settings ?? {},
      notification_settings: body.preferences.notification_settings ?? {},
    };

    const { data: existingPref, error: selPrefErr } = await admin
      .from("user_preferences")
      .select("id")
      .eq("user_id", sub)
      .maybeSingle();

    if (selPrefErr) {
      return new Response(JSON.stringify({ error: selPrefErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingPref) {
      const { error: upPref } = await admin.from("user_preferences").update(prefRow).eq("user_id", sub);
      if (upPref) {
        return new Response(JSON.stringify({ error: upPref.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { error: insPref } = await admin.from("user_preferences").insert(prefRow);
      if (insPref) {
        return new Response(JSON.stringify({ error: insPref.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

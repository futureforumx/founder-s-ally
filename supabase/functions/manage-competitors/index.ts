import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    // ── LIST: Get user's tracked competitors with full details ──
    if (action === "list") {
      const { data, error } = await supabase
        .from("company_competitors")
        .select("*, competitor:competitors(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ competitors: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SEARCH: Find competitors in global registry ──
    if (action === "search") {
      const { query } = payload;
      if (!query || query.length < 2) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("competitors")
        .select("*")
        .ilike("name", `%${query}%`)
        .limit(10);

      if (error) throw error;
      return new Response(JSON.stringify({ results: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ADD: Add a competitor (create global entry if needed, then link) ──
    if (action === "add") {
      const { name, status = "Tracked", user_defined_advantage, notes } = payload;
      if (!name?.trim()) {
        return new Response(JSON.stringify({ error: "Name is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const trimmedName = name.trim();

      // Check if competitor exists globally
      const { data: existing } = await supabase
        .from("competitors")
        .select("*")
        .ilike("name", trimmedName)
        .limit(1)
        .single();

      let competitorId: string;
      let competitorRecord: any;

      if (existing) {
        competitorId = existing.id;
        competitorRecord = existing;
      } else {
        // Create new global competitor entry
        const website = `https://${trimmedName.toLowerCase().replace(/\s+/g, "")}.com`;

        // Try AI enrichment
        let description = `${trimmedName} operates in the market. Add industry tags for better intelligence.`;
        let industryTags: string[] = [];

        try {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (LOVABLE_API_KEY) {
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  { role: "system", content: "Return a JSON object with 'description' (1 sentence about the company) and 'industry_tags' (array of 2-4 industry tags). No markdown." },
                  { role: "user", content: `Company: ${trimmedName}` },
                ],
                tools: [{
                  type: "function",
                  function: {
                    name: "enrich_competitor",
                    description: "Return enriched competitor data",
                    parameters: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        industry_tags: { type: "array", items: { type: "string" } },
                        funding: { type: "string" },
                        stage: { type: "string" },
                        employee_count: { type: "string" },
                      },
                      required: ["description", "industry_tags"],
                    },
                  },
                }],
                tool_choice: { type: "function", function: { name: "enrich_competitor" } },
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                const parsed = JSON.parse(toolCall.function.arguments);
                description = parsed.description || description;
                industryTags = parsed.industry_tags || [];
              }
            }
          }
        } catch (e) {
          console.error("AI enrichment failed (non-blocking):", e);
        }

        const { data: newComp, error: insertErr } = await supabase
          .from("competitors")
          .insert({
            name: trimmedName,
            website,
            description,
            industry_tags: industryTags,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        competitorId = newComp.id;
        competitorRecord = newComp;
      }

      // Link to user
      const { data: link, error: linkErr } = await supabase
        .from("company_competitors")
        .insert({
          user_id: user.id,
          competitor_id: competitorId,
          status,
          user_defined_advantage: user_defined_advantage || null,
        })
        .select("*, competitor:competitors(*)")
        .single();

      if (linkErr) {
        if (linkErr.code === "23505") {
          return new Response(JSON.stringify({ error: "Competitor already tracked" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw linkErr;
      }

      return new Response(JSON.stringify({ competitor: link }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE STATUS ──
    if (action === "update_status") {
      const { company_competitor_id, status } = payload;
      const { data, error } = await supabase
        .from("company_competitors")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", company_competitor_id)
        .eq("user_id", user.id)
        .select("*, competitor:competitors(*)")
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ competitor: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REMOVE ──
    if (action === "remove") {
      const { company_competitor_id } = payload;
      const { error } = await supabase
        .from("company_competitors")
        .delete()
        .eq("id", company_competitor_id)
        .eq("user_id", user.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RECOMMEND ──
    if (action === "recommend") {
      const { industry_tags = [] } = payload;
      const { data, error } = await supabase.rpc("recommend_competitors", {
        _user_id: user.id,
        _industry_tags: industry_tags,
        _limit: 5,
      });

      if (error) throw error;
      return new Response(JSON.stringify({ recommendations: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("manage-competitors error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

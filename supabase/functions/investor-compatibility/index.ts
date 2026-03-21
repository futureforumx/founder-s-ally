import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const {
      investorName, investorDescription, investorStage, investorSector, investorCheckSize,
      investorRecentDeals, investorThesis, investorGeography, enrichmentSource,
      companyName, companySector, companyStage, companyModel, companyDescription, matchScore
    } = await req.json();

    if (!investorName || !companyName) {
      return new Response(
        JSON.stringify({ error: "investorName and companyName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a venture capital compatibility analyst. Given a startup's profile and an investor's profile, write a concise 2-3 sentence compatibility insight for the founder.

Rules:
- Address the founder directly (use "your" not "their")
- Reference specific data points from both profiles (sector, stage, check size, recent deals, thesis, geography)
- If recent deals or thesis data is available, weave it into the insight naturally
- Be specific and data-driven, not generic
- Keep it under 60 words
- Include one actionable suggestion for how the founder should approach this investor
- Do NOT use markdown formatting, just plain text
- Do NOT start with "Your" — vary your sentence openings`;

    const userPrompt = `Startup Profile:
- Company: ${companyName}
- Sector: ${companySector || "Not specified"}
- Stage: ${companyStage || "Not specified"}
- Business Model: ${companyModel || "Not specified"}
- Description: ${companyDescription || "Not specified"}

Investor Profile:
- Firm: ${investorName}
- Focus Sectors: ${investorSector || "Not specified"}
- Stage Preference: ${investorStage || "Not specified"}
- Check Size: ${investorCheckSize || "Not specified"}
- Description: ${investorDescription || "Not specified"}
- Recent Deals: ${investorRecentDeals || "Not available"}
- Current Thesis: ${investorThesis || "Not available"}
- Geography: ${investorGeography || "Not specified"}
- Data Source: ${enrichmentSource || "directory"}
- Current Match Score: ${matchScore ?? "N/A"}%

Write a compatibility insight for this founder about this investor.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited — please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("investor-compatibility error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

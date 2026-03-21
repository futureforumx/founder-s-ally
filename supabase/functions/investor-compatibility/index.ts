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

    const systemPrompt = `You are a venture capital compatibility analyst. Given a startup and investor profile, produce exactly 3 structured compatibility criteria as a JSON array.

Rules:
- Return ONLY a JSON array with exactly 3 objects
- Each object has: "type" ("match" or "warning"), "label" (2-4 word category), "detail" (1 sentence, under 20 words)
- Address the founder directly (use "your")
- Reference specific data points (sector, stage, check size, geography, deals)
- Typically 2 matches and 1 warning, but adjust based on actual compatibility
- Be specific, not generic. Use real numbers and names when available.
- Do NOT wrap in markdown code blocks

Example output:
[{"type":"match","label":"Check Size Fit","detail":"Their $2M-$10M range covers your $3M Seed target perfectly."},{"type":"match","label":"Stage Alignment","detail":"Active Pre-Seed/Seed focus matches your current stage."},{"type":"warning","label":"Sector Gap","detail":"Broad thesis—highlight your AI differentiation early in the pitch."}]`;

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
- Match Score: ${matchScore ?? "N/A"}%

Return exactly 3 structured compatibility criteria as a JSON array.`;

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
        response_format: { type: "json_object" },
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
    const raw = data.choices?.[0]?.message?.content?.trim() || "";

    // Parse the structured response
    let criteria = null;
    try {
      const parsed = JSON.parse(raw);
      // Handle both direct array and wrapped object (e.g., { criteria: [...] })
      if (Array.isArray(parsed)) {
        criteria = parsed;
      } else if (parsed.criteria && Array.isArray(parsed.criteria)) {
        criteria = parsed.criteria;
      } else {
        // Try to find any array value in the object
        for (const val of Object.values(parsed)) {
          if (Array.isArray(val)) {
            criteria = val;
            break;
          }
        }
      }
    } catch {
      console.error("Failed to parse AI JSON response:", raw);
    }

    // Validate structure
    if (criteria && Array.isArray(criteria)) {
      criteria = criteria
        .filter((item: any) => item.type && item.label && item.detail)
        .slice(0, 3)
        .map((item: any) => ({
          type: item.type === "warning" ? "warning" : "match",
          label: String(item.label).slice(0, 30),
          detail: String(item.detail).slice(0, 120),
        }));
    }

    return new Response(
      JSON.stringify({
        criteria: criteria && criteria.length > 0 ? criteria : null,
        // Keep backward compat: also return insight as joined text
        insight: criteria ? criteria.map((c: any) => `${c.label}: ${c.detail}`).join(" ") : raw,
      }),
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

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

    const systemPrompt = `You are a venture capital compatibility analyst. Given a startup and investor profile, produce a structured compatibility breakdown as a JSON object with exactly 4 scored categories.

Rules:
- Return ONLY a JSON object with a "breakdown" array containing exactly 4 objects
- Each object has: "category" (one of: "sector", "stage", "geography", "profile"), "score" (integer 0-100), "type" ("match" if score >= 70, "warning" if score < 70), "detail" (1 sentence, under 20 words)
- "sector": How well the investor's thesis verticals align with the startup's sector
- "stage": How well the investor's stage preference matches the startup's current stage
- "geography": How well the investor's geographic focus aligns with the startup's location/market
- "profile": Overall fit based on check size, business model, thesis, and company-specific factors
- Address the founder directly (use "your")
- Be specific, not generic. Use real numbers and names when available.
- Scores should reflect genuine compatibility: 90+ = excellent fit, 70-89 = good fit, 50-69 = partial fit, below 50 = poor fit
- Do NOT wrap in markdown code blocks

Example output:
{"breakdown":[{"category":"sector","score":92,"type":"match","detail":"Their fintech focus directly aligns with your payments infrastructure."},{"category":"stage","score":85,"type":"match","detail":"Active Seed investor matching your current fundraising stage."},{"category":"geography","score":65,"type":"warning","detail":"Primarily US-focused but your LATAM market may need extra positioning."},{"category":"profile","score":78,"type":"match","detail":"$2M-$8M range covers your $5M target with room for follow-on."}]}`;

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

Return the 4-category scored breakdown as a JSON object.`;

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
    let breakdown = null;
    let legacyCriteria = null;
    try {
      const parsed = JSON.parse(raw);
      // Look for breakdown array
      if (parsed.breakdown && Array.isArray(parsed.breakdown)) {
        breakdown = parsed.breakdown;
      } else if (Array.isArray(parsed)) {
        breakdown = parsed;
      } else {
        for (const val of Object.values(parsed)) {
          if (Array.isArray(val)) {
            breakdown = val;
            break;
          }
        }
      }
    } catch {
      console.error("Failed to parse AI JSON response:", raw);
    }

    // Validate and normalize
    const validCategories = ["sector", "stage", "geography", "profile"];
    if (breakdown && Array.isArray(breakdown)) {
      breakdown = breakdown
        .filter((item: any) => item.category && item.detail && typeof item.score === "number")
        .map((item: any) => ({
          category: validCategories.includes(item.category) ? item.category : "profile",
          score: Math.max(0, Math.min(100, Math.round(item.score))),
          type: item.score >= 70 ? "match" : "warning",
          detail: String(item.detail).slice(0, 120),
        }));

      // Also produce legacy criteria format for backward compat
      legacyCriteria = breakdown.slice(0, 3).map((item: any) => ({
        type: item.type,
        label: item.category.charAt(0).toUpperCase() + item.category.slice(1) + " Alignment",
        detail: item.detail,
      }));
    }

    return new Response(
      JSON.stringify({
        breakdown: breakdown && breakdown.length > 0 ? breakdown : null,
        // Legacy fields for backward compat
        criteria: legacyCriteria,
        insight: breakdown ? breakdown.map((c: any) => `${c.category}: ${c.detail}`).join(" ") : raw,
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

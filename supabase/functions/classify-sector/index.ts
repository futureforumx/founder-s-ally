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
    const { websiteText, executiveSummary, companyName } = await req.json();

    const combinedText = [
      websiteText ? `=== WEBSITE CONTENT ===\n${websiteText}` : "",
      executiveSummary ? `=== EXECUTIVE SUMMARY ===\n${executiveSummary}` : "",
    ].filter(Boolean).join("\n\n");

    if (combinedText.length < 20) {
      return new Response(
        JSON.stringify({ error: "Not enough content to classify sector." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a startup sector classification expert. Given website content and/or an executive summary, classify the company using this exact taxonomy:

Sectors and subsectors:
- Artificial Intelligence: Vertical AI (SaaS), AI Infrastructure & LLMOps, Autonomous Agents, Computer Vision, Natural Language Processing, Generative Media
- Fintech: Payments & Infrastructure, Neobanking, DeFi & Web3 Finance, Insurtech, RegTech & Compliance, Embedded Finance
- Climate & Energy: Carbon Capture & Storage, Renewable Energy (Solar/Wind/Fusion), Battery Tech & Storage, Circular Economy, AgTech & Food Science, Water Tech
- Health & Biotech: Longevity & Anti-Aging, Digital Health & Telemedicine, Biopharmaceuticals, Medical Devices, Genomics, Mental Health Tech
- Enterprise Software: Cybersecurity, DevTools & Open Source, HRTech & Future of Work, MarTech, Supply Chain & Logistics, ERP & CRM
- Deep Tech & Space: Quantum Computing, Space Infrastructure, Satellite Communications, Advanced Materials, Semiconductors, Photonics
- Consumer & Retail: E-commerce & D2C, Gaming & Esport, EdTech, PropTech, Social Media & Creators, AR/VR Platforms

The primary_sector MUST be one of the 7 sectors above. The modern_tags should include the matching subsector(s) plus any additional niche tags.`,
          },
          {
            role: "user",
            content: `Company: ${companyName || "Unknown"}\n\n${combinedText.slice(0, 20000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_sector",
              description: "Return the sector classification for this company",
              parameters: {
                type: "object",
                properties: {
                  primary_sector: {
                    type: "string",
                    enum: ["Artificial Intelligence", "Fintech", "Climate & Energy", "Health & Biotech", "Enterprise Software", "Deep Tech & Space", "Consumer & Retail"],
                    description: "Primary sector from the taxonomy",
                  },
                  modern_tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 tags: matching subsector(s) from taxonomy plus modern niche tags",
                  },
                },
                required: ["primary_sector", "modern_tags"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_sector" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured output");

    const classification = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(classification), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-sector error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

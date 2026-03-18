import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior VC analyst. You will receive text extracted from a company's website and/or pitch deck. Your job is to:

1. Search for these specific financial keywords and extract their values: MRR, Burn Rate, CAC, LTV, Runway
2. Generate an Executive Summary (exactly 150 words) covering the company's business model, market position, and key strengths/risks
3. Produce a Health Score (0-100) based on:
   - Clarity of value proposition (20 pts)
   - Financial metrics presence & health (30 pts)
   - Market positioning & competitive moat (20 pts)
   - Team & execution signals (15 pts)
   - GTM strategy clarity (15 pts)
4. Extract: company header/tagline, core value proposition, and pricing structure if found
5. Also extract these company profile fields if you can find them:
   - businessModel: one of SaaS, Marketplace, E-Commerce, Hardware, Services, Freemium, Usage-Based, Other
   - targetCustomer: one of B2B, B2C, B2B2C, B2G
   - hqLocation: city/state/country
   - competitors: list of direct competitor company names (up to 5)
   - uniqueValueProp: 1-2 sentence unique value proposition
   - currentARR: annual recurring revenue if mentioned
   - yoyGrowth: year-over-year growth percentage
   - totalHeadcount: team size / number of employees
   - description: 1-sentence company description
   - stage: funding stage if mentioned
   - sector: primary sector
6. Semantic Sector Mapping: Analyze the content for domain-specific keywords and map to precise sectors with sub-tags. For example:
   - Keywords like 'Ledger', 'Payment', 'Blockchain', 'Wallet' → Sector: "Fintech", Sub-tag: "Web3 Payments"
   - Keywords like 'EHR', 'Telehealth', 'Patient' → Sector: "Health Tech", Sub-tag: "Digital Health"
   - Keywords like 'LLM', 'Neural', 'Training', 'GPT' → Sector: "AI / ML", Sub-tag: "Foundation Models"
   - Keywords like 'Carbon', 'Solar', 'Emission' → Sector: "Climate Tech", Sub-tag: "Clean Energy"
   Return the sectorMapping with the detected sector, subTag, and the keywords that triggered the mapping.

Be precise. If a metric is not found, return null for it. Write the summary in professional VC language.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { websiteText, deckText, companyName, stage, sector } = await req.json();

    const combinedText = [
      websiteText ? `=== WEBSITE CONTENT ===\n${websiteText}` : "",
      deckText ? `=== PITCH DECK CONTENT ===\n${deckText}` : "",
    ].filter(Boolean).join("\n\n");

    if (combinedText.length < 30) {
      return new Response(
        JSON.stringify({ error: "Not enough content to analyze. Provide a website URL or pitch deck." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const userPrompt = `Company: ${companyName || "Unknown"}
Stage: ${stage || "Unknown"}
Sector: ${sector || "Unknown"}

${combinedText.slice(0, 40000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_analysis",
              description: "Submit the completed company analysis",
              parameters: {
                type: "object",
                properties: {
                  header: { type: "string", description: "Company header/tagline from website" },
                  valueProposition: { type: "string", description: "Core value proposition" },
                  pricingStructure: { type: "string", description: "Pricing tiers/model if found, or null" },
                  executiveSummary: { type: "string", description: "150-word executive summary" },
                  healthScore: { type: "number", description: "Overall health score 0-100" },
                  metrics: {
                    type: "object",
                    properties: {
                      mrr: {
                        type: "object",
                        properties: {
                          value: { type: "string", description: "Monthly Recurring Revenue value or null" },
                          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in this metric extraction" },
                        },
                        required: ["value", "confidence"],
                        additionalProperties: false,
                      },
                      burnRate: {
                        type: "object",
                        properties: {
                          value: { type: "string", description: "Burn rate value or null" },
                          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in this metric extraction" },
                        },
                        required: ["value", "confidence"],
                        additionalProperties: false,
                      },
                      cac: {
                        type: "object",
                        properties: {
                          value: { type: "string", description: "Customer Acquisition Cost or null" },
                          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in this metric extraction" },
                        },
                        required: ["value", "confidence"],
                        additionalProperties: false,
                      },
                      ltv: {
                        type: "object",
                        properties: {
                          value: { type: "string", description: "Lifetime Value or null" },
                          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in this metric extraction" },
                        },
                        required: ["value", "confidence"],
                        additionalProperties: false,
                      },
                      runway: {
                        type: "object",
                        properties: {
                          value: { type: "string", description: "Runway in months or null" },
                          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in this metric extraction" },
                        },
                        required: ["value", "confidence"],
                        additionalProperties: false,
                      },
                    },
                    required: ["mrr", "burnRate", "cac", "ltv", "runway"],
                    additionalProperties: false,
                  },
                  metricTable: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        metric: { type: "string" },
                        value: { type: "string" },
                        benchmark: { type: "string" },
                        status: { type: "string", enum: ["healthy", "warning", "critical"] },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["metric", "value", "benchmark", "status", "confidence"],
                      additionalProperties: false,
                    },
                    description: "Table of key metrics with their values, SaaS benchmarks, health status, and confidence level",
                  },
                  aiExtracted: {
                    type: "object",
                    properties: {
                      businessModel: { type: "string", description: "Business model type" },
                      targetCustomer: { type: "string", description: "B2B, B2C, B2B2C, or B2G" },
                      hqLocation: { type: "string", description: "HQ location" },
                      competitors: { type: "array", items: { type: "string" }, description: "Direct competitors" },
                      uniqueValueProp: { type: "string", description: "Unique value proposition" },
                      currentARR: { type: "string", description: "Current ARR" },
                      yoyGrowth: { type: "string", description: "YoY growth %" },
                      totalHeadcount: { type: "string", description: "Total headcount" },
                      description: { type: "string", description: "1-sentence company description" },
                      stage: { type: "string", description: "Funding stage" },
                      sector: { type: "string", description: "Primary sector" },
                    },
                    additionalProperties: false,
                  },
                  metricSources: {
                    type: "object",
                    description: "For each extracted metric, indicate where it was found. E.g. 'Found on Slide 5 of Pitch Deck' or 'Extracted from website pricing page'. Keys: currentARR, yoyGrowth, totalHeadcount",
                    properties: {
                      currentARR: { type: "string", description: "Source of ARR data" },
                      yoyGrowth: { type: "string", description: "Source of growth data" },
                      totalHeadcount: { type: "string", description: "Source of headcount data" },
                    },
                    additionalProperties: false,
                  },
                },
                required: ["header", "valueProposition", "executiveSummary", "healthScore", "metrics", "metricTable"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured output");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-company error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

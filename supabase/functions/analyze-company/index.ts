import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior VC analyst. You will receive text extracted from a company's website and/or pitch deck. Your job is to:

1. Search for these specific financial keywords and extract their values: MRR, Burn Rate, CAC, LTV, Runway
8. **Investor / Cap Table Extraction**: Parse the pitch deck for any slide mentioning investors, cap table, funding rounds, or backers. For each investor found, extract:
   - investorName: the firm or individual name
   - entityType: one of "Angel", "VC Firm", "Syndicate", "Accelerator", "CVC", "Family Office"
   - instrument: one of "SAFE (Post-money)", "SAFE (Pre-money)", "Convertible Note", "Equity", or other if specified
   - amount: dollar amount invested (0 if not specified)
   - date: date of investment if mentioned (YYYY-MM-DD format)
   - source: "deck" if found in pitch deck text, "web" if inferred from website/news context
   Also look for total funding raised, round names (Seed, Series A, etc.).
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
    - sector: primary sector — IMPORTANT: Prioritize INDUSTRY VERTICAL over business model. A SaaS company serving construction should be "Construction & Real Estate", not "Enterprise Software & SaaS". A fintech tool for healthcare should be "Health & Biotech", not "Fintech". Only use horizontal categories like "Enterprise Software & SaaS" or "Artificial Intelligence" when the company is truly horizontal/platform-agnostic. (MUST be one of: Construction & Real Estate, Industrial & Manufacturing, Enterprise Software & SaaS, Artificial Intelligence, Fintech, Climate & Energy, Health & Biotech, Consumer & Retail, Deep Tech & Space, Defense & GovTech)
6. Semantic Sector Mapping using this taxonomy:
   - Construction & Real Estate: ConTech (Construction Tech), PropTech, Sustainable Materials, Infrastructure & Civil Engineering, Digital Twins & BIM, Residential Construction
   - Industrial & Manufacturing: Industrial Tech (Industry 4.0), Robotics & Automation, Supply Chain Tech, Warehousing Tech, Advanced Manufacturing, 3D Printing
   - Enterprise Software & SaaS: Vertical SaaS, Horizontal SaaS, DevTools & Open Source, Cybersecurity, HRTech, MarTech, LegalTech
   - Artificial Intelligence: Vertical AI Agents, LLMOps & Infrastructure, Computer Vision, Generative Media, AI Safety & Governance, Edge AI
   - Fintech: Embedded Finance, Payments Infrastructure, Insurtech, Real World Asset (RWA) Tokenization, RegTech, WealthTech
   - Climate & Energy: Carbon Capture, Energy Storage, Circular Economy, Grid Optimization, AgTech, Water Tech
   - Health & Biotech: Longevity, Digital Health, MedTech, Biopharma, Genomics, Neurotech
   - Consumer & Retail: E-commerce Infrastructure, Gaming & Interactive, EdTech, Social Commerce, AdTech
   - Deep Tech & Space: Quantum Computing, Space Infrastructure, Satcom, Photonics, Semiconductors
   - Defense & GovTech: Dual-Use Tech, Public Safety, Civic Engagement, National Security, Drones & UAVs
   Return the sectorMapping with the detected sector (from the 10 above), subTag (matching subsector), and the keywords that triggered the mapping.
7. Stage Classification using linguistic heuristics:
   Analyze the deck/website text to classify the company as "Seed" or "Series A" (or other if clearly stated).
   
   Seed Heuristics: Focus on problem/vision, founder pedigrees, MVP/Beta/Design Partners language, LOIs/waitlist/pilots, roadmap about building core product.
   Series A Heuristics: Focus on unit economics/GTM, PMF/Scaling/Repeatable Revenue/Churn/LTV-CAC language, Sales Playbook/Channel Partners, hard MRR/ARR/NRR/Gross Margin data, roadmap about scaling sales/international expansion.
   
   Return stageClassification with detected_stage, confidence_score (0-1), reasoning (cite 2-3 specific phrases), and conflicting_signals.

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
                      sector: { type: "string", enum: ["Construction & Real Estate", "Industrial & Manufacturing", "Enterprise Software & SaaS", "Artificial Intelligence", "Fintech", "Climate & Energy", "Health & Biotech", "Consumer & Retail", "Deep Tech & Space", "Defense & GovTech"], description: "Primary sector from taxonomy — must match exactly one of these canonical names" },
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
                  sectorMapping: {
                    type: "object",
                    description: "Semantic sector mapping based on detected keywords",
                    properties: {
                      sector: { type: "string", description: "Mapped sector (e.g. Fintech, Health Tech)" },
                      subTag: { type: "string", description: "Specific sub-tag (e.g. Web3 Payments, Digital Health)" },
                      keywords: { type: "array", items: { type: "string" }, description: "Keywords that triggered this mapping" },
                    },
                    additionalProperties: false,
                  },
                  stageClassification: {
                    type: "object",
                    description: "Linguistic heuristic-based stage classification",
                    properties: {
                      detected_stage: { type: "string", description: "Seed, Series A, or other detected stage" },
                      confidence_score: { type: "number", description: "Confidence 0.0-1.0" },
                      reasoning: { type: "string", description: "Brief explanation citing 2-3 specific phrases found" },
                      conflicting_signals: { type: "string", description: "Data points that suggest a different stage" },
                    },
                    required: ["detected_stage", "confidence_score", "reasoning"],
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

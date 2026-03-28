import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior VC associate conducting due diligence on a startup pitch deck. Your job is to find every weakness, inconsistency, and red flag that would cause a partner to pass on the deal.

Analyze the pitch deck text provided and return a JSON response with this exact structure:

{
  "companyName": "string - the company name from the deck, or 'Unknown Company' if not found",
  "overallScore": number 0-100 representing investment readiness,
  "flags": [
    {
      "severity": "high" | "medium" | "low",
      "title": "short title of the issue",
      "body": "Associate Note: detailed explanation of why this is a problem, written in first person as a VC associate. Be specific about numbers, claims, or logic gaps you found.",
      "requiredFix": "specific, actionable recommendation to fix this issue",
      "slideRef": "which slide or section this relates to, e.g. 'Slide 04: Financials'"
    }
  ]
}

Rules:
- Find 3-8 flags depending on deck quality
- At least 1 must be high severity
- Be brutally honest but constructive
- Reference specific claims, numbers, or slides from the deck
- If financials are missing or vague, flag it as high severity
- Check for: unrealistic TAM, weak moat, team gaps, inconsistent projections, missing competitive analysis, unclear GTM, inflated metrics
- Write like a real associate who has seen 500+ decks`;

type AuditFlag = {
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  requiredFix: string;
  slideRef: string;
};

type AuditResult = {
  companyName: string;
  overallScore: number;
  flags: AuditFlag[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function extractCompanyName(deckText: string): string {
  const labeledMatch = deckText.match(/(?:company|startup|venture)\s*name\s*[:\-]\s*([^\n]+)/i);
  if (labeledMatch?.[1]) return labeledMatch[1].trim().slice(0, 80);

  const lines = deckText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[slide\s+\d+\]$/i.test(line));

  const firstTitleish = lines.find((line) => line.length <= 80 && /^[A-Z0-9][A-Za-z0-9&,. '\-]{1,79}$/.test(line));
  return firstTitleish || "Unknown Company";
}

function findSlideRef(deckText: string, patterns: RegExp[], fallback: string): string {
  const slidePattern = /\[Slide\s+(\d+)\]([\s\S]*?)(?=\[Slide\s+\d+\]|$)/gi;
  for (const match of deckText.matchAll(slidePattern)) {
    const slideNum = match[1];
    const content = match[2] || "";
    if (patterns.some((pattern) => pattern.test(content))) {
      return `Slide ${slideNum.padStart(2, "0")}`;
    }
  }
  return fallback;
}

function buildHeuristicAudit(deckText: string): AuditResult {
  const companyName = extractCompanyName(deckText);
  const normalized = deckText.toLowerCase();
  const flags: AuditFlag[] = [];
  let score = 78;

  const addFlag = (flag: AuditFlag, penalty: number) => {
    flags.push(flag);
    score -= penalty;
  };

  const hasFinancials = /(arr|mrr|revenue|runway|burn|gross margin|ebitda|cash)/i.test(deckText);
  const hasTraction = /(customers|logos|pipeline|retention|growth|churn|bookings|gmv|usage)/i.test(deckText);
  const hasMarket = /(tam|sam|som|market size|\$\d+[mbk]?|billion|million)/i.test(deckText);
  const hasCompetition = /(competitor|competition|alternative|vs\.?|g2|gartner|quadrant)/i.test(deckText);
  const hasTeam = /(founder|co-founder|team|ceo|cto|cpo|leadership)/i.test(deckText);
  const hasGtm = /(go-to-market|gtm|sales|channel|pipeline|plg|outbound|partnerships|distribution|cac)/i.test(deckText);

  if (!hasFinancials) {
    addFlag(
      {
        severity: "high",
        title: "Financial proof is missing",
        body: "Associate Note: I do not see concrete revenue, burn, runway, or unit-economics evidence in this deck. Without operating metrics, I cannot underwrite whether the company is compounding or simply telling a story.",
        requiredFix: "Add a dedicated metrics slide with current ARR/MRR, growth, burn, runway, gross margin, and a short note on how each number is measured.",
        slideRef: findSlideRef(deckText, [/arr/i, /mrr/i, /revenue/i, /financial/i], "Financials section"),
      },
      18,
    );
  }

  if (!hasTraction) {
    addFlag(
      {
        severity: "high",
        title: "Traction claims are not substantiated",
        body: "Associate Note: The deck does not give me enough evidence that customers are pulling the product through the market. I need customer count, growth, retention, pipeline quality, or another proof point that demand is real and repeatable.",
        requiredFix: "Show 2-4 traction metrics with dates, plus one customer proof point such as logos, case-study outcomes, or retention curves.",
        slideRef: findSlideRef(deckText, [/customer/i, /traction/i, /growth/i, /retention/i], "Traction section"),
      },
      14,
    );
  }

  if (!hasMarket) {
    addFlag(
      {
        severity: "medium",
        title: "Market sizing lacks rigor",
        body: "Associate Note: I am not seeing a defensible market model. If TAM exists in the deck, it is not grounded in a bottoms-up explanation I can trust. Hand-wavy market size claims are one of the fastest ways to lose confidence.",
        requiredFix: "Replace broad market claims with a bottoms-up SOM/SAM/TAM model that ties directly to the buyer, pricing, and reachable distribution channels.",
        slideRef: findSlideRef(deckText, [/tam/i, /sam/i, /som/i, /market/i], "Market slide"),
      },
      10,
    );
  }

  if (!hasCompetition) {
    addFlag(
      {
        severity: "medium",
        title: "Competitive landscape is underdeveloped",
        body: "Associate Note: This deck does not convince me the team has a sharp view of incumbent alternatives, direct competitors, or why this wedge wins. If the market is attractive, competition is never truly absent.",
        requiredFix: "Add a competition slide that names credible alternatives, explains switching behavior, and makes the moat legible in one glance.",
        slideRef: findSlideRef(deckText, [/compet/i, /alternative/i, /vs\.?/i], "Competition section"),
      },
      9,
    );
  }

  if (!hasTeam) {
    addFlag(
      {
        severity: "medium",
        title: "Team credibility is hard to assess",
        body: "Associate Note: I do not have enough information on why this specific team is uniquely suited to win. At early stage, founder-market fit is often the entire bet, and the deck is not making that case clearly.",
        requiredFix: "Add short founder bios with relevant wins, domain expertise, and one sentence on why the team has an unfair right to build this company.",
        slideRef: findSlideRef(deckText, [/team/i, /founder/i, /ceo/i, /cto/i], "Team slide"),
      },
      8,
    );
  }

  if (!hasGtm) {
    addFlag(
      {
        severity: "medium",
        title: "Go-to-market plan is vague",
        body: "Associate Note: I cannot tell how this company acquires customers predictably. Product quality alone is not a distribution strategy, and the current deck leaves too much ambiguity around acquisition motion and sales efficiency.",
        requiredFix: "Spell out the primary acquisition channels, sales motion, average deal cycle, and why customer acquisition should stay efficient as you scale.",
        slideRef: findSlideRef(deckText, [/go-to-market/i, /gtm/i, /sales/i, /channel/i, /cac/i], "GTM slide"),
      },
      8,
    );
  }

  if (flags.length < 3) {
    addFlag(
      {
        severity: "low",
        title: "Narrative could be sharper",
        body: "Associate Note: The core story is present, but the deck would benefit from tighter sequencing between problem, solution, traction, and the ask. Right now I have to do some of the synthesis work myself.",
        requiredFix: "Tighten slide transitions so each claim naturally earns the next one, and make the fundraising ask explicitly tied to near-term milestones.",
        slideRef: "Overall narrative",
      },
      4,
    );
  }

  return {
    companyName,
    overallScore: clampScore(score),
    flags: flags.slice(0, 8),
  };
}

function tryParseJsonBlock(value: string): AuditResult | null {
  try {
    return JSON.parse(value) as AuditResult;
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (!fenced) return null;
    try {
      return JSON.parse(fenced) as AuditResult;
    } catch {
      return null;
    }
  }
}

function extractAuditResult(payload: any): AuditResult | null {
  const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return tryParseJsonBlock(toolCall.function.arguments);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return tryParseJsonBlock(content);
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item?.text === "string") {
        const parsed = tryParseJsonBlock(item.text);
        if (parsed) return parsed;
      }
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deckText } = await req.json();

    if (!deckText || typeof deckText !== "string" || deckText.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Deck text is too short or missing. Please upload a valid pitch deck." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.warn("audit-deck: LOVABLE_API_KEY missing, returning heuristic fallback audit");
      return new Response(JSON.stringify(buildHeuristicAudit(deckText)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Here is the pitch deck content to analyze:\n\n${deckText.slice(0, 30000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_audit_report",
              description: "Submit the completed due diligence audit report",
              parameters: {
                type: "object",
                properties: {
                  companyName: { type: "string" },
                  overallScore: { type: "number", minimum: 0, maximum: 100 },
                  flags: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        severity: { type: "string", enum: ["high", "medium", "low"] },
                        title: { type: "string" },
                        body: { type: "string" },
                        requiredFix: { type: "string" },
                        slideRef: { type: "string" },
                      },
                      required: ["severity", "title", "body", "requiredFix", "slideRef"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["companyName", "overallScore", "flags"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_audit_report" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify(buildHeuristicAudit(deckText)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const auditResult = extractAuditResult(data) ?? buildHeuristicAudit(deckText);

    return new Response(JSON.stringify(auditResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("audit-deck error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

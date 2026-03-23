import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Tier-1 authority sources get 1.5× weight ──
const TIER1_SOURCES = ["financial times", "ft.com", "cnbc", "wired", "bloomberg"];

interface MentionResult {
  source: string;
  title: string;
  snippet: string;
  sentiment: number; // -1.0 to 1.0
  isTier1: boolean;
}

interface SentimentSummary {
  score: number; // -1.0 to 1.0
  mentions: MentionResult[];
  summary: string;
}

// ── Mock mention fetcher (simulates TechCrunch, FT, X mentions) ──
function mockFetchMentions(firmName: string): MentionResult[] {
  const hash = firmName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const seed = (hash % 100) / 100;

  const newsSources = [
    { source: "TechCrunch", tier1: false },
    { source: "Financial Times", tier1: true },
    { source: "CNBC", tier1: true },
    { source: "Wired", tier1: true },
    { source: "The Information", tier1: false },
    { source: "Bloomberg", tier1: true },
    { source: "VentureBeat", tier1: false },
  ];

  const socialSources = [
    { source: "X / Twitter", tier1: false },
    { source: "Reddit r/startups", tier1: false },
    { source: "Reddit r/venturecapital", tier1: false },
    { source: "LinkedIn", tier1: false },
  ];

  const allSources = [...newsSources, ...socialSources];
  const count = 3 + Math.floor(seed * 5);

  return Array.from({ length: count }, (_, i) => {
    const src = allSources[(hash + i * 7) % allSources.length];
    const rawSentiment = ((hash * (i + 1) * 17) % 200 - 100) / 100;
    return {
      source: src.source,
      title: `${firmName} ${rawSentiment > 0 ? "leads major deal" : "faces market headwinds"} — ${src.source}`,
      snippet: `Coverage of ${firmName}'s latest activities and market position.`,
      sentiment: Math.round(rawSentiment * 100) / 100,
      isTier1: src.tier1,
    };
  });
}

// ── LLM-powered sentiment summarization ──
async function summarizeSentiment(
  firmName: string,
  mentions: MentionResult[],
  type: "news" | "social"
): Promise<SentimentSummary> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!LOVABLE_API_KEY) {
    // Fallback: compute from raw mentions without LLM
    return computeRawSentiment(mentions);
  }

  const mentionText = mentions
    .map((m, i) => `${i + 1}. [${m.source}${m.isTier1 ? " (Tier-1)" : ""}] "${m.title}" — raw sentiment: ${m.sentiment}`)
    .join("\n");

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a financial sentiment analyst. Given ${type} mentions about a VC firm, produce a JSON object with:
- "score": a number between -1.0 and 1.0 representing overall sentiment (positive = good reputation)
- "summary": a 1-2 sentence summary of the coverage tone

IMPORTANT: Tier-1 sources (FT, CNBC, Wired, Bloomberg) should carry 1.5× weight in your assessment.
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Analyze the following ${type} mentions for "${firmName}":\n\n${mentionText}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_sentiment",
              description: "Report the sentiment analysis result",
              parameters: {
                type: "object",
                properties: {
                  score: { type: "number", description: "Sentiment score from -1.0 to 1.0" },
                  summary: { type: "string", description: "1-2 sentence summary of coverage tone" },
                },
                required: ["score", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_sentiment" } },
      }),
    });

    if (!response.ok) {
      console.error("LLM API error:", response.status, await response.text());
      return computeRawSentiment(mentions);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return {
        score: Math.max(-1, Math.min(1, parsed.score)),
        mentions,
        summary: parsed.summary || "Analysis complete.",
      };
    }

    return computeRawSentiment(mentions);
  } catch (err) {
    console.error("LLM summarization failed:", err);
    return computeRawSentiment(mentions);
  }
}

// ── Fallback: weighted average with tier-1 authority factor ──
function computeRawSentiment(mentions: MentionResult[]): SentimentSummary {
  if (mentions.length === 0) return { score: 0, mentions, summary: "No mentions found." };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const m of mentions) {
    const weight = m.isTier1 ? 1.5 : 1.0;
    weightedSum += m.sentiment * weight;
    totalWeight += weight;
  }

  const score = Math.round((weightedSum / totalWeight) * 100) / 100;
  return {
    score: Math.max(-1, Math.min(1, score)),
    mentions,
    summary: `Computed from ${mentions.length} mentions (${mentions.filter((m) => m.isTier1).length} Tier-1 sources).`,
  };
}

// ── Reputation formula ──
function calculateReputation(
  communityRating: number | null,
  socialScore: number,
  newsScore: number
): { score: number; weights: { community: number; social: number; news: number } } {
  // Normalize sentiment scores from [-1, 1] to [0, 100]
  const normalizedSocial = ((socialScore + 1) / 2) * 100;
  const normalizedNews = ((newsScore + 1) / 2) * 100;

  let wCommunity = 0.4;
  let wSocial = 0.3;
  let wNews = 0.3;

  if (communityRating == null) {
    // Fallback: redistribute community weight equally
    wCommunity = 0;
    wSocial = 0.5;
    wNews = 0.5;
  }

  const score =
    (communityRating != null ? communityRating * wCommunity : 0) +
    normalizedSocial * wSocial +
    normalizedNews * wNews;

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    weights: { community: wCommunity, social: wSocial, news: wNews },
  };
}

// ── Main handler ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Accept optional firm_id to recalculate a single firm, otherwise batch all
    let firmIds: string[] = [];
    try {
      const body = await req.json();
      if (body?.firm_id) firmIds = [body.firm_id];
      if (body?.firm_ids) firmIds = body.firm_ids;
    } catch {
      // No body = batch all
    }

    // Fetch firms to process
    let query = supabase.from("investor_database").select("id, firm_name, community_rating, founder_reputation_score");
    if (firmIds.length > 0) {
      query = query.in("id", firmIds);
    } else {
      // Batch: process firms not updated in last 24h (or never updated)
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.or(`reputation_updated_at.is.null,reputation_updated_at.lt.${cutoff}`).limit(50);
    }

    const { data: firms, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (!firms || firms.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No firms to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${firms.length} firms for reputation calculation`);

    const results: Array<{ firm_id: string; firm_name: string; reputation_score: number }> = [];

    for (const firm of firms) {
      try {
        // 1. Fetch mock mentions
        const allMentions = mockFetchMentions(firm.firm_name);
        const newsMentions = allMentions.filter(
          (m) => !["X / Twitter", "Reddit r/startups", "Reddit r/venturecapital", "LinkedIn"].includes(m.source)
        );
        const socialMentions = allMentions.filter((m) =>
          ["X / Twitter", "Reddit r/startups", "Reddit r/venturecapital", "LinkedIn"].includes(m.source)
        );

        // 2. LLM-powered sentiment summarization
        const newsSentiment = await summarizeSentiment(firm.firm_name, newsMentions, "news");
        const socialSentiment = await summarizeSentiment(firm.firm_name, socialMentions, "social");

        // 3. Use existing community_rating or founder_reputation_score as community input
        const communityRating = (firm as any).community_rating ?? (firm as any).founder_reputation_score ?? null;

        // 4. Calculate weighted reputation
        const { score, weights } = calculateReputation(communityRating, socialSentiment.score, newsSentiment.score);

        // 5. Update investor_database
        await supabase
          .from("investor_database")
          .update({
            news_sentiment_score: newsSentiment.score,
            social_sentiment_score: socialSentiment.score,
            reputation_score: score,
            founder_reputation_score: score,
            reputation_updated_at: new Date().toISOString(),
          })
          .eq("id", firm.id);

        // 6. Insert log entry
        await supabase.from("reputation_logs").insert({
          firm_id: firm.id,
          reputation_score: score,
          news_sentiment_score: newsSentiment.score,
          social_sentiment_score: socialSentiment.score,
          community_rating: communityRating,
          weight_community: weights.community,
          weight_social: weights.social,
          weight_news: weights.news,
          source_details: {
            news: { summary: newsSentiment.summary, mention_count: newsMentions.length },
            social: { summary: socialSentiment.summary, mention_count: socialMentions.length },
          },
        });

        results.push({ firm_id: firm.id, firm_name: firm.firm_name, reputation_score: score });

        // Small delay between firms to avoid rate limits
        await new Promise((r) => setTimeout(r, 500));
      } catch (firmErr) {
        console.error(`Error processing ${firm.firm_name}:`, firmErr);
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("calculate-reputation error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALPHA_RAPIDAPI_HOST = "alpha-vantage.p.rapidapi.com";

interface MarketHeadline {
  title: string;
  summary: string;
  relevance: string;
}

function benchmarkTickerForSector(sector: string): string {
  const s = sector.toLowerCase();
  if (s.includes("fintech") || s.includes("finance") || s.includes("payment")) return "PYPL";
  if (s.includes("health") || s.includes("biotech") || s.includes("medtech")) return "UNH";
  if (s.includes("climate") || s.includes("energy") || s.includes("carbon")) return "NEE";
  if (s.includes("consumer") || s.includes("retail") || s.includes("e-commerce")) return "AMZN";
  if (s.includes("ai") || s.includes("machine learning")) return "NVDA";
  return "MSFT";
}

async function fetchHeadlinesFromLovable(sector: string, apiKey: string): Promise<{
  headlines: MarketHeadline[] | null;
  status?: number;
  clientMessage?: string;
}> {
  const today = new Date().toISOString().split("T")[0];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: "You are a market intelligence analyst. Return ONLY valid JSON, no markdown.",
        },
        {
          role: "user",
          content: `Generate 3 realistic and current market headlines relevant to the "${sector}" sector as of ${today}. Include regulatory changes, competitor fundraising, and emerging trends.

Return JSON: { "headlines": [{ "title": "...", "summary": "One sentence summary", "relevance": "Why this matters for ${sector} founders" }] }`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "market_headlines",
            description: "Return market headlines for a sector",
            parameters: {
              type: "object",
              properties: {
                headlines: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      summary: { type: "string" },
                      relevance: { type: "string" },
                    },
                    required: ["title", "summary", "relevance"],
                  },
                },
              },
              required: ["headlines"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "market_headlines" } },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    let clientMessage: string | undefined;
    if (response.status === 429) clientMessage = "Rate limit exceeded. Please try again later.";
    if (response.status === 402) clientMessage = "AI credits exhausted. Please add funds.";
    return { headlines: null, status: response.status, clientMessage };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  let headlines: MarketHeadline[] | undefined;

  try {
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      headlines = parsed.headlines;
    } else {
      const content = data.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      headlines = parsed.headlines;
    }
  } catch (e) {
    console.warn("Failed to parse Lovable tool response:", e);
    return { headlines: null };
  }

  if (!Array.isArray(headlines) || headlines.length === 0) {
    return { headlines: null };
  }

  return { headlines };
}

function parseAlphaVantageDaily(data: unknown): { date: string; close: number; high: number; low: number }[] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.Note || d.Information || d["Error Message"]) {
    return null;
  }
  const raw = d["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined;
  if (!raw || typeof raw !== "object") return null;

  return Object.entries(raw)
    .map(([date, bar]) => ({
      date,
      close: parseFloat(bar["4. close"] ?? ""),
      high: parseFloat(bar["2. high"] ?? ""),
      low: parseFloat(bar["3. low"] ?? ""),
    }))
    .filter((x) => !Number.isNaN(x.close))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function buildHeadlinesFromTimeSeries(
  series: { date: string; close: number; high: number; low: number }[],
  sector: string,
  symbol: string,
): MarketHeadline[] | null {
  if (series.length < 2) return null;

  const latest = series[0];
  const prev = series[1];
  const dayPct = prev.close ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const fmtUsd = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const fiveBack = series[Math.min(5, series.length - 1)];
  const weekPct = fiveBack.close ? ((latest.close - fiveBack.close) / fiveBack.close) * 100 : 0;

  const window = series.slice(0, Math.min(5, series.length));
  const hi = Math.max(...window.map((b) => b.high));
  const lo = Math.min(...window.map((b) => b.low));

  return [
    {
      title: `${symbol} daily move: ${fmtPct(dayPct)} (${latest.date})`,
      summary: `${symbol} closed at ${fmtUsd(latest.close)} versus ${fmtUsd(prev.close)} on the prior session.`,
      relevance: `Large-cap benchmarks often shape ${sector} sentiment; watch ${symbol} as a loose public-market pulse for your space.`,
    },
    {
      title: `5-session performance: ${symbol} ${fmtPct(weekPct)}`,
      summary: `Versus five trading days ago (${fiveBack.date}), ${symbol} is ${weekPct >= 0 ? "up" : "down"} ${Math.abs(weekPct).toFixed(2)}% on a closing basis.`,
      relevance: `Short-term trends in ${symbol} can echo risk appetite relevant to ${sector} fundraising and valuations.`,
    },
    {
      title: `Recent range (${window.length} sessions): ${fmtUsd(lo)} – ${fmtUsd(hi)}`,
      summary: `High–low band over the latest compact window shows realized volatility investors are pricing.`,
      relevance: `For ${sector} founders, public comparables’ volatility hints at how markets may discount growth narratives.`,
    },
  ];
}

async function fetchHeadlinesFromAlphaVantage(
  sector: string,
  symbol: string,
  rapidApiKey: string,
): Promise<MarketHeadline[] | null> {
  const url = new URL(`https://${ALPHA_RAPIDAPI_HOST}/query`);
  url.searchParams.set("function", "TIME_SERIES_DAILY");
  url.searchParams.set("symbol", symbol.toUpperCase());
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("datatype", "json");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": ALPHA_RAPIDAPI_HOST,
      "x-rapidapi-key": rapidApiKey,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("Alpha Vantage (RapidAPI) HTTP error:", response.status, data);
    return null;
  }

  const series = parseAlphaVantageDaily(data);
  if (!series) {
    console.warn("Alpha Vantage: no daily series or rate-limit note", data);
    return null;
  }

  return buildHeadlinesFromTimeSeries(series, sector, symbol.toUpperCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sector = typeof body.sector === "string" ? body.sector.trim() : "";
    const symbolRaw = typeof body.symbol === "string" ? body.symbol.trim() : "";
    const symbol = symbolRaw || benchmarkTickerForSector(sector);

    if (!sector) {
      return new Response(
        JSON.stringify({ error: "Sector is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");

    let headlines: MarketHeadline[] | null = null;
    let source: "lovable" | "alpha_vantage" = "lovable";
    let lovableClientError: { status: number; message: string } | null = null;

    if (LOVABLE_API_KEY) {
      const lov = await fetchHeadlinesFromLovable(sector, LOVABLE_API_KEY);
      if (lov.headlines?.length) {
        headlines = lov.headlines;
        source = "lovable";
      } else if (lov.status === 429) {
        lovableClientError = { status: 429, message: lov.clientMessage || "Rate limit exceeded. Please try again later." };
      } else if (lov.status === 402) {
        lovableClientError = { status: 402, message: lov.clientMessage || "AI credits exhausted. Please add funds." };
      }
    }

    if (!headlines?.length && RAPIDAPI_KEY) {
      const av = await fetchHeadlinesFromAlphaVantage(sector, symbol, RAPIDAPI_KEY);
      if (av?.length) {
        headlines = av;
        source = "alpha_vantage";
      }
    }

    if (!headlines?.length) {
      if (lovableClientError) {
        return new Response(JSON.stringify({ error: lovableClientError.message }), {
          status: lovableClientError.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          error:
            !LOVABLE_API_KEY && !RAPIDAPI_KEY
              ? "Market updates not configured (set LOVABLE_API_KEY and/or RAPIDAPI_KEY for Alpha Vantage backup)"
              : "Failed to fetch market updates (AI and Alpha Vantage backup both unavailable)",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ headlines, source }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("market-updates error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

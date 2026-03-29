import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ──

interface RawArticle {
  title: string;
  url: string;
  source_name: string;
  published_at: string;
  content_snippet: string;
  tags: string[];
  og_image_url: string | null;
}

interface UpdateCard {
  type: "Fund news" | "Investment" | "Team update" | "Thesis / Insight" | "Product update" | "Press / Media" | "Other";
  display_source: string;
  display_date: string;
  title: string;
  subtitle: string;
  why_it_matters: string;
  url: string;
  image_url: string | null;
  estimated_read_time_minutes: number;
  impact_level: "high" | "medium" | "low";
  display_tags: string[];
}

// ── System prompt for AI article enrichment ──

const SYSTEM_PROMPT = `You are an assistant that turns raw article metadata into rich, scannable update cards for a startup founder intelligence app.
You receive, per article:
- title
- url
- source_name (e.g., Medium, Firm blog, TechCrunch)
- published_at (ISO string)
- content_snippet (plain text, may be long)
- tags (array of strings, may be empty)
- og_image_url (may be null)
Your goals:
1. Make each update feel like a modern, rich card.
2. Be founder-centric: highlight why this matters to a startup founder evaluating or working with this investor.
3. Keep output structured JSON, no commentary.
For EACH article, you must:
- Classify a concise type from:
  - "Fund news"
  - "Investment"
  - "Team update"
  - "Thesis / Insight"
  - "Product update"
  - "Press / Media"
  - "Other"
- Generate:
  - display_source (short label like "Medium", "Firm blog", "TechCrunch")
  - display_date (short, e.g., "Mar 27, 2026")
  - title
  - subtitle (1 sentence max, plain English)
  - why_it_matters (1 short sentence for founders)
  - estimated_read_time_minutes (integer)
  - impact_level from: "high", "medium", "low"
- Image:
  - If og_image_url is non-empty and looks valid, set image_url to it.
  - Otherwise set image_url to null.
- Tags:
  - Create a small array display_tags (max 3) of short chips, e.g.:
    - "Funding", "Series B", "New fund", "Hiring", "Thesis", "Portfolio win".
  - Derive from content and input tags.
Impact guidelines:
- Mark as high when:
  - new fund raised, large investment, major hire, big partnership, or significant product/strategy shift.
- Mark as medium for most posts with some strategic value.
- Mark as low for light commentary or minor mentions.
Output format:
Given an array articles, return:
{
  "cards": [
    {
      "type": "Fund news",
      "display_source": "Firm blog",
      "display_date": "Mar 27, 2026",
      "title": "...",
      "subtitle": "...",
      "why_it_matters": "...",
      "url": "...",
      "image_url": "https://...",
      "estimated_read_time_minutes": 4,
      "impact_level": "high",
      "display_tags": ["Funding", "New fund"]
    }
  ]
}
Rules:
- Always return valid JSON.
- Do not include any explanations outside the JSON.
- Keep subtitle and why_it_matters very short and skimmable.`;

// ── Signal type → article tag mapping ──

const SIGNAL_TYPE_TAGS: Record<string, string[]> = {
  RECENT_INVESTMENT: ["Investment", "Portfolio"],
  HIRE: ["Hiring", "Team"],
  DEPARTURE: ["Team", "Leadership"],
  BLOG_POST: ["Insight", "Content"],
  EVENT: ["Event", "Speaking"],
  DEPLOYMENT_UPDATE: ["Fund news", "Strategy"],
  OTHER: [],
};

// ── Format date for display ──

function formatDisplayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Fallback cards if AI unavailable ──

function buildFallbackCards(articles: RawArticle[]): UpdateCard[] {
  return articles.map((a) => ({
    type: "Other" as const,
    display_source: a.source_name || "Source",
    display_date: formatDisplayDate(a.published_at),
    title: a.title,
    subtitle: a.content_snippet?.slice(0, 120) || "",
    why_it_matters: "Review this update to stay informed on this investor's activity.",
    url: a.url,
    image_url: a.og_image_url || null,
    estimated_read_time_minutes: Math.max(1, Math.round((a.content_snippet?.split(" ").length || 200) / 200)),
    impact_level: "medium" as const,
    display_tags: a.tags?.slice(0, 3) || [],
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firmId, firmName } = await req.json();

    if (!firmId && !firmName) {
      return new Response(
        JSON.stringify({ error: "firmId or firmName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ── 1. Resolve firm ID if only name was given ──
    let resolvedFirmId = firmId;
    if (!resolvedFirmId && firmName) {
      const { data: firmRows } = await admin
        .from("investor_database")
        .select("id")
        .ilike("firm_name", firmName.trim())
        .limit(1);
      resolvedFirmId = firmRows?.[0]?.id ?? null;
    }

    // ── 2. Query signals (vc_signals) for this firm ──
    let rawArticles: RawArticle[] = [];

    if (resolvedFirmId) {
      const { data: signals } = await admin
        .from("vc_signals")
        .select("id, title, url, description, signal_date, source_type, signal_type, metadata")
        .eq("firm_id", resolvedFirmId)
        .not("title", "is", null)
        .order("signal_date", { ascending: false })
        .limit(20);

      if (signals && signals.length > 0) {
        rawArticles = signals.map((s: any) => {
          const meta = s.metadata ?? {};
          return {
            title: s.title ?? "",
            url: s.url ?? meta.url ?? "",
            source_name: s.source_type ?? meta.source_name ?? "Investor update",
            published_at: s.signal_date ?? new Date().toISOString(),
            content_snippet: s.description ?? meta.excerpt ?? meta.summary ?? "",
            tags: [
              ...(SIGNAL_TYPE_TAGS[s.signal_type] ?? []),
              ...(meta.tags ?? []),
            ],
            og_image_url: meta.og_image_url ?? meta.image_url ?? null,
          };
        });
      }
    }

    // ── 3. Return empty if no signals found ──
    if (rawArticles.length === 0) {
      return new Response(
        JSON.stringify({ cards: [], source: "empty" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Enrich via AI ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      // No AI key — return fallback cards
      return new Response(
        JSON.stringify({ cards: buildFallbackCards(rawArticles), source: "fallback" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ articles: rawArticles }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI gateway error:", aiResponse.status);
      // Fallback: return unprocessed cards
      return new Response(
        JSON.stringify({ cards: buildFallbackCards(rawArticles), source: "fallback" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const raw = aiData.choices?.[0]?.message?.content?.trim() || "{}";

    let cards: UpdateCard[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.cards)) {
        cards = parsed.cards;
      } else if (Array.isArray(parsed)) {
        cards = parsed;
      }
    } catch {
      console.error("Failed to parse AI response:", raw.slice(0, 200));
      cards = buildFallbackCards(rawArticles);
    }

    // ── 5. Validate & sanitize cards ──
    const validTypes = ["Fund news", "Investment", "Team update", "Thesis / Insight", "Product update", "Press / Media", "Other"];
    const validImpact = ["high", "medium", "low"];

    cards = cards
      .filter((c: any) => c && typeof c.title === "string" && c.title.length > 0)
      .map((c: any, i: number) => ({
        type: validTypes.includes(c.type) ? c.type : "Other",
        display_source: String(c.display_source || rawArticles[i]?.source_name || "Source").slice(0, 40),
        display_date: String(c.display_date || formatDisplayDate(rawArticles[i]?.published_at || new Date().toISOString())).slice(0, 20),
        title: String(c.title).slice(0, 200),
        subtitle: String(c.subtitle || "").slice(0, 200),
        why_it_matters: String(c.why_it_matters || "").slice(0, 200),
        url: String(c.url || rawArticles[i]?.url || "").slice(0, 500),
        image_url: typeof c.image_url === "string" && c.image_url.startsWith("http") ? c.image_url : null,
        estimated_read_time_minutes: typeof c.estimated_read_time_minutes === "number"
          ? Math.max(1, Math.min(30, c.estimated_read_time_minutes))
          : 3,
        impact_level: validImpact.includes(c.impact_level) ? c.impact_level : "medium",
        display_tags: Array.isArray(c.display_tags)
          ? c.display_tags.slice(0, 3).map((t: any) => String(t).slice(0, 25))
          : [],
      }));

    return new Response(
      JSON.stringify({ cards, source: "ai" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("investor-updates error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

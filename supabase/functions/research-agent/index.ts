import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  runResearchPipeline,
  type ResearchMode,
  type SearchProfile,
} from "../_shared/research-pipeline.ts";

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
    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mode: ResearchMode = body.mode === "chat" ? "chat" : "reason";
    const searchProfile: SearchProfile =
      body.searchProfile === "exa" || body.searchProfile === "tavily" || body.searchProfile === "auto"
        ? body.searchProfile
        : "auto";
    const maxUrlReads = typeof body.maxUrlReads === "number" ? Math.min(3, Math.max(0, body.maxUrlReads)) : 3;

    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    const exaKey = Deno.env.get("EXA_API_KEY");
    const jinaKey = Deno.env.get("JINA_API_KEY");
    const scrapelessToken = Deno.env.get("SCRAPELESS_API_TOKEN");
    const scrapelessActor = Deno.env.get("SCRAPELESS_ACTOR");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!tavilyKey && !exaKey) {
      return new Response(
        JSON.stringify({
          error: "Configure at least one of TAVILY_API_KEY or EXA_API_KEY for web search.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "chat" && !groqKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY is required when mode is \"chat\"." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "reason" && !lovableKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is required when mode is \"reason\" (Gemini)." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await runResearchPipeline({
      query,
      mode,
      searchProfile,
      maxUrlReads,
      tavilyKey: tavilyKey || undefined,
      exaKey: exaKey || undefined,
      jinaKey: jinaKey || undefined,
      scrapelessToken: scrapelessToken || undefined,
      scrapelessActor: scrapelessActor || undefined,
      groqKey: groqKey || undefined,
      lovableKey: lovableKey || undefined,
    });

    return new Response(
      JSON.stringify({
        ...result,
        strategy: {
          search: "Tavily default; Exa for document/similar-company intents or Tavily empty",
          read: "Jina Reader → Scrapeless on 403/access denied (if SCRAPELESS_* set)",
          rerank: jinaKey ? "Jina reranker → top 3" : "top 3 by order (set JINA_API_KEY to enable rerank)",
          llm: mode === "chat" ? "Groq fast chat" : "Gemini 2.5 Pro (reasoning) via Lovable gateway",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("research-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

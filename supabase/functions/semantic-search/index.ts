import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SemanticCategory = "founder" | "investor" | "company" | "operator";

/** Bing Web Search v7 — SERP-style backup when the AI gateway is down or returns nothing. */
async function bingWebSearchPages(
  q: string,
  subscriptionKey: string,
  count: number,
): Promise<Array<{ name: string; url: string; snippet: string }>> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", q);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));
  url.searchParams.set("mkt", "en-US");
  url.searchParams.set("safeSearch", "Moderate");

  const resp = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": subscriptionKey },
  });
  if (!resp.ok) {
    console.warn("Bing Web Search (semantic-search backup):", resp.status);
    return [];
  }
  const data = (await resp.json()) as {
    webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
  };
  const values = data?.webPages?.value;
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => ({
      name: (v.name || v.url || "Result").trim(),
      url: (v.url || "").trim(),
      snippet: (v.snippet || "").trim(),
    }))
    .filter((v) => v.name && v.url);
}

function defaultCategoryForScope(scope: string): SemanticCategory {
  if (scope === "founders") return "founder";
  if (scope === "investors") return "investor";
  if (scope === "operators") return "operator";
  return "company";
}

function mapBingPagesToSemanticResults(
  pages: Array<{ name: string; url: string; snippet: string }>,
  scope: string,
): Array<{ name: string; subtitle: string; category: SemanticCategory; matchReason: string }> {
  const category = defaultCategoryForScope(scope);
  return pages.slice(0, 8).map((p) => ({
    name: p.name.length > 100 ? `${p.name.slice(0, 97)}…` : p.name,
    subtitle: p.snippet ? (p.snippet.length > 140 ? `${p.snippet.slice(0, 137)}…` : p.snippet) : p.url,
    category,
    matchReason: `Web search result · ${p.url}`,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, scope } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const BING_KEY = Deno.env.get("BING_SEARCH_API_KEY");

    const validScopes = ["founders", "investors", "companies", "operators", "all"];
    const safeScope = validScopes.includes(scope) ? scope : "all";

    const systemPrompt = `You are a startup ecosystem search engine. Given a user query and a search scope, return relevant results as structured data.

SCOPE: "${safeScope}"

Rules:
- Return 4-6 results that semantically match the query.
- If the query mentions a person's name, infer which entity they're associated with. For example, if "Tom Hand" is searched under "companies", return the company they lead and mention their role.
- If the query mentions a technology, sector, or trait, return matching entities.
- Each result must include: name, subtitle (contextual detail like role, sector, stage, location), category ("founder" | "investor" | "company" | "operator"), and a matchReason explaining why this result is relevant.
- If scope is "founders", return founders/people. If "investors", return investor firms/angels. If "companies", return startups/companies. If "operators", return operators. If "all", mix all types.
- Make results feel realistic for an early-stage startup ecosystem.
- The subtitle should be rich context: for companies show "Sector · Stage · Location", for founders show "Role at Company · Location", for investors show "Stage focus · Check size · Location".`;

    const tryBingBackup = async (): Promise<Response | null> => {
      if (!BING_KEY) return null;
      const pages = await bingWebSearchPages(query.trim(), BING_KEY, 8);
      if (pages.length === 0) return null;
      const results = mapBingPagesToSemanticResults(pages, safeScope);
      return new Response(JSON.stringify({ results, source: "web_search" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    if (LOVABLE_API_KEY) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_search_results",
                description: "Return structured search results for the query",
                parameters: {
                  type: "object",
                  properties: {
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Entity name" },
                          subtitle: { type: "string", description: "Contextual detail line" },
                          category: { type: "string", enum: ["founder", "investor", "company", "operator"] },
                          matchReason: { type: "string", description: "Why this result matches the query" },
                        },
                        required: ["name", "subtitle", "category", "matchReason"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["results"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_search_results" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const bing = await tryBingBackup();
          if (bing) return bing;
          return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          const bing = await tryBingBackup();
          if (bing) return bing;
          return new Response(JSON.stringify({ error: "Credits exhausted. Add funds in Settings > Workspace > Usage." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        const bing = await tryBingBackup();
        if (bing) return bing;
        return new Response(JSON.stringify({ error: "Search failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        const bing = await tryBingBackup();
        if (bing) return bing;
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        const list = Array.isArray(parsed?.results) ? parsed.results : [];
        if (list.length > 0) {
          return new Response(JSON.stringify({ ...parsed, source: "semantic" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (parseErr) {
        console.warn("semantic-search tool parse failed:", parseErr);
      }

      const bing = await tryBingBackup();
      if (bing) return bing;
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bingOnly = await tryBingBackup();
    if (bingOnly) return bingOnly;

    return new Response(
      JSON.stringify({
        error: "Search not configured: set LOVABLE_API_KEY and/or BING_SEARCH_API_KEY (Bing Web Search v7 backup).",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("semantic-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

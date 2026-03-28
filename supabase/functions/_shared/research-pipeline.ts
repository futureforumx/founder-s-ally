/**
 * Multi-tier research pipeline (edge-safe, no browser):
 * 1) Search: Tavily first; Exa for document-type / “similar companies” intents (or Tavily empty / missing key).
 * 2) Rerank: Jina reranker → top 3 snippets for the LLM context window.
 * 3) Read URLs: Jina Reader (URL → markdown); on 403 / access denied → Scrapeless (if configured).
 * 4) LLM: mode "reason" → Gemini via Lovable gateway; mode "chat" → Groq (fast).
 */

export type ResearchMode = "reason" | "chat";
export type SearchProfile = "auto" | "tavily" | "exa";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

const EXA_INTENT_RE =
  /\b(similar\s+compan|competitor|companies\s+like|lookalike|peer\s+group|pdf\b|10-?k\b|s-?1\b|filing|whitepaper|pitch\s*deck|investor\s+deck|prospectus)\b/i;

export function shouldPreferExa(query: string, profile: SearchProfile): boolean {
  if (profile === "exa") return true;
  if (profile === "tavily") return false;
  return EXA_INTENT_RE.test(query);
}

export async function searchTavily(query: string, apiKey: string): Promise<SearchHit[]> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 12,
      include_answer: false,
    }),
  });
  if (!resp.ok) {
    console.warn("Tavily error:", resp.status);
    return [];
  }
  const data = (await resp.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const rows = data.results || [];
  return rows
    .map((r) => ({
      title: (r.title || r.url || "").trim(),
      url: (r.url || "").trim(),
      snippet: (r.content || "").trim(),
    }))
    .filter((r) => r.url);
}

export async function searchExa(query: string, apiKey: string): Promise<SearchHit[]> {
  const resp = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 12,
      contents: { text: { maxCharacters: 1200 } },
    }),
  });
  if (!resp.ok) {
    console.warn("Exa error:", resp.status);
    return [];
  }
  const data = (await resp.json()) as { results?: Array<{ title?: string; url?: string; text?: string }> };
  const rows = data.results || [];
  return rows
    .map((r) => ({
      title: (r.title || r.url || "").trim(),
      url: (r.url || "").trim(),
      snippet: (r.text || "").trim(),
    }))
    .filter((r) => r.url);
}

/** Merge + dedupe by URL */
export function dedupeHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const k = h.url.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

export async function jinaRerankTopN(
  query: string,
  hits: SearchHit[],
  apiKey: string | undefined,
  topN: number,
): Promise<SearchHit[]> {
  if (hits.length <= topN) return hits;
  if (!apiKey) return hits.slice(0, topN);

  const documents = hits.map((h) => `${h.title}\n${h.snippet}`.slice(0, 8000));

  const resp = await fetch("https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-reranker-v2-base-multilingual",
      query,
      documents,
      top_n: topN,
    }),
  });

  if (!resp.ok) {
    console.warn("Jina rerank failed:", resp.status);
    return hits.slice(0, topN);
  }

  const data = (await resp.json()) as {
    results?: Array<{ index?: number }>;
  };
  const order = data.results || [];
  const picked: SearchHit[] = [];
  for (const r of order) {
    if (typeof r.index === "number" && hits[r.index]) picked.push(hits[r.index]);
    if (picked.length >= topN) break;
  }
  return picked.length ? picked : hits.slice(0, topN);
}

function looksBlocked(status: number, body: string): boolean {
  if (status === 403 || status === 401) return true;
  const t = body.slice(0, 2000).toLowerCase();
  return (
    /access denied|forbidden|403|blocked|cloudflare|attention required|captcha|enable javascript/i.test(t)
  );
}

/** Jina Reader: URL → markdown */
export async function jinaReadUrl(url: string, jinaApiKey?: string): Promise<{ markdown: string; status: number }> {
  const target = url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`;
  const readerUrl = `https://r.jina.ai/${target}`;
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Return-Format": "markdown",
  };
  if (jinaApiKey) headers.Authorization = `Bearer ${jinaApiKey}`;

  const resp = await fetch(readerUrl, { headers });
  const text = await resp.text();
  return { markdown: text, status: resp.status };
}

/** Scrapeless universal scrape (configure SCRAPELESS_ACTOR in dashboard, e.g. HTML / browser actor id). */
export async function scrapelessReadUrl(
  url: string,
  token: string,
  actor: string,
): Promise<{ markdown: string; ok: boolean }> {
  const resp = await fetch("https://api.scrapeless.com/api/v1/scraper/request", {
    method: "POST",
    headers: {
      "x-api-token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      actor,
      input: { url },
      proxy: { country: "US" },
      async: false,
    }),
  });

  const raw = await resp.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  const md =
    pickStringDeep(data, ["markdown", "content", "html", "text", "body"]) ||
    (typeof data.data === "object" && data.data !== null
      ? pickStringDeep(data.data as Record<string, unknown>, ["markdown", "content", "text"])
      : "") ||
    raw;

  return { markdown: md.slice(0, 50_000), ok: resp.ok && md.length > 50 };
}

function pickStringDeep(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

export async function readUrlToMarkdown(
  url: string,
  opts: { jinaApiKey?: string; scrapelessToken?: string; scrapelessActor?: string },
  maxChars: number,
): Promise<{ url: string; markdown: string; via: "jina" | "scrapeless" | "none" }> {
  const { markdown, status } = await jinaReadUrl(url, opts.jinaApiKey);
  if (!looksBlocked(status, markdown) && markdown.length > 80) {
    return { url, markdown: markdown.slice(0, maxChars), via: "jina" };
  }
  if (opts.scrapelessToken && opts.scrapelessActor) {
    const sl = await scrapelessReadUrl(url, opts.scrapelessToken, opts.scrapelessActor);
    if (sl.ok) {
      return { url, markdown: sl.markdown.slice(0, maxChars), via: "scrapeless" };
    }
  }
  return { url, markdown: markdown.slice(0, maxChars), via: looksBlocked(status, markdown) ? "none" : "jina" };
}

export async function runWebSearch(
  query: string,
  profile: SearchProfile,
  tavilyKey?: string,
  exaKey?: string,
): Promise<{ hits: SearchHit[]; provider: "tavily" | "exa" | "none" }> {
  const preferExa = shouldPreferExa(query, profile);
  const tryExa = () => (exaKey ? dedupeHits(await searchExa(query, exaKey)) : []);
  const tryTav = () => (tavilyKey ? dedupeHits(await searchTavily(query, tavilyKey)) : []);

  if (profile === "exa") {
    let hits = tryExa();
    if (hits.length) return { hits, provider: "exa" };
    hits = tryTav();
    if (hits.length) return { hits, provider: "tavily" };
    return { hits: [], provider: "none" };
  }

  if (profile === "tavily") {
    let hits = tryTav();
    if (hits.length) return { hits, provider: "tavily" };
    hits = tryExa();
    if (hits.length) return { hits, provider: "exa" };
    return { hits: [], provider: "none" };
  }

  // auto: Tavily first unless intent says Exa
  if (preferExa) {
    let hits = tryExa();
    if (hits.length) return { hits, provider: "exa" };
    hits = tryTav();
    if (hits.length) return { hits, provider: "tavily" };
    return { hits: [], provider: "none" };
  }

  let hits = tryTav();
  if (hits.length) return { hits, provider: "tavily" };
  hits = tryExa();
  if (hits.length) return { hits, provider: "exa" };
  return { hits: [], provider: "none" };
}

export async function callGroqChat(
  system: string,
  user: string,
  groqKey: string,
  model = "llama-3.3-70b-versatile",
): Promise<string> {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });
  if (!resp.ok) throw new Error(`Groq error ${resp.status}`);
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function callGeminiReasoning(
  system: string,
  user: string,
  lovableKey: string,
  model = "google/gemini-2.5-pro",
): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!resp.ok) throw new Error(`Gemini gateway error ${resp.status}`);
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export interface PipelineOpts {
  query: string;
  mode: ResearchMode;
  searchProfile: SearchProfile;
  maxUrlReads: number;
  tavilyKey?: string;
  exaKey?: string;
  jinaKey?: string;
  scrapelessToken?: string;
  scrapelessActor?: string;
  groqKey?: string;
  lovableKey?: string;
}

export interface PipelineResult {
  answer: string;
  modelUsed: string;
  searchProvider: "tavily" | "exa" | "none";
  topHits: SearchHit[];
  urlReads: Array<{ url: string; via: string; chars: number }>;
  intents: { preferExa: boolean };
}

export async function runResearchPipeline(opts: PipelineOpts): Promise<PipelineResult> {
  const { hits, provider } = await runWebSearch(
    opts.query,
    opts.searchProfile,
    opts.tavilyKey,
    opts.exaKey,
  );

  const preferExa = shouldPreferExa(opts.query, opts.searchProfile);

  const topHits = await jinaRerankTopN(opts.query, hits, opts.jinaKey, 3);

  const contextParts: string[] = topHits.map(
    (h, i) => `### Source ${i + 1}: ${h.title}\nURL: ${h.url}\n${h.snippet}`,
  );

  const urlReads: PipelineResult["urlReads"] = [];
  const readBudget = Math.min(opts.maxUrlReads, topHits.length);
  for (let i = 0; i < readBudget; i++) {
    const u = topHits[i]?.url;
    if (!u) continue;
    const page = await readUrlToMarkdown(
      u,
      {
        jinaApiKey: opts.jinaKey,
        scrapelessToken: opts.scrapelessToken,
        scrapelessActor: opts.scrapelessActor,
      },
      12_000,
    );
    urlReads.push({ url: u, via: page.via, chars: page.markdown.length });
    if (page.markdown.length > 200) {
      contextParts.push(`### Page body (${page.via}) ${u}\n${page.markdown}`);
    }
  }

  const context = contextParts.join("\n\n---\n\n");
  const system =
    "You are a precise research assistant. Answer using the provided sources. Cite which source index supports each claim. If evidence is thin, say so.";

  const user = `Question:\n${opts.query}\n\n---\n\nEvidence (reranked top snippets + page extracts):\n${context}`;

  let answer = "";
  let modelUsed = "";

  if (opts.mode === "chat") {
    if (!opts.groqKey) throw new Error("GROQ_API_KEY required for mode=chat");
    answer = await callGroqChat(system, user, opts.groqKey);
    modelUsed = "groq:llama-3.3-70b-versatile";
  } else {
    if (!opts.lovableKey) throw new Error("LOVABLE_API_KEY required for mode=reason (Gemini)");
    answer = await callGeminiReasoning(system, user, opts.lovableKey);
    modelUsed = "lovable:google/gemini-2.5-pro";
  }

  return {
    answer,
    modelUsed,
    searchProvider: provider,
    topHits,
    urlReads,
    intents: { preferExa },
  };
}

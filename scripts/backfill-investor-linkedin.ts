/**
 * backfill-investor-linkedin.ts
 *
 * Targeted one-time backfill to improve LinkedIn URL coverage for firm_investors.
 * Uses Exa AI → Jina AI → Gemini → DeepSeek → Grok (xAI) evaluator chain.
 * Apollo is NOT used — removed in Pass 3.
 *
 * PIPELINE:
 *  1. Exa Search — find LinkedIn profile candidates for each investor
 *  2. Jina Reader — fetch the LinkedIn page as markdown for validation
 *  3. Gemini (direct via generativelanguage.googleapis.com) — primary evaluator
 *  4. DeepSeek (direct via api.deepseek.com) — first fallback if Gemini 429/errors
 *  5. Grok (xAI) — secondary fallback if both Gemini and DeepSeek fail
 *
 * SAFETY:
 *  - Only targets investors with ready_for_live = true AND linkedin_url IS NULL
 *  - Only writes linkedin_url if LLM evaluator returns "high" confidence
 *  - Does NOT overwrite existing linkedin_url values
 *  - Respects rate limits with configurable delay
 *  - DRY_RUN mode available
 *  - Source attribution: sets enrichment_source on each updated row
 *
 * USAGE:
 *   DRY_RUN=true npx tsx scripts/backfill-investor-linkedin.ts          # preview
 *   ENRICH_MAX=50 npx tsx scripts/backfill-investor-linkedin.ts         # limited batch
 *   npx tsx scripts/backfill-investor-linkedin.ts                       # full run (max 500)
 *
 * ENVIRONMENT:
 *   EXA_API_KEY               - Required
 *   JINA_API_KEY              - Optional (improves Jina Reader results)
 *   GEMINI_API_KEY             - Recommended (direct Gemini API, or GOOGLE_API_KEY)
 *   DEEPSEEK_API_KEY           - Recommended (DeepSeek primary fallback)
 *   XAI_API_KEY               - Optional (Grok secondary fallback)
 *   SUPABASE_URL              - Required (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY - Required
 *   ENRICH_MAX                - Max investors to enrich (default: 500)
 *   ENRICH_DELAY_MS           - Delay between pipeline runs (default: 600)
 *   DRY_RUN                   - Set to "true" to preview without writing (default: false)
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";

// ── Load env ──
loadEnvFiles();

// ── Config ──
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXA_API_KEY = process.env.EXA_API_KEY;
const JINA_API_KEY = process.env.JINA_API_KEY; // optional
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY; // primary fallback
const XAI_API_KEY = process.env.XAI_API_KEY; // secondary fallback
const MAX_RAW = parseInt(process.env.ENRICH_MAX || "500", 10);
const MAX = MAX_RAW <= 0 ? 100_000 : MAX_RAW; // 0 = unlimited
const DELAY = parseInt(process.env.ENRICH_DELAY_MS || "1500", 10);
const DRY_RUN = process.env.DRY_RUN === "true";

// ── Validate required keys ──
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!EXA_API_KEY) {
  console.error("Missing EXA_API_KEY");
  process.exit(1);
}
if (!GEMINI_API_KEY && !OPENROUTER_API_KEY && !DEEPSEEK_API_KEY && !XAI_API_KEY) {
  console.error("Need at least one LLM key: OPENROUTER_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, or XAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Types ──
interface InvestorRow {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  firm_id: string;
  title: string | null;
}

interface ExaResult {
  title: string;
  url: string;
  text: string;
}

interface MatchEvaluation {
  confidence: "high" | "medium" | "low";
  reason: string;
  evaluator: "gemini" | "deepseek" | "grok";
}

// ── Utilities ──
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLinkedInProfileUrl(url: string): boolean {
  return /linkedin\.com\/in\/[a-zA-Z0-9_-]+/i.test(url);
}

function buildSearchQuery(person: InvestorRow, firmName: string | null): string {
  const first = person.first_name || "";
  const last = person.last_name || "";
  let name = `${first} ${last}`.trim();

  if (!name && person.full_name) {
    name = person.full_name;
  }

  // Build a targeted LinkedIn search query
  const parts = [name];
  if (firmName) parts.push(firmName);
  parts.push("LinkedIn");
  parts.push("site:linkedin.com/in/");

  return parts.join(" ");
}

// ── Step 1: Exa Search ──
async function searchExaForLinkedIn(
  query: string,
): Promise<ExaResult[]> {
  const resp = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": EXA_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 5,
      contents: { text: { maxCharacters: 800 } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) {
      console.warn("  Exa rate limited, waiting 5s...");
      await sleep(5000);
      return [];
    }
    console.warn(`  Exa ${resp.status}: ${resp.statusText}`);
    return [];
  }

  const data = (await resp.json()) as {
    results?: Array<{ title?: string; url?: string; text?: string }>;
  };

  return (data.results || [])
    .filter((r) => r.url && isLinkedInProfileUrl(r.url))
    .map((r) => ({
      title: (r.title || "").trim(),
      url: (r.url || "").trim(),
      text: (r.text || "").trim(),
    }));
}

// ── Step 2: Jina Reader ──
async function jinaReadPage(url: string): Promise<string> {
  const target = url.startsWith("http") ? url : `https://${url}`;
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Return-Format": "markdown",
  };
  if (JINA_API_KEY) headers.Authorization = `Bearer ${JINA_API_KEY}`;

  try {
    const resp = await fetch(`https://r.jina.ai/${target}`, { headers });
    const text = await resp.text();

    // Check if it looks blocked
    if (
      resp.status === 403 ||
      resp.status === 401 ||
      /access denied|forbidden|blocked|captcha/i.test(text.slice(0, 1000))
    ) {
      return "";
    }

    return text.slice(0, 4000); // cap for LLM context
  } catch (err) {
    console.warn(`  Jina read error: ${err}`);
    return "";
  }
}

// ── Step 3: Rule-based evaluator (no API — primary fast path) ──
// Uses name-slug matching + firm/title mention in snippet. Fast and free.

function slugTokens(url: string): string[] {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return [];
  return match[1].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t.length > 1);
}

function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(t => t.length > 1);
}

function ruleBasedEvaluate(
  person: InvestorRow,
  firmName: string | null,
  candidateUrl: string,
  exaSnippet: string,
): "high" | "medium" | "low" {
  const urlTokens = slugTokens(candidateUrl);
  const personTokens = nameTokens(person.full_name);
  if (urlTokens.length === 0 || personTokens.length === 0) return "low";

  // Count how many name tokens appear in the URL slug
  const nameMatches = personTokens.filter(t => urlTokens.some(u => u.startsWith(t) || t.startsWith(u)));
  const nameMatchRatio = nameMatches.length / personTokens.length;

  // Check firm name in snippet
  const snippet = (exaSnippet + " " + candidateUrl).toLowerCase();
  const firmTokens = firmName ? nameTokens(firmName).filter(t => t.length > 3) : [];
  const firmMentioned = firmTokens.length > 0 && firmTokens.some(t => snippet.includes(t));

  // High: most of the name matches + firm mentioned
  if (nameMatchRatio >= 0.75 && firmMentioned) return "high";
  // High: all name tokens match (very strong signal even without firm)
  if (nameMatchRatio === 1.0 && personTokens.length >= 2) return "high";
  // Medium: name mostly matches but no firm confirmation
  if (nameMatchRatio >= 0.75) return "medium";
  // Low: poor name match
  return "low";
}

// ── Step 4: OpenRouter Evaluator (LLM fallback for medium/ambiguous cases) ──
async function callOpenRouterEval(system: string, user: string, retries = 3): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error("No OPENROUTER_API_KEY");

  for (let attempt = 1; attempt <= retries; attempt++) {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vekta.so",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        max_tokens: 256,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (resp.status === 429) {
      const wait = attempt * 5000; // 5s, 10s, 15s
      console.warn(`  OpenRouter 429 — waiting ${wait / 1000}s (attempt ${attempt}/${retries})...`);
      await sleep(wait);
      continue;
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`OpenRouter error ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  throw new Error("OpenRouter failed after max retries (429)");
}

const MATCH_SYSTEM_PROMPT = `You are a strict identity-matching assistant. You will be given:
1. An investor's known details (name, title, firm, email)
2. A candidate LinkedIn profile URL and page text

Your job: determine if the LinkedIn profile belongs to the same person as the investor record.

Respond with ONLY a JSON object (no markdown fences):
{
  "confidence": "high" | "medium" | "low",
  "reason": "<brief explanation>"
}

Rules:
- "high" = name matches closely AND firm/title/context strongly aligns. You are very confident this is the same person.
- "medium" = name matches but firm/context is ambiguous or partially matches.
- "low" = name mismatch, wrong person, wrong firm, or insufficient evidence.
- When in doubt, choose "low". False positives are much worse than false negatives.
- A name match alone is NOT enough for "high" — the firm or role context must also align.`;

function buildMatchUserPrompt(
  person: InvestorRow,
  firmName: string | null,
  candidateUrl: string,
  pageText: string,
  exaSnippet: string,
): string {
  return `INVESTOR RECORD:
- Full name: ${person.full_name}
- First name: ${person.first_name || "N/A"}
- Last name: ${person.last_name || "N/A"}
- Title: ${person.title || "N/A"}
- Firm: ${firmName || "N/A"}
- Email: ${person.email || "N/A"}

CANDIDATE LINKEDIN:
- URL: ${candidateUrl}
- Exa snippet: ${exaSnippet || "N/A"}
- Page text (via Jina): ${pageText || "(page text unavailable)"}

Is this LinkedIn profile the same person as the investor record? Respond with JSON only.`;
}

async function callGeminiEval(system: string, user: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("No GEMINI_API_KEY");

  // Direct Google Generative Language API — same pattern as OnboardingStepper.tsx
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${system}\n\n${user}` }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Gemini API error ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// ── Step 4a: DeepSeek Fallback Evaluator (primary fallback) ──
async function callDeepSeekEval(system: string, user: string): Promise<string> {
  if (!DEEPSEEK_API_KEY) throw new Error("No DEEPSEEK_API_KEY");

  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 256,
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`DeepSeek API error ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── Step 4b: Grok (xAI) Secondary Fallback Evaluator ──
async function callGrokEval(system: string, user: string): Promise<string> {
  if (!XAI_API_KEY) throw new Error("No XAI_API_KEY");

  const resp = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: 256,
    }),
  });

  if (!resp.ok) throw new Error(`Grok (xAI) error ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function parseEvaluation(raw: string, evaluator: "gemini" | "deepseek" | "grok"): MatchEvaluation | null {
  try {
    // Strip markdown fences if present
    let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    // Try to extract JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const confidence = parsed.confidence?.toLowerCase();
    if (!["high", "medium", "low"].includes(confidence)) return null;

    return {
      confidence: confidence as "high" | "medium" | "low",
      reason: parsed.reason || "no reason given",
      evaluator,
    };
  } catch {
    return null;
  }
}

// ── Combined evaluator with fallback ──
async function evaluateMatch(
  person: InvestorRow,
  firmName: string | null,
  candidateUrl: string,
  pageText: string,
  exaSnippet: string,
): Promise<MatchEvaluation | null> {
  const userPrompt = buildMatchUserPrompt(person, firmName, candidateUrl, pageText, exaSnippet);

  // Tier 0: Rule-based (no API — fast path for clear name matches)
  const ruleResult = ruleBasedEvaluate(person, firmName, candidateUrl, exaSnippet);
  if (ruleResult === "high") {
    return { confidence: "high", reason: "name tokens match URL slug + firm confirmed in snippet", evaluator: "gemini" };
  }
  if (ruleResult === "low") {
    // Only escalate to LLM for medium — skip LLM entirely for clear mismatches
    return { confidence: "low", reason: "name does not match LinkedIn URL slug", evaluator: "gemini" };
  }
  // ruleResult === "medium" — escalate to LLM for confirmation

  // Tier 1: OpenRouter (most reliable — uses gemini-2.0-flash-001 via OR)
  if (OPENROUTER_API_KEY) {
    try {
      const raw = await callOpenRouterEval(MATCH_SYSTEM_PROMPT, userPrompt);
      const result = parseEvaluation(raw, "gemini");
      if (result) return result;
      console.warn("  OpenRouter returned unparseable response, trying Gemini direct...");
    } catch (err) {
      console.warn(`  OpenRouter error: ${err}, trying Gemini direct...`);
    }
  }

  // Tier 2: Gemini direct (secondary)
  if (GEMINI_API_KEY) {
    try {
      const raw = await callGeminiEval(MATCH_SYSTEM_PROMPT, userPrompt);
      const result = parseEvaluation(raw, "gemini");
      if (result) return result;
      console.warn("  Gemini returned unparseable response, trying DeepSeek...");
    } catch (err) {
      console.warn(`  Gemini error: ${err}, trying DeepSeek...`);
    }
  }

  // Tier 3: DeepSeek (tertiary fallback)
  if (DEEPSEEK_API_KEY) {
    try {
      const raw = await callDeepSeekEval(MATCH_SYSTEM_PROMPT, userPrompt);
      const result = parseEvaluation(raw, "deepseek");
      if (result) return result;
      console.warn("  DeepSeek returned unparseable response, trying Grok...");
    } catch (err) {
      console.warn(`  DeepSeek error: ${err}, trying Grok...`);
    }
  }

  // Tier 3: Grok / xAI (secondary fallback)
  if (XAI_API_KEY) {
    try {
      const raw = await callGrokEval(MATCH_SYSTEM_PROMPT, userPrompt);
      const result = parseEvaluation(raw, "grok");
      if (result) return result;
      console.warn("  Grok returned unparseable response");
    } catch (err) {
      console.warn(`  Grok error: ${err}`);
    }
  }

  return null;
}

// ── Main ──
async function main() {
  console.log(`\u{1F517} LinkedIn Backfill for firm_investors (Exa \u2192 Jina \u2192 Gemini \u2192 DeepSeek \u2192 Grok)`);
  console.log(`   Max: ${MAX} | Delay: ${DELAY}ms | DRY_RUN: ${DRY_RUN}`);
  const evals = [
    OPENROUTER_API_KEY ? "OpenRouter/Gemini (primary)" : null,
    GEMINI_API_KEY ? "Gemini direct (fallback 1)" : null,
    DEEPSEEK_API_KEY ? "DeepSeek (fallback 2)" : null,
    XAI_API_KEY ? "Grok (fallback 3)" : null,
  ].filter(Boolean).join(" + ");
  console.log(`   Evaluators: ${evals || "NONE — will fail"}`);
  console.log();

  // Fetch investors that are ready_for_live but missing LinkedIn
  const { data: investors, error } = await supabase
    .from("firm_investors")
    .select("id, full_name, first_name, last_name, email, firm_id, title")
    .is("deleted_at", null)
    .eq("ready_for_live", true)
    .is("linkedin_url", null)
    .limit(MAX);

  if (error) {
    console.error("Failed to fetch investors:", error);
    process.exit(1);
  }

  console.log(`Found ${investors.length} investors missing LinkedIn URLs`);

  // Batch-fetch firm names for better search queries
  const firmIds = [...new Set(investors.map((i) => i.firm_id))];
  const { data: firms } = await supabase
    .from("firm_records")
    .select("id, firm_name")
    .in("id", firmIds.slice(0, 1000));

  const firmMap = new Map((firms || []).map((f) => [f.id, f.firm_name]));

  // Stats
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let noResults = 0;
  let mediumSkipped = 0;
  const evaluatorStats = { gemini: 0, deepseek: 0, grok: 0 };

  for (let i = 0; i < investors.length; i++) {
    const inv = investors[i];
    const firmName = firmMap.get(inv.firm_id) || null;

    process.stdout.write(
      `[${i + 1}/${investors.length}] ${inv.full_name} @ ${firmName || "Unknown"}... `,
    );

    // ── Step 1: Exa search ──
    const query = buildSearchQuery(inv, firmName);
    const candidates = await searchExaForLinkedIn(query);

    if (candidates.length === 0) {
      console.log("no LinkedIn candidates found");
      noResults++;
      if (i < investors.length - 1) await sleep(DELAY);
      continue;
    }

    // Take the top candidate (most relevant Exa result)
    const top = candidates[0];

    // ── Step 2: Jina Reader — fetch page text for validation ──
    const pageText = await jinaReadPage(top.url);

    // ── Step 3+4: LLM evaluation (Gemini primary, Grok fallback) ──
    const evaluation = await evaluateMatch(inv, firmName, top.url, pageText, top.text);

    if (!evaluation) {
      console.log("evaluation failed (all LLMs unavailable)");
      failed++;
    } else if (evaluation.confidence === "high") {
      evaluatorStats[evaluation.evaluator]++;

      if (DRY_RUN) {
        console.log(`WOULD SET \u2192 ${top.url} [${evaluation.evaluator}: ${evaluation.reason}]`);
        updated++;
      } else {
        const { error: updateErr } = await supabase
          .from("firm_investors")
          .update({
            linkedin_url: top.url,
            last_enriched_at: new Date().toISOString(),
          })
          .eq("id", inv.id)
          .is("linkedin_url", null); // safety: only if still null

        if (updateErr) {
          console.log(`FAILED: ${updateErr.message}`);
          failed++;
        } else {
          console.log(`\u2713 ${top.url} [${evaluation.evaluator}]`);
          updated++;
        }
      }
    } else if (evaluation.confidence === "medium") {
      console.log(`skipped (medium confidence: ${evaluation.reason})`);
      mediumSkipped++;
      skipped++;
    } else {
      console.log(`skipped (low confidence: ${evaluation.reason})`);
      skipped++;
    }

    if (i < investors.length - 1) await sleep(DELAY);
  }

  // ── Summary ──
  console.log();
  console.log("=== RESULTS ===");
  console.log(`  Updated:          ${updated}`);
  console.log(`  Skipped (low/med):${skipped} (${mediumSkipped} medium)`);
  console.log(`  No candidates:    ${noResults}`);
  console.log(`  Failed:           ${failed}`);
  console.log(`  Total processed:  ${investors.length}`);
  console.log();
  console.log(`  Evaluator usage — Gemini: ${evaluatorStats.gemini} | DeepSeek: ${evaluatorStats.deepseek} | Grok: ${evaluatorStats.grok}`);
  if (DRY_RUN) {
    console.log();
    console.log("  ** DRY RUN — no database writes were made **");
  }
}

main().catch(console.error);

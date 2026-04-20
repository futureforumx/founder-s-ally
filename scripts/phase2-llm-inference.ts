#!/usr/bin/env tsx
/**
 * phase2-llm-inference.ts
 * ========================
 * Phase 2: LLM-powered inference for firm_investors fields that can't be
 * scraped directly — they must be derived from existing structured data.
 *
 * Targets: firm_investors where ready_for_live = true
 *
 * Inferred fields:
 *   short_summary    — 2-sentence human-readable profile blurb
 *   seniority        — Normalised enum: gp | partner | principal | associate |
 *                      analyst | venture_partner | scout | advisor | other
 *   investor_type    — angel | institutional_vc | corporate_vc | family_office |
 *                      accelerator | syndicate | fund_of_funds | other
 *
 * SQL-derived fields (no LLM needed):
 *   vc_fund_people   — Links each investor to fund_records for their firm
 *                      via a bulk SQL insert using firm_id foreign key
 *
 * Usage:
 *   npx tsx scripts/phase2-llm-inference.ts
 *   DRY_RUN=1 npx tsx scripts/phase2-llm-inference.ts
 *   BATCH_SIZE=25 npx tsx scripts/phase2-llm-inference.ts
 *   LIMIT=500 npx tsx scripts/phase2-llm-inference.ts
 *   SKIP_FUND_LINKS=1 npx tsx scripts/phase2-llm-inference.ts     # skip vc_fund_people step
 *   SKIP_LLM=1 npx tsx scripts/phase2-llm-inference.ts            # only populate fund links
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY            Primary LLM (Gemini 2.0 Flash)
 *   OPENROUTER_API_KEY        Fallback if Gemini fails
 *   BATCH_SIZE                Investors per LLM batch (default: 20)
 *   LIMIT                     Max investors to process (default: unlimited)
 *   DELAY_MS                  ms between batches (default: 500)
 *   DRY_RUN                   1 = print output, skip DB writes
 *   SKIP_FUND_LINKS           1 = skip vc_fund_people population
 *   SKIP_LLM                  1 = skip LLM inference, only do fund links
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

// ─── Config ───────────────────────────────────────────────────────────────────

const e    = (n: string) => (process.env[n] || "").trim();
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1", "true", "yes"].includes(e(n).toLowerCase());

const SUPA_URL        = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY        = e("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_KEY      = e("GEMINI_API_KEY");
const OPENROUTER_KEY  = e("OPENROUTER_API_KEY");
const DRY_RUN         = eBool("DRY_RUN");
const BATCH_SIZE      = eInt("BATCH_SIZE", 20);
const LIMIT           = eInt("LIMIT", 0); // 0 = unlimited
const DELAY_MS        = eInt("DELAY_MS", 500);
const SKIP_FUND_LINKS = eBool("SKIP_FUND_LINKS");
const SKIP_LLM        = eBool("SKIP_LLM");
const RULE_BASED      = eBool("RULE_BASED"); // derive fields locally — no API

if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
if (!SKIP_LLM && !RULE_BASED && !GEMINI_KEY && !OPENROUTER_KEY) {
  throw new Error("No LLM key found. Set GEMINI_API_KEY or OPENROUTER_API_KEY in .env.local, RULE_BASED=1 (no API), or SKIP_LLM=1.");
}

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const LOG_DIR  = join(process.cwd(), "data", "enrichment-logs");
const LOG_FILE = join(LOG_DIR, `phase2-llm-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);

// ─── Types ────────────────────────────────────────────────────────────────────

type Seniority =
  | "gp" | "managing_partner" | "partner" | "venture_partner"
  | "principal" | "associate" | "senior_associate"
  | "analyst" | "scout" | "advisor" | "other";

type InvestorType =
  | "angel" | "institutional_vc" | "corporate_vc" | "family_office"
  | "accelerator" | "syndicate" | "fund_of_funds" | "other";

interface InvestorRow {
  id: string;
  firm_id: string;
  full_name: string;
  title: string;
  bio: string;
  seniority: string | null;
  investor_type: string | null;
  short_summary: string | null;
  background_summary: string | null;
  education_summary: string | null;
  operator_background: string | null;
  prior_roles: unknown | null;
  stage_focus: string[];
  sector_focus: string[];
  check_size_min: number | null;
  check_size_max: number | null;
  is_actively_investing: boolean;
  // from join
  firm_name: string;
  firm_entity_type: string | null;
}

interface LlmInference {
  id: string;
  short_summary: string;
  seniority: Seniority;
  investor_type: InvestorType;
  background_summary: string;
  education_summary: string;
  operator_background: string;
  prior_roles: Array<{ title: string; company: string; years?: string }>;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(obj: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  console.log(line);
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + "\n");
  } catch { /* ignore */ }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── DB Fetch ─────────────────────────────────────────────────────────────────

async function fetchInvestors(offset: number, batchSize: number): Promise<InvestorRow[]> {
  const query = sb
    .from("firm_investors")
    .select(`
      id, firm_id, full_name, title, bio, seniority, investor_type, short_summary,
      background_summary, education_summary, operator_background, prior_roles,
      stage_focus, sector_focus, check_size_min, check_size_max, is_actively_investing,
      firm_records!inner(firm_name, entity_type)
    `)
    .eq("ready_for_live", true)
    .range(offset, offset + batchSize - 1);

  // Only fetch rows that are missing one or more inferred fields
  if (!SKIP_LLM) {
    query.or(
      "seniority.is.null,investor_type.is.null,short_summary.is.null," +
      "background_summary.is.null,education_summary.is.null,operator_background.is.null,prior_roles.is.null"
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`DB fetch error: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const firm = (row["firm_records"] as Record<string, unknown>) ?? {};
    return {
      ...row,
      firm_name: (firm["firm_name"] as string) ?? "",
      firm_entity_type: (firm["entity_type"] as string) ?? null,
    } as InvestorRow;
  });
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildBatchPrompt(investors: InvestorRow[]): string {
  const investorDescriptions = investors.map((inv, i) => {
    const stageStr = (inv.stage_focus ?? []).join(", ") || "unknown";
    const sectorStr = (inv.sector_focus ?? []).join(", ") || "unknown";
    const checkStr = inv.check_size_min && inv.check_size_max
      ? `$${(inv.check_size_min / 1_000_000).toFixed(1)}M–$${(inv.check_size_max / 1_000_000).toFixed(1)}M`
      : inv.check_size_min
      ? `$${(inv.check_size_min / 1_000_000).toFixed(1)}M+`
      : "unknown";

    return `[${i + 1}] ID: ${inv.id}
Name: ${inv.full_name}
Title: ${inv.title || "unknown"}
Firm: ${inv.firm_name || "unknown"} (entity_type: ${inv.firm_entity_type ?? "unknown"})
Bio: ${inv.bio ? inv.bio.slice(0, 400) : "not available"}
Stage focus: ${stageStr}
Sector focus: ${sectorStr}
Check size: ${checkStr}
Currently investing: ${inv.is_actively_investing ? "yes" : "unknown"}`;
  }).join("\n\n---\n\n");

  return `You are a VC data analyst. Analyze each investor profile below and return structured JSON.

For each investor, infer ALL of the following fields:
1. short_summary: A 2-sentence profile blurb a founder would read. Mention their firm, focus areas, and one distinctive trait. Be concise and specific. Do NOT invent claims not supported by the data.
2. seniority: Pick exactly one from: gp | managing_partner | partner | venture_partner | principal | associate | senior_associate | analyst | scout | advisor | other
   - Use title as primary signal. "General Partner" / "GP" → gp. "Managing Partner" / "Managing Director" → managing_partner.
   - "Partner" → partner. "Venture Partner" → venture_partner. "Principal" → principal.
   - "Associate" → associate. "Senior Associate" → senior_associate. "Analyst" → analyst.
   - "Scout" or "EIR" → scout. "Advisor" / "Adviser" → advisor. Anything else → other.
3. investor_type: Pick exactly one from: angel | institutional_vc | corporate_vc | family_office | accelerator | syndicate | fund_of_funds | other
   - If entity_type is "Angel" or title contains "Angel" → angel
   - If entity_type is "Corporate (CVC)" → corporate_vc
   - If entity_type is "Family Office" → family_office
   - If entity_type is "Accelerator / Studio" → accelerator
   - If entity_type is "Syndicate" → syndicate
   - If entity_type is "Fund of Funds" → fund_of_funds
   - Default for traditional VC firms → institutional_vc
4. background_summary: 1-2 sentences describing the investor's professional background. Focus on career highlights, domain expertise, and what makes them distinctive as an investor. Extract from bio. If no bio, use "" (empty string).
5. education_summary: Extract any educational background mentioned in the bio (degrees, schools, years). Format as plain text, e.g. "MBA, Harvard Business School; BS Computer Science, MIT". If none mentioned, use "".
6. operator_background: If the investor has prior operator/founder experience, summarise it in 1 sentence (e.g. "Former co-founder and CTO of Stripe before joining Sequoia"). If no operator background, use "".
7. prior_roles: Array of previous roles extracted from the bio. Each item: { "title": "...", "company": "...", "years": "..." (optional) }. If none found, use [].

PROFILES:

${investorDescriptions}

Return ONLY a JSON array (no markdown, no explanation) with exactly ${investors.length} objects:
[
  {
    "id": "<exact UUID from profile>",
    "short_summary": "<2-sentence blurb>",
    "seniority": "<one of the enum values>",
    "investor_type": "<one of the enum values>",
    "background_summary": "<1-2 sentence background>",
    "education_summary": "<education text or empty string>",
    "operator_background": "<operator/founder background or empty string>",
    "prior_roles": [{ "title": "...", "company": "...", "years": "..." }]
  },
  ...
]`;
}

// ─── LLM Call ─────────────────────────────────────────────────────────────────
// Primary: Gemini 2.0 Flash  |  Fallback: OpenRouter (gemini-flash via OR)

function extractJsonArray(text: string): LlmInference[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${text.slice(0, 300)}`);
  return JSON.parse(match[0]) as LlmInference[];
}

async function callGemini(prompt: string): Promise<LlmInference[]> {
  const model = "gemini-2.0-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return extractJsonArray(text);
}

async function callOpenRouter(prompt: string): Promise<LlmInference[]> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://vekta.so",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      max_tokens: 8192,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "";
  return extractJsonArray(text);
}

async function callLLM(prompt: string): Promise<LlmInference[]> {
  // Try Gemini first
  if (GEMINI_KEY) {
    try {
      return await callGemini(prompt);
    } catch (err) {
      console.warn(`  [gemini] failed, trying OpenRouter: ${err}`);
    }
  }
  // Fallback to OpenRouter
  if (OPENROUTER_KEY) {
    return await callOpenRouter(prompt);
  }
  throw new Error("All LLM providers failed and no fallback key available.");
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_SENIORITY: Seniority[] = [
  "gp", "managing_partner", "partner", "venture_partner",
  "principal", "associate", "senior_associate",
  "analyst", "scout", "advisor", "other",
];

const VALID_INVESTOR_TYPE: InvestorType[] = [
  "angel", "institutional_vc", "corporate_vc", "family_office",
  "accelerator", "syndicate", "fund_of_funds", "other",
];

// Normalize seniority values the model sometimes returns that aren't in the enum
const SENIORITY_NORMALISATION: Record<string, Seniority> = {
  managing_director: "managing_partner",
  md: "managing_partner",
  general_partner: "gp",
  angel: "other",           // "angel" belongs to investor_type, not seniority
  founder: "other",
  ceo: "other",
  cto: "other",
  president: "other",
  director: "principal",
  vice_president: "principal",
  vp: "principal",
};

function normaliseSeniority(raw: string): Seniority {
  const key = raw.toLowerCase().replace(/[\s-]/g, "_");
  if (VALID_SENIORITY.includes(raw as Seniority)) return raw as Seniority;
  return SENIORITY_NORMALISATION[key] ?? "other";
}

function validateInference(item: LlmInference): boolean {
  if (!item.id || typeof item.id !== "string") return false;
  if (!item.short_summary || typeof item.short_summary !== "string") return false;
  if (!VALID_INVESTOR_TYPE.includes(item.investor_type)) return false;
  // Normalise seniority in-place so callers get the corrected value
  item.seniority = normaliseSeniority(item.seniority as string);
  return true;
}

// ─── Rule-Based Inference ────────────────────────────────────────────────────
// Derives seniority, investor_type, and short_summary from structured fields.
// No external API required.

function inferSeniorityFromTitle(title: string): Seniority {
  const t = (title || "").toLowerCase();
  if (/\b(gp|general partner)\b/.test(t))                         return "gp";
  if (/\b(managing partner|managing director|md)\b/.test(t))      return "managing_partner";
  if (/\bventure partner\b/.test(t))                              return "venture_partner";
  if (/\bsenior (associate|assoc)\b/.test(t))                     return "senior_associate";
  if (/\b(partner)\b/.test(t))                                    return "partner";
  if (/\bprincipal\b/.test(t))                                    return "principal";
  if (/\b(associate|assoc)\b/.test(t))                            return "associate";
  if (/\b(analyst)\b/.test(t))                                    return "analyst";
  if (/\b(scout)\b/.test(t))                                      return "scout";
  if (/\b(advisor|adviser|advisory)\b/.test(t))                   return "advisor";
  if (/\b(eir|entrepreneur.in.residence)\b/.test(t))              return "scout";
  if (/\b(director|vice president|vp|head of|chief)\b/.test(t))  return "principal";
  return "other";
}

function inferInvestorTypeFromFirm(
  entityType: string | null,
  firmName: string,
  title: string,
): InvestorType {
  const et = (entityType || "").toLowerCase();
  const fn = (firmName || "").toLowerCase();
  const t  = (title || "").toLowerCase();

  if (/angel/.test(et) || /\bangel\b/.test(t) || /\bangel\b/.test(fn))   return "angel";
  if (/corporate|cvc/.test(et))                                            return "corporate_vc";
  if (/family office/.test(et) || /family office/.test(fn))               return "family_office";
  if (/accelerator|studio|incubator/.test(et))                            return "accelerator";
  if (/syndicate/.test(et) || /syndicate/.test(fn))                       return "syndicate";
  if (/fund of funds/.test(et))                                            return "fund_of_funds";
  return "institutional_vc";
}

function buildRuleBasedSummary(inv: InvestorRow): string {
  const firm    = inv.firm_name || "their firm";
  const name    = inv.full_name || "This investor";
  const title   = inv.title ? ` (${inv.title})` : "";
  const stages  = (inv.stage_focus ?? []).slice(0, 3).join(", ");
  const sectors = (inv.sector_focus ?? []).slice(0, 3).join(", ");

  let sentence1 = `${name}${title} invests at ${firm}.`;
  const focusParts: string[] = [];
  if (stages)  focusParts.push(`stage focus: ${stages}`);
  if (sectors) focusParts.push(`sectors: ${sectors}`);

  const sentence2 = focusParts.length > 0
    ? `Their investment focus includes ${focusParts.join(", ")}.`
    : inv.bio
    ? `${inv.bio.slice(0, 160).trim()}${inv.bio.length > 160 ? "…" : ""}`
    : `${name} is actively evaluating opportunities at ${firm}.`;

  return `${sentence1} ${sentence2}`;
}

function inferEducationFromBio(bio: string): string {
  if (!bio) return "";
  // Look for common education patterns in bio text
  const matches: string[] = [];
  const patterns = [
    /(?:MBA|M\.B\.A\.?)[^.]*(?:from|at|,)\s*([A-Z][^,.]+)/gi,
    /(?:B\.?S\.?|B\.?A\.?|M\.?S\.?|Ph\.?D\.?)[^.]*(?:from|at|,)\s*([A-Z][^,.]+)/gi,
    /graduated?(?:\s+\w+)* from\s+([A-Z][^,.]+)/gi,
    /alumnu?s? of\s+([A-Z][^,.]+)/gi,
    /studied at\s+([A-Z][^,.]+)/gi,
  ];
  for (const pat of patterns) {
    const m = bio.match(pat);
    if (m) matches.push(...m.slice(0, 2));
  }
  // Also catch school name mentions directly
  const schools = bio.match(/\b(Harvard|Stanford|MIT|Wharton|Kellogg|Booth|Columbia|Yale|Princeton|Oxford|Cambridge|INSEAD|Berkeley|UCLA|NYU)[^.]*\b/g);
  if (schools) matches.push(...schools.slice(0, 2));
  return [...new Set(matches)].slice(0, 3).join("; ").slice(0, 300);
}

function inferOperatorBackgroundFromBio(bio: string, name: string): string {
  if (!bio) return "";
  const b = bio.toLowerCase();
  const operatorKeywords = ["founded", "co-founded", "ceo", "cto", "coo", "chief", "built", "started", "launched", "entrepreneur"];
  if (!operatorKeywords.some(k => b.includes(k))) return "";
  // Return first sentence mentioning operator experience
  const sentences = bio.split(/[.!?]+/);
  const opSentences = sentences.filter(s => operatorKeywords.some(k => s.toLowerCase().includes(k)));
  return opSentences.slice(0, 2).join(". ").trim().slice(0, 300);
}

function inferPriorRolesFromBio(bio: string): Array<{ title: string; company: string; years?: string }> {
  if (!bio) return [];
  const roles: Array<{ title: string; company: string }> = [];
  // Pattern: "Title at Company" or "Title, Company"
  const atPattern = /\b((?:VP|Director|Head|Partner|Principal|Associate|Analyst|CEO|CTO|COO|CFO|Founder|Co-founder)[^,\n.]{0,40})\s+at\s+([A-Z][^,\n.]{2,40})/g;
  let m;
  while ((m = atPattern.exec(bio)) !== null) {
    roles.push({ title: m[1].trim(), company: m[2].trim() });
    if (roles.length >= 5) break;
  }
  return roles;
}

function inferRuleBased(inv: InvestorRow): LlmInference {
  const bio = inv.bio || "";
  return {
    id:                  inv.id,
    seniority:           inv.seniority as Seniority ?? inferSeniorityFromTitle(inv.title),
    investor_type:       inv.investor_type as InvestorType ?? inferInvestorTypeFromFirm(inv.firm_entity_type, inv.firm_name, inv.title),
    short_summary:       inv.short_summary ?? buildRuleBasedSummary(inv),
    background_summary:  inv.background_summary ?? (bio.length > 50 ? bio.slice(0, 400).split(/[.!?]/)[0] + "." : ""),
    education_summary:   inv.education_summary ?? inferEducationFromBio(bio),
    operator_background: inv.operator_background ?? inferOperatorBackgroundFromBio(bio, inv.full_name),
    prior_roles:         (inv.prior_roles as LlmInference["prior_roles"]) ?? inferPriorRolesFromBio(bio),
  };
}

// ─── LLM Phase ────────────────────────────────────────────────────────────────

async function runLlmInference(): Promise<{ processed: number; errors: number }> {
  const mode = RULE_BASED ? "Rule-Based (no API)" : GEMINI_KEY ? "Gemini 2.0 Flash Lite" : "OpenRouter (gemini-2.0-flash-001)";
  console.log("\n📊 Phase 2a — Inference");
  console.log(`   Mode: ${mode} | Batch size: ${BATCH_SIZE}`);
  console.log(`   Target: ready_for_live investors missing seniority / investor_type / short_summary\n`);

  let offset = 0;
  let totalProcessed = 0;
  let totalErrors = 0;
  let batchNum = 0;

  while (true) {
    if (LIMIT > 0 && totalProcessed >= LIMIT) break;

    const batch = await fetchInvestors(offset, BATCH_SIZE);
    if (batch.length === 0) break;
    batchNum++;

    log({ event: "batch.start", offset, count: batch.length, mode: RULE_BASED ? "rule_based" : "llm" });

    let results: LlmInference[] = [];

    if (RULE_BASED) {
      // No API — derive everything locally from structured fields
      results = batch.map(inferRuleBased);
    } else {
      try {
        const prompt = buildBatchPrompt(batch);
        results = await callLLM(prompt);
      } catch (err) {
        log({ event: "llm.batch.error", offset, err: String(err) });
        totalErrors += batch.length;
        offset += BATCH_SIZE;
        await sleep(DELAY_MS * 3);
        continue;
      }
    }

    // Build a map for fast lookup
    const resultMap = new Map(results.map(r => [r.id, r]));

    for (const investor of batch) {
      const inference = resultMap.get(investor.id);
      if (!inference || !validateInference(inference)) {
        log({ event: "inference.invalid", investor_id: investor.id, inference });
        totalErrors++;
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (!investor.seniority)           patch.seniority           = inference.seniority;
      if (!investor.investor_type)       patch.investor_type       = inference.investor_type;
      if (!investor.short_summary)       patch.short_summary       = inference.short_summary;
      if (!investor.background_summary && inference.background_summary)
                                         patch.background_summary  = inference.background_summary;
      if (!investor.education_summary && inference.education_summary)
                                         patch.education_summary   = inference.education_summary;
      if (!investor.operator_background && inference.operator_background)
                                         patch.operator_background = inference.operator_background;
      if (!investor.prior_roles && Array.isArray(inference.prior_roles) && inference.prior_roles.length > 0)
                                         patch.prior_roles         = inference.prior_roles;

      if (Object.keys(patch).length === 0) continue;

      if (DRY_RUN) {
        log({ event: "dry_run", investor_id: investor.id, name: investor.full_name, patch });
      } else {
        const { error } = await sb.from("firm_investors").update(patch).eq("id", investor.id);
        if (error) {
          log({ event: "db.write.error", investor_id: investor.id, error: error.message });
          totalErrors++;
        } else {
          log({ event: "db.write.ok", investor_id: investor.id, name: investor.full_name, fields: Object.keys(patch) });
          totalProcessed++;
        }
      }
    }

    if (!DRY_RUN) {
      console.log(`  ✓ Batch ${batchNum}: ${batch.length} investors processed (total: ${totalProcessed})`);
    } else {
      console.log(`  [DRY RUN] Batch ${batchNum}: would update ${batch.length} investors`);
      totalProcessed += batch.length;
    }

    offset += BATCH_SIZE;
    if (!RULE_BASED) await sleep(DELAY_MS); // no need to throttle rule-based
  }

  return { processed: totalProcessed, errors: totalErrors };
}

// ─── Fund People Links Phase ──────────────────────────────────────────────────

async function runFundPeopleLinks(): Promise<{ inserted: number; errors: number }> {
  console.log("\n🔗 Phase 2b — vc_fund_people Population");
  console.log("   Strategy: SQL join firm_investors → fund_records via firm_id\n");

  // Use a SQL function to do this efficiently in bulk
  // NOTE: vc_fund_people.vc_fund_id → FK to vc_funds (canonical fund table),
  //       NOT fund_records. Join through vc_funds.firm_record_id.
  const insertSql = `
    INSERT INTO vc_fund_people (
      vc_fund_id, firm_investor_id, canonical_person_key,
      role, confidence, source, source_url,
      created_at, updated_at
    )
    SELECT
      vf.id                                        AS vc_fund_id,
      fi.id                                        AS firm_investor_id,
      LOWER(REGEXP_REPLACE(fi.full_name, '[^a-zA-Z0-9]', '-', 'g')) AS canonical_person_key,
      COALESCE(NULLIF(fi.title, ''), 'investor')   AS role,
      0.80                                         AS confidence,
      'firm_investor_join'                         AS source,
      ''                                           AS source_url,
      NOW()                                        AS created_at,
      NOW()                                        AS updated_at
    FROM firm_investors fi
    JOIN vc_funds vf
      ON vf.firm_record_id = fi.firm_id
    WHERE fi.ready_for_live = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM vc_fund_people vfp
        WHERE vfp.firm_investor_id = fi.id
          AND vfp.vc_fund_id = vf.id
      )
    RETURNING id
  `;

  if (DRY_RUN) {
    // Count what would be inserted
    const countSql = `
      SELECT COUNT(*) AS would_insert
      FROM firm_investors fi
      JOIN fund_records fr ON fr.firm_id = fi.firm_id
      WHERE fi.ready_for_live = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM vc_fund_people vfp
          WHERE vfp.firm_investor_id = fi.id AND vfp.vc_fund_id = fr.id
        )
    `;
    const { data, error } = await sb.rpc("execute_raw_sql", { sql: countSql }).single() as unknown as
      { data: { would_insert: number } | null; error: { message: string } | null };

    if (error) {
      // Fallback: use execute_sql if rpc not available
      console.log(`  [DRY RUN] Would populate vc_fund_people via firm_id join.`);
      console.log(`            Run without DRY_RUN=1 to execute.`);
    } else {
      console.log(`  [DRY RUN] Would insert ${data?.would_insert ?? "?"} rows into vc_fund_people.`);
    }
    return { inserted: 0, errors: 0 };
  }

  // Execute the insert directly via Supabase
  // Since we need raw SQL, use the postgres function or do it in chunks
  const { data, error } = await (sb as SupabaseClient & { rpc: Function }).rpc(
    "execute_raw_sql",
    { sql: insertSql },
  );

  if (error) {
    // rpc might not exist — fall back to chunked approach via individual inserts
    log({ event: "fund_people.sql.fallback", reason: error.message });
    return await runFundPeopleLinksFallback();
  }

  const inserted = Array.isArray(data) ? data.length : 0;
  log({ event: "fund_people.insert.ok", inserted });
  console.log(`  ✅ Inserted ${inserted} rows into vc_fund_people`);
  return { inserted, errors: 0 };
}

/** Fallback: fetch investors + their funds in pages, insert in batches */
async function runFundPeopleLinksFallback(): Promise<{ inserted: number; errors: number }> {
  console.log("  [fallback] Inserting vc_fund_people via batched upserts...");

  let offset = 0;
  const PAGE = 200;
  let totalInserted = 0;
  let totalErrors = 0;

  while (true) {
    // Fetch investors with their firm's fund_records
    const { data: investors, error: fetchErr } = await sb
      .from("firm_investors")
      .select("id, firm_id, full_name, title")
      .eq("ready_for_live", true)
      .range(offset, offset + PAGE - 1);

    if (fetchErr) { log({ event: "fund_people.fetch.error", error: fetchErr.message }); break; }
    if (!investors || investors.length === 0) break;

    // Get all vc_funds entries for these firm IDs (FK is firm_record_id, not firm_id)
    const firmIds = [...new Set(investors.map((i: Record<string, string>) => i.firm_id))];
    const { data: funds, error: fundErr } = await sb
      .from("vc_funds")
      .select("id, firm_record_id")
      .in("firm_record_id", firmIds);

    if (fundErr || !funds) {
      offset += PAGE;
      continue;
    }

    // Build a firm_record_id → fund_ids map
    const firmFunds = new Map<string, string[]>();
    for (const fund of funds as Array<{ id: string; firm_record_id: string }>) {
      if (!firmFunds.has(fund.firm_record_id)) firmFunds.set(fund.firm_record_id, []);
      firmFunds.get(fund.firm_record_id)!.push(fund.id);
    }

    // Build insert rows
    const insertRows = [];
    for (const inv of investors as Array<{ id: string; firm_id: string; full_name: string; title: string }>) {
      const fundIds = firmFunds.get(inv.firm_id) ?? [];
      for (const fundId of fundIds) {
        insertRows.push({
          vc_fund_id: fundId,
          firm_investor_id: inv.id,
          canonical_person_key: inv.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          role: inv.title || "investor",
          confidence: 0.80,
          source: "firm_investor_join",
          source_url: "",
        });
      }
    }

    if (insertRows.length === 0) {
      offset += PAGE;
      continue;
    }

    // Upsert in chunks of 100
    for (let i = 0; i < insertRows.length; i += 100) {
      const chunk = insertRows.slice(i, i + 100);
      const { error: insertErr } = await sb
        .from("vc_fund_people")
        .upsert(chunk, { onConflict: "vc_fund_id,firm_investor_id", ignoreDuplicates: true });

      if (insertErr) {
        log({ event: "fund_people.insert.error", error: insertErr.message });
        totalErrors++;
      } else {
        totalInserted += chunk.length;
      }
    }

    console.log(`  → Offset ${offset}: ${investors.length} investors, ${insertRows.length} fund links`);
    offset += PAGE;
    await sleep(200);
  }

  return { inserted: totalInserted, errors: totalErrors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Vekta Phase 2 — Inference + Fund People Links");
  console.log(`  Mode: ${RULE_BASED ? "rule-based (no API)" : "LLM"} | Dry run: ${DRY_RUN} | Batch: ${BATCH_SIZE} | Limit: ${LIMIT || "unlimited"}`);
  console.log("=".repeat(60));

  let llmStats   = { processed: 0, errors: 0 };
  let fundStats  = { inserted: 0, errors: 0 };

  if (!SKIP_LLM) {
    llmStats = await runLlmInference();
  } else {
    console.log("\n⏭️  Skipping LLM inference (SKIP_LLM=1)");
  }

  if (!SKIP_FUND_LINKS) {
    fundStats = await runFundPeopleLinks();
  } else {
    console.log("\n⏭️  Skipping fund people links (SKIP_FUND_LINKS=1)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Phase 2 Complete");
  if (!SKIP_LLM) {
    console.log(`  LLM — Updated:  ${llmStats.processed} investors`);
    console.log(`  LLM — Errors:   ${llmStats.errors}`);
  }
  if (!SKIP_FUND_LINKS) {
    console.log(`  Fund links — Inserted: ${fundStats.inserted} rows`);
    console.log(`  Fund links — Errors:   ${fundStats.errors}`);
  }
  console.log(`  Log: ${LOG_FILE}`);
  console.log("=".repeat(60) + "\n");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WAITLIST_BASE_URL =
  Deno.env.get("WAITLIST_BASE_URL") || "https://vekta.app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TallyOption { id: string; text: string }

interface TallyField {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
  options?: TallyOption[];
}

interface ParsedPayload {
  email: string | null;
  name: string | null;
  role: string | null;
  stage: string | null;
  urgency: string | null;
  intent: string[];
  biggest_pain: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  referral_code: string | null;
  source: string | null;
  campaign: string | null;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSnake(s: string): string {
  return s.toLowerCase()
    .replace(/[\u2018\u2019\u0027\u02BC]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function stripDash(s: string): string {
  return s.replace(/^[\-\u2013\u2014]\s*/, "").trim();
}

function looksLikeId(s: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^[0-9a-f]{24,}$/i.test(s)) return true;
  return false;
}

function getField(obj: Record<string, unknown>, labels: string[]): unknown | null {
  for (const label of labels) {
    if (obj[label] !== undefined && obj[label] !== null && obj[label] !== "") return obj[label];
    const lower = label.toLowerCase();
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === lower && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
        return obj[key];
      }
    }
  }
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0].trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => typeof x === "string" ? x.trim() : "").filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function humanize(v: string | null): string | null {
  if (!v) return null;
  if (looksLikeId(v)) return null;
  return v;
}

function decodeSelect(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  if (looksLikeId(s)) return null;
  return stripDash(s);
}

function normalizeBooleanGroup(obj: Record<string, unknown>, baseLabel: string): string | null {
  for (const suffix of [" (Yes)", " (yes)", " (YES)"]) {
    const val = getField(obj, [baseLabel + suffix]);
    if (val !== null) return "yes";
  }
  for (const suffix of [" (No)", " (no)", " (NO)"]) {
    const val = getField(obj, [baseLabel + suffix]);
    if (val !== null) return "no";
  }
  for (const suffix of [" (Unsure)", " (unsure)", " (UNSURE)", " (Maybe)", " (maybe)"]) {
    const val = getField(obj, [baseLabel + suffix]);
    if (val !== null) return "unsure";
  }
  const raw = getField(obj, [baseLabel]);
  if (raw === null) return null;
  const s = asString(raw);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith("yes")) return "yes";
  if (lower.startsWith("no")) return "no";
  if (lower.startsWith("unsure") || lower.startsWith("maybe")) return "unsure";
  return s;
}

function deriveCompanyNameFromWebsite(url: string | null): string | null {
  if (!url) return null;
  try {
    let clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) clean = "https://" + clean;
    const host = new URL(clean).hostname.replace(/^www\./, "");
    const name = host.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Option ID resolution for Tally fields
// ---------------------------------------------------------------------------

function resolveFieldValue(field: TallyField): string | string[] | null {
  const v = field.value;
  if (v == null || v === "") return null;

  const optMap = new Map<string, string>();
  if (field.options && Array.isArray(field.options)) {
    for (const o of field.options) {
      if (o && typeof o.id === "string" && typeof o.text === "string") {
        optMap.set(o.id, stripDash(o.text));
      }
    }
  }

  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      if (typeof item === "string") {
        const text = optMap.get(item);
        if (text) { out.push(text); }
        else if (!looksLikeId(item)) { out.push(stripDash(item)); }
        else { console.warn(`[tally] unresolved array ID: "${item}" field="${field.label}"`); }
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === "string") out.push(stripDash(obj.text));
        else if (typeof obj.label === "string") out.push(stripDash(obj.label));
        else if (typeof obj.id === "string" && optMap.has(obj.id)) out.push(optMap.get(obj.id)!);
      }
    }
    return out.length > 0 ? out : null;
  }

  if (typeof v === "string") {
    const text = optMap.get(v);
    if (text) return text;
    if (!looksLikeId(v)) return stripDash(v);
    console.warn(`[tally] unresolved ID: "${v}" field="${field.label}" opts=${optMap.size}`);
    return null;
  }

  if (typeof v === "number" || typeof v === "boolean") return String(v);

  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    if (typeof obj.text === "string") return stripDash(obj.text);
    if (typeof obj.label === "string") return stripDash(obj.label);
    if (typeof obj.id === "string") return optMap.get(obj.id) ?? null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Label matching — exact lowercase ➜ snake_case ➜ substring
// ---------------------------------------------------------------------------

const EXACT_LABELS: Record<string, string> = {
  "email address": "email",
  "email": "email",
  "first name": "first_name",
  "last name": "last_name",
  "name": "name",
  "full name": "name",
  "what best describes you?": "role",
  "which best describes you?": "role",
  "what stage are you at?": "stage",
  "what kind of investor are you?": "investor_type",
  "what type of investor are you?": "investor_type",
  "what kind of operator are you?": "operator_type",
  "are you raising in the next 6 months?": "urgency_raising",
  "are you actively raising in the next 6 months?": "urgency_raising",
  "are you actively deploying capital in the next 6 months?": "urgency_deploying",
  "what's your biggest priority?": "intent",
  "what\u2019s your biggest priority?": "intent",
  "what's the hardest part right now?": "biggest_pain",
  "what\u2019s the hardest part right now?": "biggest_pain",
  "linkedin url": "linkedin_url",
  "linkedin": "linkedin_url",
  "company website": "company_website",
  "company name": "company_name",
  "company or firm name": "company_name",
  "what priority access?": "priority_access",
  "referral code": "referral_code",
  "ref": "referral_code",
  "source": "source",
  "campaign": "campaign",
};

const SUBSTRING_HINTS: [string, string][] = [
  ["email", "email"],
  ["first name", "first_name"],
  ["last name", "last_name"],
  ["best describes you", "role"],
  ["stage are you", "stage"],
  ["kind of investor", "investor_type"],
  ["type of investor", "investor_type"],
  ["kind of operator", "operator_type"],
  ["raising in the next", "urgency_raising"],
  ["deploying capital", "urgency_deploying"],
  ["biggest priority", "intent"],
  ["hardest part", "biggest_pain"],
  ["linkedin", "linkedin_url"],
  ["company website", "company_website"],
  ["company name", "company_name"],
  ["firm name", "company_name"],
  ["priority access", "priority_access"],
  ["referral", "referral_code"],
];

function matchFieldToCanonical(rawLabel: string): string | null {
  const lower = rawLabel.toLowerCase().trim();
  if (!lower) return null;
  if (EXACT_LABELS[lower]) return EXACT_LABELS[lower];
  const snake = toSnake(rawLabel);
  if (EXACT_LABELS[snake]) return EXACT_LABELS[snake];
  for (const [hint, canonical] of SUBSTRING_HINTS) {
    if (lower.includes(hint)) return canonical;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tally parser — primary pass: structured field iteration
// ---------------------------------------------------------------------------

function isTallyWebhook(body: Record<string, unknown>): boolean {
  if (typeof body.eventType === "string") return true;
  if (body.data && typeof body.data === "object") {
    const d = body.data as Record<string, unknown>;
    if (Array.isArray(d.fields)) return true;
  }
  return false;
}

function parseTallyPayload(body: Record<string, unknown>): ParsedPayload {
  const data = (body.data ?? body) as Record<string, unknown>;
  const fields = (Array.isArray(data.fields) ? data.fields : []) as TallyField[];

  let firstName: string | null = null;
  let lastName: string | null = null;
  let companyWebsite: string | null = null;
  let urgencyValue: string | null = null;
  let urgencyIsDeploying = false;
  const allIntents: string[] = [];
  const mapped: Map<string, string | string[] | null> = new Map();
  const fieldLog: string[] = [];
  const seenLabels: string[] = [];
  const unmapped: Record<string, unknown> = {};

  for (const field of fields) {
    const rawLabel = (field.label ?? field.key ?? "").trim();
    seenLabels.push(rawLabel);
    const canonical = matchFieldToCanonical(rawLabel);
    const val = resolveFieldValue(field);

    fieldLog.push(`label="${rawLabel}" → ${canonical ?? "UNMAPPED"} = ${JSON.stringify(val)}`);

    if (!canonical) {
      unmapped[rawLabel] = val ?? field.value;
      continue;
    }

    if (canonical === "first_name") { firstName = asString(val); continue; }
    if (canonical === "last_name") { lastName = asString(val); continue; }
    if (canonical === "intent") {
      for (const item of asStringArray(val)) {
        const norm = normalizeIntent(item);
        if (!allIntents.includes(norm)) allIntents.push(norm);
      }
      continue;
    }
    if (canonical === "company_website") { companyWebsite = asString(val); continue; }
    if (canonical === "urgency_raising") { urgencyValue = asString(val); urgencyIsDeploying = false; continue; }
    if (canonical === "urgency_deploying") { if (!urgencyValue) { urgencyValue = asString(val); urgencyIsDeploying = true; } continue; }
    if (canonical === "investor_type" || canonical === "operator_type") {
      if (!mapped.has("stage")) mapped.set("stage", val);
      mapped.set(canonical, val);
      continue;
    }
    if (!mapped.has(canonical)) mapped.set(canonical, val);
  }

  console.log("[waitlist-signup] field map:\n" + fieldLog.join("\n"));
  if (Object.keys(unmapped).length > 0) {
    console.log("[waitlist-signup] unmapped fields:", JSON.stringify(unmapped));
  }

  // ------------------------------------------------------------------
  // FALLBACK LAYER — read unmapped fields by raw label as safety net
  // ------------------------------------------------------------------

  const fb = unmapped;

  if (!firstName) firstName = asString(getField(fb, ["First name", "First Name", "first name"]));
  if (!lastName) lastName = asString(getField(fb, ["Last name", "Last Name", "last name"]));
  if (!mapped.has("email")) {
    const fbEmail = asString(getField(fb, ["Email address", "Email Address", "Email", "email"]));
    if (fbEmail) mapped.set("email", fbEmail);
  }
  if (!companyWebsite) {
    companyWebsite = asString(getField(fb, ["Company website", "Company Website", "Website", "Company URL"]));
  }
  if (!mapped.has("linkedin_url")) {
    const fbLinkedin = asString(getField(fb, ["LinkedIn URL", "LinkedIn", "linkedin url", "linkedin"]));
    if (fbLinkedin) mapped.set("linkedin_url", fbLinkedin);
  }
  if (!mapped.has("biggest_pain")) {
    const fbPain = asString(getField(fb, [
      "What's the hardest part right now?",
      "What\u2019s the hardest part right now?",
      "Hardest part",
    ]));
    if (fbPain) mapped.set("biggest_pain", fbPain);
  }

  const fbRaising = normalizeBooleanGroup(fb, "Are you raising in the next 6 months?");
  const fbDeploying = normalizeBooleanGroup(fb, "Are you actively deploying capital in the next 6 months?");
  if (!urgencyValue && fbRaising) { urgencyValue = fbRaising; urgencyIsDeploying = false; }
  if (!urgencyValue && fbDeploying) { urgencyValue = fbDeploying; urgencyIsDeploying = true; }

  if (!mapped.has("investor_type")) {
    const fbInvestorType = decodeSelect(getField(fb, [
      "What kind of investor are you?",
      "What type of investor are you?",
    ]));
    if (fbInvestorType) { mapped.set("investor_type", fbInvestorType); if (!mapped.has("stage")) mapped.set("stage", fbInvestorType); }
  }
  if (!mapped.has("role")) {
    const fbRole = decodeSelect(getField(fb, [
      "What best describes you?",
      "Which best describes you?",
    ]));
    if (fbRole) mapped.set("role", fbRole);
  }

  if (allIntents.length === 0) {
    const fbIntent = getField(fb, [
      "What's your biggest priority?",
      "What\u2019s your biggest priority?",
    ]);
    if (fbIntent) {
      for (const item of asStringArray(fbIntent)) {
        const decoded = decodeSelect(item);
        if (decoded) {
          const norm = normalizeIntent(decoded);
          if (!allIntents.includes(norm)) allIntents.push(norm);
        }
      }
    }
  }

  if (!mapped.has("priority_access")) {
    const fbPA = decodeSelect(getField(fb, ["What priority access?"]));
    if (fbPA) mapped.set("priority_access", fbPA);
  }

  // ------------------------------------------------------------------
  // Assemble final values
  // ------------------------------------------------------------------

  const str = (k: string): string | null => {
    const v = mapped.get(k);
    if (typeof v === "string") return v.trim() || null;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0].trim() || null;
    return null;
  };

  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || str("name") || null;
  const rawRole = humanize(str("role"));
  const rawStage = humanize(str("stage"));

  const role = normalizeRole(rawRole);
  const stage = normalizeStage(rawStage);

  let urgency: string | null = null;
  if (urgencyValue) {
    const lower = urgencyValue.toLowerCase().trim();
    if (/^yes/i.test(lower)) urgency = urgencyIsDeploying ? "actively_deploying" : "actively_raising";
    else if (/^no/i.test(lower)) urgency = "not_yet";
    else if (/^unsure/i.test(lower) || /^maybe/i.test(lower)) urgency = "exploring";
    else urgency = toSnake(lower);
  }

  const email = str("email");

  console.log("[waitlist-signup] canonical:", JSON.stringify({
    email, name, role, stage, urgency,
    intent: allIntents,
    biggest_pain: str("biggest_pain"),
    company_name: str("company_name") ?? deriveCompanyNameFromWebsite(companyWebsite),
    linkedin_url: str("linkedin_url"),
    source: str("source") || "tally",
  }));

  return {
    email,
    name,
    role,
    stage,
    urgency,
    intent: allIntents,
    biggest_pain: str("biggest_pain"),
    company_name: str("company_name") ?? deriveCompanyNameFromWebsite(companyWebsite),
    linkedin_url: str("linkedin_url"),
    referral_code: str("referral_code"),
    source: str("source") || "tally",
    campaign: str("campaign"),
    metadata: {
      tally_form_id: data.formId ?? data.formID ?? null,
      tally_form_name: data.formName ?? null,
      tally_response_id: data.responseId ?? data.responseID ?? null,
      tally_raw: body,
      ...(companyWebsite ? { company_website: companyWebsite } : {}),
      ...(mapped.has("investor_type") ? { investor_type: humanize(asString(mapped.get("investor_type") ?? null)) } : {}),
      ...(mapped.has("operator_type") ? { operator_type: humanize(asString(mapped.get("operator_type") ?? null)) } : {}),
      ...(mapped.has("priority_access") ? { priority_access: humanize(asString(mapped.get("priority_access") ?? null)) } : {}),
      ...(Object.keys(unmapped).length > 0 ? { tally_unmapped_fields: unmapped } : {}),
      tally_labels_seen: seenLabels,
    },
  };
}

// ---------------------------------------------------------------------------
// Intent normalizer
// ---------------------------------------------------------------------------

const INTENT_NORM: Record<string, string> = {
  find_investors: "find_investors",
  get_warm_intros: "get_warm_intros",
  track_competitors: "track_competitors",
  source_deals: "source_deals",
  monitor_market_trends: "monitor_market_trends",
  build_relationships: "build_relationships",
  find_founders: "find_founders",
  track_markets: "track_markets",
  monitor_sectors: "monitor_sectors",
  find_opportunities: "find_opportunities",
  track_companies: "track_companies",
  monitor_markets: "monitor_markets",
  other: "other",
};

function normalizeIntent(raw: string): string {
  return INTENT_NORM[toSnake(raw)] ?? toSnake(raw);
}

// ---------------------------------------------------------------------------
// Role / stage normalizers
// ---------------------------------------------------------------------------

function normalizeRole(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower.includes("founder")) return "founder";
  if (lower.includes("investor")) return "investor";
  if (lower.includes("operator")) return "operator";
  if (lower.includes("advisor") || lower.includes("consultant")) return "advisor";
  if (lower === "other") return "other";
  return lower;
}

function normalizeStage(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "idea" || lower === "idea stage") return "idea";
  if (/pre.?seed/i.test(lower)) return "pre-seed";
  if (lower === "seed") return "seed";
  if (/series.?a\+/i.test(lower)) return "series-a-plus";
  if (/series.?a/i.test(lower)) return "series-a";
  if (/series.?b/i.test(lower)) return "series-b+";
  if (lower === "angel") return "angel";
  if (/multi.?stage/i.test(lower)) return "multi-stage";
  return toSnake(lower);
}

// ---------------------------------------------------------------------------
// Match + email helpers (file-scope so handler can call them)
// ---------------------------------------------------------------------------

interface MatchResult {
  name: string;
  firm?: string;
}

function classifySignup(signup: { role: string | null; stage: string | null }): "investor" | "founder" | "other" {
  const role = (signup.role ?? "").toLowerCase();
  const stage = (signup.stage ?? "").toLowerCase();
  if (role.includes("investor")) return "investor";
  if (role.includes("founder")) return "founder";
  return "other";
}

async function generateMatches(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  classification: "investor" | "founder" | "other",
): Promise<MatchResult[]> {
  try {
    if (classification === "founder") {
      // Founders want to find investors → query firm_investors + firm_records
      const { data, error } = await supabase
        .from("firm_investors")
        .select("full_name, firm_records(firm_name)")
        .is("deleted_at", null)
        .limit(5);
      if (error) {
        console.warn("[waitlist-signup] generateMatches firm_investors error:", error.message);
        return [];
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        name: (r.full_name as string) ?? "Unknown",
        firm: (r.firm_records as Record<string, unknown> | null)?.firm_name as string | undefined,
      }));
    }

    if (classification === "investor") {
      // Investors want to find founders/operators → query operator_profiles
      const { data, error } = await supabase
        .from("operator_profiles")
        .select("full_name, current_company_name")
        .is("deleted_at", null)
        .limit(5);
      if (error) {
        console.warn("[waitlist-signup] generateMatches operator_profiles error:", error.message);
        return [];
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        name: (r.full_name as string) ?? "Unknown",
        firm: (r.current_company_name as string | null) ?? undefined,
      }));
    }

    return [];
  } catch (err) {
    console.warn("[waitlist-signup] generateMatches unexpected error:", err);
    return [];
  }
}

async function sendMatchEmail(opts: {
  email: string;
  classification: "investor" | "founder" | "other";
  matches: MatchResult[];
}): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[waitlist-signup] RESEND_API_KEY not set — skipping match email");
    return;
  }
  if (opts.classification === "other") {
    console.log("[waitlist-signup] classification=other — skipping match email");
    return;
  }
  if (opts.matches.length === 0) {
    console.log("[waitlist-signup] no matches found — skipping match email");
    return;
  }

  const label = opts.classification === "founder" ? "investors" : "founders";
  const rows = opts.matches
    .map((m) => `<li>${m.name}${m.firm ? ` — <em>${m.firm}</em>` : ""}</li>`)
    .join("\n");

  const html = `
<p>Hi,</p>
<p>You've joined the Vekta waitlist. Here are some ${label} you might want to connect with:</p>
<ul>
${rows}
</ul>
<p>We'll be in touch soon.<br/>— The Vekta Team</p>
`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vekta <hello@vekta.app>",
        to: [opts.email],
        subject: `Your Vekta matches are ready`,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[waitlist-signup] Resend API error:", res.status, body);
    } else {
      console.log("[waitlist-signup] match email sent to", opts.email);
    }
  } catch (err) {
    console.warn("[waitlist-signup] sendMatchEmail fetch error:", err);
  }
}

// ---------------------------------------------------------------------------
// Direct JSON parser (unchanged)
// ---------------------------------------------------------------------------

function parseDirectPayload(body: Record<string, unknown>): ParsedPayload {
  const rawIntent = body.intent;
  let intent: string[] = [];
  if (Array.isArray(rawIntent)) intent = rawIntent.map(String);
  else if (typeof rawIntent === "string" && rawIntent.trim()) intent = [rawIntent];

  return {
    email: typeof body.email === "string" ? body.email : null,
    name: (body.name as string) ?? null,
    role: (body.role as string) ?? null,
    stage: (body.stage as string) ?? null,
    urgency: (body.urgency as string) ?? null,
    intent,
    biggest_pain: (body.biggest_pain as string) ?? null,
    company_name: (body.company_name as string) ?? null,
    linkedin_url: (body.linkedin_url as string) ?? null,
    referral_code: (body.referral_code as string) ?? null,
    source: (body.source as string) ?? null,
    campaign: (body.campaign as string) ?? null,
    metadata: (body.metadata as Record<string, unknown>) ?? {},
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    console.log("[waitlist-signup] raw body:", JSON.stringify(body).slice(0, 4000));

    const isTally = isTallyWebhook(body);
    console.log("[waitlist-signup] detected as:", isTally ? "TALLY" : "DIRECT");

    const parsed = isTally ? parseTallyPayload(body) : parseDirectPayload(body);

    const email = String(parsed.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      const labels = (parsed.metadata?.tally_labels_seen as string[]) ?? [];
      const hint = labels.length > 0
        ? ` Tally labels seen: [${labels.join(", ")}]`
        : "";
      console.error(`[waitlist-signup] MISSING EMAIL after parse+fallback.${hint}`);
      return new Response(
        JSON.stringify({
          error: `A valid email is required. Could not extract email from payload.${hint}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("waitlist_signup", {
      p_email: email,
      p_name: parsed.name ?? null,
      p_role: parsed.role ?? null,
      p_stage: parsed.stage ?? null,
      p_urgency: parsed.urgency ?? null,
      p_intent: parsed.intent,
      p_biggest_pain: parsed.biggest_pain ?? null,
      p_company_name: parsed.company_name ?? null,
      p_linkedin_url: parsed.linkedin_url ?? null,
      p_source: parsed.source ?? null,
      p_campaign: parsed.campaign ?? null,
      p_referral_code_used: parsed.referral_code ?? null,
      p_metadata: parsed.metadata ?? {},
    });

    if (error) {
      console.error("waitlist_signup RPC error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (data?.error) {
      return new Response(
        JSON.stringify({ error: data.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // ===== MATCH + EMAIL TRIGGER =====
if (email) {
  try {
    const signup = {
      email,
      role: parsed.role,
      stage: parsed.stage,
    };

    const classification = classifySignup(signup);
    const matches = await generateMatches(supabase, classification);

    await sendMatchEmail({
      email,
      classification,
      matches,
    });

    console.log("[waitlist-signup] match + email sent", {
      email,
      classification,
      matchCount: matches.length,
    });
  } catch (err) {
    console.error("[waitlist-signup] match/email error", err);
  }
}

    const result = {
      ...data,
      referral_link: `${WAITLIST_BASE_URL}?ref=${data.referral_code}`,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("waitlist-signup error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

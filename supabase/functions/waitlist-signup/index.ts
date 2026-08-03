import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WAITLIST_BASE_URL =
  Deno.env.get("WAITLIST_BASE_URL") || "https://vekta.app";

function waitlistReferralShareUrl(code: string): string {
  const base = WAITLIST_BASE_URL.replace(/\/$/, "");
  const path = `${base}/access`;
  const t = code.trim();
  if (!t) return path;
  return `${path}?ref=${encodeURIComponent(t)}`;
}

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
  sector: string | null;
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
    sector: null,
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
// Direct JSON parser
// ---------------------------------------------------------------------------

/** Same precedence as RPC input: body.referral_code ?? body.ref (Tally may only set parsed.referral_code). */
function referralFromBodyOnly(body: Record<string, unknown>): string | null {
  const referral = body.referral_code ?? body.ref ?? null;
  return typeof referral === "string" ? referral : null;
}

/** PostgREST can return jsonb aggregates as JSON strings — normalize before spreading into the HTTP body. */
function asRpcJsonObject(data: unknown): Record<string, unknown> {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

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
    sector: typeof body.sector === "string" ? body.sector.trim() || null : null,
    urgency: (body.urgency as string) ?? null,
    intent,
    biggest_pain: (body.biggest_pain as string) ?? null,
    company_name: (body.company_name as string) ?? null,
    linkedin_url: (body.linkedin_url as string) ?? null,
    referral_code: referralFromBodyOnly(body),
    source: (body.source as string) ?? null,
    campaign: (body.campaign as string) ?? null,
    metadata: (body.metadata as Record<string, unknown>) ?? {},
  };
}

// ---------------------------------------------------------------------------
// Google Sheets sync — Apps Script webhook approach (no service account needed)
// Set WAITLIST_SHEETS_WEBHOOK_URL to your deployed Apps Script web app URL.
// See scripts/waitlist-sheets.gs for the script to paste into your sheet.
// ---------------------------------------------------------------------------

async function syncToGoogleSheet(parsed: ParsedPayload, rpcPayload: Record<string, unknown>): Promise<void> {
  const webhookUrl = Deno.env.get("WAITLIST_SHEETS_WEBHOOK_URL");
  if (!webhookUrl) {
    console.log("[waitlist-signup] Google Sheets sync skipped: WAITLIST_SHEETS_WEBHOOK_URL not set");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        email: parsed.email ?? "",
        name: parsed.name ?? "",
        role: parsed.role ?? "",
        stage: parsed.stage ?? "",
        sector: parsed.sector ?? "",
        urgency: parsed.urgency ?? "",
        intent: parsed.intent.join(", "),
        biggest_pain: parsed.biggest_pain ?? "",
        company_name: parsed.company_name ?? "",
        linkedin_url: parsed.linkedin_url ?? "",
        source: parsed.source ?? "",
        campaign: parsed.campaign ?? "",
        status: String(rpcPayload.status ?? ""),
        waitlist_position: String(rpcPayload.waitlist_position ?? ""),
        referral_code: String(rpcPayload.referral_code ?? ""),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[waitlist-signup] Google Sheets webhook failed (${res.status}): ${text.slice(0, 200)}`);
    } else {
      console.log("[waitlist-signup] Google Sheets row synced for", parsed.email);
    }
  } catch (err) {
    console.error("[waitlist-signup] syncToGoogleSheet error:", err);
  }
}

// ---------------------------------------------------------------------------
// HubSpot sync — private app token approach
// Set HUBSPOT_ACCESS_TOKEN to your HubSpot private app token.
// ---------------------------------------------------------------------------

async function syncToHubSpot(parsed: ParsedPayload): Promise<void> {
  const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
  if (!token) {
    console.log("[waitlist-signup] HubSpot sync skipped: HUBSPOT_ACCESS_TOKEN not set");
    return;
  }

  try {
    const nameParts = (parsed.name ?? "").trim().split(/\s+/);
    const firstname = nameParts[0] ?? "";
    const lastname = nameParts.slice(1).join(" ");

    const properties: Record<string, string> = {};
    if (parsed.email) properties.email = parsed.email;
    if (firstname) properties.firstname = firstname;
    if (lastname) properties.lastname = lastname;
    if (parsed.company_name) properties.company = parsed.company_name;
    if (parsed.role) properties.jobtitle = parsed.role;
    if (parsed.linkedin_url) properties.website = parsed.linkedin_url;

    const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties }),
    });

    if (createRes.status === 409) {
      const body = await createRes.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof body.message === "string" ? body.message : "";
      const match = msg.match(/Existing ID: (\d+)/);
      const existingId = match?.[1];
      if (existingId) {
        const updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ properties }),
        });
        if (updateRes.ok) {
          console.log("[waitlist-signup] HubSpot contact updated for", parsed.email);
        } else {
          console.warn("[waitlist-signup] HubSpot update failed:", updateRes.status);
        }
      }
    } else if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      console.error(`[waitlist-signup] HubSpot create failed (${createRes.status}): ${text.slice(0, 200)}`);
    } else {
      console.log("[waitlist-signup] HubSpot contact created for", parsed.email);
    }
  } catch (err) {
    console.error("[waitlist-signup] syncToHubSpot error:", err);
  }
}

// ---------------------------------------------------------------------------
// Loops waitlist confirmation email
// Set LOOPS_API_KEY (or the waitlist-specific LOOPS_API_KEY_WAITLIST override)
// in Supabase Edge Function secrets. LOOPS_WAITLIST_TRANSACTIONAL_ID can
// optionally override the published template configured below.
// The Loops template should define data variables:
// referralCode, referralLink, waitlistPosition.
// ---------------------------------------------------------------------------

const DEFAULT_LOOPS_WAITLIST_TRANSACTIONAL_ID = "cmrmhqcic00670jxx9srojqea";

type WaitlistConfirmationEmailResult = {
  sent: boolean;
  status: "sent" | "already_sent" | "not_configured" | "failed";
  detail?: string;
};

async function sendWaitlistLoopsEmail(opts: {
  email: string;
  result: Record<string, unknown>;
  name?: string;
  companyName?: string;
  alreadySent: boolean;
}): Promise<WaitlistConfirmationEmailResult> {
  const loopsApiKey = Deno.env.get("LOOPS_API_KEY_WAITLIST") ?? Deno.env.get("LOOPS_API_KEY");
  const transactionalId =
    Deno.env.get("LOOPS_WAITLIST_TRANSACTIONAL_ID")?.trim() ||
    DEFAULT_LOOPS_WAITLIST_TRANSACTIONAL_ID;

  if (!loopsApiKey || !transactionalId) {
    console.log("[waitlist-signup] Loops email skipped: missing Loops secrets");
    return { sent: false, status: "not_configured" };
  }

  if (opts.alreadySent) {
    console.log("[waitlist-signup] Loops confirmation already recorded for", opts.email);
    return { sent: true, status: "already_sent" };
  }

  try {
    // A fresh key is required for each database-authorized retry: Loops retains
    // an idempotency key even when the original request was rejected with 400.
    const idempotencyKey = `waitlist-confirmation-${String(opts.result.id ?? "user")}-${crypto.randomUUID()}`;
    const referralCode = String(opts.result.referral_code ?? "");
    const referralLink = String(opts.result.referral_link ?? "");
    const waitlistPosition =
      opts.result.waitlist_position === null || opts.result.waitlist_position === undefined
        ? ""
        : String(opts.result.waitlist_position);
    const name = opts.name?.trim() ?? "";
    const [firstName = "", ...lastNameParts] = name.split(/\s+/).filter(Boolean);
    const lastName = lastNameParts.join(" ");
    const knownDataVariables: Record<string, string> = {
      referralCode,
      referral_code: referralCode,
      code: referralCode,
      referralLink,
      referral_link: referralLink,
      inviteLink: referralLink,
      invite_link: referralLink,
      shareLink: referralLink,
      share_link: referralLink,
      confirmationUrl: referralLink,
      confirmation_url: referralLink,
      waitlistPosition,
      waitlist_position: waitlistPosition,
      position: waitlistPosition,
      email: opts.email,
      name,
      fullName: name,
      fullname: name,
      full_name: name,
      firstName,
      firstname: firstName,
      first_name: firstName,
      lastName,
      lastname: lastName,
      last_name: lastName,
      company: opts.companyName?.trim() ?? "",
      companyName: opts.companyName?.trim() ?? "",
      companyname: opts.companyName?.trim() ?? "",
      company_name: opts.companyName?.trim() ?? "",
    };

    // Loops rejects requests when any variable configured on the published
    // template is absent. Resolve the template first so edits in Loops do not
    // silently break waitlist confirmations.
    let dataVariables = knownDataVariables;
    try {
      const templatesRes = await fetch(
        "https://app.loops.so/api/v1/transactional?perPage=50",
        { headers: { Authorization: `Bearer ${loopsApiKey}` } },
      );
      if (templatesRes.ok) {
        const templatesBody = await templatesRes.json() as {
          data?: Array<{ id?: string; dataVariables?: string[] }>;
        };
        const template = templatesBody.data?.find((item) => item.id === transactionalId);
        if (template?.dataVariables) {
          dataVariables = Object.fromEntries(
            template.dataVariables.map((variable) => [variable, knownDataVariables[variable] ?? ""]),
          );
        }
      }
    } catch (err) {
      console.warn("[waitlist-signup] Loops template lookup failed; using compatible aliases:", err);
    }

    const res = await fetch("https://app.loops.so/api/v1/transactional", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loopsApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transactionalId,
        email: opts.email,
        addToAudience: true,
        dataVariables,
      }),
    });

    const body = await res.text().catch(() => "");
    if (res.status === 409) {
      console.log("[waitlist-signup] Loops confirmation already accepted for", opts.email);
      return { sent: true, status: "already_sent" };
    }
    if (!res.ok) {
      console.warn("[waitlist-signup] Loops API error:", res.status, body.slice(0, 500));
      let providerMessage = "";
      try {
        const errorBody = JSON.parse(body) as {
          message?: unknown;
          error?: { message?: unknown };
        };
        const message = errorBody.message ?? errorBody.error?.message;
        if (typeof message === "string") {
          providerMessage = message.replace(/[\r\n]+/g, " ").slice(0, 300);
        }
      } catch {
        // Keep the audit entry useful without persisting arbitrary response HTML.
      }
      return {
        sent: false,
        status: "failed",
        detail: `Loops HTTP ${res.status}${providerMessage ? `: ${providerMessage}` : ""}`,
      };
    }

    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(body) as Record<string, unknown>;
    } catch {
      // A successful HTTP response is sufficient when Loops returns no JSON body.
    }
    if (parsedBody && parsedBody.success !== true) {
      console.warn("[waitlist-signup] Loops API did not confirm success:", body.slice(0, 500));
      return { sent: false, status: "failed", detail: "Loops did not confirm success" };
    }

    console.log("[waitlist-signup] Loops waitlist email sent to", opts.email);
    return { sent: true, status: "sent" };
  } catch (err) {
    console.warn("[waitlist-signup] sendWaitlistLoopsEmail error:", err);
    return {
      sent: false,
      status: "failed",
      detail: err instanceof Error ? err.message : "Unexpected Loops error",
    };
  }
}

async function recordWaitlistConfirmationEmailResult(
  supabase: ReturnType<typeof createClient>,
  userId: unknown,
  emailResult: WaitlistConfirmationEmailResult,
): Promise<void> {
  if (typeof userId !== "string" || !userId) return;
  if (emailResult.status === "already_sent") return;
  const { error } = await supabase.from("waitlist_events").insert({
    user_id: userId,
    event_type: emailResult.sent ? "confirmation_email_sent" : "confirmation_email_not_sent",
    payload: {
      provider: "loops",
      status: emailResult.status,
      ...(emailResult.detail ? { detail: emailResult.detail } : {}),
    },
  });
  if (error) {
    console.warn("[waitlist-signup] confirmation email event insert failed:", error.message);
  }
}

async function hasSentWaitlistConfirmationEmail(
  supabase: ReturnType<typeof createClient>,
  userId: unknown,
): Promise<boolean> {
  if (typeof userId !== "string" || !userId) return false;
  const { data, error } = await supabase
    .from("waitlist_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", "confirmation_email_sent")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[waitlist-signup] confirmation email audit lookup failed:", error.message);
    return false;
  }
  return Boolean(data);
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
    const body = (await req.json()) as Record<string, unknown>;
    console.log("[waitlist-signup] raw body:", JSON.stringify(body).slice(0, 4000));

    const isTally = isTallyWebhook(body);
    console.log("[waitlist-signup] detected as:", isTally ? "TALLY" : "DIRECT");

    const parsed = isTally ? parseTallyPayload(body) : parseDirectPayload(body);

    const referral =
      referralFromBodyOnly(body) ??
      (typeof parsed.referral_code === "string" ? parsed.referral_code : null);
    const normalizedReferral = referral?.trim().toUpperCase() || null;

    console.log("REFERRAL INPUT:", body.ref, body.referral_code);
    console.log("NORMALIZED REFERRAL:", normalizedReferral);

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
      p_referral_code: normalizedReferral,
      p_sector: parsed.sector ?? null,
      p_metadata: parsed.metadata ?? {},
    });

    if (error) {
      console.error("waitlist_signup RPC error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rpcPayload = asRpcJsonObject(data);
    if (Deno.env.get("WAITLIST_DEBUG") === "1") {
      console.log("[waitlist-signup] waitlist_signup RPC payload:", JSON.stringify(rpcPayload));
    }

    if (rpcPayload.error) {
      return new Response(
        JSON.stringify({ error: rpcPayload.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = {
      ...rpcPayload,
      referral_link: waitlistReferralShareUrl(String(rpcPayload.referral_code ?? "")),
    };

    // ===== GOOGLE SHEETS + HUBSPOT SYNC =====
    console.log("[waitlist-signup] sync-check", {
      hasSheetUrl: !!Deno.env.get("WAITLIST_SHEETS_WEBHOOK_URL"),
      hasHubspot: !!Deno.env.get("HUBSPOT_ACCESS_TOKEN"),
      hasLoops: !!(Deno.env.get("LOOPS_API_KEY_WAITLIST") ?? Deno.env.get("LOOPS_API_KEY")) &&
        !!(Deno.env.get("LOOPS_WAITLIST_TRANSACTIONAL_ID")?.trim() ||
          DEFAULT_LOOPS_WAITLIST_TRANSACTIONAL_ID),
    });
    const confirmationAlreadySent = await hasSentWaitlistConfirmationEmail(supabase, rpcPayload.id);
    const [, , confirmationEmail] = await Promise.all([
      syncToGoogleSheet(parsed, rpcPayload),
      syncToHubSpot(parsed),
      sendWaitlistLoopsEmail({
        email,
        result,
        name: parsed.name,
        companyName: parsed.company_name,
        alreadySent: confirmationAlreadySent,
      }),
    ]);
    await recordWaitlistConfirmationEmailResult(supabase, rpcPayload.id, confirmationEmail);
    console.log("[waitlist-signup] sync-done");

    return new Response(JSON.stringify({
      ...result,
      confirmation_email_sent: confirmationEmail.sent,
      confirmation_email_status: confirmationEmail.status,
    }), {
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

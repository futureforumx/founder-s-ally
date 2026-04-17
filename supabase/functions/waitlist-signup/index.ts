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
// Tally field types
// ---------------------------------------------------------------------------

interface TallyOption {
  id: string;
  text: string;
}

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
  return s
    .toLowerCase()
    .replace(/['\u2019\u2018]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function stripLeadingDash(s: string): string {
  return s.replace(/^-\s*/, "").trim();
}

function resolveFieldValue(field: TallyField): string | string[] | null {
  const v = field.value;
  if (v == null || v === "") return null;

  const optMap = new Map<string, string>();
  if (field.options) {
    for (const o of field.options) {
      optMap.set(o.id, stripLeadingDash(o.text));
    }
  }

  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      if (typeof item === "string") {
        out.push(stripLeadingDash(optMap.get(item) ?? item));
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.text === "string") out.push(stripLeadingDash(obj.text));
        else if (typeof obj.label === "string") out.push(stripLeadingDash(obj.label));
        else if (typeof obj.id === "string" && optMap.has(obj.id)) out.push(optMap.get(obj.id)!);
      }
    }
    return out.length > 0 ? out : null;
  }

  if (typeof v === "string") {
    const resolved = optMap.get(v) ?? stripLeadingDash(v);
    return resolved || null;
  }

  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }

  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    if (typeof obj.text === "string") return stripLeadingDash(obj.text);
    if (typeof obj.id === "string" && optMap.has(obj.id)) return optMap.get(obj.id)!;
  }

  return null;
}

function firstStr(v: string | string[] | null): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v) && v.length > 0) return v[0].trim() || null;
  return null;
}

function toArr(v: string | string[] | null): string[] {
  if (Array.isArray(v)) return v.map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

// ---------------------------------------------------------------------------
// Value normalizers
// ---------------------------------------------------------------------------

const ROLE_MAP: Record<string, string> = {
  founder: "founder",
  investor: "investor",
  operator: "operator",
  advisor: "advisor",
  consultant: "advisor",
  other: "other",
};

function normalizeRole(raw: string | null): string | null {
  if (!raw) return null;
  const key = toSnake(raw);
  for (const [pattern, role] of Object.entries(ROLE_MAP)) {
    if (key.includes(pattern)) return role;
  }
  return raw.toLowerCase().trim();
}

const STAGE_MAP: Record<string, string> = {
  idea: "idea",
  pre_seed: "pre-seed",
  preseed: "pre-seed",
  seed: "seed",
  series_a: "series-a",
  series_a_plus: "series-a-plus",
  "series-a+": "series-a-plus",
  angel: "angel",
  multi_stage: "multi-stage",
  startup_operator: "startup_operator",
  functional_leader: "functional_leader",
  advisor: "advisor",
  consultant: "consultant",
};

function normalizeStage(raw: string | null): string | null {
  if (!raw) return null;
  const key = toSnake(raw);
  if (STAGE_MAP[key]) return STAGE_MAP[key];
  for (const [pattern, stage] of Object.entries(STAGE_MAP)) {
    if (key.includes(pattern)) return stage;
  }
  return key;
}

function normalizeUrgency(raw: string | null, label: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  const isDeploying = label ? /deploying capital/i.test(label) : false;

  if (/^yes/i.test(lower)) return isDeploying ? "actively_deploying" : "actively_raising";
  if (/^no/i.test(lower)) return "not_yet";
  if (/^unsure/i.test(lower) || /^maybe/i.test(lower)) return "exploring";
  return toSnake(lower);
}

const INTENT_MAP: Record<string, string> = {
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
  const key = toSnake(raw);
  return INTENT_MAP[key] ?? key;
}

// ---------------------------------------------------------------------------
// Tally label -> canonical field mapping
// ---------------------------------------------------------------------------

const LABEL_MAP: Record<string, string> = {
  email_address: "email",
  email: "email",
  first_name: "first_name",
  last_name: "last_name",
  name: "name",
  what_best_describes_you: "role",
  which_best_describes_you: "role",
  what_stage_are_you_at: "stage",
  what_kind_of_investor_are_you: "investor_type",
  what_type_of_investor_are_you: "investor_type",
  what_kind_of_operator_are_you: "operator_type",
  are_you_raising_in_the_next_6_months: "urgency_raising",
  are_you_actively_raising_in_the_next_6_months: "urgency_raising",
  are_you_actively_deploying_capital_in_the_next_6_months: "urgency_deploying",
  whats_your_biggest_priority: "intent",
  what_s_your_biggest_priority: "intent",
  whats_the_hardest_part_right_now: "biggest_pain",
  what_s_the_hardest_part_right_now: "biggest_pain",
  linkedin_url: "linkedin_url",
  linkedin: "linkedin_url",
  company_website: "company_website",
  company_name: "company_name",
  company_or_firm_name: "company_name",
  what_priority_access: "priority_access",
  referral_code: "referral_code",
  ref: "referral_code",
  referral_code_used: "referral_code",
  source: "source",
  campaign: "campaign",
};

// ---------------------------------------------------------------------------
// Tally parser
// ---------------------------------------------------------------------------

function isTallyWebhook(body: Record<string, unknown>): boolean {
  return (
    typeof body.eventType === "string" ||
    (body.data != null &&
      typeof body.data === "object" &&
      "fields" in (body.data as Record<string, unknown>))
  );
}

function parseTallyPayload(body: Record<string, unknown>): ParsedPayload {
  const data = (body.data ?? body) as Record<string, unknown>;
  const fields = (data.fields ?? []) as TallyField[];

  const resolved: Map<string, { value: string | string[] | null; label: string | null }> = new Map();
  const allIntents: string[] = [];
  const seenLabels: string[] = [];
  let firstName: string | null = null;
  let lastName: string | null = null;
  let companyWebsite: string | null = null;
  let urgencyLabel: string | null = null;

  for (const field of fields) {
    const rawLabel = field.label ?? field.key ?? "";
    seenLabels.push(rawLabel);
    const labelSnake = toSnake(rawLabel);
    const keySnake = field.key ? toSnake(field.key) : labelSnake;
    const canonical = LABEL_MAP[labelSnake] ?? LABEL_MAP[keySnake] ?? null;
    const val = resolveFieldValue(field);

    if (canonical === "first_name") {
      firstName = firstStr(val);
      continue;
    }
    if (canonical === "last_name") {
      lastName = firstStr(val);
      continue;
    }

    if (canonical === "intent") {
      const items = toArr(val);
      for (const item of items) {
        const norm = normalizeIntent(item);
        if (!allIntents.includes(norm)) allIntents.push(norm);
      }
      continue;
    }

    if (canonical === "company_website") {
      companyWebsite = firstStr(val);
      continue;
    }

    if (canonical === "urgency_raising" || canonical === "urgency_deploying") {
      urgencyLabel = field.label ?? null;
      if (!resolved.has("urgency")) {
        resolved.set("urgency", { value: val, label: field.label ?? null });
      }
      continue;
    }

    if (canonical === "investor_type" || canonical === "operator_type") {
      if (!resolved.has("stage")) {
        resolved.set("stage", { value: val, label: field.label ?? null });
      }
      resolved.set(canonical, { value: val, label: field.label ?? null });
      continue;
    }

    if (canonical && !resolved.has(canonical)) {
      resolved.set(canonical, { value: val, label: field.label ?? null });
    }
  }

  const str = (k: string): string | null => {
    const entry = resolved.get(k);
    if (!entry) return null;
    return firstStr(entry.value);
  };

  const combinedName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const name = combinedName ?? str("name");

  const rawRole = str("role");
  const role = normalizeRole(rawRole);

  const rawStage = str("stage");
  const stage = normalizeStage(rawStage);

  const rawUrgency = str("urgency");
  const urgency = normalizeUrgency(rawUrgency, urgencyLabel);

  const unmapped: Record<string, unknown> = {};
  for (const field of fields) {
    const rawLabel = field.label ?? field.key ?? "";
    const labelSnake = toSnake(rawLabel);
    const keySnake = field.key ? toSnake(field.key) : labelSnake;
    const canonical = LABEL_MAP[labelSnake] ?? LABEL_MAP[keySnake];
    if (!canonical) {
      unmapped[rawLabel] = resolveFieldValue(field);
    }
  }

  return {
    email: str("email"),
    name,
    role,
    stage,
    urgency,
    intent: allIntents,
    biggest_pain: str("biggest_pain"),
    company_name: str("company_name"),
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
      ...(resolved.has("investor_type") ? { investor_type: firstStr(resolved.get("investor_type")!.value) } : {}),
      ...(resolved.has("operator_type") ? { operator_type: firstStr(resolved.get("operator_type")!.value) } : {}),
      ...(resolved.has("priority_access") ? { priority_access: firstStr(resolved.get("priority_access")!.value) } : {}),
      ...(Object.keys(unmapped).length > 0 ? { tally_unmapped_fields: unmapped } : {}),
      tally_labels_seen: seenLabels,
    },
  };
}

// ---------------------------------------------------------------------------
// Direct JSON parser (existing flow)
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
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();
    console.log("[waitlist-signup] raw body:", JSON.stringify(body));

    const parsed = isTallyWebhook(body)
      ? parseTallyPayload(body)
      : parseDirectPayload(body);

    console.log("[waitlist-signup] parsed payload:", JSON.stringify(parsed));

    const email = String(parsed.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      const labels = (parsed.metadata?.tally_labels_seen as string[]) ?? [];
      const hint = labels.length > 0
        ? ` Tally labels seen: [${labels.join(", ")}]`
        : "";
      console.error(`[waitlist-signup] missing email. parsed.email=${parsed.email}${hint}`);
      return new Response(
        JSON.stringify({
          error: `A valid email is required. Could not find an email field in the payload.${hint}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (data?.error) {
      return new Response(
        JSON.stringify({ error: data.error }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

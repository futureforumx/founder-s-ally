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
// Tally webhook parser
// ---------------------------------------------------------------------------

interface TallyField {
  key?: string;
  label?: string;
  value?: unknown;
  options?: { id: string; text: string }[];
}

function toSnake(s: string): string {
  return s
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const FIELD_ALIASES: Record<string, string[]> = {
  email: [
    "email",
    "what_s_your_email",
    "whats_your_email",
  ],
  name: [
    "name",
    "what_s_your_name",
    "whats_your_name",
  ],
  role: [
    "role",
    "which_best_describes_you",
    "what_best_describes_you",
  ],
  stage: [
    "stage",
    "what_stage_are_you_at",
    "what_type_of_investor_are_you",
    "what_kind_of_operator_are_you",
  ],
  urgency: [
    "urgency",
    "are_you_actively_raising_in_the_next_6_months",
    "are_you_actively_deploying_capital_in_the_next_6_months",
  ],
  intent: [
    "intent",
    "what_are_you_trying_to_do_right_now",
    "what_are_you_trying_to_do_right_now_as_a_founder",
    "what_are_you_trying_to_do_right_now_as_an_investor",
    "what_are_you_trying_to_do_right_now_as_an_operator",
  ],
  biggest_pain: [
    "biggest_pain",
    "what_s_the_hardest_part_right_now",
    "whats_the_hardest_part_right_now",
  ],
  company_name: [
    "company_name",
    "company_or_firm_name",
  ],
  linkedin_url: [
    "linkedin_url",
  ],
  referral_code: [
    "ref",
    "referral_code",
    "referral_code_used",
  ],
  source: [
    "source",
  ],
  campaign: [
    "campaign",
  ],
};

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias, canonical);
  }
}

function resolveFieldValue(field: TallyField): string | string[] | null {
  const v = field.value;
  if (v == null) return null;

  if (Array.isArray(v)) {
    const texts: string[] = [];
    for (const item of v) {
      if (typeof item === "string") texts.push(item);
      else if (item && typeof item === "object" && "text" in item) texts.push(String(item.text));
      else if (item && typeof item === "object" && "label" in item) texts.push(String((item as Record<string, unknown>).label));
    }
    return texts.length > 0 ? texts : null;
  }

  if (typeof v === "object" && v !== null && "text" in v) return String((v as Record<string, unknown>).text);
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
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

  const mapped: Record<string, string | string[] | null> = {};

  for (const field of fields) {
    const keySnake = field.key ? toSnake(field.key) : null;
    const labelSnake = field.label ? toSnake(field.label) : null;

    const canonical = (keySnake && ALIAS_TO_CANONICAL.get(keySnake))
      || (labelSnake && ALIAS_TO_CANONICAL.get(labelSnake))
      || null;

    if (canonical && !(canonical in mapped)) {
      mapped[canonical] = resolveFieldValue(field);
    }
  }

  const str = (k: string): string | null => {
    const v = mapped[k];
    if (typeof v === "string") return v;
    if (Array.isArray(v) && v.length > 0) return v[0];
    return null;
  };

  const arr = (k: string): string[] => {
    const v = mapped[k];
    if (Array.isArray(v)) return v;
    if (typeof v === "string" && v.trim()) return [v];
    return [];
  };

  const unmapped: Record<string, unknown> = {};
  for (const field of fields) {
    const keySnake = field.key ? toSnake(field.key) : null;
    const labelSnake = field.label ? toSnake(field.label) : null;
    const canonical = (keySnake && ALIAS_TO_CANONICAL.get(keySnake))
      || (labelSnake && ALIAS_TO_CANONICAL.get(labelSnake));
    if (!canonical) {
      unmapped[field.label || field.key || "unknown"] = field.value;
    }
  }

  return {
    email: str("email"),
    name: str("name"),
    role: str("role"),
    stage: str("stage"),
    urgency: str("urgency"),
    intent: arr("intent"),
    biggest_pain: str("biggest_pain"),
    company_name: str("company_name"),
    linkedin_url: str("linkedin_url"),
    referral_code: str("referral_code"),
    source: str("source") || "tally",
    campaign: str("campaign"),
    metadata: {
      tally_form_id: data.formId ?? data.formID ?? null,
      tally_response_id: data.responseId ?? data.responseID ?? null,
      tally_unmapped_fields: Object.keys(unmapped).length > 0 ? unmapped : undefined,
    },
  };
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
      return new Response(
        JSON.stringify({ error: "A valid email is required. Check that your form includes an email field." }),
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

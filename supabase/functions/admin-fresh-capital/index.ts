import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";
import {
  buildDedupeKey,
  extractDomain,
  normalizeCompanyName,
  normalizeDate,
  normalizeInvestorName,
  normalizeRoundType,
  normalizeSector,
  parseAmount,
} from "../_shared/funding/normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppAction = "list" | "update_fund" | "update_deal";

type FundWatchRow = {
  id: string;
  firmRecordId: string;
  firmName: string;
  name: string;
  vintageYear: number | null;
  announcedDate: string | null;
  closeDate: string | null;
  targetSizeUsd: number | null;
  finalSizeUsd: number | null;
  stageFocus: string[];
  sectorFocus: string[];
  geographyFocus: string[];
  announcementUrl: string | null;
  status: string;
  manuallyVerified: boolean;
  updatedAt: string;
};

type LatestFundingRow = {
  id: string;
  companyName: string;
  companyWebsite: string | null;
  sectorRaw: string | null;
  sectorNormalized: string | null;
  roundTypeRaw: string | null;
  roundTypeNormalized: string | null;
  amountRaw: string | null;
  announcedDate: string | null;
  leadInvestor: string | null;
  coInvestors: string[];
  primarySourceUrl: string | null;
  primaryPressUrl: string | null;
  sourceType: string;
  isRumor: boolean;
  needsReview: boolean;
  updatedAt: string;
};

type ListPayload = {
  fundWatch: FundWatchRow[];
  latestFunding: LatestFundingRow[];
};

type FundUpdatePayload = {
  name?: unknown;
  vintageYear?: unknown;
  announcedDate?: unknown;
  closeDate?: unknown;
  targetSizeUsd?: unknown;
  finalSizeUsd?: unknown;
  status?: unknown;
  stageFocus?: unknown;
  sectorFocus?: unknown;
  geographyFocus?: unknown;
  announcementUrl?: unknown;
};

type DealUpdatePayload = {
  companyName?: unknown;
  companyWebsite?: unknown;
  sectorRaw?: unknown;
  roundTypeRaw?: unknown;
  amountRaw?: unknown;
  announcedDate?: unknown;
  leadInvestor?: unknown;
  coInvestors?: unknown;
  primarySourceUrl?: unknown;
  primaryPressUrl?: unknown;
  sourceType?: unknown;
  isRumor?: unknown;
  needsReview?: unknown;
};

function asPermission(v: unknown): AppPermission | null {
  const p = String(v ?? "").toLowerCase();
  if (p === "user" || p === "manager" || p === "admin" || p === "god") return p as AppPermission;
  return null;
}

function highestPermission(...candidates: Array<AppPermission | null>): AppPermission {
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  let best: AppPermission = "user";
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (rank[candidate] > rank[best]) best = candidate;
  }
  return best;
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function asNullableString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function asNullableNumber(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value: ${raw}`);
  return parsed;
}

function asNullableYear(value: unknown): number | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1950 || parsed > 2100) {
    throw new Error("Vintage year must be between 1950 and 2100.");
  }
  return parsed;
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry ?? "").split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeFundName(raw: string): string {
  const ROMAN_VALUES: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
    XIII: 13,
    XIV: 14,
    XV: 15,
    XVI: 16,
    XVII: 17,
    XVIII: 18,
    XIX: 19,
    XX: 20,
  };
  const romanPattern = Object.keys(ROMAN_VALUES).sort((a, b) => b.length - a.length).join("|");
  return normalizeWhitespace(
    raw
      .toUpperCase()
      .replace(new RegExp(`\\b(${romanPattern})\\b`, "g"), (match) => String(ROMAN_VALUES[match] ?? match))
      .toLowerCase()
      .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
      .replace(/\b(l\.?p\.?|llc|llp|inc\.?|ltd\.?|corp\.?|plc|gmbh|sarl|fund,?\s*l\.?p\.?)\b/gi, " ")
      .replace(/\bfund\s+(\d+)/g, "$1")
      .replace(/\bvehicle\b/g, "fund")
      .replace(/[^a-z0-9\s]/g, " "),
  );
}

function buildFundNormalizedKey(args: { firmRecordId: string; fundName: string; vintageYear?: number | null }): string {
  const suffix = args.vintageYear ? String(args.vintageYear) : "unknown";
  return `${args.firmRecordId}:${normalizeFundName(args.fundName)}:${suffix}`;
}

function sanitizeFundStatus(value: unknown): string {
  const status = asTrimmedString(value).toLowerCase();
  const allowed = new Set(["announced", "target", "first_close", "final_close", "inferred_active", "historical"]);
  if (!allowed.has(status)) throw new Error(`Invalid fund status: ${String(value ?? "")}`);
  return status;
}

function sanitizeSourceType(value: unknown): string {
  const sourceType = asTrimmedString(value).toLowerCase();
  const allowed = new Set(["news", "curated_feed", "rumor", "api"]);
  if (!allowed.has(sourceType)) throw new Error(`Invalid source type: ${String(value ?? "")}`);
  return sourceType;
}

async function resolveAdmin(req: Request): Promise<SupabaseClient> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resolved = await resolveAdminCaller(authHeader, supabaseUrl, supabaseKey);
  if ("error" in resolved) throw new Error(resolved.error);

  const adminClient = createClient(supabaseUrl, serviceKey);
  const roleIds = resolved.identityUserIds.length ? resolved.identityUserIds : [resolved.id];
  const { data: roleRows } = await adminClient.from("user_roles").select("permission").in("user_id", roleIds);
  let roleFromDb: AppPermission | null = null;
  for (const row of roleRows ?? []) {
    roleFromDb = highestPermission(roleFromDb, asPermission(row.permission));
  }

  const callerPermission = clampGodModeToDesignatedEmail(
    highestPermission(
      roleFromDb,
      asPermission(resolved.user_metadata?.role),
      autoPermissionForEmail(resolved.email),
    ),
    resolved.email,
  );

  if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");
  return adminClient;
}

async function listPayload(adminClient: SupabaseClient): Promise<ListPayload> {
  const [fundsRes, dealsRes] = await Promise.all([
    adminClient
      .from("vc_funds")
      .select("id, firm_record_id, name, vintage_year, announced_date, close_date, target_size_usd, final_size_usd, stage_focus, sector_focus, geography_focus, announcement_url, status, manually_verified, updated_at, firm_records!inner(firm_name)")
      .is("deleted_at", null)
      .order("announced_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(80),
    adminClient
      .from("fi_deals_canonical")
      .select("id, company_name, company_website, sector_raw, sector_normalized, round_type_raw, round_type_normalized, amount_raw, announced_date, lead_investor, co_investors, primary_source_url, primary_press_url, source_type, is_rumor, needs_review, updated_at")
      .is("duplicate_of_deal_id", null)
      .order("announced_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(120),
  ]);

  if (fundsRes.error) throw new Error(fundsRes.error.message);
  if (dealsRes.error) throw new Error(dealsRes.error.message);

  const fundWatch: FundWatchRow[] = (fundsRes.data ?? []).map((row) => {
    const firmRecord = Array.isArray(row.firm_records) ? row.firm_records[0] : row.firm_records;
    return {
      id: row.id,
      firmRecordId: row.firm_record_id,
      firmName: String(firmRecord?.firm_name ?? "Unknown firm"),
      name: row.name,
      vintageYear: row.vintage_year,
      announcedDate: row.announced_date,
      closeDate: row.close_date,
      targetSizeUsd: row.target_size_usd,
      finalSizeUsd: row.final_size_usd,
      stageFocus: Array.isArray(row.stage_focus) ? row.stage_focus : [],
      sectorFocus: Array.isArray(row.sector_focus) ? row.sector_focus : [],
      geographyFocus: Array.isArray(row.geography_focus) ? row.geography_focus : [],
      announcementUrl: row.announcement_url,
      status: row.status,
      manuallyVerified: Boolean(row.manually_verified),
      updatedAt: row.updated_at,
    };
  });

  const latestFunding: LatestFundingRow[] = (dealsRes.data ?? []).map((row) => ({
    id: row.id,
    companyName: row.company_name,
    companyWebsite: row.company_website,
    sectorRaw: row.sector_raw,
    sectorNormalized: row.sector_normalized,
    roundTypeRaw: row.round_type_raw,
    roundTypeNormalized: row.round_type_normalized,
    amountRaw: row.amount_raw,
    announcedDate: row.announced_date,
    leadInvestor: row.lead_investor,
    coInvestors: Array.isArray(row.co_investors) ? row.co_investors : [],
    primarySourceUrl: row.primary_source_url,
    primaryPressUrl: row.primary_press_url,
    sourceType: row.source_type,
    isRumor: Boolean(row.is_rumor),
    needsReview: Boolean(row.needs_review),
    updatedAt: row.updated_at,
  }));

  return { fundWatch, latestFunding };
}

async function updateFund(adminClient: SupabaseClient, id: string, payload: FundUpdatePayload): Promise<void> {
  const { data: existing, error } = await adminClient
    .from("vc_funds")
    .select("id, firm_record_id, name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) throw new Error("Fund Watch row not found.");

  const name = asTrimmedString(payload.name);
  if (!name) throw new Error("Fund name is required.");

  const vintageYear = asNullableYear(payload.vintageYear);
  const update = {
    name,
    normalized_name: normalizeFundName(name),
    normalized_key: buildFundNormalizedKey({ firmRecordId: existing.firm_record_id, fundName: name, vintageYear }),
    vintage_year: vintageYear,
    announced_date: normalizeDate(asNullableString(payload.announcedDate)),
    close_date: normalizeDate(asNullableString(payload.closeDate)),
    target_size_usd: asNullableNumber(payload.targetSizeUsd),
    final_size_usd: asNullableNumber(payload.finalSizeUsd),
    status: sanitizeFundStatus(payload.status),
    stage_focus: parseStringList(payload.stageFocus),
    sector_focus: parseStringList(payload.sectorFocus),
    geography_focus: parseStringList(payload.geographyFocus),
    announcement_url: asNullableString(payload.announcementUrl),
    manually_verified: true,
    last_verified_at: new Date().toISOString(),
  };

  const { error: updateError } = await adminClient.from("vc_funds").update(update).eq("id", id);
  if (updateError) throw new Error(updateError.message);
}

async function updateDeal(adminClient: SupabaseClient, id: string, payload: DealUpdatePayload): Promise<void> {
  const companyName = asTrimmedString(payload.companyName);
  if (!companyName) throw new Error("Company name is required.");

  const companyWebsite = asNullableString(payload.companyWebsite);
  const sectorRaw = asNullableString(payload.sectorRaw);
  const roundTypeRaw = asNullableString(payload.roundTypeRaw);
  const amountRaw = asNullableString(payload.amountRaw);
  const leadInvestor = asNullableString(payload.leadInvestor);
  const announcedDate = normalizeDate(asNullableString(payload.announcedDate));
  const { minor_units, currency } = parseAmount(amountRaw);

  const update = {
    company_name: companyName,
    normalized_company_name: normalizeCompanyName(companyName),
    company_website: companyWebsite,
    company_domain: extractDomain(companyWebsite),
    sector_raw: sectorRaw,
    sector_normalized: normalizeSector(sectorRaw),
    round_type_raw: roundTypeRaw,
    round_type_normalized: normalizeRoundType(roundTypeRaw),
    amount_raw: amountRaw,
    amount_minor_units: minor_units,
    currency,
    announced_date: announcedDate,
    lead_investor: leadInvestor,
    lead_investor_normalized: normalizeInvestorName(leadInvestor),
    co_investors: parseStringList(payload.coInvestors),
    primary_source_url: asNullableString(payload.primarySourceUrl),
    primary_press_url: asNullableString(payload.primaryPressUrl),
    source_type: sanitizeSourceType(payload.sourceType),
    is_rumor: parseBooleanLike(payload.isRumor),
    needs_review: parseBooleanLike(payload.needsReview),
    dedupe_key: buildDedupeKey(
      normalizeCompanyName(companyName),
      normalizeRoundType(roundTypeRaw),
      announcedDate,
    ),
  };

  const { error } = await adminClient.from("fi_deals_canonical").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = await resolveAdmin(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const payload = requireObject(body, "Invalid request body.");
    const action = String(payload.action ?? "list") as AppAction;

    if (action === "list") {
      const data = await listPayload(adminClient);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const id = asTrimmedString(payload.id);
    if (!id) throw new Error("Record id is required.");

    if (action === "update_fund") {
      await updateFund(adminClient, id, requireObject(payload.payload, "Fund payload is required."));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_deal") {
      await updateDeal(adminClient, id, requireObject(payload.payload, "Deal payload is required."));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unsupported action: ${action}`);
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

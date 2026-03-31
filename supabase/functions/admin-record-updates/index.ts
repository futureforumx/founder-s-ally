import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

export type RecordUpdateKind =
  | "vc_firm"
  | "vc_investor"
  | "company"
  | "user_founder"
  | "user_operator"
  | "user_investor"
  | "user_other";

export interface RecordUpdateRow {
  kind: RecordUpdateKind;
  recordId: string;
  name: string;
  subtitle: string | null;
  updatedAt: string;
}

function effectiveTs(updatedAt: string | null | undefined, createdAt: string | null | undefined): string {
  const u = updatedAt?.trim();
  if (u) return u;
  const c = createdAt?.trim();
  if (c) return c;
  return new Date(0).toISOString();
}

type FirmRow = { id: string; firm_name: string; updated_at?: string | null; created_at?: string | null };
type PartnerRow = { id: string; full_name: string; firm_id: string; updated_at?: string | null; created_at?: string | null };
type CompanyRow = { id: string; company_name: string; user_id: string; updated_at?: string | null; created_at?: string | null };
type ProfileRow = { user_id: string; full_name: string; user_type: string; updated_at?: string | null; created_at?: string | null };

async function fetchFirms(adminClient: SupabaseClient, limit: number): Promise<FirmRow[]> {
  const attempts = [
    () =>
      adminClient
        .from("firm_records")
        .select("id, firm_name, updated_at, created_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit),
    () =>
      adminClient
        .from("firm_records")
        .select("id, firm_name, updated_at, created_at")
        .order("updated_at", { ascending: false })
        .limit(limit),
    () =>
      adminClient
        .from("firm_records")
        .select("id, firm_name, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
  ];
  for (const run of attempts) {
    const res = await run();
    if (!res.error && res.data) return res.data as FirmRow[];
  }
  return [];
}

async function fetchPartners(adminClient: SupabaseClient, limit: number): Promise<PartnerRow[]> {
  const res = await adminClient
    .from("firm_investors")
    .select("id, full_name, firm_id, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (!res.error && res.data) return res.data as PartnerRow[];
  const fallback = await adminClient
    .from("firm_investors")
    .select("id, full_name, firm_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (fallback.data ?? []) as PartnerRow[];
}

async function fetchCompanies(adminClient: SupabaseClient, limit: number): Promise<CompanyRow[]> {
  const res = await adminClient
    .from("company_analyses")
    .select("id, company_name, user_id, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (!res.error && res.data) return res.data as CompanyRow[];
  const fallback = await adminClient
    .from("company_analyses")
    .select("id, company_name, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (fallback.data ?? []) as CompanyRow[];
}

async function fetchProfiles(adminClient: SupabaseClient, limit: number): Promise<ProfileRow[]> {
  const res = await adminClient
    .from("profiles")
    .select("user_id, full_name, user_type, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (!res.error && res.data) return res.data as ProfileRow[];
  const fallback = await adminClient
    .from("profiles")
    .select("user_id, full_name, user_type, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (fallback.data ?? []) as ProfileRow[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("permission")
      .eq("user_id", caller.id)
      .maybeSingle();

    const callerPermission = clampGodModeToDesignatedEmail(
      highestPermission(
        asPermission(roleData?.permission),
        asPermission(caller.user_metadata?.role),
        autoPermissionForEmail(caller.email),
      ),
      caller.email,
    );
    if (!hasAdminConsoleAccess(callerPermission)) throw new Error("Admin access required");

    const perSource = 250;

    const [firms, partners, companies, profiles] = await Promise.all([
      fetchFirms(adminClient, perSource),
      fetchPartners(adminClient, perSource),
      fetchCompanies(adminClient, perSource),
      fetchProfiles(adminClient, perSource * 2),
    ]);

    const firmNameById = new Map(firms.map((f) => [f.id, f.firm_name]));
    if (partners.length) {
      const missingFirmIds = [...new Set(partners.map((p) => p.firm_id))].filter((id) => !firmNameById.has(id));
      if (missingFirmIds.length) {
        const { data: extraFirms } = await adminClient
          .from("firm_records")
          .select("id, firm_name")
          .in("id", missingFirmIds);
        for (const f of extraFirms ?? []) firmNameById.set(f.id, f.firm_name);
      }
    }

    const updates: RecordUpdateRow[] = [];

    for (const f of firms) {
      updates.push({
        kind: "vc_firm",
        recordId: f.id,
        name: f.firm_name || "Unnamed firm",
        subtitle: null,
        updatedAt: effectiveTs(f.updated_at as string | null | undefined, f.created_at as string | null | undefined),
      });
    }

    for (const p of partners) {
      updates.push({
        kind: "vc_investor",
        recordId: p.id,
        name: p.full_name || "Unnamed",
        subtitle: firmNameById.get(p.firm_id) ?? null,
        updatedAt: effectiveTs(p.updated_at as string | null | undefined, p.created_at as string | null | undefined),
      });
    }

    for (const c of companies) {
      updates.push({
        kind: "company",
        recordId: c.id,
        name: c.company_name || "Unnamed company",
        subtitle: c.user_id ? `Owner ${c.user_id}` : null,
        updatedAt: effectiveTs(c.updated_at as string | null | undefined, c.created_at as string | null | undefined),
      });
    }

    for (const pr of profiles) {
      const t = String(pr.user_type || "founder").toLowerCase();
      let kind: RecordUpdateKind;
      if (t === "founder") kind = "user_founder";
      else if (t === "operator") kind = "user_operator";
      else if (t === "investor") kind = "user_investor";
      else kind = "user_other";

      updates.push({
        kind,
        recordId: pr.user_id,
        name: pr.full_name?.trim() || "Unnamed user",
        subtitle: `user_type: ${pr.user_type || "—"}`,
        updatedAt: effectiveTs(pr.updated_at as string | null | undefined, pr.created_at as string | null | undefined),
      });
    }

    updates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const capped = updates.slice(0, 800);

    return new Response(JSON.stringify({ updates: capped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

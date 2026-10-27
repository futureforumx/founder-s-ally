import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "../_shared/app-admin-email.ts";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";

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
  /** Firm record id. Set for VC firms and for investors so the editor can open the parent firm. */
  firmId?: string | null;
  /** Catalog startups can be opened in the company editor. Workspace-only rows cannot. */
  source?: "startup";
  change?: "created" | "updated" | "linked";
  linkedTo?: string | null;
  origin?: string | null;
}

/** `startups.updated_at` is timestamp without time zone; treat the wall clock as UTC. */
function asUtcIso(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed;
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return `${normalized}Z`;
}

function effectiveTs(updatedAt: string | null | undefined, createdAt: string | null | undefined): string {
  const u = updatedAt?.trim();
  if (u) return u;
  const c = createdAt?.trim();
  if (c) return c;
  return new Date(0).toISOString();
}

const CREATED_WINDOW_MS = 2 * 60 * 1000;

function wasCreated(createdAt: string | null | undefined, updatedAt: string | null | undefined): boolean {
  const created = Date.parse(asUtcIso(createdAt) ?? "");
  if (Number.isNaN(created)) return false;
  const updated = Date.parse(asUtcIso(updatedAt) ?? "");
  if (Number.isNaN(updated)) return true;
  return Math.abs(updated - created) <= CREATED_WINDOW_MS;
}

function recordChange(
  createdAt: string | null | undefined,
  updatedAt: string | null | undefined,
  linkedTo?: string | null,
): { change: "created" | "updated" | "linked"; linkedTo: string | null } {
  if (wasCreated(createdAt, updatedAt)) return { change: "created", linkedTo: null };
  const target = linkedTo?.trim() || null;
  if (target) return { change: "linked", linkedTo: target };
  return { change: "updated", linkedTo: null };
}

function labelOrigin(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key.includes("firecrawl")) return "Firecrawl";
  if (key === "user") return "User";
  if (key === "admin" || key === "manual") return "Admin";
  const known: Record<string, string> = {
    yc: "YC",
    crunchbase: "Crunchbase",
    cbinsights: "CB Insights",
    tracxn: "Tracxn",
    seedtable: "Seedtable",
    topstartups: "Top Startups",
    tinyteams: "Tiny Teams",
    nextplay: "Next Play",
    startupsgallery: "Startups Gallery",
    signalnfx: "Signal NFX",
    alexandriafullenrich: "FullEnrich",
    fullenrich: "FullEnrich",
    alexandriafireround: "FireRound",
    fireround: "FireRound",
    ninjapear: "Ninjapear",
    prisma: "Prisma",
    openvc: "OpenVC",
    other: "Other",
  };
  return known[key] ?? value.replace(/[_:]+/g, " ").replace(/\s+/g, " ").trim();
}

function companyAnalysisId(externalIds: unknown): string | null {
  if (!externalIds || typeof externalIds !== "object" || Array.isArray(externalIds)) return null;
  const id = (externalIds as { company_analysis_id?: unknown }).company_analysis_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function startupOrigin(row: {
  id: string;
  primary_data_source?: string | null;
  external_ids?: unknown;
}): string | null {
  if (companyAnalysisId(row.external_ids)) return "User";
  const primary = row.primary_data_source?.trim() || null;
  if (!primary && row.id.startsWith("cs_")) return "Admin";
  return labelOrigin(primary);
}

function firmOrigin(row: {
  signal_nfx_url?: string | null;
  crunchbase_url?: string | null;
  prisma_firm_id?: string | null;
}, provenance: string | null): string | null {
  if (provenance) return labelOrigin(provenance);
  if (row.signal_nfx_url?.trim()) return "Signal NFX";
  if (row.crunchbase_url?.trim()) return "Crunchbase";
  if (row.prisma_firm_id?.trim()) return "Prisma";
  return null;
}

async function latestProvenance(adminClient: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const origins = new Map<string, string>();
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return origins;
  const { data, error } = await adminClient
    .from("enrichment_field_provenance")
    .select("entity_id, source_platform, created_at")
    .in("entity_id", unique)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error || !data) return origins;
  for (const row of data as Array<{ entity_id?: string; source_platform?: string }>) {
    const id = row.entity_id?.trim();
    const platform = row.source_platform?.trim();
    if (!id || !platform || origins.has(id)) continue;
    origins.set(id, platform);
  }
  return origins;
}

type FirmRow = {
  id: string;
  firm_name: string;
  updated_at?: string | null;
  created_at?: string | null;
  signal_nfx_url?: string | null;
  crunchbase_url?: string | null;
  prisma_firm_id?: string | null;
};
type PartnerRow = {
  id: string;
  full_name: string;
  firm_id: string;
  title?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};
type StartupRow = {
  id: string;
  company_name: string;
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  record_status?: string | null;
  primary_data_source?: string | null;
  external_ids?: unknown;
  updated_at?: string | null;
  created_at?: string | null;
};
type ProfileRow = { user_id: string; full_name: string; user_type: string; updated_at?: string | null; created_at?: string | null };

async function fetchFirms(adminClient: SupabaseClient, limit: number): Promise<FirmRow[]> {
    const attempts = [
    () =>
      adminClient
        .from("firm_records")
        .select("id, firm_name, updated_at, created_at, signal_nfx_url, crunchbase_url, prisma_firm_id")
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeSearch(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[%_\\,"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function pageWindow(limitRaw: unknown, offsetRaw: unknown): { limit: number; offset: number } {
  const limit = Math.min(100, Math.max(1, Math.floor(Number(limitRaw) || 50)));
  const offset = Math.max(0, Math.floor(Number(offsetRaw) || 0));
  return { limit, offset };
}

async function readRequestBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== "POST") return {};
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function listFirmDirectory(
  adminClient: SupabaseClient,
  limit: number,
  offset: number,
  search: string,
): Promise<{ updates: RecordUpdateRow[]; total: number }> {
  const run = async (withDeleted: boolean, orderCol: "updated_at" | "created_at") => {
    const cols = orderCol === "updated_at"
      ? "id, firm_name, updated_at, created_at, signal_nfx_url, crunchbase_url, prisma_firm_id"
      : "id, firm_name, created_at, signal_nfx_url, crunchbase_url, prisma_firm_id";
    let q = adminClient.from("firm_records").select(cols, { count: "exact" });
    if (withDeleted) q = q.is("deleted_at", null);
    if (UUID_RE.test(search)) q = q.eq("id", search);
    else if (search) q = q.ilike("firm_name", `%${search}%`);
    return q.order(orderCol, { ascending: false }).range(offset, offset + limit - 1);
  };

  const attempts = [
    () => run(true, "updated_at"),
    () => run(false, "updated_at"),
    () => run(true, "created_at"),
    () => run(false, "created_at"),
  ];
  let lastError = "Could not list firms";
  for (const attempt of attempts) {
    const res = await attempt();
    if (res.error || !res.data) {
      if (res.error?.message) lastError = res.error.message;
      continue;
    }
    const firms = res.data as FirmRow[];
    const provenance = await latestProvenance(adminClient, firms.map((firm) => firm.id));
    const updates = firms.map((f) => ({
      kind: "vc_firm" as const,
      recordId: f.id,
      firmId: f.id,
      name: f.firm_name || "Unnamed firm",
      subtitle: null,
      updatedAt: effectiveTs(f.updated_at, f.created_at),
      ...recordChange(f.created_at, f.updated_at),
      origin: firmOrigin(f, provenance.get(f.id) ?? null),
    }));
    return { updates, total: res.count ?? updates.length };
  }
  throw new Error(lastError);
}

async function listInvestorDirectory(
  adminClient: SupabaseClient,
  limit: number,
  offset: number,
  search: string,
): Promise<{ updates: RecordUpdateRow[]; total: number }> {
  let firmIdsFromName: string[] = [];
  if (search && !UUID_RE.test(search)) {
    const named = await adminClient
      .from("firm_records")
      .select("id")
      .is("deleted_at", null)
      .ilike("firm_name", `%${search}%`)
      .limit(40);
    firmIdsFromName = (named.data ?? []).map((row) => String((row as { id: string }).id));
  }

  const run = async (withDeleted: boolean, orderCol: "updated_at" | "created_at") => {
    const cols = orderCol === "updated_at"
      ? "id, full_name, firm_id, title, updated_at, created_at"
      : "id, full_name, firm_id, title, created_at";
    let q = adminClient.from("firm_investors").select(cols, { count: "exact" });
    if (withDeleted) q = q.is("deleted_at", null);
    if (UUID_RE.test(search)) q = q.eq("id", search);
    else if (search) {
      const nameFilter = `full_name.ilike."%${search}%",title.ilike."%${search}%"`;
      const firmFilter = firmIdsFromName.map((id) => `firm_id.eq.${id}`).join(",");
      q = q.or(firmFilter ? `${nameFilter},${firmFilter}` : nameFilter);
    }
    return q.order(orderCol, { ascending: false }).range(offset, offset + limit - 1);
  };

  const attempts = [
    () => run(true, "updated_at"),
    () => run(false, "updated_at"),
    () => run(true, "created_at"),
    () => run(false, "created_at"),
  ];

  let partners: PartnerRow[] = [];
  let total = 0;
  let matched = false;
  let lastError = "Could not list investors";
  for (const attempt of attempts) {
    const res = await attempt();
    if (res.error || !res.data) {
      if (res.error?.message) lastError = res.error.message;
      continue;
    }
    partners = res.data as PartnerRow[];
    total = res.count ?? partners.length;
    matched = true;
    break;
  }
  if (!matched) throw new Error(lastError);

  const firmNameById = new Map<string, string>();
  const firmIds = [...new Set(partners.map((p) => p.firm_id).filter(Boolean))];
  if (firmIds.length) {
    const { data: firms } = await adminClient.from("firm_records").select("id, firm_name").in("id", firmIds);
    for (const f of firms ?? []) firmNameById.set(f.id, f.firm_name);
  }

  const provenance = await latestProvenance(adminClient, partners.map((partner) => partner.id));
  const updates = partners.map((p) => {
    const firmName = firmNameById.get(p.firm_id) ?? null;
    const change = recordChange(p.created_at, p.updated_at, firmName);
    return {
      kind: "vc_investor" as const,
      recordId: p.id,
      firmId: p.firm_id,
      name: p.full_name || "Unnamed",
      subtitle: p.title?.trim() || null,
      updatedAt: effectiveTs(p.updated_at, p.created_at),
      ...change,
      origin: labelOrigin(provenance.get(p.id) ?? null),
    };
  });
  return { updates, total };
}

function startupSubtitle(row: StartupRow): string | null {
  const place = [row.hq_city?.trim(), row.hq_state?.trim() || row.hq_country?.trim()]
    .filter(Boolean)
    .join(", ");
  const status = row.record_status?.trim().replace(/_/g, " ");
  const parts = [place || null, status || null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

async function fetchStartups(adminClient: SupabaseClient, limit: number): Promise<StartupRow[]> {
  const attempts = [
    () =>
      adminClient
        .from("startups")
        .select("id, company_name, hq_city, hq_state, hq_country, record_status, primary_data_source, external_ids, updated_at, created_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit),
    () =>
      adminClient
        .from("startups")
        .select("id, company_name, updated_at, created_at")
        .order("updated_at", { ascending: false })
        .limit(limit),
    () =>
      adminClient
        .from("startups")
        .select("id, company_name, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
  ];
  for (const run of attempts) {
    const res = await run();
    if (!res.error && res.data) return res.data as StartupRow[];
  }
  return [];
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

    const body = await readRequestBody(req);
    const requestedKind = typeof body.kind === "string" ? body.kind : "";
    if (requestedKind === "vc_firm" || requestedKind === "vc_investor") {
      const search = safeSearch(body.search);
      const { limit, offset } = pageWindow(body.limit, body.offset);
      const page = requestedKind === "vc_firm"
        ? await listFirmDirectory(adminClient, limit, offset, search)
        : await listInvestorDirectory(adminClient, limit, offset, search);
      return new Response(JSON.stringify({ updates: page.updates, total: page.total, directory: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const perSource = 250;

    const [firms, partners, startups, profiles] = await Promise.all([
      fetchFirms(adminClient, perSource),
      fetchPartners(adminClient, perSource),
      fetchStartups(adminClient, perSource),
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

    const provenance = await latestProvenance(adminClient, [
      ...firms.map((firm) => firm.id),
      ...partners.map((partner) => partner.id),
    ]);
    const updates: RecordUpdateRow[] = [];

    for (const f of firms) {
      updates.push({
        kind: "vc_firm",
        recordId: f.id,
        firmId: f.id,
        name: f.firm_name || "Unnamed firm",
        subtitle: null,
        updatedAt: effectiveTs(f.updated_at as string | null | undefined, f.created_at as string | null | undefined),
        ...recordChange(f.created_at, f.updated_at),
        origin: firmOrigin(f, provenance.get(f.id) ?? null),
      });
    }

    for (const p of partners) {
      const firmName = firmNameById.get(p.firm_id) ?? null;
      updates.push({
        kind: "vc_investor",
        recordId: p.id,
        firmId: p.firm_id,
        name: p.full_name || "Unnamed",
        subtitle: null,
        updatedAt: effectiveTs(p.updated_at as string | null | undefined, p.created_at as string | null | undefined),
        ...recordChange(p.created_at, p.updated_at, firmName),
        origin: labelOrigin(provenance.get(p.id) ?? null),
      });
    }

    for (const startup of startups) {
      updates.push({
        kind: "company",
        source: "startup",
        recordId: startup.id,
        name: startup.company_name || "Unnamed company",
        subtitle: startupSubtitle(startup),
        updatedAt: effectiveTs(asUtcIso(startup.updated_at), asUtcIso(startup.created_at)),
        ...recordChange(startup.created_at, startup.updated_at),
        origin: startupOrigin(startup),
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
        subtitle: null,
        updatedAt: effectiveTs(pr.updated_at as string | null | undefined, pr.created_at as string | null | undefined),
        ...recordChange(pr.created_at, pr.updated_at),
        origin: "User",
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

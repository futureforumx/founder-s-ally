import { getSupabaseBearerForFunctions, supabase } from "@/integrations/supabase/client";

export type AdminLiveRecordEntity =
  | "firms"
  | "firm-investors"
  | "operators"
  | "people"
  | "organizations";

export type AdminLiveRecordTarget = {
  entity: AdminLiveRecordEntity;
  id: string;
  title: string;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAdminLiveRecordUuid(value: string | null | undefined): value is string {
  if (value == null) return false;
  const s = String(value).trim();
  return s.length > 0 && UUID_RE.test(s);
}

export function adminLiveRecordFromDirectory(entry: {
  category?: string | null;
  name?: string | null;
  _profileId?: string | null;
  _firmId?: string | null;
  _investorEntityType?: "firm" | "person" | null;
  _personData?: { id?: string | null; full_name?: string | null } | null;
}): AdminLiveRecordTarget | null {
  const name = String(entry.name ?? "").trim() || "Record";
  if (entry.category === "investor") {
    if (entry._investorEntityType === "person" && isAdminLiveRecordUuid(entry._personData?.id)) {
      return {
        entity: "firm-investors",
        id: String(entry._personData.id).trim(),
        title: String(entry._personData.full_name ?? name).trim() || name,
      };
    }
    if (isAdminLiveRecordUuid(entry._firmId)) {
      return { entity: "firms", id: String(entry._firmId).trim(), title: name };
    }
    return null;
  }
  if (entry.category === "operator" && isAdminLiveRecordUuid(entry._profileId)) {
    return { entity: "operators", id: String(entry._profileId).trim(), title: name };
  }
  if (entry.category === "founder" && isAdminLiveRecordUuid(entry._profileId)) {
    return { entity: "people", id: String(entry._profileId).trim(), title: name };
  }
  if (entry.category === "company" && isAdminLiveRecordUuid(entry._firmId)) {
    return { entity: "organizations", id: String(entry._firmId).trim(), title: name };
  }
  return null;
}

export function adminLiveRecordLabel(entity: AdminLiveRecordEntity): string {
  switch (entity) {
    case "firms":
      return "Firm";
    case "firm-investors":
      return "Investor";
    case "operators":
      return "Operator";
    case "people":
      return "Founder";
    case "organizations":
      return "Company";
  }
}

async function adminHeaders(): Promise<Record<string, string>> {
  const tok = await getSupabaseBearerForFunctions();
  const anon = SUPABASE_ANON_KEY ?? "";
  const h: Record<string, string> = {
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
    apikey: anon,
  };
  if (tok && tok !== anon) h["X-User-Auth"] = `Bearer ${tok}`;
  return h;
}

const ENTITY_TABLE: Record<AdminLiveRecordEntity, string> = {
  firms: "firm_records",
  "firm-investors": "firm_investors",
  operators: "operator_profiles",
  people: "people",
  organizations: "organizations",
};

export async function fetchAdminLiveRecord(
  entity: AdminLiveRecordEntity,
  id: string,
): Promise<{ row?: Record<string, unknown>; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase is not configured." };
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { headers: await adminHeaders() });
    const json = (await res.json().catch(() => ({}))) as { row?: Record<string, unknown>; error?: string };
    if (res.ok && json.row) return { row: json.row };
  } catch {
    // Fall through to the table read below when the edge GET-by-id path is not deployed yet.
  }

  const table = ENTITY_TABLE[entity];
  const { data, error } = await (supabase as any).from(table).select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Record not found." };
  return { row: data as Record<string, unknown> };
}

export async function patchAdminLiveRecord(
  entity: AdminLiveRecordEntity,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ row?: Record<string, unknown>; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase is not configured." };
  const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: await adminHeaders(),
      body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as { row?: Record<string, unknown>; error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { row: json.row };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Failed to save record." };
  }
}

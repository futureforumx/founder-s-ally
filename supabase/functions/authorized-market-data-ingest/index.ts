import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";
import { autoPermissionForEmail, clampGodModeToDesignatedEmail, hasAdminConsoleAccess, type AppPermission } from "../_shared/app-admin-email.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-user-auth", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
function permission(value: unknown): AppPermission | null { return ["user", "manager", "admin", "god"].includes(String(value)) ? value as AppPermission : null; }

async function assertAdmin(req: Request, db: SupabaseClient): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const token = req.headers.get("x-user-auth") ?? req.headers.get("authorization");
  if (!token) return null;
  const bearer = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  const caller = await resolveAdminCaller(bearer, supabaseUrl, anonKey);
  if ("error" in caller) return null;
  const { data } = await db.from("user_roles").select("permission").in("user_id", caller.identityUserIds.length ? caller.identityUserIds : [caller.id]);
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  let role: AppPermission = "user";
  for (const row of data ?? []) { const parsed = permission(row.permission); if (parsed && rank[parsed] > rank[role]) role = parsed; }
  if (rank[permission(caller.user_metadata?.role) ?? "user"] > rank[role]) role = permission(caller.user_metadata?.role) ?? role;
  if (rank[autoPermissionForEmail(caller.email) ?? "user"] > rank[role]) role = autoPermissionForEmail(caller.email) ?? role;
  return hasAdminConsoleAccess(clampGodModeToDesignatedEmail(role, caller.email)) ? caller.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);
  const db = createClient(url, serviceKey);
  const actorId = await assertAdmin(req, db);
  if (!actorId) return json({ error: "Admin access required" }, 403);

  if (req.method === "GET") {
    const [jobs, total, staged, quarantined] = await Promise.all([
      db.from("ingestion_jobs").select("id,sourceAdapter,status,stats,config,checkpoint,error,startedAt,completedAt,createdAt,updatedAt").in("sourceAdapter", ["crunchbase", "tracxn"]).order("createdAt", { ascending: false }).limit(30),
      db.from("source_records").select("id", { count: "exact", head: true }).in("sourceAdapter", ["crunchbase", "tracxn"]),
      db.from("source_records").select("id", { count: "exact", head: true }).in("sourceAdapter", ["crunchbase", "tracxn"]).eq("processing_status", "raw"),
      db.from("source_records").select("id", { count: "exact", head: true }).in("sourceAdapter", ["crunchbase", "tracxn"]).eq("processing_status", "quarantined"),
    ]);
    if (jobs.error || total.error || staged.error || quarantined.error) return json({ error: "Could not load ingestion status." }, 500);
    return json({ jobs: jobs.data ?? [], analytics: { recordsCollected: total.count ?? 0, recordsStaged: staged.count ?? 0, recordsQuarantined: quarantined.count ?? 0 } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Expected JSON request body" }, 400); }
  if (body.action === "purge_expired") {
    const { data, error } = await db.from("source_records").delete().in("sourceAdapter", ["crunchbase", "tracxn"]).not("usage_expires_at", "is", null).lt("usage_expires_at", new Date().toISOString()).select("id");
    if (error) return json({ error: "Could not purge expired source records." }, 500);
    return json({ deleted: data?.length ?? 0 });
  }
  const provider = body.provider;
  const allowed = provider === "crunchbase" ? Deno.env.get("CRUNCHBASE_LICENSE_SCOPE") : provider === "tracxn" ? Deno.env.get("TRACXN_LICENSE_SCOPE") : null;
  if (!allowed) return json({ error: "A verified provider license scope must be configured server-side before staging data." }, 403);
  if (body.license_scope !== allowed) return json({ error: "Submitted license scope does not match configured authorization." }, 403);
  if (body.dry_run === true) return json({ dryRun: true, accepted: Array.isArray(body.records) ? body.records.length : 0 });
  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length < 1 || records.length > 100) return json({ error: "A batch must contain 1–100 records." }, 400);
  const entityType = String(body.entity_type ?? "");
  if (!["company", "firm", "person", "funding_round"].includes(entityType)) return json({ error: "Unsupported entity_type" }, 400);
  const jobResult = await db.from("ingestion_jobs").insert({ sourceAdapter: provider, status: "running", triggeredBy: actorId, config: { entity_type: entityType, license_scope: allowed, batch_size: records.length }, checkpoint: { offset: 0 }, stats: { fetched: records.length, staged: 0, quarantined: 0 } }).select("id").single();
  if (jobResult.error || !jobResult.data) return json({ error: "Could not create ingestion job" }, 500);
  const jobId = jobResult.data.id;
  let staged = 0; let unchanged = 0; let failed = 0; let quarantined = 0;
  const now = new Date().toISOString();
  for (const item of records) {
    if (!item || typeof item !== "object" || Array.isArray(item)) { failed += 1; continue; }
    const record = item as Record<string, unknown>;
    const sourceId = String(record.source_id ?? record.uuid ?? record.id ?? record.external_id ?? "").trim() || null;
    const payload = record.payload && typeof record.payload === "object" ? record.payload : record;
    const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload))).then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
    const parsedName = String((payload as Record<string, unknown>).name ?? (payload as Record<string, unknown>).company_name ?? (payload as Record<string, unknown>).firm_name ?? (payload as Record<string, unknown>).full_name ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
    const errors: string[] = [];
    if (!sourceId) errors.push("missing_provider_id");
    if (!parsedName || ["unknown", "n/a", "na", "none", "unnamed", "company", "startup", "founder", "team"].includes(parsedName.toLowerCase())) errors.push("missing_or_placeholder_name");
    const parsedAmount = (payload as Record<string, unknown>).amount ?? (payload as Record<string, unknown>).funding_amount ?? (payload as Record<string, unknown>).raised_amount;
    const parsedCurrency = (payload as Record<string, unknown>).currency ?? (payload as Record<string, unknown>).currency_code ?? (payload as Record<string, unknown>).amount_currency;
    if (entityType === "funding_round" && parsedAmount != null && !parsedCurrency) errors.push("funding_currency_missing");
    const lookup = db.from("source_records").select("id,payload_hash,usage_expires_at").eq("sourceAdapter", provider);
    const { data: previousRows } = await (sourceId ? lookup.eq("sourceId", sourceId) : lookup.eq("payload_hash", payloadHash)).limit(1);
    const previous = previousRows?.[0] ?? null;
    if (previous?.payload_hash === payloadHash) { unchanged += 1; continue; }
    const row = {
      sourceAdapter: provider, sourceUrl: String(record.source_url ?? record.profile_url ?? record.url ?? "") || null,
      sourceId, rawPayload: payload, entityType, fetchedAt: now, normalizedAt: null, import_job_id: jobId,
      processing_status: errors.length ? "quarantined" : "raw", license_scope: allowed, payload_hash: payloadHash, parsing_errors: errors, source_retrieved_at: now,
      usage_expires_at: typeof body.usage_expires_at === "string" && !Number.isNaN(Date.parse(body.usage_expires_at)) ? body.usage_expires_at : previous?.usage_expires_at ?? null,
    };
    const write = previous
      ? await db.from("source_records").update(row).eq("id", previous.id)
      : await db.from("source_records").insert(row);
    if (write.error) failed += 1; else if (errors.length) quarantined += 1; else staged += 1;
  }
  const status = failed ? "completed_with_errors" : "completed";
  await db.from("ingestion_jobs").update({ status, checkpoint: { offset: records.length, completed: true }, stats: { fetched: records.length, staged, quarantined, unchanged, failed, canonical_writes: 0 }, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).eq("id", jobId);
  return json({ jobId, status, fetched: records.length, staged, quarantined, unchanged, failed, canonicalWrites: 0 });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAdminCaller } from "../_shared/admin-resolve-caller.ts";
import { autoPermissionForEmail, clampGodModeToDesignatedEmail, hasAdminConsoleAccess, type AppPermission } from "../_shared/app-admin-email.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-auth", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const configKeys = ["foundations", "icons", "componentPresets", "visualizations", "patterns", "motion"];
const colorValue = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const allowedIcons = new Set(["Activity", "ArrowDownToLine", "ArrowRight", "Bookmark", "Building2", "ChartNoAxesCombined", "Check", "CircleCheck", "Clock3", "Download", "Eye", "Globe", "HeartHandshake", "Layers3", "Lightbulb", "Search", "Settings2", "Sparkles", "TriangleAlert", "Users", "Wallet"]);
function valid(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const c = config as Record<string, any>;
  if (Object.keys(c).length !== configKeys.length || configKeys.some((key) => !(key in c))) return false;
  const f = c.foundations, i = c.icons, m = c.motion;
  if (!f || !f.colors || typeof f.colors !== "object" || Array.isArray(f.colors) || Object.keys(f.colors).length > 40) return false;
  if (Object.entries(f.colors).some(([key, value]) => !/^--[a-z0-9-]{1,48}$/.test(key) || typeof value !== "string" || !colorValue.test(value))) return false;
  if (!/^\d+(?:\.\d+)?(?:px|rem)$/.test(f.radius) || !/^\d+(?:\.\d+)?(?:px|rem)$/.test(f.spacing) || !["comfortable", "compact"].includes(f.density) || !["Geist", "Inter", "system-ui"].includes(f.fontFamily)) return false;
  if (!i || i.library !== "lucide" || !Number.isFinite(i.size) || i.size < 12 || i.size > 40 || !Number.isFinite(i.strokeWidth) || i.strokeWidth < 1 || i.strokeWidth > 3 || typeof i.color !== "string" || i.color.length > 48 || Object.entries(i.mappings ?? {}).some(([key, value]) => !/^[a-z.]{3,48}$/.test(key) || typeof value !== "string" || !allowedIcons.has(value))) return false;
  const presets = c.componentPresets, charts = c.visualizations, patterns = c.patterns;
  const unique = (items: any[]) => new Set(items.map((x) => x?.id)).size === items.length;
  if (!Array.isArray(presets) || presets.length > 100 || !unique(presets) || presets.some((x) => !x || !/^[a-z0-9][a-z0-9._-]{1,80}$/.test(x.id) || typeof x.name !== "string" || x.name.length > 80 || /[<>;]/.test(x.name) || !["button", "badge", "card"].includes(x.component) || !["default", "secondary", "outline", "ghost", "destructive", "success", "warning"].includes(x.variant) || !["default", "sm", "lg"].includes(x.size) || !["sm", "md", "lg", "full"].includes(x.radius) || !["default", "compact", "comfortable"].includes(x.padding))) return false;
  if (!Array.isArray(charts) || charts.length > 100 || !unique(charts) || charts.some((x) => !x || !/^[a-z0-9][a-z0-9._-]{1,80}$/.test(x.id) || typeof x.name !== "string" || x.name.length > 80 || /[<>;]/.test(x.name) || !["line", "bar", "area", "pie", "donut", "kpi"].includes(x.type) || typeof x.title !== "string" || x.title.length > 100 || /[<>;]/.test(x.title) || typeof x.color !== "string" || !colorValue.test(x.color) || typeof x.showGrid !== "boolean" || typeof x.showLegend !== "boolean" || !["name", "value", "secondary"].includes(x.xAxisKey) || !["value", "secondary"].includes(x.yAxisKey) || typeof x.xAxisLabel !== "string" || x.xAxisLabel.length > 60 || /[<>;]/.test(x.xAxisLabel) || typeof x.yAxisLabel !== "string" || x.yAxisLabel.length > 60 || /[<>;]/.test(x.yAxisLabel) || typeof x.showTooltip !== "boolean" || typeof x.showLabels !== "boolean")) return false;
  if (!Array.isArray(patterns) || patterns.length > 100 || !unique(patterns) || patterns.some((x) => !x || !/^[a-z0-9][a-z0-9._-]{1,80}$/.test(x.id) || typeof x.name !== "string" || x.name.length > 80 || /[<>;]/.test(x.name) || !["page-header", "search-filters", "metric-grid", "empty-state"].includes(x.template) || !["comfortable", "compact"].includes(x.density))) return false;
  return !!m && Number.isInteger(m.durationMs) && m.durationMs >= 0 && m.durationMs <= 2000 && ["ease", "ease-in-out", "linear"].includes(m.easing) && ["subtle", "standard", "reduced"].includes(m.intensity) && typeof m.reducedMotion === "boolean";
}

function bearer(value: string | null) { const v = value?.trim(); return v ? (v.toLowerCase().startsWith("bearer ") ? v : `Bearer ${v}`) : null; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anonKey || !serviceKey) return json({ error: "Design Studio service is not configured" }, 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const action = new URL(req.url).searchParams.get("action") ?? "state";

  if (action === "published") {
    const { data, error } = await db.from("design_studio_state").select("published_config,published_version,published_at").eq("singleton", true).maybeSingle();
    if (error) return json({ error: "Published design configuration is unavailable" }, 503);
    return json({ config: data?.published_config ?? null, version: data?.published_version ?? 0, publishedAt: data?.published_at ?? null });
  }

  const authHeader = bearer(req.headers.get("x-user-auth")) ?? bearer(req.headers.get("authorization"));
  if (!authHeader) return json({ error: "Missing authorization" }, 401);
  const caller = await resolveAdminCaller(authHeader, url, anonKey);
  if ("error" in caller) return json({ error: caller.error }, 401);
  const ids = caller.identityUserIds.length ? caller.identityUserIds : [caller.id];
  const { data: roles, error: rolesError } = await db.from("user_roles").select("permission").in("user_id", ids);
  if (rolesError) return json({ error: "Admin permission lookup failed" }, 503);
  const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
  let permission: AppPermission = autoPermissionForEmail(caller.email) ?? "user";
  for (const row of roles ?? []) {
    const role = String(row.permission ?? "").toLowerCase() as AppPermission;
    if (role in rank && rank[role] > rank[permission]) permission = role;
  }
  permission = clampGodModeToDesignatedEmail(permission, caller.email);
  if (!hasAdminConsoleAccess(permission)) return json({ error: "Caller is not an admin" }, 403);

  if (req.method === "GET" || action === "state") {
    const [{ data: state, error: stateError }, { data: revisions, error: revisionsError }] = await Promise.all([
      db.from("design_studio_state").select("draft_config,published_config,draft_revision_id,published_revision_id,published_version,updated_at,published_at").eq("singleton", true).maybeSingle(),
      db.from("design_studio_revisions").select("id,version,action,actor,note,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (stateError || revisionsError) return json({ error: "Could not load Design Studio state" }, 503);
    return json({ state, revisions: revisions ?? [] });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (new TextEncoder().encode(JSON.stringify(body)).length > 200_000) return json({ error: "Configuration is too large" }, 413);
  const mutateAction = body.action;
  if (!["save_draft", "publish", "restore"].includes(String(mutateAction))) return json({ error: "Unsupported action" }, 400);
  if ((mutateAction === "save_draft" && !valid(body.config)) || (mutateAction === "restore" && typeof body.targetRevision !== "string")) return json({ error: "Configuration failed validation" }, 400);
  if (typeof body.expectedRevision !== "string") return json({ error: "Expected revision is required" }, 400);
  const { data, error } = await db.rpc("design_studio_mutate", {
    p_action: mutateAction,
    p_config: mutateAction === "save_draft" ? body.config : null,
    p_expected_revision: body.expectedRevision,
    p_target_revision: body.targetRevision ?? null,
    p_actor: caller.id,
    p_note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
  });
  if (error) {
    if (error.message.includes("DRAFT_CONFLICT")) return json({ error: "Another admin changed this draft. Reload to review the latest version." }, 409);
    if (error.message.includes("REVISION_NOT_FOUND")) return json({ error: "The selected revision no longer exists." }, 404);
    return json({ error: "Design Studio update failed" }, 500);
  }
  return json({ result: data });
});

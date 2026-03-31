import { FunctionsFetchError, FunctionsRelayError } from "@supabase/supabase-js";
import type { CompanyData } from "@/components/CompanyProfile";
import { supabase, getSupabaseAccessToken, isSupabaseConfigured } from "@/integrations/supabase/client";
import { getClerkSessionToken } from "@/lib/clerkSessionForEdge";
import { ensureManagerMembership } from "@/lib/ensureManagerMembership";
import { isFunctionsHttpError, readFunctionsHttpErrorMessage } from "@/lib/supabaseFunctionErrors";

export type EnsureWorkspaceResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string };

const sb = supabase as any;

/** Edge `resolveEdgeUserId` failures: safe to retry via PostgREST (may still hit RLS). */
function isRecoverableEdgeIdentityError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("jwt") ||
    m.includes("identify this user") ||
    m.includes("does not identify") ||
    m.includes("missing or invalid bearer") ||
    m.includes("bearer token")
  );
}

/** Append setup hints when PostgREST denies inserts/updates due to RLS (common in local dev without Clerk↔Supabase JWT). */
function withPostgrestRlsHint(message: string | undefined, code?: string): string {
  const msg = message || "Unknown error";
  const lowered = msg.toLowerCase();
  if (
    code === "42501" ||
    lowered.includes("row-level security") ||
    lowered.includes("rls policy") ||
    lowered.includes("violates row-level security")
  ) {
    return `${msg} — Fix: Clerk Dashboard → JWT Templates → name exactly "supabase" (e.g. sub: {{user.id}}), then Supabase → Authentication → Third-party auth → Clerk. Or deploy create-company-workspace and set function secrets so the app uses the service-role path. See .env.example.`;
  }
  return msg;
}

/**
 * Ensures the user has a company_analyses row + company_members(manager) row.
 * Prefers the create-company-workspace edge function (service role — avoids RLS/client JWT issues).
 * Falls back to direct inserts if the function is not deployed.
 */
export async function ensureCompanyWorkspace(
  userId: string,
  company: Pick<CompanyData, "name" | "website">,
): Promise<EnsureWorkspaceResult> {
  const name = company.name?.trim();
  if (!name) return { ok: false, error: "Company name is required" };

  const website = company.website?.trim() || "";

  // Edge function uses resolveEdgeUserId(Authorization, body.userId): anon publishable JWT never matches
  // the Clerk id in body — skip edge and use direct DB when we only have anon (no user JWT).
  if (isSupabaseConfigured) {
    const userJwt =
      (await getSupabaseAccessToken())?.trim() ||
      (await getClerkSessionToken())?.trim() ||
      "";
    if (userJwt) {
      const anonKey =
        typeof import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
          ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
          : "";
      const { data, error } = await supabase.functions.invoke("create-company-workspace", {
        body: { companyName: name, website, userId },
        headers: {
          Authorization: `Bearer ${userJwt}`,
          ...(anonKey ? { apikey: anonKey } : {}),
        },
      });

      const payload = (data || {}) as { success?: boolean; companyId?: string; error?: string };

      if (payload.success && payload.companyId) {
        return { ok: true, companyId: payload.companyId };
      }

      if (payload.error && !isRecoverableEdgeIdentityError(payload.error)) {
        return { ok: false, error: payload.error };
      }
      if (payload.error && isRecoverableEdgeIdentityError(payload.error)) {
        console.warn(
          "[ensureCompanyWorkspace] create-company-workspace identity/JWT — trying direct DB:",
          payload.error,
        );
      }

      if (error) {
        if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
          console.warn("[ensureCompanyWorkspace] create-company-workspace relay/fetch:", error.message, "— trying direct DB.");
        } else {
          const httpStatus = isFunctionsHttpError(error) ? error.context.status : 0;
          const jsonErr = await readFunctionsHttpErrorMessage(error);
          const recoverableHttp = httpStatus === 401 || httpStatus === 403 || httpStatus === 404;
          if (jsonErr && !isRecoverableEdgeIdentityError(jsonErr) && !recoverableHttp) {
            return { ok: false, error: jsonErr };
          }
          if (jsonErr && (isRecoverableEdgeIdentityError(jsonErr) || recoverableHttp)) {
            console.warn("[ensureCompanyWorkspace] create-company-workspace HTTP/status — trying direct DB:", jsonErr);
          } else if (!jsonErr && recoverableHttp) {
            console.warn(
              `[ensureCompanyWorkspace] create-company-workspace HTTP ${httpStatus} — trying direct DB.`,
            );
          } else if (isFunctionsHttpError(error) && !recoverableHttp) {
            return {
              ok: false,
              error: `Workspace setup failed (HTTP ${error.context.status}). Deploy create-company-workspace and set function secrets, or configure Clerk "supabase" JWT for direct database access.`,
            };
          } else {
            console.warn("[ensureCompanyWorkspace] create-company-workspace:", String(error), "; trying direct DB.");
          }
        }
      }
    } else {
      console.warn(
        "[ensureCompanyWorkspace] No Clerk/Supabase JWT — skipping create-company-workspace; using direct DB.",
      );
    }
  }

  const { data: existingMem } = await sb
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .in("role", ["owner", "manager", "admin"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingMem?.company_id) {
    return { ok: true, companyId: existingMem.company_id };
  }

  const { data: ownRow } = await supabase
    .from("company_analyses")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const own = ownRow as { id: string } | null;

  if (own?.id) {
    const mem = await ensureManagerMembership(sb, userId, own.id);
    if (!mem.ok) {
      return { ok: false, error: withPostgrestRlsHint(mem.error) };
    }

    await sb.from("profiles").update({ company_id: own.id }).eq("user_id", userId);

    return { ok: true, companyId: own.id };
  }

  const newCompId = crypto.randomUUID();
  const websiteUrl = website || null;

  const { error: compError } = await supabase.from("company_analyses").insert({
    id: newCompId,
    user_id: userId,
    company_name: name,
    website_url: websiteUrl,
    is_claimed: true,
    claimed_by: userId,
  } as any);

  if (compError) {
    return { ok: false, error: withPostgrestRlsHint(compError.message, compError.code) };
  }

  const mem = await ensureManagerMembership(sb, userId, newCompId);
  if (!mem.ok) {
    await supabase.from("company_analyses").delete().eq("id", newCompId);
    return { ok: false, error: withPostgrestRlsHint(mem.error) };
  }

  await sb.from("profiles").update({ company_id: newCompId }).eq("user_id", userId);

  return { ok: true, companyId: newCompId };
}

import { supabase, getSupabaseBearerForFunctions, isSupabaseConfigured } from "@/integrations/supabase/client";
import { getEdgeFunctionAuthToken } from "@/lib/edgeFunctionAuth";

type InvokeOptions = NonNullable<Parameters<typeof supabase.functions.invoke>[1]>;

/** Extra options for {@link invokeEdgeFunction}. */
export type InvokeEdgeFunctionOptions = InvokeOptions & {
  /**
   * Use Clerk session JWT first (`sub` = `user_…`) so `user_roles` and other Clerk-keyed rows match.
   * Default bearer follows `AuthProvider` (session JWT first unless `VITE_SUPABASE_JWT_TEMPLATE_FIRST=true`).
   */
  preferClerkSessionToken?: boolean;
};

const DEFAULT_TIMEOUT_MS = 90_000;

function headersToRecord(h: InvokeOptions["headers"]): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  return { ...(h as Record<string, string>) };
}

function publishableKey(): string {
  const k = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return typeof k === "string" ? k.trim() : "";
}

/**
 * Invoke a Supabase Edge Function with headers the **gateway** accepts (see getSupabaseBearerForFunctions).
 */
export async function invokeEdgeFunction(
  name: string,
  options?: InvokeEdgeFunctionOptions,
) {
  const { preferClerkSessionToken, ...rest } = options ?? {};
  if (!isSupabaseConfigured) {
    return supabase.functions.invoke(name, rest);
  }
  const bearer =
    preferClerkSessionToken === true
      ? await getEdgeFunctionAuthToken()
      : await getSupabaseBearerForFunctions();
  const anonKey = publishableKey();
  const mergedHeaders = headersToRecord(rest.headers);
  if (bearer) mergedHeaders.Authorization = `Bearer ${bearer}`;
  if (anonKey && mergedHeaders.apikey == null) mergedHeaders.apikey = anonKey;
  return supabase.functions.invoke(name, {
    ...rest,
    headers: mergedHeaders,
    timeout: rest.timeout ?? DEFAULT_TIMEOUT_MS,
  });
}

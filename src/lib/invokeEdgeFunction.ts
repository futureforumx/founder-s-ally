import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { getEdgeFunctionAuthToken } from "@/lib/edgeFunctionAuth";

type InvokeOptions = NonNullable<Parameters<typeof supabase.functions.invoke>[1]>;

const DEFAULT_TIMEOUT_MS = 90_000;

function headersToRecord(h: InvokeOptions["headers"]): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  return { ...(h as Record<string, string>) };
}

/**
 * Invoke a Supabase Edge Function with the same JWT chain as claim flows (Clerk session → Clerk template → Supabase)
 * and a generous timeout. Helps avoid 401s when only Clerk session JWT is valid and flaky gateway timeouts.
 * Deploy with `[functions.<name>] verify_jwt = false` when using Clerk (see supabase/config.toml).
 */
export async function invokeEdgeFunction(
  name: string,
  options?: InvokeOptions
) {
  if (!isSupabaseConfigured) {
    return supabase.functions.invoke(name, options);
  }
  const token = await getEdgeFunctionAuthToken();
  const base = options ?? {};
  const mergedHeaders = headersToRecord(base.headers);
  if (token) mergedHeaders.Authorization = `Bearer ${token}`;
  return supabase.functions.invoke(name, {
    ...base,
    headers: mergedHeaders,
    timeout: base.timeout ?? DEFAULT_TIMEOUT_MS,
  });
}

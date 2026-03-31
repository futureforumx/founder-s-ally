import { supabase, getSupabaseAccessToken, isSupabaseConfigured } from "@/integrations/supabase/client";

type InvokeOptions = NonNullable<Parameters<typeof supabase.functions.invoke>[1]>;

const DEFAULT_TIMEOUT_MS = 90_000;

function headersToRecord(h: InvokeOptions["headers"]): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  return { ...(h as Record<string, string>) };
}

/**
 * Invoke a Supabase Edge Function with a JWT the **gateway** accepts (same as PostgREST: Clerk `supabase` template,
 * then Clerk session per useAuth). Do not use the raw Clerk session token here — Supabase returns 401 Invalid JWT
 * when `verify_jwt` is enabled on the function. Long timeout avoids flaky gateway timeouts.
 */
export async function invokeEdgeFunction(
  name: string,
  options?: InvokeOptions
) {
  if (!isSupabaseConfigured) {
    return supabase.functions.invoke(name, options);
  }
  const token = await getSupabaseAccessToken();
  const base = options ?? {};
  const mergedHeaders = headersToRecord(base.headers);
  if (token) mergedHeaders.Authorization = `Bearer ${token}`;
  return supabase.functions.invoke(name, {
    ...base,
    headers: mergedHeaders,
    timeout: base.timeout ?? DEFAULT_TIMEOUT_MS,
  });
}

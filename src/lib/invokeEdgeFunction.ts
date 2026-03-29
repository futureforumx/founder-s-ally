import { supabase, getSupabaseAccessToken, isSupabaseConfigured } from "@/integrations/supabase/client";

type InvokeOptions = NonNullable<Parameters<typeof supabase.functions.invoke>[1]>;

const DEFAULT_TIMEOUT_MS = 90_000;

function headersToRecord(h: InvokeOptions["headers"]): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  return { ...(h as Record<string, string>) };
}

/**
 * Invoke a Supabase Edge Function with Clerk JWT explicitly attached and a generous timeout.
 * Helps avoid flaky "Failed to send a request to the Edge Function" when the gateway or relay is slow.
 * Deploy with `[functions.<name>] verify_jwt = false` when using Clerk (see supabase/config.toml).
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

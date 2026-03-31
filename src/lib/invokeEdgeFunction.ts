import { supabase, getSupabaseBearerForFunctions, isSupabaseConfigured } from "@/integrations/supabase/client";

type InvokeOptions = NonNullable<Parameters<typeof supabase.functions.invoke>[1]>;

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
  options?: InvokeOptions
) {
  if (!isSupabaseConfigured) {
    return supabase.functions.invoke(name, options);
  }
  const bearer = await getSupabaseBearerForFunctions();
  const anonKey = publishableKey();
  const base = options ?? {};
  const mergedHeaders = headersToRecord(base.headers);
  if (bearer) mergedHeaders.Authorization = `Bearer ${bearer}`;
  if (anonKey && mergedHeaders.apikey == null) mergedHeaders.apikey = anonKey;
  return supabase.functions.invoke(name, {
    ...base,
    headers: mergedHeaders,
    timeout: base.timeout ?? DEFAULT_TIMEOUT_MS,
  });
}

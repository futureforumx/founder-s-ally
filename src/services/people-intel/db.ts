/**
 * Shared Supabase client for people-intel services.
 * Follows the same loadEnvFiles pattern as scripts/lib/loadEnvFiles.ts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function makeServiceClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false } });
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { mockSupabase } from "./mock-client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** True when the real Supabase client is used (not the local mock). */
export const isSupabaseConfigured = hasSupabaseConfig;

if (import.meta.env.DEV && !hasSupabaseConfig) {
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Falling back to Mock Storage mode so the UI can function in local dev. Data will be saved to your browser's local storage."
  );
}

let accessTokenGetter: () => Promise<string | null> = async () => null;

/** Called from AuthProvider when Clerk session changes — forwards JWT to Supabase (third-party auth). */
export function setSupabaseAccessTokenGetter(fn: () => Promise<string | null>) {
  accessTokenGetter = fn;
}

// Export either the real client or our mock
export const supabase = hasSupabaseConfig
  ? createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      global: {
        fetch: (...args) => fetch(...args),
      },
      accessToken: async () => accessTokenGetter(),
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    })
  : mockSupabase;

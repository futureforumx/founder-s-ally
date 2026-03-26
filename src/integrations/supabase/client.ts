import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const fallbackSupabaseUrl = "https://placeholder.supabase.co";
const fallbackSupabaseKey = "placeholder-anon-key";

if (import.meta.env.DEV && !hasSupabaseConfig) {
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Using a placeholder client so the UI can render in local dev. Add real values to .env.local when you need live auth or data."
  );
}

let accessTokenGetter: () => Promise<string | null> = async () => null;

/** Called from AuthProvider when Clerk session changes — forwards JWT to Supabase (third-party auth). */
export function setSupabaseAccessTokenGetter(fn: () => Promise<string | null>) {
  accessTokenGetter = fn;
}

export const supabase = createClient<Database>(
  hasSupabaseConfig ? SUPABASE_URL : fallbackSupabaseUrl,
  hasSupabaseConfig ? SUPABASE_PUBLISHABLE_KEY : fallbackSupabaseKey,
  {
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
  }
);

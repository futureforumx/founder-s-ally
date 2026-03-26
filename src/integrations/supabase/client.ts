import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  console.error(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local, add your project URL and anon key from the Supabase dashboard, then restart Vite."
  );
}

let accessTokenGetter: () => Promise<string | null> = async () => null;

/** Called from AuthProvider when Clerk session changes — forwards JWT to Supabase (third-party auth). */
export function setSupabaseAccessTokenGetter(fn: () => Promise<string | null>) {
  accessTokenGetter = fn;
}

export const supabase = createClient<Database>(SUPABASE_URL ?? "", SUPABASE_PUBLISHABLE_KEY ?? "", {
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
});

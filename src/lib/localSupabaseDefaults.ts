/**
 * Public browser credentials already shipped on vekta.so.
 * Used only for local `vite` / `pnpm dev` when `.env` is missing so login
 * can talk to the same Supabase project as production.
 *
 * This is the publishable (anon) key, not the service role.
 * Playwright demo mode must not use these — keep `VITE_DEMO_MODE=true` there.
 */
export const LOCAL_DEV_SUPABASE_URL = "https://zmnlsdohtwztneamvwaq.supabase.co";
export const LOCAL_DEV_SUPABASE_PUBLISHABLE_KEY = "sb_publishable__qp4VF-DRoI3pbvYUOZSVg_saGEPQMI";
export const LOCAL_DEV_SUPABASE_PROJECT_ID = "zmnlsdohtwztneamvwaq";

export type LocalSupabaseEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
  VITE_DEMO_MODE?: string;
};

function isBlank(value: string | undefined): boolean {
  return !value || !value.trim();
}

/** True when local login should fall back to the production public project. */
export function shouldUseLocalSupabaseDefaults(
  mode: string,
  env: Pick<LocalSupabaseEnv, "VITE_DEMO_MODE" | "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY">,
): boolean {
  if (mode !== "development") return false;
  if (env.VITE_DEMO_MODE === "true") return false;
  return isBlank(env.VITE_SUPABASE_URL) || isBlank(env.VITE_SUPABASE_PUBLISHABLE_KEY);
}

/** Fill missing VITE_SUPABASE_* values for local development. Mutates `env`. */
export function applyLocalSupabaseDefaults<T extends LocalSupabaseEnv>(mode: string, env: T): T {
  if (!shouldUseLocalSupabaseDefaults(mode, env)) return env;
  if (isBlank(env.VITE_SUPABASE_URL)) env.VITE_SUPABASE_URL = LOCAL_DEV_SUPABASE_URL;
  if (isBlank(env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    env.VITE_SUPABASE_PUBLISHABLE_KEY = LOCAL_DEV_SUPABASE_PUBLISHABLE_KEY;
  }
  if (isBlank(env.VITE_SUPABASE_PROJECT_ID)) env.VITE_SUPABASE_PROJECT_ID = LOCAL_DEV_SUPABASE_PROJECT_ID;
  return env;
}

/** Browser/auth helpers: resolved URL + publishable key after local-dev fallback. */
export function resolveBrowserSupabaseConfig(
  mode: string,
  env: LocalSupabaseEnv,
): { url: string; publishableKey: string; projectId: string } {
  const resolved = applyLocalSupabaseDefaults(mode, { ...env });
  return {
    url: (resolved.VITE_SUPABASE_URL ?? "").replace(/\/$/, ""),
    publishableKey: (resolved.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim(),
    projectId: (resolved.VITE_SUPABASE_PROJECT_ID ?? "").trim(),
  };
}

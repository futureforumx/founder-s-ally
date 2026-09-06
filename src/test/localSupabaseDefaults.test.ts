import { describe, expect, it } from "vitest";
import {
  LOCAL_DEV_SUPABASE_PROJECT_ID,
  LOCAL_DEV_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_DEV_SUPABASE_URL,
  applyLocalSupabaseDefaults,
  resolveBrowserSupabaseConfig,
  shouldUseLocalSupabaseDefaults,
} from "@/lib/localSupabaseDefaults";

describe("localSupabaseDefaults", () => {
  it("uses production public keys only for local development without env", () => {
    expect(
      shouldUseLocalSupabaseDefaults("development", {
        VITE_DEMO_MODE: undefined,
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toBe(true);
  });

  it("does not override production builds, demo mode, or an explicit env", () => {
    expect(shouldUseLocalSupabaseDefaults("production", { VITE_SUPABASE_URL: "" })).toBe(false);
    expect(
      shouldUseLocalSupabaseDefaults("development", {
        VITE_DEMO_MODE: "true",
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toBe(false);
    expect(
      shouldUseLocalSupabaseDefaults("development", {
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_custom",
      }),
    ).toBe(false);
  });

  it("fills missing local env values", () => {
    const env = applyLocalSupabaseDefaults("development", {});
    expect(env.VITE_SUPABASE_URL).toBe(LOCAL_DEV_SUPABASE_URL);
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(LOCAL_DEV_SUPABASE_PUBLISHABLE_KEY);
    expect(env.VITE_SUPABASE_PROJECT_ID).toBe(LOCAL_DEV_SUPABASE_PROJECT_ID);
  });

  it("resolves a browser config from empty local env", () => {
    const resolved = resolveBrowserSupabaseConfig("development", {});
    expect(resolved.url).toBe(LOCAL_DEV_SUPABASE_URL);
    expect(resolved.publishableKey).toBe(LOCAL_DEV_SUPABASE_PUBLISHABLE_KEY);
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";

export type EnsureAppUserInput = {
  userId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Upsert `users` + default `profiles` row and return the profile (shared by
 * Vercel `/api/ensure-user` and the Vite dev middleware).
 */
export async function ensureAppUserRows(
  admin: SupabaseClient,
  input: EnsureAppUserInput,
): Promise<{ ok: true; profile: unknown } | { ok: false; error: string; status: number }> {
  const now = new Date().toISOString();
  const { userId, email, displayName, avatarUrl } = input;

  const userRow: Record<string, unknown> = { id: userId, updated_at: now };
  if (email) userRow.email = email;
  if (displayName) userRow.display_name = displayName;
  if (avatarUrl) userRow.avatar_url = avatarUrl;

  const { error: userError } = await admin.from("users").upsert(userRow, { onConflict: "id" });

  if (userError) {
    console.error("[ensure-user] users upsert failed:", userError.message);
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    { user_id: userId, has_completed_onboarding: false, created_at: now, updated_at: now },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  if (profileError) {
    console.error("[ensure-user] profiles upsert failed:", profileError.message);
    return { ok: false, error: profileError.message, status: 500 };
  }

  const { data: profile, error: fetchError } = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[ensure-user] profile fetch failed:", fetchError.message);
    return { ok: false, error: fetchError.message, status: 500 };
  }

  return { ok: true, profile };
}

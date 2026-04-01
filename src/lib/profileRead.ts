/**
 * ## Profile counter reads (source of truth)
 *
 * **`public.profiles`** keeps nullable storage for derived / consistency counters listed in
 * {@link PROFILE_READ_COUNTER_FIELDS}. Inserts and updates always target this table.
 *
 * ### App reads (Supabase JS in the browser)
 * - Query **`profiles`** (not the view) so RLS, Clerk JWT, and the local mock client stay aligned.
 * - After **`select("*")`** (or any full row), run {@link normalizeProfileRowForRead} or
 *   {@link normalizeProfileRowsForRead} so missing/null counter fields become **`0`** for consumers.
 * - **Canonical list of which columns are normalized:** {@link PROFILE_READ_COUNTER_FIELDS}.
 *   If you add a column here, mirror it in the SQL view migration (see below).
 *
 * ### SQL / service_role / Edge (server-side)
 * - Query **`public.profiles_app_read`** ({@link PROFILE_READ_VIEW_NAME}) for the same counter
 *   semantics via **`COALESCE(..., 0)`** in one place—avoid ad-hoc COALESCE lists in random SQL.
 * - Defined in `supabase/migrations/20260331210000_profiles_app_read_view.sql`.
 * - **Writes** still go to **`public.profiles`** only; the view is read-only.
 */

/** DB view name for server-side reads with coalesced counters. */
export const PROFILE_READ_VIEW_NAME = "profiles_app_read" as const;

/**
 * Counter-shaped columns on `public.profiles` that are nullable in storage but should read as `0`
 * in app logic when unknown. Keep in sync with `COALESCE` columns in `profiles_app_read`.
 */
export const PROFILE_READ_COUNTER_FIELDS = [
  "actions_last_30d",
  "intros_made_count",
  "playbooks_used_count",
  "prior_exits_count",
] as const;

export type ProfileReadCounterField = (typeof PROFILE_READ_COUNTER_FIELDS)[number];

/** @see module doc — use after full-row reads from `profiles` in the app. */
export function normalizeProfileRowForRead<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as T;
  const rec = out as Record<string, unknown>;
  for (const key of PROFILE_READ_COUNTER_FIELDS) {
    if (!(key in rec) || rec[key] == null) rec[key] = 0;
  }
  return out;
}

/** @see normalizeProfileRowForRead */
export function normalizeProfileRowsForRead<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(normalizeProfileRowForRead);
}

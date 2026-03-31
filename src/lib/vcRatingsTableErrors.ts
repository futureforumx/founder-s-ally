/**
 * Detect PostgREST errors when `public.vc_ratings` is absent or not exposed
 * (e.g. Prisma migrations not applied on the linked Supabase DB).
 */
export function isMissingVcRatingsTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { message?: string; details?: string; hint?: string; code?: string };
  const blob = `${o.code ?? ""} ${o.message ?? ""} ${o.details ?? ""} ${o.hint ?? ""}`.toLowerCase();
  if (o.code === "PGRST205" && blob.includes("vc_ratings")) return true;
  if (!blob.includes("vc_ratings")) return false;
  if (blob.includes("schema cache")) return true;
  if (blob.includes("could not find")) return true;
  if (blob.includes("does not exist") && (blob.includes("relation") || blob.includes("table"))) return true;
  return false;
}

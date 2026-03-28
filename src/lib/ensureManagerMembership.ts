/**
 * Client-side: ensure company_members has manager access (insert or promote pending).
 * Mirrors supabase/functions/_shared/ensure-manager-membership.ts for the direct-DB fallback path.
 */
export async function ensureManagerMembership(
  sb: any,
  userId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: selErr } = await sb
    .from("company_members")
    .select("id, role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message };

  const r = row as { id: string; role: string } | null;
  if (r) {
    if (r.role === "owner" || r.role === "manager" || r.role === "admin") return { ok: true };
    if (r.role === "pending") {
      const { error: upErr } = await sb.from("company_members").update({ role: "manager" }).eq("id", r.id);
      if (upErr) return { ok: false, error: upErr.message };
      return { ok: true };
    }
  }

  const { error: insErr } = await sb.from("company_members").insert({
    user_id: userId,
    company_id: companyId,
    role: "manager",
  });

  if (!insErr) return { ok: true };

  if (insErr.code === "23505" || insErr.message?.toLowerCase().includes("duplicate")) {
    const { data: again } = await sb
      .from("company_members")
      .select("id, role")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();
    const a = again as { id: string; role: string } | null;
    if (a?.role === "pending") {
      const { error: up2 } = await sb.from("company_members").update({ role: "manager" }).eq("id", a.id);
      if (up2) return { ok: false, error: up2.message };
      return { ok: true };
    }
    if (a && ["owner", "manager", "admin"].includes(a.role)) return { ok: true };
  }

  return { ok: false, error: insErr.message };
}

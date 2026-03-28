/**
 * Ensures (user_id, company_id) has manager-level access: insert manager, or promote pending → manager.
 * Handles UNIQUE(user_id, company_id) when a pending row already exists.
 */
export async function ensureManagerMembership(
  admin: any,
  userId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: selErr } = await admin
    .from("company_members")
    .select("id, role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message };
  }

  if (row) {
    if (row.role === "owner" || row.role === "manager" || row.role === "admin") {
      return { ok: true };
    }
    if (row.role === "pending") {
      const { error: upErr } = await admin.from("company_members").update({ role: "manager" }).eq("id", row.id);
      if (upErr) return { ok: false, error: upErr.message };
      return { ok: true };
    }
  }

  const { error: insErr } = await admin.from("company_members").insert({
    user_id: userId,
    company_id: companyId,
    role: "manager",
  });

  if (!insErr) return { ok: true };

  if (insErr.code === "23505" || insErr.message?.toLowerCase().includes("duplicate")) {
    const { data: again } = await admin
      .from("company_members")
      .select("id, role")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (again?.role === "pending") {
      const { error: up2 } = await admin.from("company_members").update({ role: "manager" }).eq("id", again.id);
      if (up2) return { ok: false, error: up2.message };
      return { ok: true };
    }
    if (again && ["owner", "manager", "admin"].includes(String(again.role))) {
      return { ok: true };
    }
  }

  return { ok: false, error: insErr.message };
}

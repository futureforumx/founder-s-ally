import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  autoPermissionForEmail,
  clampGodModeToDesignatedEmail,
  hasAdminConsoleAccess,
  type AppPermission,
} from "@/lib/appAdmin";

/**
 * App-level access: user_roles, legacy metadata role, and automatic email-based manager/god grants.
 */
export function useAppAdmin(): {
  isAppAdmin: boolean;
  isGodMode: boolean;
  permission: AppPermission;
  loading: boolean;
} {
  const { user, loading: authLoading } = useAuth();
  const [permission, setPermission] = useState<AppPermission | null>(null);

  const finalizePermission = (candidate: AppPermission): AppPermission =>
    clampGodModeToDesignatedEmail(candidate, user?.email);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setPermission("user");
      return;
    }

    const autoPermission = autoPermissionForEmail(user.email);
    if (autoPermission === "god") {
      setPermission("god");
      return;
    }

    const legacyRoleRaw = String(user.user_metadata?.role ?? "").toLowerCase();
    const legacyPermission: AppPermission | null =
      legacyRoleRaw === "god" || legacyRoleRaw === "admin" || legacyRoleRaw === "manager" || legacyRoleRaw === "user"
        ? (legacyRoleRaw as AppPermission)
        : null;

    setPermission(null);
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("permission")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          const fallback = finalizePermission(autoPermission ?? legacyPermission ?? "user");
          setPermission(fallback);
          return;
        }
        const rolePermissionRaw = String((data as { permission?: string } | null)?.permission ?? "").toLowerCase();
        const rolePermission: AppPermission | null =
          rolePermissionRaw === "god" ||
          rolePermissionRaw === "admin" ||
          rolePermissionRaw === "manager" ||
          rolePermissionRaw === "user"
            ? (rolePermissionRaw as AppPermission)
            : null;

        const rank: Record<AppPermission, number> = { user: 0, manager: 1, admin: 2, god: 3 };
        const candidates: AppPermission[] = ["user"];
        if (autoPermission) candidates.push(autoPermission);
        if (legacyPermission) candidates.push(legacyPermission);
        if (rolePermission) candidates.push(rolePermission);

        const highest = candidates.reduce((best, next) => (rank[next] > rank[best] ? next : best), "user" as AppPermission);
        setPermission(finalizePermission(highest));
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.email, user?.user_metadata?.role]);

  const loading = authLoading || permission === null;
  const resolvedPermission: AppPermission = permission ?? "user";
  return {
    isAppAdmin: hasAdminConsoleAccess(resolvedPermission),
    isGodMode: resolvedPermission === "god",
    permission: resolvedPermission,
    loading,
  };
}

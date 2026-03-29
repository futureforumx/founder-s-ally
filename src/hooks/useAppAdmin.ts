import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isAppAdminEmailDomain } from "@/lib/appAdmin";

/**
 * App-level admin: `user_roles` admin/god, legacy `user_metadata.role === "admin"`,
 * or email on @{vekta.so|kova.vc}.
 */
export function useAppAdmin(): { isAppAdmin: boolean; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [isAppAdmin, setIsAppAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAppAdmin(false);
      return;
    }
    if (isAppAdminEmailDomain(user.email)) {
      setIsAppAdmin(true);
      return;
    }
    const legacyAdmin = user.user_metadata?.role === "admin";
    if (legacyAdmin) {
      setIsAppAdmin(true);
      return;
    }

    setIsAppAdmin(null);
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("permission")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setIsAppAdmin(false);
          return;
        }
        const perm = (data as { permission?: string } | null)?.permission;
        setIsAppAdmin(perm === "admin" || perm === "god");
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.email, user?.user_metadata?.role]);

  const loading = authLoading || isAppAdmin === null;
  return { isAppAdmin: isAppAdmin === true, loading };
}

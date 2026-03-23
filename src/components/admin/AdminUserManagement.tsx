import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Search, Shield, UserCog, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ProfileRow {
  id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  avatar_url: string | null;
  user_type: string;
}

export function AdminUserManagement() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // We track admin user_ids locally since we can't read other users' metadata from the client
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, title, avatar_url, user_type")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load users");
    } else {
      setProfiles(data || []);
    }
    setLoading(false);
  };

  const filtered = profiles.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleAdmin = async (profile: ProfileRow) => {
    setTogglingId(profile.user_id);
    try {
      const isCurrentlyAdmin = adminIds.has(profile.user_id);
      // Use edge function to update user metadata (admin action)
      const { data, error } = await supabase.functions.invoke("manage-admin-role", {
        body: { target_user_id: profile.user_id, action: isCurrentlyAdmin ? "revoke" : "grant" },
      });
      if (error) throw error;
      
      setAdminIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyAdmin) next.delete(profile.user_id);
        else next.add(profile.user_id);
        return next;
      });
      toast.success(isCurrentlyAdmin ? "Admin access revoked" : "Admin access granted", {
        description: profile.full_name,
      });
    } catch (e: any) {
      toast.error("Failed to update role", { description: e.message });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-white/90">User Management</h1>
        <p className="mt-1 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Assign or revoke admin access for platform users.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 rounded-lg border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/25 focus-visible:ring-emerald-500/40"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#39FF14" }} />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((profile) => {
            const isAdmin = adminIds.has(profile.user_id);
            const isToggling = togglingId === profile.user_id;
            return (
              <div
                key={profile.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors"
                style={{
                  borderColor: isAdmin ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.06)",
                  background: isAdmin ? "rgba(57,255,20,0.04)" : "rgba(255,255,255,0.02)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                    style={{
                      background: isAdmin ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.06)",
                      color: isAdmin ? "#f59e0b" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {isAdmin ? <Crown className="h-3.5 w-3.5" /> : <UserCog className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/85">{profile.full_name || "Unnamed User"}</p>
                    <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {profile.title || profile.user_type || "User"}
                    </p>
                  </div>
                  {isAdmin && (
                    <Badge
                      className="ml-1 border-none text-[9px] font-bold uppercase"
                      style={{ background: "rgba(57,255,20,0.1)", color: "#39FF14" }}
                    >
                      Admin
                    </Badge>
                  )}
                </div>
                <Switch
                  checked={isAdmin}
                  onCheckedChange={() => handleToggleAdmin(profile)}
                  disabled={isToggling}
                />
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              No users found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Search, Shield, UserCog, Loader2, Clock, Zap, Mail, MapPin, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface EnrichedUser {
  id: string;
  email: string;
  last_sign_in_at: string | null;
  created_at: string;
  full_name: string;
  avatar_url: string | null;
  user_type: string;
  title: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  location: string | null;
  permission: string;
  total_time_seconds: number;
  api_calls_count: number;
  last_active_at: string | null;
}

const PERMISSION_COLORS: Record<string, { bg: string; text: string }> = {
  user: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" },
  manager: { bg: "rgba(59,130,246,0.12)", text: "#3b82f6" },
  admin: { bg: "rgba(57,255,20,0.1)", text: "#39FF14" },
  god: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
};

const PERMISSION_ICONS: Record<string, typeof UserCog> = {
  user: UserCog,
  manager: Shield,
  admin: Crown,
  god: Zap,
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function AdminUserManagement() {
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPermission, setFilterPermission] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-list-users");
      if (error) throw error;
      setUsers(data.users || []);
    } catch (e: any) {
      toast.error("Failed to load users", { description: e.message });
    }
    setLoading(false);
  };

  const handlePermissionChange = async (userId: string, permission: string) => {
    setUpdatingId(userId);
    try {
      const { error } = await supabase.functions.invoke("admin-update-permission", {
        body: { target_user_id: userId, permission },
      });
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, permission } : u));
      toast.success("Permission updated", { description: `Set to ${permission.toUpperCase()}` });
    } catch (e: any) {
      toast.error("Failed to update permission", { description: e.message });
    }
    setUpdatingId(null);
  };

  const filtered = users.filter((u) => {
    const matchSearch = (u.full_name || u.email || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || u.user_type === filterType;
    const matchPerm = filterPermission === "all" || u.permission === filterPermission;
    return matchSearch && matchType && matchPerm;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-lg font-semibold text-white/90">User Management</h1>
        <p className="mt-1 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          {users.length} registered users · Manage permissions and monitor activity
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/25 focus-visible:ring-emerald-500/40"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32 h-9 border-white/10 bg-white/5 text-xs text-white/70">
            <SelectValue placeholder="User Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="founder">Founder</SelectItem>
            <SelectItem value="operator">Operator</SelectItem>
            <SelectItem value="investor">Investor</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPermission} onValueChange={setFilterPermission}>
          <SelectTrigger className="w-32 h-9 border-white/10 bg-white/5 text-xs text-white/70">
            <SelectValue placeholder="Permission" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="god">GOD</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#39FF14" }} />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {/* Table Header */}
          <div
            className="grid items-center gap-2 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest"
            style={{ background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.3)", gridTemplateColumns: "2fr 1.2fr 1fr 0.8fr 0.8fr 0.8fr 1fr" }}
          >
            <span>User</span>
            <span>Contact</span>
            <span>Last Sign In</span>
            <span>Type</span>
            <span>Time on App</span>
            <span>API Usage</span>
            <span>Permission</span>
          </div>

          {/* Rows */}
          {filtered.map((user) => {
            const permColor = PERMISSION_COLORS[user.permission] || PERMISSION_COLORS.user;
            const PermIcon = PERMISSION_ICONS[user.permission] || UserCog;
            const isUpdating = updatingId === user.id;

            return (
              <div
                key={user.id}
                className="grid items-center gap-2 px-4 py-3 border-t transition-colors hover:bg-white/[0.02]"
                style={{ borderColor: "rgba(255,255,255,0.04)", gridTemplateColumns: "2fr 1.2fr 1fr 0.8fr 0.8fr 0.8fr 1fr" }}
              >
                {/* User */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                    style={{ background: permColor.bg, color: permColor.text }}
                  >
                    {user.avatar_url ? (
                      <img src={user.avatar_url} className="h-8 w-8 rounded-lg object-cover" alt="" />
                    ) : (
                      <PermIcon className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white/85 truncate">{user.full_name || "Unnamed"}</p>
                    <p className="font-mono text-[10px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {user.title || "—"}
                    </p>
                  </div>
                </div>

                {/* Contact */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span className="text-[11px] text-white/60 truncate">{user.email}</span>
                  </div>
                  {user.location && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />
                      <span className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{user.location}</span>
                    </div>
                  )}
                </div>

                {/* Last Sign In */}
                <div>
                  {user.last_sign_in_at ? (
                    <span className="text-[11px] text-white/50">
                      {formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })}
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>Never</span>
                  )}
                </div>

                {/* User Type */}
                <Badge
                  variant="outline"
                  className="w-fit border-none text-[9px] font-semibold uppercase"
                  style={{
                    background: user.user_type === "founder" ? "rgba(139,92,246,0.1)" : user.user_type === "investor" ? "rgba(34,197,94,0.1)" : "rgba(59,130,246,0.1)",
                    color: user.user_type === "founder" ? "#a78bfa" : user.user_type === "investor" ? "#22c55e" : "#60a5fa",
                  }}
                >
                  {user.user_type}
                </Badge>

                {/* Time on App */}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" style={{ color: "rgba(255,255,255,0.2)" }} />
                  <span className="font-mono text-[11px] text-white/50">{formatTime(user.total_time_seconds)}</span>
                </div>

                {/* API Usage */}
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3" style={{ color: user.api_calls_count > 100 ? "#f59e0b" : "rgba(255,255,255,0.2)" }} />
                  <span className="font-mono text-[11px] text-white/50">{user.api_calls_count.toLocaleString()}</span>
                </div>

                {/* Permission */}
                <Select
                  value={user.permission}
                  onValueChange={(val) => handlePermissionChange(user.id, val)}
                  disabled={isUpdating}
                >
                  <SelectTrigger
                    className="h-7 w-full border-none text-[11px] font-semibold uppercase"
                    style={{ background: permColor.bg, color: permColor.text }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="god">GOD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="py-12 text-center font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              No users found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

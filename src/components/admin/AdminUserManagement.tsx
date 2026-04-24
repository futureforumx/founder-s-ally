import { useState, useEffect } from "react";
import {
  Crown,
  Search,
  Shield,
  UserCog,
  Loader2,
  Clock,
  Zap,
  Mail,
  MapPin,
  Plus,
  Trash2,
  X,
  UserPlus,
  Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";

// ─── API helper ───────────────────────────────────────────────────────────────
// Supabase gateway rejects RS256 (WorkOS) JWTs even with verify_jwt=false.
// Solution: anon key in Authorization (HS256, gateway-safe), WorkOS JWT in X-User-Auth.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function callAdminFunction(
  name: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<{ data?: unknown; error?: string }> {
  if (!SUPABASE_URL) return { error: "Supabase not configured" };

  const userToken = await getSupabaseBearerForFunctions();
  const anonKey = SUPABASE_ANON_KEY ?? "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };
  if (userToken && userToken !== anonKey) {
    headers["X-User-Auth"] = `Bearer ${userToken}`;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (json as { error?: string }).error ??
        (json as { message?: string }).message ??
        `HTTP ${res.status}`;
      return { error: msg };
    }
    return { data: json };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Permission config (WorkOS 3-role system) ─────────────────────────────────

const PERMISSION_COLORS: Record<string, { bg: string; text: string }> = {
  member: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" },
  admin: { bg: "rgba(46,230,166,0.1)", text: "#2EE6A6" },
  god:   { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
  // Legacy fallbacks
  user:    { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" },
  manager: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" },
};

const PERMISSION_ICONS: Record<string, typeof UserCog> = {
  member: UserCog,
  admin:  Crown,
  god:    Zap,
  // Legacy fallbacks
  user:    UserCog,
  manager: Shield,
};

function normalisePermission(p: string): "member" | "admin" | "god" {
  if (p === "god") return "god";
  if (p === "admin") return "admin";
  return "member";
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function InviteModal({ onClose, onSuccess }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"member" | "admin" | "god">("member");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setLoading(true);
    const { error } = await callAdminFunction("admin-manage-user", {
      method: "POST",
      body: { action: "invite", email: trimmed, permission },
    });
    setLoading(false);
    if (error) {
      toast.error("Invite failed", { description: error });
    } else {
      toast.success("Invitation sent", { description: `Invite sent to ${trimmed}` });
      onSuccess();
      onClose();
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-sm rounded-xl border p-6 shadow-2xl"
        style={{ background: "#0e1117", borderColor: "rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" style={{ color: "#2EE6A6" }} />
            <h2 className="font-mono text-sm font-semibold text-white/90">Invite User</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-white/40" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
              Email
            </label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="h-9 border-white/10 bg-white/5 text-sm text-white/80 placeholder:text-white/25 focus-visible:ring-emerald-500/40"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
              Role
            </label>
            <Select value={permission} onValueChange={(v) => setPermission(v as typeof permission)}>
              <SelectTrigger className="h-9 border-white/10 bg-white/5 text-sm text-white/70">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="god">GOD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              style={{ background: "rgba(46,230,166,0.15)", color: "#2EE6A6" }}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send Invite
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminUserManagement() {
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPermission, setFilterPermission] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await callAdminFunction("admin-list-users");
    if (error) {
      toast.error("Failed to load users", { description: error });
    } else {
      setUsers((data as { users: EnrichedUser[] }).users ?? []);
    }
    setLoading(false);
  };

  const handlePermissionChange = async (userId: string, permission: string) => {
    setUpdatingId(userId);
    const { error } = await callAdminFunction("admin-update-permission", {
      method: "POST",
      body: { target_user_id: userId, permission },
    });
    if (error) {
      toast.error("Failed to update permission", { description: error });
    } else {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, permission } : u)));
      toast.success("Permission updated", { description: `Set to ${permission.toUpperCase()}` });
    }
    setUpdatingId(null);
  };

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    setConfirmDeleteId(null);
    const { error } = await callAdminFunction("admin-manage-user", {
      method: "POST",
      body: { action: "delete", user_id: userId },
    });
    if (error) {
      toast.error("Failed to delete user", { description: error });
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("User deleted");
    }
    setDeletingId(null);
  };

  const filtered = users.filter((u) => {
    const searchHaystack = [u.full_name, u.email, u.id].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = searchHaystack.includes(search.toLowerCase());
    const matchType = filterType === "all" || u.user_type === filterType;
    const normPerm = normalisePermission(u.permission);
    const matchPerm = filterPermission === "all" || normPerm === filterPermission;
    return matchSearch && matchType && matchPerm;
  });

  // Grid: User | Contact | Last Sign In | Type | Time | API | Permission | Delete
  const GRID = "2fr 1.2fr 1fr 0.8fr 0.8fr 0.8fr 1fr 40px";

  return (
    <>
      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={fetchUsers}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-lg font-semibold text-white/90">User Management</h1>
            <p className="mt-1 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {users.length} registered users · Manage permissions and monitor activity
            </p>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold transition-colors"
            style={{ background: "rgba(46,230,166,0.12)", color: "#2EE6A6" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Invite User
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.3)" }}
            />
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
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="god">GOD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
          </div>
        ) : (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            {/* Table Header */}
            <div
              className="grid items-center gap-2 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest"
              style={{
                background: "rgba(255,255,255,0.02)",
                color: "rgba(255,255,255,0.3)",
                gridTemplateColumns: GRID,
              }}
            >
              <span>User</span>
              <span>Contact</span>
              <span>Last Sign In</span>
              <span>Type</span>
              <span>Time on App</span>
              <span>API Usage</span>
              <span>Role</span>
              <span />
            </div>

            {/* Rows */}
            {filtered.map((user) => {
              const normPerm = normalisePermission(user.permission);
              const permColor = PERMISSION_COLORS[normPerm] ?? PERMISSION_COLORS.member;
              const PermIcon = PERMISSION_ICONS[normPerm] ?? UserCog;
              const isUpdating = updatingId === user.id;
              const isDeleting = deletingId === user.id;
              const isConfirming = confirmDeleteId === user.id;

              return (
                <div
                  key={user.id}
                  className="grid items-center gap-2 px-4 py-3 border-t transition-colors hover:bg-white/[0.02]"
                  style={{
                    borderColor: "rgba(255,255,255,0.04)",
                    gridTemplateColumns: GRID,
                  }}
                >
                  {/* User */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                      style={{ background: permColor.bg, color: permColor.text }}
                    >
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          className="h-8 w-8 rounded-lg object-cover"
                          alt=""
                        />
                      ) : (
                        <PermIcon className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/85 truncate">
                        {user.full_name || "Unnamed"}
                      </p>
                      <p
                        className="font-mono text-[10px] truncate"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                      >
                        {user.title || "—"}
                      </p>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Mail
                        className="h-3 w-3 shrink-0"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      />
                      <span
                        className="text-[11px] text-white/60 truncate"
                        title={user.id}
                      >
                        {user.email || (
                          <span
                            style={{ color: "rgba(255,255,255,0.35)" }}
                            className="font-mono"
                          >
                            {user.id.length > 24
                              ? `${user.id.slice(0, 22)}…`
                              : user.id}
                          </span>
                        )}
                      </span>
                    </div>
                    {user.location && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin
                          className="h-3 w-3 shrink-0"
                          style={{ color: "rgba(255,255,255,0.2)" }}
                        />
                        <span
                          className="text-[10px] truncate"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          {user.location}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Last Sign In */}
                  <div>
                    {user.last_sign_in_at ? (
                      <span className="text-[11px] text-white/50">
                        {formatDistanceToNow(new Date(user.last_sign_in_at), {
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span
                        className="text-[11px]"
                        style={{ color: "rgba(255,255,255,0.2)" }}
                      >
                        Never
                      </span>
                    )}
                  </div>

                  {/* User Type */}
                  <Badge
                    variant="outline"
                    className="w-fit border-none text-[9px] font-semibold uppercase"
                    style={{
                      background:
                        user.user_type === "founder"
                          ? "rgba(91,92,255,0.1)"
                          : user.user_type === "investor"
                          ? "rgba(46,230,166,0.1)"
                          : "rgba(59,130,246,0.1)",
                      color:
                        user.user_type === "founder"
                          ? "#a78bfa"
                          : user.user_type === "investor"
                          ? "#2EE6A6"
                          : "#60a5fa",
                    }}
                  >
                    {user.user_type}
                  </Badge>

                  {/* Time on App */}
                  <div className="flex items-center gap-1.5">
                    <Clock
                      className="h-3 w-3"
                      style={{ color: "rgba(255,255,255,0.2)" }}
                    />
                    <span className="font-mono text-[11px] text-white/50">
                      {formatTime(user.total_time_seconds)}
                    </span>
                  </div>

                  {/* API Usage */}
                  <div className="flex items-center gap-1.5">
                    <Zap
                      className="h-3 w-3"
                      style={{
                        color:
                          user.api_calls_count > 100
                            ? "#f59e0b"
                            : "rgba(255,255,255,0.2)",
                      }}
                    />
                    <span className="font-mono text-[11px] text-white/50">
                      {user.api_calls_count.toLocaleString()}
                    </span>
                  </div>

                  {/* Role selector */}
                  <Select
                    value={normPerm}
                    onValueChange={(val) => handlePermissionChange(user.id, val)}
                    disabled={isUpdating || isDeleting}
                  >
                    <SelectTrigger
                      className="h-7 w-full border-none text-[11px] font-semibold uppercase"
                      style={{ background: permColor.bg, color: permColor.text }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="god">GOD</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Delete */}
                  <div className="flex items-center justify-center">
                    {isDeleting ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                      />
                    ) : isConfirming ? (
                      /* Confirm buttons replace the trash icon */
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(user.id)}
                          title="Confirm delete"
                          className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold transition-colors"
                          style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          title="Cancel"
                          className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10"
                          style={{ color: "rgba(255,255,255,0.4)" }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(user.id)}
                        title="Delete user"
                        className="flex h-6 w-6 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/20"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "#ef4444")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "rgba(255,255,255,0.25)")
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <p
                className="py-12 text-center font-mono text-xs"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                No users found.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

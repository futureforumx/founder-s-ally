import { useState, useEffect, type ReactNode } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEdgeFunctionInvokeError } from "@/lib/supabaseFunctionErrors";
import {
  Crown, Search, Shield, UserCog, Loader2, Clock, Zap, Mail, MapPin, ExternalLink,
  ChevronDown, ChevronRight, Ban, Globe, Activity, CalendarClock, Fingerprint,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

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
  ip_addresses?: string[];
  last_ip?: string | null;
  banned?: boolean;
}

const PERMISSION_COLORS: Record<string, { bg: string; text: string }> = {
  user: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)" },
  manager: { bg: "rgba(59,130,246,0.12)", text: "#3b82f6" },
  admin: { bg: "rgba(46,230,166,0.1)", text: "#2EE6A6" },
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(new Date(value), "MMM d, yyyy · h:mm a");
  } catch {
    return "—";
  }
}

export function AdminUserManagement() {
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPermission, setFilterPermission] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction("admin-list-users", { preferClerkSessionToken: true });
      if (error) throw error;
      setUsers(data.users || []);
    } catch (e: unknown) {
      toast.error("Failed to load users", { description: await formatEdgeFunctionInvokeError(e) });
    }
    setLoading(false);
  };

  const handlePermissionChange = async (userId: string, permission: string) => {
    setUpdatingId(userId);
    try {
      const { error } = await invokeEdgeFunction("admin-update-permission", {
        preferClerkSessionToken: true,
        body: { target_user_id: userId, permission },
      });
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, permission } : u));
      toast.success("Permission updated", { description: `Set to ${permission.toUpperCase()}` });
    } catch (e: unknown) {
      toast.error("Failed to update permission", { description: await formatEdgeFunctionInvokeError(e) });
    }
    setUpdatingId(null);
  };

  const handleBan = async (user: EnrichedUser) => {
    const confirmed = window.confirm(
      `Ban ${user.full_name || user.email || "this user"}?\n\n` +
        `This blocks their email${user.email ? ` (${user.email})` : ""} and ` +
        `${user.ip_addresses?.length ? `${user.ip_addresses.length} known IP address(es)` : "any known IP addresses"} ` +
        `from accessing the platform. This can be reversed in the database.`,
    );
    if (!confirmed) return;

    setBanningId(user.id);
    try {
      const { data, error } = await invokeEdgeFunction("admin-ban-user", {
        preferClerkSessionToken: true,
        body: {
          target_user_id: user.id,
          email: user.email || undefined,
          ip_addresses: user.ip_addresses ?? [],
        },
      });
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, banned: true } : u)));
      const ips: string[] = data?.banned_ips ?? [];
      toast.success("User banned", {
        description: `Blocked ${data?.banned_email || user.email || "account"}${
          ips.length ? ` and ${ips.length} IP address(es)` : ""
        }.`,
      });
    } catch (e: unknown) {
      toast.error("Failed to ban user", { description: await formatEdgeFunctionInvokeError(e) });
    }
    setBanningId(null);
  };

  const filtered = users.filter((u) => {
    const searchHaystack = [u.full_name, u.email, u.id].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = searchHaystack.includes(search.toLowerCase());
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
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {/* Table Header */}
          <div
            className="grid items-center gap-2 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest"
            style={{ background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.3)", gridTemplateColumns: "2fr 1.2fr 1fr 0.8fr 0.8fr 0.8fr 1fr" }}
          >
            <span>Name</span>
            <span>Email</span>
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
            const isExpanded = expandedId === user.id;

            return (
              <div key={user.id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <div
                onClick={() => setExpandedId((cur) => (cur === user.id ? null : user.id))}
                className="grid items-center gap-2 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.02]"
                style={{
                  gridTemplateColumns: "2fr 1.2fr 1fr 0.8fr 0.8fr 0.8fr 1fr",
                  background: isExpanded ? "rgba(255,255,255,0.02)" : undefined,
                }}
              >
                {/* User */}
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />
                  )}
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
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-white/85 truncate">{user.full_name || "Unnamed"}</p>
                      {user.banned && (
                        <span
                          className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                          style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
                        >
                          Banned
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[10px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {user.title || "—"}
                    </p>
                  </div>
                </div>

                {/* Contact */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span className="text-[11px] text-white/60 truncate" title={user.id}>
                      {user.email || (
                        <span style={{ color: "rgba(255,255,255,0.35)" }} className="font-mono">
                          {user.id.length > 24 ? `${user.id.slice(0, 22)}…` : user.id}
                        </span>
                      )}
                    </span>
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
                    background: user.user_type === "founder" ? "rgba(91,92,255,0.1)" : user.user_type === "investor" ? "rgba(46,230,166,0.1)" : "rgba(59,130,246,0.1)",
                    color: user.user_type === "founder" ? "#a78bfa" : user.user_type === "investor" ? "#2EE6A6" : "#60a5fa",
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
                <div onClick={(e) => e.stopPropagation()}>
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
              </div>

              {isExpanded && <UserDetailPanel user={user} banning={banningId === user.id} onBan={() => handleBan(user)} />}
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

function SectionCard({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-3.5" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3" style={{ color: "#2EE6A6" }} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
          {title}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono, href }: { label: string; value: ReactNode; mono?: boolean; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 truncate text-[11px] text-emerald-300/80 hover:text-emerald-300"
        >
          <span className="truncate">{value}</span>
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
        </a>
      ) : (
        <span className={`truncate text-right text-[11px] text-white/70 ${mono ? "font-mono" : ""}`}>{value}</span>
      )}
    </div>
  );
}

function UserDetailPanel({ user, banning, onBan }: { user: EnrichedUser; banning: boolean; onBan: () => void }) {
  const ips = user.ip_addresses ?? [];
  return (
    <div className="px-4 pb-4 pt-1" style={{ background: "rgba(255,255,255,0.02)" }} onClick={(e) => e.stopPropagation()}>
      <div className="grid gap-3 md:grid-cols-3">
        {/* Login & session */}
        <SectionCard icon={CalendarClock} title="Login & session">
          <DetailRow label="Last sign in" value={formatDateTime(user.last_sign_in_at)} />
          <DetailRow label="Time on app" value={formatTime(user.total_time_seconds)} mono />
          <DetailRow label="Account created" value={formatDateTime(user.created_at)} />
        </SectionCard>

        {/* Activity */}
        <SectionCard icon={Activity} title="Activity">
          <DetailRow label="API calls" value={user.api_calls_count.toLocaleString()} mono />
          <DetailRow
            label="Last active"
            value={user.last_active_at ? formatDistanceToNow(new Date(user.last_active_at), { addSuffix: true }) : "Never"}
          />
          <DetailRow label="Permission" value={user.permission.toUpperCase()} mono />
        </SectionCard>

        {/* Details provided */}
        <SectionCard icon={UserCog} title="Details provided">
          <DetailRow label="Type" value={user.user_type || "—"} />
          <DetailRow label="Title" value={user.title || "—"} />
          <DetailRow label="Location" value={user.location || "—"} />
          {user.linkedin_url && <DetailRow label="LinkedIn" value={user.linkedin_url} href={user.linkedin_url} />}
          {user.twitter_url && <DetailRow label="X / Twitter" value={user.twitter_url} href={user.twitter_url} />}
        </SectionCard>
      </div>

      {/* Contact + IPs */}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SectionCard icon={Mail} title="Contact">
          <DetailRow label="Email" value={user.email || "—"} mono />
          <DetailRow label="User ID" value={user.id} mono />
        </SectionCard>

        <SectionCard icon={Globe} title="Known IP addresses">
          {ips.length === 0 ? (
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              No IP addresses recorded yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ips.map((ip) => (
                <span
                  key={ip}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
                >
                  <Fingerprint className="h-2.5 w-2.5" style={{ color: "rgba(255,255,255,0.3)" }} />
                  {ip}
                </span>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Ban */}
      <div className="mt-3 flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.04)" }}>
        <div>
          <p className="text-[12px] font-medium text-white/80">Danger zone</p>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Ban this user's email address{ips.length ? ` and ${ips.length} known IP address(es)` : ""} from the platform.
          </p>
        </div>
        <Button
          onClick={onBan}
          disabled={banning || user.banned}
          className="h-8 shrink-0 gap-1.5 border-none text-[12px] font-semibold"
          style={{ background: user.banned ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.9)", color: user.banned ? "#f87171" : "#fff" }}
        >
          {banning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Ban className="h-3.5 w-3.5" />
          )}
          {user.banned ? "Banned" : "Ban user"}
        </Button>
      </div>
    </div>
  );
}

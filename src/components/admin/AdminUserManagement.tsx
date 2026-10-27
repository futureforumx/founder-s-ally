import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEdgeFunctionInvokeError } from "@/lib/supabaseFunctionErrors";
import {
  Ban, Check, ChevronDown, ChevronRight, Copy, CreditCard, Download, ExternalLink, Fingerprint, MoreHorizontal, Search, Shield, Trash2, Users,
} from "lucide-react";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { AdminStickyHeader } from "@/components/admin/AdminStickyHeader";

export interface EnrichedUser {
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
  storage_bytes: number;
  last_active_at: string | null;
  ip_addresses?: string[];
  last_ip?: string | null;
  banned?: boolean;
  subscription?: SubscriptionPlan;
}

export interface AdminUserApplicant {
  id: string;
  created_at: string;
  email: string;
  name: string | null;
  role: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  source: string | null;
  status: string;
  total_score: number;
  waitlist_position: number | null;
  reviewed_at: string | null;
  admin_notes: string | null;
}

interface DecisionNotification {
  sent: boolean;
  status: string;
  detail?: string;
}

type Stage = "accounts" | "active" | "waitlist" | "invites";

type RoleFilter = "all" | "founder" | "investor" | "operator";

type PermissionFilter = "all" | "user" | "manager" | "admin" | "god";

type SubscriptionPlan = "free" | "basic" | "premium" | "elite";

type SubscriptionFilter = "all" | SubscriptionPlan;

type Lifecycle = "active" | "invited" | "waitlisted" | "never" | "inactive";

type RoleKey = "founder" | "investor" | "operator" | "admin" | "other";

type WaitlistApplicant = AdminUserApplicant;

type DirectoryRow =
  | { kind: "account"; id: string; user: EnrichedUser }
  | { kind: "applicant"; id: string; applicant: WaitlistApplicant; stage: "waitlist" | "invites" };

const AVATAR_COLORS = ["#8B8CFF", "#2EE6A6", "#7DD3FC", "#FBBF24", "#F9A8D4", "#86EFAC"] as const;

const PERMISSIONS = [
  { value: "user", label: "User" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "god", label: "God" },
] as const;

const STAGES: { id: Stage; label: string }[] = [
  { id: "accounts", label: "All Accounts" },
  { id: "active", label: "Active" },
  { id: "waitlist", label: "Waitlist" },
  { id: "invites", label: "Pending Invites" },
];

interface WaitlistCommand {
  action: "list" | "update_status" | "delete";
  id?: string;
  status?: "approved" | "rejected" | "pending";
}

interface WaitlistUpdateResponse {
  applicant?: WaitlistApplicant;
  notification?: DecisionNotification;
}

function invokeAdminWaitlist(body: WaitlistCommand) {
  return invokeEdgeFunction("admin-waitlist", {
    preferClerkSessionToken: true,
    body,
  });
}

function emailHandle(email: string): string {
  return email.split("@")[0]?.trim() ?? "";
}

function personLabel(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim() ?? "";

  if (trimmed) return trimmed;

  return emailHandle(email) || "Unknown";
}

function isIncompleteName(name: string | null | undefined, email: string): boolean {
  const trimmed = name?.trim() ?? "";
  const handle = emailHandle(email);

  if (!trimmed) return true;

  return trimmed.toLowerCase() === handle.toLowerCase() || trimmed.toLowerCase() === email.trim().toLowerCase();
}

function initials(label: string): string {
  const parts = label.split(/[\s._+-]+/).filter((part) => part.length > 0);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  const letters = label.replace(/[^a-zA-Z0-9]/g, "");

  return (letters.slice(0, 2) || "??").toUpperCase();
}

function avatarColor(seed: string): string {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash + seed.charCodeAt(index) * (index + 1)) % AVATAR_COLORS.length;
  }

  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);

  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return format(date, "MMM d, yyyy · h:mm a");
}

function formatJoined(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  const days = (Date.now() - date.getTime()) / 86_400_000;

  if (days < 7) {
    return formatDistanceToNow(date, { addSuffix: true }).replace(/^about /, "");
  }

  return format(date, "MMM d, yyyy");
}

function accountRole(user: EnrichedUser): RoleKey {
  if (user.user_type === "investor") return "investor";

  if (user.user_type === "founder") return "founder";

  if (user.user_type === "operator") return "operator";

  return "other";
}

function applicantRole(role: string | null): RoleKey {
  const value = role?.trim().toLowerCase() ?? "";

  if (value.includes("admin")) return "admin";

  if (value.includes("invest")) return "investor";

  if (value.includes("found")) return "founder";

  if (value.includes("operat")) return "operator";

  return "other";
}

function rowRole(row: DirectoryRow): RoleKey {
  return row.kind === "account" ? accountRole(row.user) : applicantRole(row.applicant.role);
}

function roleLabel(row: DirectoryRow): string {
  const role = rowRole(row);

  if (role === "admin") return "Admin";

  if (role === "investor") return "Investor";

  if (role === "founder") return "Founder";

  if (role === "operator") return "Operator";

  if (row.kind === "account" && row.user.user_type) {
    return row.user.user_type.charAt(0).toUpperCase() + row.user.user_type.slice(1);
  }

  const raw = row.kind === "applicant" ? row.applicant.role?.trim() : "";

  return raw || "Member";
}

function rowLifecycle(row: DirectoryRow): Lifecycle {
  if (row.kind === "applicant") return row.stage === "invites" ? "invited" : "waitlisted";

  if (row.user.banned) return "inactive";

  if (row.user.last_sign_in_at || row.user.last_active_at) return "active";

  return "never";
}

function isRoleFilter(value: string): value is RoleFilter {
  return value === "all" || value === "founder" || value === "investor" || value === "operator";
}

function isPermissionFilter(value: string): value is PermissionFilter {
  return value === "all" || value === "user" || value === "manager" || value === "admin" || value === "god";
}

function isSubscriptionFilter(value: string): value is SubscriptionFilter {
  return value === "all" || value === "free" || value === "basic" || value === "premium" || value === "elite";
}

function rowPermission(row: DirectoryRow): string | null {
  if (row.kind !== "account") return null;

  return row.user.permission;
}

function rowPlan(row: DirectoryRow): SubscriptionPlan {
  if (row.kind === "applicant") return "free";

  return row.user.subscription ?? "free";
}

function rowEmail(row: DirectoryRow): string {
  return row.kind === "account" ? row.user.email : row.applicant.email;
}

function rowName(row: DirectoryRow): string {
  if (row.kind === "account") return personLabel(row.user.full_name, row.user.email);

  return personLabel(row.applicant.name, row.applicant.email);
}

type DisplayName = {
  label: string;
  incomplete: boolean;
};

function rowDisplayName(row: DirectoryRow): DisplayName {
  const email = rowEmail(row);
  const raw = row.kind === "account" ? row.user.full_name : row.applicant.name;

  if (isIncompleteName(raw, email)) {
    return { label: "Profile incomplete", incomplete: true };
  }

  return { label: raw?.trim() || "Unknown", incomplete: false };
}

function rowCreatedAt(row: DirectoryRow): string {
  return row.kind === "account" ? row.user.created_at : row.applicant.created_at;
}

function planLabel(plan: SubscriptionPlan): string {
  if (plan === "premium") return "Pro";

  if (plan === "basic") return "Basic";

  if (plan === "elite") return "Elite";

  return "Free";
}

function permissionLabel(permission: string | null): string | null {
  if (!permission || permission === "user") return null;

  if (permission === "god") return "God";

  if (permission === "admin") return "Admin";

  if (permission === "manager") return "Manager";

  return permission;
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;

  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function statusLabel(lifecycle: Lifecycle): string {
  if (lifecycle === "active") return "Active";

  if (lifecycle === "invited") return "Invite Sent";

  if (lifecycle === "waitlisted") return "Waitlisted";

  if (lifecycle === "inactive") return "Inactive";

  return "Never active";
}

function rowHeadline(row: DirectoryRow): string {
  if (row.kind === "account") return row.user.title?.trim() ?? "";

  return row.applicant.company_name?.trim() ?? "";
}

function rowSearchText(row: DirectoryRow): string {
  if (row.kind === "account") {
    return [row.user.full_name, row.user.email, row.user.id].filter(Boolean).join(" ").toLowerCase();
  }

  return [row.applicant.name, row.applicant.email, row.applicant.company_name, row.applicant.role]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function PersonAvatar({ name, email, src }: { name: string; email: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  const color = avatarColor(email || name);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-sans text-[11px] font-semibold"
      style={{ background: `${color}24`, color }}
    >
      {initials(name)}
    </span>
  );
}

function RolePill({ label }: { label: string }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 font-sans text-xs text-neutral-300">
      {label}
    </span>
  );
}

function RoleCell({ row }: { row: DirectoryRow }) {
  const permission = permissionLabel(rowPermission(row));

  return (
    <div className="flex flex-col items-start gap-1">
      <RolePill label={roleLabel(row)} />
      {permission ? (
        <span className="inline-flex rounded-full border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 font-sans text-[10px] text-neutral-400">
          {permission}
        </span>
      ) : null}
    </div>
  );
}

function SubscriptionCell({ row }: { row: DirectoryRow }) {
  return <RolePill label={planLabel(rowPlan(row))} />;
}

function StatusBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  const styles: Record<Lifecycle, { label: string; dot: string; className: string }> = {
    active: {
      label: "Active",
      dot: "bg-emerald-500",
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    },
    invited: {
      label: "Invite Sent",
      dot: "bg-amber-500",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    },
    waitlisted: {
      label: "Waitlisted",
      dot: "bg-sky-500",
      className: "border-sky-500/20 bg-sky-500/10 text-sky-300",
    },
    never: {
      label: "Never active",
      dot: "bg-neutral-600",
      className: "border-neutral-800 bg-neutral-900 text-neutral-400",
    },
    inactive: {
      label: "Inactive",
      dot: "bg-neutral-600",
      className: "border-neutral-800 bg-neutral-900 text-neutral-400",
    },
  };

  const style = styles[lifecycle];

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-sans text-xs ${style.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  if (!email) return null;

  return (
    <button
      type="button"
      aria-label={copied ? "Email copied" : `Copy ${email}`}
      onClick={async (event) => {
        event.stopPropagation();

        try {
          await navigator.clipboard.writeText(email);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          toast.error("Could not copy email");
        }
      }}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-neutral-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-neutral-200 group-hover/row:opacity-100"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="font-sans text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 truncate font-sans text-sm text-neutral-200 ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export function AdminUserManagement({
  loadDirectory,
}: {
  loadDirectory?: () => (
    | { users: EnrichedUser[]; applicants: WaitlistApplicant[] }
    | Promise<{ users: EnrichedUser[]; applicants: WaitlistApplicant[] }>
  );
} = {}) {
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [applicants, setApplicants] = useState<WaitlistApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>("accounts");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    if (loadDirectory) {
      const directory = await loadDirectory();
      setUsers(directory.users);
      setApplicants(directory.applicants);
      setLoading(false);
      return;
    }

    const [userResult, waitlistResult] = await Promise.all([
      invokeEdgeFunction("admin-list-users", { preferClerkSessionToken: true }),
      invokeAdminWaitlist({ action: "list" }),
    ]);

    if (userResult.error) {
      toast.error("Failed to load users", { description: await formatEdgeFunctionInvokeError(userResult.error) });
    } else {
      setUsers(userResult.data?.users ?? []);
    }

    if (waitlistResult.error) {
      toast.error("Failed to load waitlist", { description: await formatEdgeFunctionInvokeError(waitlistResult.error) });
    } else {
      setApplicants(waitlistResult.data?.applicants ?? []);
    }

    setLoading(false);
  }, [loadDirectory]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountEmails = useMemo(() => {
    const emails = new Set<string>();

    for (const user of users) {
      if (user.email) emails.add(user.email.toLowerCase());
    }

    return emails;
  }, [users]);

  const staged = useMemo(() => {
    const accounts: DirectoryRow[] = users.map((user) => ({ kind: "account", id: user.id, user }));
    const active = accounts.filter((row) => rowLifecycle(row) === "active");
    const waitlist: DirectoryRow[] = [];
    const invites: DirectoryRow[] = [];

    for (const applicant of applicants) {
      if (applicant.status === "pending") {
        waitlist.push({ kind: "applicant", id: applicant.id, applicant, stage: "waitlist" });
      } else if (applicant.status === "approved" && !accountEmails.has(applicant.email.toLowerCase())) {
        invites.push({ kind: "applicant", id: applicant.id, applicant, stage: "invites" });
      }
    }

    return { accounts, active, waitlist, invites };
  }, [accountEmails, applicants, users]);

  const stageRows = staged[stage];

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    return stageRows.filter((row) => {
      if (roleFilter !== "all" && rowRole(row) !== roleFilter) return false;

      if (permissionFilter !== "all" && rowPermission(row) !== permissionFilter) return false;

      if (subscriptionFilter !== "all" && rowPlan(row) !== subscriptionFilter) return false;

      if (!query) return true;

      return rowSearchText(row).includes(query);
    });
  }, [permissionFilter, roleFilter, search, stageRows, subscriptionFilter]);

  const handlePermissionChange = async (userId: string, permission: string) => {
    setUpdatingId(userId);

    try {
      if (loadDirectory) {
        setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, permission } : user)));
        toast.success("Permission updated", { description: `Set to ${permission}` });
        setUpdatingId(null);
        return;
      }
      const { error } = await invokeEdgeFunction("admin-update-permission", {
        preferClerkSessionToken: true,
        body: { target_user_id: userId, permission },
      });

      if (error) throw error;
      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, permission } : user)));
      toast.success("Permission updated", { description: `Set to ${permission}` });
    } catch (error: unknown) {
      toast.error("Failed to update permission", { description: await formatEdgeFunctionInvokeError(error) });
    }

    setUpdatingId(null);
  };

  const handleBan = async (user: EnrichedUser) => {
    const confirmed = window.confirm(
      `Revoke access for ${personLabel(user.full_name, user.email)}?\n\n` +
        `This blocks their email${user.email ? ` (${user.email})` : ""} and ` +
        `${user.ip_addresses?.length ? `${user.ip_addresses.length} known IP address(es)` : "any known IP addresses"} ` +
        `from the platform. This can be reversed in the database.`,
    );

    if (!confirmed) return;

    setBanningId(user.id);

    try {
      if (loadDirectory) {
        setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, banned: true } : item)));
        toast.success("Access revoked", {
          description: `Blocked ${user.email || "account"}${user.ip_addresses?.length ? ` and ${user.ip_addresses.length} IP address(es)` : ""}.`,
        });
        setBanningId(null);
        return;
      }
      const { data, error } = await invokeEdgeFunction("admin-ban-user", {
        preferClerkSessionToken: true,
        body: {
          target_user_id: user.id,
          email: user.email || undefined,
          ip_addresses: user.ip_addresses ?? [],
        },
      });

      if (error) throw error;
      setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, banned: true } : item)));
      const ips: string[] = data?.banned_ips ?? [];
      toast.success("Access revoked", {
        description: `Blocked ${data?.banned_email || user.email || "account"}${ips.length ? ` and ${ips.length} IP address(es)` : ""}.`,
      });
    } catch (error: unknown) {
      toast.error("Failed to revoke access", { description: await formatEdgeFunctionInvokeError(error) });
    }

    setBanningId(null);
  };

  const revokeAccess = async (user: EnrichedUser) => {
    if (loadDirectory) {
      setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, banned: true } : item)));
      return { banned_email: user.email, banned_ips: user.ip_addresses ?? [] };
    }
    const { data, error } = await invokeEdgeFunction("admin-ban-user", {
      preferClerkSessionToken: true,
      body: {
        target_user_id: user.id,
        email: user.email || undefined,
        ip_addresses: user.ip_addresses ?? [],
      },
    });

    if (error) throw error;
    setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, banned: true } : item)));

    return data;
  };

  const deleteApplicant = async (applicant: WaitlistApplicant) => {
    if (loadDirectory) {
      setApplicants((current) => current.filter((item) => item.id !== applicant.id));
      return;
    }
    const { error } = await invokeAdminWaitlist({ action: "delete", id: applicant.id });

    if (error) throw error;
    setApplicants((current) => current.filter((item) => item.id !== applicant.id));
  };

  const selectedRows = useMemo(
    () => visible.filter((row) => selectedIds.includes(row.id)),
    [selectedIds, visible],
  );

  useEffect(() => {
    const ids = new Set(visible.map((row) => row.id));

    setSelectedIds((current) => {
      const next = current.filter((id) => ids.has(id));

      if (next.length === current.length) return current;

      return next;
    });
  }, [visible]);

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selectedIds.includes(row.id));
  const someVisibleSelected = selectedIds.length > 0 && !allVisibleSelected;

  const toggleRowSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];

      return current.filter((item) => item !== id);
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    if (checked) {
      setSelectedIds(visible.map((row) => row.id));

      return;
    }

    setSelectedIds([]);
  };

  const exportSelected = () => {
    const rows = selectedRows.length > 0 ? selectedRows : visible;
    const header = ["Name", "Email", "Role", "Plan", "Permission", "Status", "Joined"];

    const body = rows.map((row) => {
      const display = rowDisplayName(row);

      return [
        display.incomplete ? "" : display.label,
        rowEmail(row),
        roleLabel(row),
        planLabel(rowPlan(row)),
        rowPermission(row) ?? "",
        statusLabel(rowLifecycle(row)),
        formatJoined(rowCreatedAt(row)),
      ].map(csvCell).join(",");
    });

    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vekta-users.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"}`);
  };

  const resendSelected = async () => {
    const invites = selectedRows.filter((row) => row.kind === "applicant" && row.stage === "invites");

    if (invites.length === 0) {
      toast.message("No pending invites in this selection");

      return;
    }

    setBatchBusy(true);
    let sent = 0;

    for (const row of invites) {
      if (row.kind !== "applicant") continue;

      try {
        await updateApplicantStatus(row.applicant, "pending");
        const notification = await updateApplicantStatus(row.applicant, "approved");

        if (notification?.sent) sent += 1;
      } catch {
        toast.error(`Failed to resend ${row.applicant.email}`);
      }
    }

    setBatchBusy(false);
    toast.success(sent > 0 ? `Resent ${sent} ${sent === 1 ? "invite" : "invites"}` : "Invite status refreshed");
  };

  const deleteSelected = async () => {
    if (selectedRows.length === 0) return;

    const accounts = selectedRows.filter((row) => row.kind === "account").length;
    const applicants = selectedRows.length - accounts;

    const confirmed = window.confirm(
      `Remove ${selectedRows.length} selected ${selectedRows.length === 1 ? "record" : "records"}?\n\n` +
        (accounts ? `${accounts} account${accounts === 1 ? "" : "s"} will have access revoked.\n` : "") +
        (applicants ? `${applicants} waitlist ${applicants === 1 ? "row" : "rows"} will be deleted.` : ""),
    );

    if (!confirmed) return;

    setBatchBusy(true);
    let removed = 0;

    for (const row of selectedRows) {
      try {
        if (row.kind === "account") {
          if (!row.user.banned) await revokeAccess(row.user);
        } else {
          await deleteApplicant(row.applicant);
        }

        removed += 1;
      } catch {
        toast.error(`Could not remove ${rowEmail(row)}`);
      }
    }

    setBatchBusy(false);
    setSelectedIds([]);
    toast.success(`Updated ${removed} ${removed === 1 ? "record" : "records"}`);
  };

  const updateApplicantStatus = async (applicant: WaitlistApplicant, status: "approved" | "rejected" | "pending") => {
    if (loadDirectory) {
      const updated: WaitlistApplicant = {
        ...applicant,
        status,
        reviewed_at: status === "pending" ? null : new Date().toISOString(),
      };
      setApplicants((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      return { sent: true, status: "sent" };
    }
    const { data, error } = await invokeAdminWaitlist({
      action: "update_status",
      id: applicant.id,
      status,
    });

    if (error) throw error;
    // SAFETY: admin-waitlist update_status returns { applicant, notification } in this shape.
    const payload = data as WaitlistUpdateResponse | null;
    const updated = payload?.applicant;

    if (!updated?.id) throw new Error("The waitlist update returned no applicant");
    setApplicants((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));

    return payload?.notification;
  };

  const decideApplicant = async (applicant: WaitlistApplicant, status: "approved" | "rejected") => {
    setUpdatingId(applicant.id);

    try {
      const notification = await updateApplicantStatus(applicant, status);

      if (notification?.sent) {
        toast.success(status === "approved" ? "Approved and invite sent" : "Application rejected");
      } else if (notification?.status === "unchanged") {
        toast.success(status === "approved" ? "Already approved" : "Already rejected");
      } else {
        toast.warning(status === "approved" ? "Approved, invite email needs a check" : "Rejected, email needs a check", {
          description: notification?.detail || "The status was saved. Check the decision email.",
        });
      }
    } catch (error: unknown) {
      toast.error("Failed to update applicant", { description: await formatEdgeFunctionInvokeError(error) });
    }

    setUpdatingId(null);
  };

  const resendInvite = async (applicant: WaitlistApplicant) => {
    setUpdatingId(applicant.id);

    try {
      await updateApplicantStatus(applicant, "pending");
      const notification = await updateApplicantStatus(applicant, "approved");

      if (notification?.sent) toast.success("Invite sent again");
      else {
        toast.warning("Invite status refreshed", {
          description: notification?.detail || "The approval email did not confirm a send.",
        });
      }
    } catch (error: unknown) {
      toast.error("Failed to resend invite", { description: await formatEdgeFunctionInvokeError(error) });
    }

    setUpdatingId(null);
  };

  const counts = {
    accounts: staged.accounts.length,
    active: staged.active.length,
    waitlist: staged.waitlist.length,
    invites: staged.invites.length,
  };

  return (
    <div className="space-y-4">
      <AdminStickyHeader className="flex flex-col gap-4">
        <h1 className="font-sans text-lg font-semibold text-neutral-100">User Management</h1>

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="User stage">
          {STAGES.map((item) => {
            const selected = stage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setStage(item.id);
                  setExpandedId(null);
                  setSelectedIds([]);
                }}
                className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 font-sans text-sm transition-colors ${
                  selected
                    ? "border-neutral-700 bg-neutral-900 text-neutral-100"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {item.label}
                <span className="font-mono text-xs tabular-nums text-neutral-400">{counts[item.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[240px] max-w-full shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            <Input
              aria-label="Search by name or email"
              placeholder="Search by name or email..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 rounded-md border-neutral-800 bg-neutral-950 pl-9 font-sans text-sm text-neutral-200 placeholder:text-neutral-600"
            />
          </div>
          <FilterSelect
            label="Role"
            icon={Users}
            value={roleFilter}
            options={[
              { value: "all", label: "All" },
              { value: "founder", label: "Founder" },
              { value: "investor", label: "Investor" },
              { value: "operator", label: "Operator" },
            ]}
            onValueChange={(value) => { if (isRoleFilter(value)) setRoleFilter(value); }}
          />
          <FilterSelect
            label="Permission"
            icon={Shield}
            value={permissionFilter}
            options={[
              { value: "all", label: "All" },
              { value: "user", label: "User" },
              { value: "manager", label: "Manager" },
              { value: "admin", label: "Admin" },
              { value: "god", label: "God Mode" },
            ]}
            onValueChange={(value) => { if (isPermissionFilter(value)) setPermissionFilter(value); }}
          />
          <FilterSelect
            label="Subscription"
            icon={CreditCard}
            value={subscriptionFilter}
            options={[
              { value: "all", label: "All" },
              { value: "free", label: "Free" },
              { value: "basic", label: "Basic" },
              { value: "premium", label: "Premium" },
              { value: "elite", label: "Elite" },
            ]}
            onValueChange={(value) => { if (isSubscriptionFilter(value)) setSubscriptionFilter(value); }}
          />
        </div>
      </AdminStickyHeader>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <BouncingDots />
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-lg border border-neutral-800/80 bg-neutral-950 ${selectedIds.length > 0 ? "mb-2" : ""}`}>
          <table className="w-full min-w-[920px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-10" />
              <col className="w-8" />
              <col />
              <col />
              <col className="w-[6.75rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[9rem]" />
              <col className="w-[7.25rem]" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="border-b border-neutral-800/80">
                <th className="px-2 py-2">
                  <Checkbox
                    aria-label="Select all visible users"
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={(value) => toggleAllVisible(value === true)}
                    className="border-neutral-700 bg-neutral-950 data-[state=checked]:bg-primary data-[state=checked]:text-white data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-white"
                  />
                </th>
                <th className="px-1 py-2" />
                <th className="px-3 py-2 font-sans text-xs font-medium text-neutral-500">Name</th>
                <th className="px-3 py-2 font-sans text-xs font-medium text-neutral-500">Email</th>
                <th className="px-3 py-2 font-sans text-xs font-medium text-neutral-500">Role</th>
                <th className="px-3 py-2 font-sans text-xs font-medium text-neutral-500">Subscription</th>
                <th className="px-3 py-2 font-sans text-xs font-medium text-neutral-500">Status</th>
                <th className="px-3 py-2 font-sans text-xs font-medium text-neutral-500">Joined</th>
                <th className="px-2 py-2 text-right font-sans text-xs font-medium text-neutral-500">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-14 text-center font-sans text-sm text-neutral-500">
                    {stageRows.length === 0 ? "Nothing in this stage." : "No one matches these filters."}
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <DirectoryTableRow
                    key={row.id}
                    row={row}
                    selected={selectedIds.includes(row.id)}
                    expanded={expandedId === row.id}
                    busy={updatingId === row.id || banningId === (row.kind === "account" ? row.user.id : "")}
                    onSelect={(checked) => toggleRowSelected(row.id, checked)}
                    onToggle={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                    onApprove={() => {
                      if (row.kind === "applicant") void decideApplicant(row.applicant, "approved");
                    }}
                    onReject={() => {
                      if (row.kind === "applicant") void decideApplicant(row.applicant, "rejected");
                    }}
                    onResend={() => {
                      if (row.kind === "applicant") void resendInvite(row.applicant);
                    }}
                    onPermission={(permission) => {
                      if (row.kind === "account") void handlePermissionChange(row.user.id, permission);
                    }}
                    onBan={() => {
                      if (row.kind === "account") void handleBan(row.user);
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedIds.length > 0 ? (
        <div className="sticky bottom-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="font-sans text-sm text-neutral-300">
            <span className="font-mono tabular-nums text-neutral-100">{selectedIds.length}</span>
            {selectedIds.length === 1 ? " user selected" : " users selected"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={batchBusy}
              onClick={() => void resendSelected()}
              className="h-8 border-neutral-800 bg-transparent font-sans text-xs text-neutral-200 hover:bg-white/5"
            >
              Resend Invites
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={batchBusy}
              onClick={exportSelected}
              className="h-8 border-neutral-800 bg-transparent font-sans text-xs text-neutral-200 hover:bg-white/5"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={batchBusy}
              onClick={() => void deleteSelected()}
              className="h-8 border-red-500/30 bg-transparent font-sans text-xs text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete Selected
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DirectoryTableRow({
  row,
  selected,
  expanded,
  busy,
  onSelect,
  onToggle,
  onApprove,
  onReject,
  onResend,
  onPermission,
  onBan,
}: {
  row: DirectoryRow;
  selected: boolean;
  expanded: boolean;
  busy: boolean;
  onSelect: (checked: boolean) => void;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResend: () => void;
  onPermission: (permission: string) => void;
  onBan: () => void;
}) {
  const display = rowDisplayName(row);
  const email = rowEmail(row);
  const headline = rowHeadline(row);
  const lifecycle = rowLifecycle(row);
  const avatar = row.kind === "account" ? row.user.avatar_url : null;
  const avatarName = display.incomplete ? email : display.label;

  return (
    <>
      <tr className="group/row border-b border-neutral-800/60 hover:bg-white/[0.02]">
        <td className="px-2 py-2.5">
          <Checkbox
            aria-label={`Select ${display.label}`}
            checked={selected}
            onCheckedChange={(value) => onSelect(value === true)}
            className="border-neutral-700 bg-neutral-950 data-[state=checked]:bg-primary data-[state=checked]:text-white"
          />
        </td>
        <td className="px-1 py-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? `Hide details for ${display.label}` : `Show details for ${display.label}`}
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <PersonAvatar name={avatarName} email={email} src={avatar} />
            <div className="min-w-0">
              <p className={`truncate font-sans text-sm ${display.incomplete ? "italic text-neutral-500" : "font-medium text-neutral-200"}`}>
                {display.label}
              </p>
              {headline && !display.incomplete ? (
                <p className="truncate font-sans text-xs text-neutral-500">{headline}</p>
              ) : null}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-sans text-sm text-neutral-300">{email || "—"}</span>
            <CopyEmailButton email={email} />
          </div>
        </td>
        <td className="px-3 py-2.5">
          <RoleCell row={row} />
        </td>
        <td className="px-3 py-2.5">
          <SubscriptionCell row={row} />
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge lifecycle={lifecycle} />
        </td>
        <td className="px-3 py-2.5">
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-neutral-400">{formatJoined(rowCreatedAt(row))}</span>
        </td>
        <td className="px-2 py-2.5">
          <div className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
            <RowMenu
              row={row}
              busy={busy}
              onView={onToggle}
              onApprove={onApprove}
              onResend={onResend}
              onReject={onReject}
              onPermission={onPermission}
              onBan={onBan}
            />
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-neutral-800/60">
          <td colSpan={9} className="bg-neutral-950 px-4 py-4">
            {row.kind === "account" ? <AccountDetail user={row.user} /> : <ApplicantDetail applicant={row.applicant} />}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RowMenu({
  row,
  busy,
  onView,
  onApprove,
  onResend,
  onReject,
  onPermission,
  onBan,
}: {
  row: DirectoryRow;
  busy: boolean;
  onView: () => void;
  onApprove: () => void;
  onResend: () => void;
  onReject: () => void;
  onPermission: (permission: string) => void;
  onBan: () => void;
}) {
  const name = rowName(row);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          className="h-8 w-8 text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open actions for {name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onView}>View full profile</DropdownMenuItem>
        {row.kind === "applicant" && row.stage === "waitlist" ? (
          <DropdownMenuItem onSelect={onApprove}>Approve</DropdownMenuItem>
        ) : null}
        {row.kind === "applicant" ? (
          <DropdownMenuItem onSelect={onResend}>Resend invite</DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => {
              toast.message("Invites are sent from Pending invites", {
                description: "This person already has an account, so there is no magic link to resend.",
              });
            }}
          >
            Resend magic link
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            toast.message("Impersonation isn't available", {
              description: "This console can change permissions and revoke access. It does not open a user session.",
            });
          }}
        >
          Impersonate user
        </DropdownMenuItem>
        {row.kind === "account" ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Edit role</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {PERMISSIONS.map((permission) => (
                <DropdownMenuItem
                  key={permission.value}
                  onSelect={() => onPermission(permission.value)}
                >
                  {permission.label}
                  {row.user.permission === permission.value ? " · current" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSeparator />
        {row.kind === "account" ? (
          <DropdownMenuItem
            disabled={busy || row.user.banned}
            onSelect={onBan}
            className="text-red-300 focus:text-red-200"
          >
            <Ban className="mr-2 h-3.5 w-3.5" />
            {row.user.banned ? "Access already revoked" : "Revoke access"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onReject} className="text-red-300 focus:text-red-200">
            Reject application
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountDetail({ user }: { user: EnrichedUser }) {
  const ips = user.ip_addresses ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        label="Last active"
        value={user.last_active_at ? formatDistanceToNow(new Date(user.last_active_at), { addSuffix: true }) : "Never"}
      />
      <Metric label="Session time" value={formatTime(user.total_time_seconds)} mono />
      <Metric label="API requests" value={user.api_calls_count.toLocaleString()} mono />
      <Metric label="Storage used" value={formatStorage(user.storage_bytes)} mono />
      <Metric label="Registered" value={formatDateTime(user.created_at)} />
      <Metric label="Last sign in" value={formatDateTime(user.last_sign_in_at)} />
      <Metric label="Permission" value={user.permission} mono />
      <Metric label="User ID" value={user.id} mono />
      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
        <p className="font-sans text-xs text-neutral-500">Known IPs</p>
        {ips.length === 0 ? (
          <p className="mt-1 font-sans text-sm text-neutral-500">None recorded</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ips.map((ip) => (
              <span key={ip} className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
                <Fingerprint className="h-3 w-3 text-neutral-500" />
                {ip}
              </span>
            ))}
          </div>
        )}
      </div>
      {user.location ? <Metric label="Location" value={user.location} /> : null}
      {user.linkedin_url ? <ExternalMetric label="LinkedIn" href={user.linkedin_url} /> : null}
      {user.twitter_url ? <ExternalMetric label="X" href={user.twitter_url} /> : null}
    </div>
  );
}

function ApplicantDetail({ applicant }: { applicant: WaitlistApplicant }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Applied" value={formatDateTime(applicant.created_at)} />
      <Metric label="Reviewed" value={formatDateTime(applicant.reviewed_at)} />
      <Metric label="Score" value={String(applicant.total_score ?? 0)} mono />
      <Metric
        label="Position"
        value={applicant.waitlist_position == null ? "—" : String(applicant.waitlist_position)}
        mono
      />
      <Metric label="Source" value={applicant.source?.replaceAll("_", " ") || "Direct"} />
      {applicant.admin_notes ? <Metric label="Notes" value={applicant.admin_notes} /> : null}
      {applicant.linkedin_url ? <ExternalMetric label="LinkedIn" href={applicant.linkedin_url} /> : null}
    </div>
  );
}

function ExternalMetric({ label, href }: { label: string; href: string }) {
  return (
    <div className="min-w-0">
      <p className="font-sans text-xs text-neutral-500">{label}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-sans text-sm text-emerald-300 hover:text-emerald-200"
      >
        <span className="truncate">{href}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

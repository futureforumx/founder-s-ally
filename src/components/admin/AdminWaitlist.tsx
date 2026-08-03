import { useEffect, useMemo, useState } from "react";
import { Check, Clock, ExternalLink, Loader2, RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEdgeFunctionInvokeError } from "@/lib/supabaseFunctionErrors";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ReviewStatus = "pending" | "approved" | "rejected";

interface WaitlistApplicant {
  id: string;
  created_at: string;
  updated_at: string;
  email: string;
  name: string | null;
  role: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  source: string | null;
  status: string;
  priority_access: boolean;
  referral_count: number;
  total_score: number;
  waitlist_position: number | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewed_by_email: string | null;
}

interface WaitlistListResponse {
  applicants?: WaitlistApplicant[];
}

interface DecisionNotification {
  sent: boolean;
  status: "sent" | "not_configured" | "failed" | "unchanged" | "not_applicable";
  detail?: string;
}

interface WaitlistUpdateResponse {
  applicant?: WaitlistApplicant;
  notification?: DecisionNotification;
}

type AdminWaitlistInvokeOptions = NonNullable<Parameters<typeof invokeEdgeFunction>[1]> & {
  body: Record<string, unknown>;
};

function invokeAdminWaitlist(body: Record<string, unknown>) {
  return invokeEdgeFunction("admin-waitlist", {
    preferClerkSessionToken: true,
    body,
  } as AdminWaitlistInvokeOptions);
}

const STATUS_STYLES: Record<string, { color: string; background: string; borderColor: string }> = {
  pending: { color: "#f59e0b", background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.25)" },
  approved: { color: "#2EE6A6", background: "rgba(46,230,166,0.10)", borderColor: "rgba(46,230,166,0.25)" },
  rejected: { color: "#f87171", background: "rgba(248,113,113,0.10)", borderColor: "rgba(248,113,113,0.25)" },
};

function statusStyle(status: string) {
  return STATUS_STYLES[status] ?? {
    color: "rgba(255,255,255,0.55)",
    background: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.10)",
  };
}

export function AdminWaitlist() {
  const [applicants, setApplicants] = useState<WaitlistApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchApplicants = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeAdminWaitlist({ action: "list" });
      if (error) throw error;
      const payload = data as WaitlistListResponse | null;
      setApplicants(payload?.applicants ?? []);
    } catch (error) {
      toast.error("Failed to load waitlist", {
        description: await formatEdgeFunctionInvokeError(error),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchApplicants();
  }, []);

  const counts = useMemo(() => applicants.reduce(
    (acc, applicant) => {
      acc.all += 1;
      if (applicant.status === "pending") acc.pending += 1;
      if (applicant.status === "approved") acc.approved += 1;
      if (applicant.status === "rejected") acc.rejected += 1;
      return acc;
    },
    { all: 0, pending: 0, approved: 0, rejected: 0 },
  ), [applicants]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applicants.filter((applicant) => {
      if (statusFilter !== "all" && applicant.status !== statusFilter) return false;
      if (!query) return true;
      return [applicant.name, applicant.email, applicant.company_name, applicant.role]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [applicants, search, statusFilter]);

  const updateStatus = async (applicant: WaitlistApplicant, status: ReviewStatus) => {
    setUpdatingId(applicant.id);
    try {
      const { data, error } = await invokeAdminWaitlist({
        action: "update_status",
        id: applicant.id,
        status,
      });
      if (error) throw error;
      const payload = data as WaitlistUpdateResponse | null;
      const updated = payload?.applicant;
      if (!updated) throw new Error("The waitlist update returned no applicant");
      setApplicants((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (status === "pending") {
        toast.success("Applicant returned to pending");
      } else if (payload?.notification?.sent) {
        toast.success(status === "approved" ? "Applicant approved and emailed" : "Applicant rejected and emailed");
      } else {
        toast.warning(status === "approved" ? "Applicant approved, but email was not sent" : "Applicant rejected, but email was not sent", {
          description: payload?.notification?.detail || "Check the decision-email configuration and audit log.",
        });
      }
    } catch (error) {
      toast.error("Failed to update applicant", {
        description: await formatEdgeFunctionInvokeError(error),
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 pr-24">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-400">Access queue</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Waitlist approvals</h1>
          <p className="mt-1 text-sm text-white/40">Review requests submitted from vekta.so/register.</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchApplicants()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/60 transition hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["All requests", counts.all, "#e5e7eb"],
          ["Pending", counts.pending, "#f59e0b"],
          ["Approved", counts.approved, "#2EE6A6"],
          ["Rejected", counts.rejected, "#f87171"],
        ] as const).map(([label, value, color]) => (
          <div key={label} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/30">{label}</p>
            <p className="mt-1 text-2xl font-semibold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, company, or role"
            className="border-white/10 bg-white/[0.03] pl-9 text-white placeholder:text-white/25"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full border-white/10 bg-white/[0.03] text-white/70 sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-white/40">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading waitlist…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-white/35">No matching applicants.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filtered.map((applicant) => {
              const isUpdating = updatingId === applicant.id;
              const badgeStyle = statusStyle(applicant.status);
              return (
                <div key={applicant.id} className="grid gap-4 bg-[#080808] p-4 transition hover:bg-white/[0.025] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white/85">{applicant.name || "Unnamed applicant"}</p>
                      <span className="rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider" style={badgeStyle}>
                        {applicant.status}
                      </span>
                    </div>
                    <a href={`mailto:${applicant.email}`} className="mt-1 block truncate text-xs text-white/45 hover:text-emerald-400">
                      {applicant.email}
                    </a>
                    <p className="mt-1 truncate text-xs text-white/30">
                      {[applicant.company_name, applicant.role, applicant.source].filter(Boolean).join(" · ") || "Submitted from registration"}
                    </p>
                  </div>

                  <div className="space-y-1 font-mono text-[10px] text-white/30">
                    <p className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Applied {new Date(applicant.created_at).toLocaleString()}</p>
                    {applicant.reviewed_at && (
                      <p>Reviewed {new Date(applicant.reviewed_at).toLocaleString()} by {applicant.reviewed_by_email || applicant.reviewed_by}</p>
                    )}
                    {applicant.linkedin_url && (
                      <a href={applicant.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/45 hover:text-emerald-400">
                        LinkedIn <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {applicant.status !== "approved" && (
                      <button
                        type="button"
                        onClick={() => void updateStatus(applicant, "approved")}
                        disabled={isUpdating}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-emerald-400/25 bg-emerald-400/10 px-3 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-400/15 disabled:opacity-50"
                      >
                        {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                      </button>
                    )}
                    {applicant.status !== "rejected" && (
                      <button
                        type="button"
                        onClick={() => void updateStatus(applicant, "rejected")}
                        disabled={isUpdating}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-red-400/20 bg-red-400/[0.07] px-3 text-[11px] font-semibold text-red-400 transition hover:bg-red-400/10 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    )}
                    {applicant.status !== "pending" && (
                      <button
                        type="button"
                        onClick={() => void updateStatus(applicant, "pending")}
                        disabled={isUpdating}
                        className="inline-flex h-8 items-center rounded border border-white/10 px-3 text-[11px] font-medium text-white/45 transition hover:text-white/70 disabled:opacity-50"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

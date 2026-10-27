import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, RefreshCw, TicketCheck, Trash2 } from "lucide-react";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEdgeFunctionInvokeError } from "@/lib/supabaseFunctionErrors";
import { Input } from "@/components/ui/input";
import { AdminStickyHeader } from "@/components/admin/AdminStickyHeader";

type ReferralCode = {
  id: string;
  code: string;
  label: string | null;
  is_active: boolean;
  type: "organization" | "member";
  waitlist_user_id: string | null;
  created_by: string | null;
  created_at: string;
  times_used: number;
};

type AdminWaitlistInvokeOptions = NonNullable<Parameters<typeof invokeEdgeFunction>[1]> & {
  body: Record<string, unknown>;
};

function invokeAdminWaitlist(body: Record<string, unknown>) {
  return invokeEdgeFunction("admin-waitlist", {
    preferClerkSessionToken: true,
    body,
  } as AdminWaitlistInvokeOptions);
}

const tableGrid =
  "grid w-full grid-cols-[minmax(0,1.5fr)_minmax(0,1.15fr)_5rem_6.5rem_4.5rem_6.25rem_4.75rem_3.25rem] items-center gap-x-3 px-4";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function AdminReferralCodes() {
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");

  const loadCodes = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeAdminWaitlist({ action: "list_referral_codes" });
      if (error) throw error;
      setCodes(((data as { referralCodes?: ReferralCode[] } | null)?.referralCodes ?? []));
    } catch (error) {
      toast.error("Could not load referral codes", { description: await formatEdgeFunctionInvokeError(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCodes();
  }, []);

  const addCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await invokeAdminWaitlist({
        action: "create_referral_code",
        code: code.trim().toUpperCase(),
        label: label.trim() || null,
      });
      if (error) throw error;
      const created = (data as { referralCode?: ReferralCode } | null)?.referralCode;
      if (!created) throw new Error("Referral code was not returned");
      setCodes((current) => [created, ...current]);
      setCode("");
      setLabel("");
      toast.success("Referral code added");
    } catch (error) {
      toast.error("Could not add referral code", { description: await formatEdgeFunctionInvokeError(error) });
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (item: ReferralCode) => {
    setUpdatingId(item.id);
    try {
      const { data, error } = await invokeAdminWaitlist({
        action: "set_referral_code_active",
        id: item.id,
        is_active: !item.is_active,
      });
      if (error) throw error;
      const updated = (data as { referralCode?: ReferralCode } | null)?.referralCode;
      if (!updated) throw new Error("Referral code was not returned");
      setCodes((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...updated } : candidate));
      toast.success(updated.is_active ? "Referral code activated" : "Referral code deactivated");
    } catch (error) {
      toast.error("Could not update referral code", { description: await formatEdgeFunctionInvokeError(error) });
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteCode = async (item: ReferralCode) => {
    if (!window.confirm(`Delete referral code ${item.code}?`)) return;
    setUpdatingId(item.id);
    try {
      const { error } = await invokeAdminWaitlist({ action: "delete_referral_code", id: item.id });
      if (error) throw error;
      setCodes((current) => current.filter((candidate) => candidate.id !== item.id));
      toast.success("Referral code deleted");
    } catch (error) {
      toast.error("Could not delete referral code", { description: await formatEdgeFunctionInvokeError(error) });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminStickyHeader
        trailing={(
          <button
            type="button"
            onClick={() => void loadCodes()}
            disabled={loading}
            className="inline-flex h-8 shrink-0 items-center gap-2 border border-white/10 px-3 text-xs text-white/60 transition hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        )}
      >
        <div>
          <div className="flex items-center gap-2 text-emerald-300">
            <TicketCheck className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">Waitlist</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Referral Codes</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">
            Add organization codes for partners and campaigns. Member codes are created automatically when someone signs up.
          </p>
        </div>
      </AdminStickyHeader>

      <form onSubmit={addCode} className="grid gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1.5 text-left">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">Referral code</span>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
            placeholder="e.g. VEKTA2026"
            minLength={3}
            maxLength={64}
            required
            className="border-white/10 bg-black/40 font-mono uppercase text-white placeholder:text-white/20"
          />
        </label>
        <label className="space-y-1.5 text-left">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">Label (optional)</span>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Campaign or partner name"
            maxLength={120}
            className="border-white/10 bg-black/40 text-white placeholder:text-white/20"
          />
        </label>
        <button
          type="submit"
          disabled={saving || code.trim().length < 3}
          className="mt-auto inline-flex h-10 items-center justify-center gap-2 bg-emerald-300 px-4 text-xs font-semibold uppercase tracking-wider text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add code
        </button>
      </form>

      <div className="w-full overflow-hidden rounded-lg border border-white/[0.08]">
        <div className={`${tableGrid} py-3 text-xs font-medium text-white/55`}>
          <span>Code</span>
          <span>Label</span>
          <span className="whitespace-nowrap">Times used</span>
          <span>Type</span>
          <span>Status</span>
          <span>Added</span>
          <span>Actions</span>
          <span className="text-center">Delete</span>
        </div>
        {loading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-white/40"><BouncingDots />Loading codes…</div>
        ) : codes.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-white/35">No referral codes yet.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {codes.map((item) => {
              const updating = updatingId === item.id;
              return (
                <div key={item.id} className={`${tableGrid} bg-[#080808] py-2.5`}>
                  <div className="min-w-0">
                    <span className="block truncate font-mono text-sm tracking-wide text-white">{item.code}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm text-white/55">{item.label || "—"}</span>
                  </div>
                  <div>
                    <span className="text-sm tabular-nums text-white/70">{item.times_used}</span>
                  </div>
                  <div>
                    <span className="whitespace-nowrap text-xs text-white/45">{item.type === "member" ? "Member" : "Organization"}</span>
                  </div>
                  <div>
                    <span className={`whitespace-nowrap text-xs ${item.is_active ? "text-emerald-300" : "text-white/35"}`}>{item.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div>
                    <span className="whitespace-nowrap text-xs text-white/40">{formatDate(item.created_at)}</span>
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => void setActive(item)}
                      className="border border-white/10 px-2.5 py-1.5 text-xs text-white/65 transition hover:border-white/25 hover:text-white disabled:opacity-40"
                    >
                      {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : item.is_active ? "Disable" : "Enable"}
                    </button>
                  </div>
                  <div className="flex justify-center">
                    {item.type === "organization" ? (
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => void deleteCode(item)}
                        aria-label={`Delete ${item.code}`}
                        className="rounded p-1.5 text-white/35 transition hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40"
                      ><Trash2 className="h-4 w-4" /></button>
                    ) : (
                      <span className="text-sm text-white/30">—</span>
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

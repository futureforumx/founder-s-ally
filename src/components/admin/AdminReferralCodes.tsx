import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, RefreshCw, TicketCheck, Trash2 } from "lucide-react";
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
  source: "admin" | "member";
  waitlist_user_id: string | null;
  created_by: string | null;
  created_at: string;
  times_used: number;
};

const tableFieldLabelClassName = "mb-1 text-xs font-medium text-white/55 2xl:hidden";

type AdminWaitlistInvokeOptions = NonNullable<Parameters<typeof invokeEdgeFunction>[1]> & {
  body: Record<string, unknown>;
};

function invokeAdminWaitlist(body: Record<string, unknown>) {
  return invokeEdgeFunction("admin-waitlist", {
    preferClerkSessionToken: true,
    body,
  } as AdminWaitlistInvokeOptions);
}

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
      <AdminStickyHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-300">
              <TicketCheck className="h-4 w-4" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em]">Waitlist</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Referral Codes</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/45">
              Add and manage codes accepted on the signup form. Member referral links are listed here automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCodes()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 border border-white/10 px-3 text-xs text-white/60 transition hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
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

      <div className="overflow-hidden rounded-lg border border-white/[0.08]">
        <div className="hidden px-4 py-3 text-xs font-medium text-white/55 2xl:grid 2xl:grid-cols-[minmax(150px,1.2fr)_minmax(130px,1.1fr)_80px_90px_90px_125px_100px_56px] 2xl:items-center 2xl:gap-4">
          <span>Code</span><span>Label</span><span>Times used</span><span>Source</span><span>Status</span><span>Added</span><span className="text-right">Actions</span><span className="text-center">Delete</span>
        </div>
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-white/40"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading codes…</div>
        ) : codes.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-white/35">No referral codes yet.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {codes.map((item) => {
              const updating = updatingId === item.id;
              return (
                <div key={item.id} className="grid gap-3 bg-[#080808] px-4 py-4 2xl:grid-cols-[minmax(150px,1.2fr)_minmax(130px,1.1fr)_80px_90px_90px_125px_100px_56px] 2xl:items-center 2xl:gap-4 2xl:py-3">
                  <div className="min-w-0">
                    <p className={tableFieldLabelClassName}>Code</p>
                    <span className="block truncate font-mono text-sm tracking-wide text-white">{item.code}</span>
                  </div>
                  <div className="min-w-0">
                    <p className={tableFieldLabelClassName}>Label</p>
                    <span className="block truncate text-sm text-white/55">{item.label || "—"}</span>
                  </div>
                  <div>
                    <p className={tableFieldLabelClassName}>Times used</p>
                    <span className="text-sm tabular-nums text-white/70">{item.times_used}</span>
                  </div>
                  <div>
                    <p className={tableFieldLabelClassName}>Source</p>
                    <span className="text-xs capitalize text-white/45">{item.source === "member" ? "Member" : "Admin"}</span>
                  </div>
                  <div>
                    <p className={tableFieldLabelClassName}>Status</p>
                    <span className={`text-xs ${item.is_active ? "text-emerald-300" : "text-white/35"}`}>{item.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div>
                    <p className={tableFieldLabelClassName}>Added</p>
                    <span className="text-xs text-white/40">{formatDate(item.created_at)}</span>
                  </div>
                  <div>
                    <p className={tableFieldLabelClassName}>Actions</p>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => void setActive(item)}
                      className="border border-white/10 px-2.5 py-1.5 text-xs text-white/65 transition hover:border-white/25 hover:text-white disabled:opacity-40"
                    >
                      {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : item.is_active ? "Disable" : "Enable"}
                    </button>
                  </div>
                  <div className="min-w-0 2xl:flex 2xl:justify-center">
                    <p className={tableFieldLabelClassName}>Delete</p>
                    {item.source === "admin" ? (
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

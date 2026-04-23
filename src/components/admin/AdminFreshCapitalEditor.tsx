import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { DatabaseZap, Loader2, RefreshCw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEdgeFunctionInvokeError } from "@/lib/supabaseFunctionErrors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FundWatchAdminRow = {
  id: string;
  firmRecordId: string;
  firmName: string;
  name: string;
  vintageYear: number | null;
  announcedDate: string | null;
  closeDate: string | null;
  targetSizeUsd: number | null;
  finalSizeUsd: number | null;
  stageFocus: string[];
  sectorFocus: string[];
  geographyFocus: string[];
  announcementUrl: string | null;
  status: "announced" | "target" | "first_close" | "final_close" | "inferred_active" | "historical";
  manuallyVerified: boolean;
  updatedAt: string;
};

type LatestFundingAdminRow = {
  id: string;
  companyName: string;
  companyWebsite: string | null;
  sectorRaw: string | null;
  sectorNormalized: string | null;
  roundTypeRaw: string | null;
  roundTypeNormalized: string | null;
  amountRaw: string | null;
  announcedDate: string | null;
  leadInvestor: string | null;
  coInvestors: string[];
  primarySourceUrl: string | null;
  primaryPressUrl: string | null;
  sourceType: "news" | "curated_feed" | "rumor" | "api";
  isRumor: boolean;
  needsReview: boolean;
  updatedAt: string;
};

type FreshCapitalAdminPayload = {
  fundWatch: FundWatchAdminRow[];
  latestFunding: LatestFundingAdminRow[];
};

type FundFormState = {
  name: string;
  vintageYear: string;
  announcedDate: string;
  closeDate: string;
  targetSizeUsd: string;
  finalSizeUsd: string;
  status: FundWatchAdminRow["status"];
  stageFocus: string;
  sectorFocus: string;
  geographyFocus: string;
  announcementUrl: string;
};

type DealFormState = {
  companyName: string;
  companyWebsite: string;
  sectorRaw: string;
  roundTypeRaw: string;
  amountRaw: string;
  announcedDate: string;
  leadInvestor: string;
  coInvestors: string;
  primarySourceUrl: string;
  primaryPressUrl: string;
  sourceType: LatestFundingAdminRow["sourceType"];
  isRumor: "true" | "false";
  needsReview: "true" | "false";
};

const STATUS_OPTIONS: Array<FundWatchAdminRow["status"]> = [
  "announced",
  "target",
  "first_close",
  "final_close",
  "inferred_active",
  "historical",
];

const SOURCE_TYPE_OPTIONS: Array<LatestFundingAdminRow["sourceType"]> = [
  "news",
  "curated_feed",
  "rumor",
  "api",
];

function formatUsdCompact(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function joinTags(values: string[] | null | undefined): string {
  return Array.isArray(values) ? values.join(", ") : "";
}

function fundFormFromRow(row: FundWatchAdminRow): FundFormState {
  return {
    name: row.name ?? "",
    vintageYear: row.vintageYear != null ? String(row.vintageYear) : "",
    announcedDate: row.announcedDate ?? "",
    closeDate: row.closeDate ?? "",
    targetSizeUsd: row.targetSizeUsd != null ? String(row.targetSizeUsd) : "",
    finalSizeUsd: row.finalSizeUsd != null ? String(row.finalSizeUsd) : "",
    status: row.status,
    stageFocus: joinTags(row.stageFocus),
    sectorFocus: joinTags(row.sectorFocus),
    geographyFocus: joinTags(row.geographyFocus),
    announcementUrl: row.announcementUrl ?? "",
  };
}

function dealFormFromRow(row: LatestFundingAdminRow): DealFormState {
  return {
    companyName: row.companyName ?? "",
    companyWebsite: row.companyWebsite ?? "",
    sectorRaw: row.sectorRaw ?? row.sectorNormalized ?? "",
    roundTypeRaw: row.roundTypeRaw ?? row.roundTypeNormalized ?? "",
    amountRaw: row.amountRaw ?? "",
    announcedDate: row.announcedDate ?? "",
    leadInvestor: row.leadInvestor ?? "",
    coInvestors: joinTags(row.coInvestors),
    primarySourceUrl: row.primarySourceUrl ?? "",
    primaryPressUrl: row.primaryPressUrl ?? "",
    sourceType: row.sourceType,
    isRumor: row.isRumor ? "true" : "false",
    needsReview: row.needsReview ? "true" : "false",
  };
}

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{title}</p>
      {hint ? <p className="text-[11px] text-white/35">{hint}</p> : null}
    </div>
  );
}

export function AdminFreshCapitalEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"fund" | "deal" | null>(null);
  const [activeTab, setActiveTab] = useState<"fund-watch" | "latest-funding">("fund-watch");
  const [fundSearch, setFundSearch] = useState("");
  const [dealSearch, setDealSearch] = useState("");
  const [fundRows, setFundRows] = useState<FundWatchAdminRow[]>([]);
  const [dealRows, setDealRows] = useState<LatestFundingAdminRow[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [fundForm, setFundForm] = useState<FundFormState | null>(null);
  const [dealForm, setDealForm] = useState<DealFormState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction("admin-fresh-capital", {
        preferClerkSessionToken: true,
        body: { action: "list" },
      });
      if (error) throw error;
      const body = data as FreshCapitalAdminPayload;
      const nextFunds = body.fundWatch ?? [];
      const nextDeals = body.latestFunding ?? [];
      setFundRows(nextFunds);
      setDealRows(nextDeals);

      setSelectedFundId((current) => {
        const candidate = current && nextFunds.some((row) => row.id === current) ? current : nextFunds[0]?.id ?? null;
        const row = nextFunds.find((item) => item.id === candidate);
        setFundForm(row ? fundFormFromRow(row) : null);
        return candidate;
      });

      setSelectedDealId((current) => {
        const candidate = current && nextDeals.some((row) => row.id === current) ? current : nextDeals[0]?.id ?? null;
        const row = nextDeals.find((item) => item.id === candidate);
        setDealForm(row ? dealFormFromRow(row) : null);
        return candidate;
      });
    } catch (error) {
      toast.error("Failed to load Fresh Capital records", {
        description: await formatEdgeFunctionInvokeError(error),
      });
      setFundRows([]);
      setDealRows([]);
      setSelectedFundId(null);
      setSelectedDealId(null);
      setFundForm(null);
      setDealForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredFunds = useMemo(() => {
    const q = fundSearch.trim().toLowerCase();
    if (!q) return fundRows;
    return fundRows.filter((row) =>
      [row.name, row.firmName, joinTags(row.stageFocus), joinTags(row.sectorFocus)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [fundRows, fundSearch]);

  const filteredDeals = useMemo(() => {
    const q = dealSearch.trim().toLowerCase();
    if (!q) return dealRows;
    return dealRows.filter((row) =>
      [row.companyName, row.sectorRaw, row.roundTypeRaw, row.leadInvestor, joinTags(row.coInvestors)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [dealRows, dealSearch]);

  const selectedFund = useMemo(
    () => fundRows.find((row) => row.id === selectedFundId) ?? null,
    [fundRows, selectedFundId],
  );
  const selectedDeal = useMemo(
    () => dealRows.find((row) => row.id === selectedDealId) ?? null,
    [dealRows, selectedDealId],
  );

  const selectFund = useCallback((row: FundWatchAdminRow) => {
    setSelectedFundId(row.id);
    setFundForm(fundFormFromRow(row));
  }, []);

  const selectDeal = useCallback((row: LatestFundingAdminRow) => {
    setSelectedDealId(row.id);
    setDealForm(dealFormFromRow(row));
  }, []);

  const saveFund = useCallback(async () => {
    if (!selectedFundId || !fundForm) return;
    setSaving("fund");
    try {
      const { error } = await invokeEdgeFunction("admin-fresh-capital", {
        preferClerkSessionToken: true,
        body: {
          action: "update_fund",
          id: selectedFundId,
          payload: fundForm,
        },
      });
      if (error) throw error;
      toast.success("Fund Watch updated");
      await load();
    } catch (error) {
      toast.error("Failed to save Fund Watch changes", {
        description: await formatEdgeFunctionInvokeError(error),
      });
    } finally {
      setSaving(null);
    }
  }, [fundForm, load, selectedFundId]);

  const saveDeal = useCallback(async () => {
    if (!selectedDealId || !dealForm) return;
    setSaving("deal");
    try {
      const { error } = await invokeEdgeFunction("admin-fresh-capital", {
        preferClerkSessionToken: true,
        body: {
          action: "update_deal",
          id: selectedDealId,
          payload: dealForm,
        },
      });
      if (error) throw error;
      toast.success("Latest Funding updated");
      await load();
    } catch (error) {
      toast.error("Failed to save Latest Funding changes", {
        description: await formatEdgeFunctionInvokeError(error),
      });
    } finally {
      setSaving(null);
    }
  }, [dealForm, load, selectedDealId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-semibold text-white/90">Fresh Capital manual updates</h1>
          <p className="mt-1 max-w-2xl font-mono text-[11px] text-white/40">
            Edit the canonical records that power Fund Watch and Latest Funding on <span className="text-white/60">/fresh-capital</span>.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh records
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white/[0.02] p-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">Fund Watch</p>
          <p className="mt-2 text-2xl font-semibold text-white/90">{fundRows.length}</p>
          <p className="mt-1 text-xs text-white/40">Recent canonical `vc_funds` rows ready for manual correction.</p>
        </div>
        <div className="rounded-xl border bg-white/[0.02] p-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">Latest Funding</p>
          <p className="mt-2 text-2xl font-semibold text-white/90">{dealRows.length}</p>
          <p className="mt-1 text-xs text-white/40">Recent canonical `fi_deals_canonical` rows surfaced in the admin console.</p>
        </div>
        <div className="rounded-xl border bg-white/[0.02] p-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">Publishing note</p>
          <p className="mt-2 text-sm font-medium text-white/80">Manual saves write directly to the live canonical source.</p>
          <p className="mt-1 text-xs text-white/40">Use precise values here. Changes should appear on `/fresh-capital` once the feed refreshes.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "fund-watch" | "latest-funding")}>
        <TabsList className="bg-white/[0.03]">
          <TabsTrigger value="fund-watch">Fund Watch</TabsTrigger>
          <TabsTrigger value="latest-funding">Latest Funding</TabsTrigger>
        </TabsList>

        <TabsContent value="fund-watch">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(0,1.35fr)]">
              <section className="rounded-xl border bg-white/[0.02]" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="border-b px-4 py-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <SectionLabel title="Choose fund" hint="Select a live Fund Watch record, then edit its public feed fields." />
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
                    <Input
                      value={fundSearch}
                      onChange={(event) => setFundSearch(event.target.value)}
                      placeholder="Search fund or firm"
                      className="h-9 border-white/10 bg-white/5 pl-9 text-sm text-white/85 placeholder:text-white/25"
                    />
                  </div>
                </div>

                <div className="max-h-[40rem] overflow-y-auto">
                  {filteredFunds.map((row) => {
                    const active = row.id === selectedFundId;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => selectFund(row)}
                        className="block w-full border-b px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                        style={{
                          borderColor: "rgba(255,255,255,0.05)",
                          background: active ? "rgba(46,230,166,0.06)" : "transparent",
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white/88">{row.name}</p>
                            <p className="mt-0.5 truncate text-[11px] text-white/40">{row.firmName}</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                            {row.status.replace("_", " ")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/45">
                          <span>{row.announcedDate ?? "No announce date"}</span>
                          <span>{formatUsdCompact(row.finalSizeUsd ?? row.targetSizeUsd)}</span>
                          <span>{joinTags(row.stageFocus) || "No stages"}</span>
                        </div>
                      </button>
                    );
                  })}

                  {filteredFunds.length === 0 ? (
                    <p className="px-4 py-12 text-center font-mono text-xs text-white/30">No Fund Watch rows match this search.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border bg-white/[0.02] p-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                {selectedFund && fundForm ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/75">Editing Fund Watch row</p>
                        <h2 className="mt-1 text-lg font-semibold text-white/90">{selectedFund.name}</h2>
                        <p className="mt-1 text-sm text-white/45">
                          {selectedFund.firmName} · Updated {formatDistanceToNow(new Date(selectedFund.updatedAt), { addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void saveFund()}
                        disabled={saving === "fund"}
                        className="h-9 bg-emerald-500/90 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-black hover:bg-emerald-400"
                      >
                        {saving === "fund" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                        Save fund watch
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <SectionLabel title="Fund name" />
                        <Input value={fundForm.name} onChange={(event) => setFundForm((prev) => prev ? { ...prev, name: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Firm" hint="Firm linkage stays fixed here to avoid accidental reassignment." />
                        <Input value={selectedFund.firmName} disabled className="border-white/10 bg-white/[0.04] text-white/55" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Vintage year" />
                        <Input value={fundForm.vintageYear} onChange={(event) => setFundForm((prev) => prev ? { ...prev, vintageYear: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Status" />
                        <Select value={fundForm.status} onValueChange={(value) => setFundForm((prev) => prev ? { ...prev, status: value as FundFormState["status"] } : prev)}>
                          <SelectTrigger className="border-white/10 bg-white/5 text-white/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>{status.replace("_", " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Announced date" />
                        <Input type="date" value={fundForm.announcedDate} onChange={(event) => setFundForm((prev) => prev ? { ...prev, announcedDate: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Close date" />
                        <Input type="date" value={fundForm.closeDate} onChange={(event) => setFundForm((prev) => prev ? { ...prev, closeDate: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Target size (USD)" />
                        <Input value={fundForm.targetSizeUsd} onChange={(event) => setFundForm((prev) => prev ? { ...prev, targetSizeUsd: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Final size (USD)" />
                        <Input value={fundForm.finalSizeUsd} onChange={(event) => setFundForm((prev) => prev ? { ...prev, finalSizeUsd: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <SectionLabel title="Stage focus" hint="Comma-separated, e.g. Seed, Series A, Growth" />
                        <Textarea value={fundForm.stageFocus} onChange={(event) => setFundForm((prev) => prev ? { ...prev, stageFocus: event.target.value } : prev)} className="min-h-[84px] border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Sector focus" hint="Comma-separated theme tags used by the Fresh Capital row pills." />
                        <Textarea value={fundForm.sectorFocus} onChange={(event) => setFundForm((prev) => prev ? { ...prev, sectorFocus: event.target.value } : prev)} className="min-h-[84px] border-white/10 bg-white/5 text-white/85" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                      <div className="space-y-2">
                        <SectionLabel title="Geography focus" hint="Comma-separated geographies shown in downstream analytics." />
                        <Textarea value={fundForm.geographyFocus} onChange={(event) => setFundForm((prev) => prev ? { ...prev, geographyFocus: event.target.value } : prev)} className="min-h-[84px] border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Announcement URL" />
                        <Input value={fundForm.announcementUrl} onChange={(event) => setFundForm((prev) => prev ? { ...prev, announcementUrl: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[24rem] items-center justify-center text-center">
                    <div>
                      <DatabaseZap className="mx-auto h-8 w-8 text-white/25" />
                      <p className="mt-3 text-sm text-white/55">Select a Fund Watch record to edit it.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </TabsContent>

        <TabsContent value="latest-funding">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(0,1.35fr)]">
              <section className="rounded-xl border bg-white/[0.02]" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="border-b px-4 py-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <SectionLabel title="Choose deal" hint="Edit the canonical deal row that feeds the Latest Funding table." />
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
                    <Input
                      value={dealSearch}
                      onChange={(event) => setDealSearch(event.target.value)}
                      placeholder="Search company, round, sector, investor"
                      className="h-9 border-white/10 bg-white/5 pl-9 text-sm text-white/85 placeholder:text-white/25"
                    />
                  </div>
                </div>

                <div className="max-h-[40rem] overflow-y-auto">
                  {filteredDeals.map((row) => {
                    const active = row.id === selectedDealId;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => selectDeal(row)}
                        className="block w-full border-b px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                        style={{
                          borderColor: "rgba(255,255,255,0.05)",
                          background: active ? "rgba(46,230,166,0.06)" : "transparent",
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white/88">{row.companyName}</p>
                            <p className="mt-0.5 truncate text-[11px] text-white/40">
                              {(row.roundTypeRaw ?? row.roundTypeNormalized ?? "Unknown round").replace(/_/g, " ")}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                            {(row.sectorRaw ?? row.sectorNormalized ?? "unknown").replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/45">
                          <span>{row.announcedDate ?? "No date"}</span>
                          <span>{row.amountRaw ?? "No amount"}</span>
                          <span>{row.leadInvestor ?? "No lead"}</span>
                        </div>
                      </button>
                    );
                  })}

                  {filteredDeals.length === 0 ? (
                    <p className="px-4 py-12 text-center font-mono text-xs text-white/30">No Latest Funding rows match this search.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border bg-white/[0.02] p-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                {selectedDeal && dealForm ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/75">Editing Latest Funding row</p>
                        <h2 className="mt-1 text-lg font-semibold text-white/90">{selectedDeal.companyName}</h2>
                        <p className="mt-1 text-sm text-white/45">
                          Updated {formatDistanceToNow(new Date(selectedDeal.updatedAt), { addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void saveDeal()}
                        disabled={saving === "deal"}
                        className="h-9 bg-emerald-500/90 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-black hover:bg-emerald-400"
                      >
                        {saving === "deal" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                        Save latest funding
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <SectionLabel title="Company name" />
                        <Input value={dealForm.companyName} onChange={(event) => setDealForm((prev) => prev ? { ...prev, companyName: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Company website" />
                        <Input value={dealForm.companyWebsite} onChange={(event) => setDealForm((prev) => prev ? { ...prev, companyWebsite: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Sector label" hint="Raw label is normalized automatically on save." />
                        <Input value={dealForm.sectorRaw} onChange={(event) => setDealForm((prev) => prev ? { ...prev, sectorRaw: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Round label" hint="Examples: Strategic, Series A, Series B." />
                        <Input value={dealForm.roundTypeRaw} onChange={(event) => setDealForm((prev) => prev ? { ...prev, roundTypeRaw: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Amount label" />
                        <Input value={dealForm.amountRaw} onChange={(event) => setDealForm((prev) => prev ? { ...prev, amountRaw: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Announced date" />
                        <Input type="date" value={dealForm.announcedDate} onChange={(event) => setDealForm((prev) => prev ? { ...prev, announcedDate: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Lead investor" />
                        <Input value={dealForm.leadInvestor} onChange={(event) => setDealForm((prev) => prev ? { ...prev, leadInvestor: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Source type" />
                        <Select value={dealForm.sourceType} onValueChange={(value) => setDealForm((prev) => prev ? { ...prev, sourceType: value as DealFormState["sourceType"] } : prev)}>
                          <SelectTrigger className="border-white/10 bg-white/5 text-white/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SOURCE_TYPE_OPTIONS.map((sourceType) => (
                              <SelectItem key={sourceType} value={sourceType}>{sourceType.replace("_", " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <SectionLabel title="Co-investors" hint="Comma-separated investor list used by the Latest Funding table." />
                      <Textarea value={dealForm.coInvestors} onChange={(event) => setDealForm((prev) => prev ? { ...prev, coInvestors: event.target.value } : prev)} className="min-h-[92px] border-white/10 bg-white/5 text-white/85" />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <SectionLabel title="Primary source URL" />
                        <Input value={dealForm.primarySourceUrl} onChange={(event) => setDealForm((prev) => prev ? { ...prev, primarySourceUrl: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Primary press URL" />
                        <Input value={dealForm.primaryPressUrl} onChange={(event) => setDealForm((prev) => prev ? { ...prev, primaryPressUrl: event.target.value } : prev)} className="border-white/10 bg-white/5 text-white/85" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <SectionLabel title="Rumor status" />
                        <Select value={dealForm.isRumor} onValueChange={(value) => setDealForm((prev) => prev ? { ...prev, isRumor: value as "true" | "false" } : prev)}>
                          <SelectTrigger className="border-white/10 bg-white/5 text-white/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">Confirmed / not rumor</SelectItem>
                            <SelectItem value="true">Rumor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <SectionLabel title="Review state" />
                        <Select value={dealForm.needsReview} onValueChange={(value) => setDealForm((prev) => prev ? { ...prev, needsReview: value as "true" | "false" } : prev)}>
                          <SelectTrigger className="border-white/10 bg-white/5 text-white/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">Ready for feed</SelectItem>
                            <SelectItem value="true">Needs review</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[24rem] items-center justify-center text-center">
                    <div>
                      <DatabaseZap className="mx-auto h-8 w-8 text-white/25" />
                      <p className="mt-3 text-sm text-white/55">Select a Latest Funding record to edit it.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

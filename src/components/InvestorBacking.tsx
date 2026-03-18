import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, DollarSign, Bell, CheckCircle2, Eye, Loader2, RefreshCw, ChevronDown, Landmark } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";

interface CapRow {
  id: string;
  investor_name: string;
  entity_type: string;
  instrument: string;
  amount: number;
  date: string;
  notes: string;
  _new?: boolean;
}

interface PendingInvestor {
  id: string;
  investor_name: string;
  entity_type: string;
  instrument: string;
  amount: number;
  round_name: string | null;
  source_type: string;
  source_detail: string | null;
  source_date: string | null;
  status: string;
}

const ENTITY_TYPES = ["Angel", "VC Firm", "Syndicate", "Accelerator"];
const INSTRUMENTS = ["SAFE (Post-money)", "SAFE (Pre-money)", "Convertible Note", "Equity"];

function logoUrl(name: string) {
  if (!name.trim()) return null;
  const domain = name.trim().toLowerCase().replace(/\s+/g, "") + ".com";
  return `https://logo.clearbit.com/${domain}`;
}

export function InvestorBacking() {
  const [rows, setRows] = useState<CapRow[]>([]);
  const [original, setOriginal] = useState<CapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingInvestor[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(original), [rows, original]);
  const totalRaised = useMemo(() => rows.reduce((s, r) => s + (r.amount || 0), 0), [rows]);

  const fetchRows = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("cap_table")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    const mapped = (data || []).map((r: any) => ({
      id: r.id,
      investor_name: r.investor_name,
      entity_type: r.entity_type,
      instrument: r.instrument,
      amount: r.amount,
      date: r.date || "",
      notes: r.notes || "",
    }));
    setRows(mapped);
    setOriginal(mapped);
    setLoading(false);
  }, []);

  const fetchPending = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("pending_investors")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setPending((data as PendingInvestor[]) || []);
  }, []);

  useEffect(() => { fetchRows(); fetchPending(); }, [fetchRows, fetchPending]);

  const updateCell = (id: string, field: keyof CapRow, value: string | number) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), investor_name: "", entity_type: "Angel", instrument: "SAFE (Post-money)", amount: 0, date: "", notes: "", _new: true },
    ]);
  };

  const deleteRow = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      const { error } = await supabase.from("cap_table").delete().eq("id", id);
      if (error) { toast.error("Delete failed"); return; }
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setOriginal((prev) => prev.filter((r) => r.id !== id));
    toast.success("Investor removed");
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      for (const row of rows) {
        const payload = {
          user_id: user.id, investor_name: row.investor_name, entity_type: row.entity_type,
          instrument: row.instrument, amount: row.amount, date: row.date || null, notes: row.notes || null,
        };
        if (row._new) {
          const { error } = await supabase.from("cap_table").insert({ ...payload, id: row.id });
          if (error) throw error;
        } else {
          const orig = original.find((o) => o.id === row.id);
          if (JSON.stringify(orig) !== JSON.stringify(row)) {
            const { error } = await supabase.from("cap_table").update(payload).eq("id", row.id);
            if (error) throw error;
          }
        }
      }
      toast.success("Changes saved");
      await fetchRows();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Accept a single pending investor ──
  const acceptPending = async (p: PendingInvestor) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: insertErr } = await supabase.from("cap_table").insert({
      user_id: user.id,
      investor_name: p.investor_name,
      entity_type: p.entity_type,
      instrument: p.instrument,
      amount: p.amount,
      date: p.source_date || "",
      notes: `${p.source_type}: ${p.source_detail || ""}`.trim(),
    });
    if (insertErr) { toast.error("Failed to add investor"); return; }
    const { error: updateErr } = await supabase.from("pending_investors").update({ status: "accepted" }).eq("id", p.id);
    if (updateErr) console.error(updateErr);
    setPending((prev) => prev.filter((x) => x.id !== p.id));
    await fetchRows();
    toast.success(`${p.investor_name} added to your cap table`);
  };

  const dismissPending = async (id: string) => {
    await supabase.from("pending_investors").update({ status: "dismissed" }).eq("id", id);
    setPending((prev) => prev.filter((x) => x.id !== id));
    toast("Investor dismissed");
  };

  const acceptAll = async () => {
    for (const p of pending) {
      await acceptPending(p);
    }
    setShowReview(false);
  };

  // ── Manual sync trigger ──
  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      // Get the user's company analysis
      const { data: analyses } = await supabase
        .from("company_analyses")
        .select("id, company_name, website_url")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!analyses) {
        toast.error("No company profile found. Complete onboarding first.");
        return;
      }
      const domain = analyses.website_url
        ? analyses.website_url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
        : "";

      const { data, error } = await supabase.functions.invoke("sync-investor-data", {
        body: {
          company_id: analyses.id,
          company_domain: domain,
          user_id: user.id,
          company_name: analyses.company_name,
        },
      });
      if (error) throw error;
      toast.success(`Sync complete — ${data?.newInvestorsFound || 0} new investor(s) found`);
      await fetchPending();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="surface-card border border-border">
        <CollapsibleTrigger asChild>
          <button className="w-full p-5 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Landmark className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-foreground">Investment</h3>
                <p className="text-[10px] text-muted-foreground">Capital raised &amp; investor backing</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {totalRaised > 0 && (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                  {fmt(totalRaised)} raised
                </Badge>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4">
      {/* Pending Investors Notification Banner */}
      {pending.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center justify-between py-3 px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                <Bell className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  We found {pending.length} new investor{pending.length > 1 ? "s" : ""} for your recent round.
                </p>
                <p className="text-xs text-muted-foreground">Would you like to add them to your cap table?</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowReview(true)}>
                <Eye className="h-3.5 w-3.5" />
                Review
              </Button>
              <Button size="sm" className="gap-1.5 text-xs" onClick={acceptAll}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Accept All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Total Capital Raised Summary */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-between py-4 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Capital Raised</p>
              <p className="text-xl font-bold text-foreground tracking-tight">{fmt(totalRaised)}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={triggerSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? "Scanning..." : "Scan for Investors"}
          </Button>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Investor Backing</CardTitle>
          {dirty && (
            <Button size="sm" className="gap-1.5" onClick={saveChanges} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Investor Name</TableHead>
                <TableHead className="w-[140px]">Entity Type</TableHead>
                <TableHead className="w-[170px]">Instrument</TableHead>
                <TableHead className="w-[120px]">Amount ($)</TableHead>
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-xs">
                    No investors yet. Click "Add Investor" to get started.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="p-1.5">
                    <div className="flex items-center gap-2">
                      {row.investor_name && (
                        <img
                          src={logoUrl(row.investor_name)!}
                          alt=""
                          className="h-5 w-5 rounded-sm object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <Input
                        value={row.investor_name}
                        onChange={(e) => updateCell(row.id, "investor_name", e.target.value)}
                        className="h-8 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                        placeholder="Firm name…"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Select value={row.entity_type} onValueChange={(v) => updateCell(row.id, "entity_type", v)}>
                      <SelectTrigger className="h-8 text-xs border-transparent hover:border-input bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Select value={row.instrument} onValueChange={(v) => updateCell(row.id, "instrument", v)}>
                      <SelectTrigger className="h-8 text-xs border-transparent hover:border-input bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INSTRUMENTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Input
                      type="number"
                      value={row.amount || ""}
                      onChange={(e) => updateCell(row.id, "amount", parseInt(e.target.value) || 0)}
                      className="h-8 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateCell(row.id, "date", e.target.value)}
                      className="h-8 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                    />
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Input
                      value={row.notes}
                      onChange={(e) => updateCell(row.id, "notes", e.target.value)}
                      className="h-8 text-xs border-transparent hover:border-input focus:border-input bg-transparent"
                      placeholder="Optional…"
                    />
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteRow(row.id, row._new)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-3 border-t">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              Add Investor
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Review Modal */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Discovered Investors</DialogTitle>
            <DialogDescription>
              These investors were found from public data sources. Accept to add them to your cap table.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {pending.map((p) => (
              <Card key={p.id} className="border">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {p.investor_name && (
                      <img
                        src={logoUrl(p.investor_name)!}
                        alt=""
                        className="h-8 w-8 rounded object-contain shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.investor_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {p.entity_type}
                        </Badge>
                        {p.round_name && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {p.round_name}
                          </Badge>
                        )}
                        {p.amount > 0 && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {fmt(p.amount)}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">
                        Source: {p.source_type}{p.source_detail ? ` — ${p.source_detail}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => dismissPending(p.id)}
                    >
                      Dismiss
                    </Button>
                    <Button size="sm" className="text-xs gap-1" onClick={() => acceptPending(p)}>
                      <CheckCircle2 className="h-3 w-3" />
                      Accept
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {pending.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No pending investors to review.</p>
            )}
          </div>
          {pending.length > 1 && (
            <div className="flex justify-end pt-2 border-t">
              <Button className="gap-1.5" onClick={acceptAll}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Accept All ({pending.length})
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

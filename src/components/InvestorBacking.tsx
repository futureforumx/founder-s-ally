import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Save, DollarSign } from "lucide-react";
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
    const mapped = (data || []).map((r) => ({
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

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const updateCell = (id: string, field: keyof CapRow, value: string | number) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        investor_name: "",
        entity_type: "Angel",
        instrument: "SAFE (Post-money)",
        amount: 0,
        date: "",
        notes: "",
        _new: true,
      },
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
          user_id: user.id,
          investor_name: row.investor_name,
          entity_type: row.entity_type,
          instrument: row.instrument,
          amount: row.amount,
          date: row.date || null,
          notes: row.notes || null,
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

  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;

  return (
    <div className="space-y-4">
      {/* Total Capital Raised Summary */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 py-4 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Capital Raised</p>
            <p className="text-xl font-bold text-foreground tracking-tight">{fmt(totalRaised)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
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
                        {ENTITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1.5">
                    <Select value={row.instrument} onValueChange={(v) => updateCell(row.id, "instrument", v)}>
                      <SelectTrigger className="h-8 text-xs border-transparent hover:border-input bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INSTRUMENTS.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
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
    </div>
  );
}

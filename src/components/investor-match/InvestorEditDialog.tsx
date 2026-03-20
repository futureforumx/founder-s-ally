import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, DollarSign, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INVESTMENT_TYPES, FUNDING_ROUNDS, type CapBacker } from "./CapTableRow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvestorEditDialogProps {
  backer: CapBacker | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: Partial<CapBacker>) => void;
  onRemove: (id: string) => void;
}

function parseShorthand(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").toLowerCase();
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+\.?\d*)(k|m)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const suffix = match[2];
  if (suffix === "k") return num * 1_000;
  if (suffix === "m") return num * 1_000_000;
  return num;
}

function formatWithCommas(n: number): string {
  if (isNaN(n) || n === 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function cleanDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export function InvestorEditDialog({ backer, open, onOpenChange, onSave, onRemove }: InvestorEditDialogProps) {
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState("");
  const [round, setRound] = useState("");
  const [closingMonth, setClosingMonth] = useState("");
  const [closingYear, setClosingYear] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (backer) {
      setAmount(backer.amount > 0 ? formatWithCommas(backer.amount) : "");
      setInstrument(backer.instrument);
      setRound(backer.date);
      // Try to parse existing date like "Mar 2026"
      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      if (backer.date) {
        const parts = backer.date.split(" ");
        if (parts.length === 2 && MONTHS.includes(parts[0])) {
          setClosingMonth(parts[0]);
          setClosingYear(parts[1]);
        } else {
          setClosingMonth("");
          setClosingYear("");
        }
      } else {
        setClosingMonth("");
        setClosingYear("");
      }
      setAmountError(null);
    }
  }, [backer]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSave = useCallback(async () => {
    if (!backer) return;

    let parsedAmount = 0;
    if (amount.trim()) {
      const parsed = parseShorthand(amount);
      if (parsed === null) {
        setAmountError("Invalid format. Try 1.5M or 50k");
        return;
      }
      if (parsed < 1_000 || parsed > 50_000_000) {
        setAmountError("Must be $1k – $50M");
        return;
      }
      parsedAmount = parsed;
    }

    setSaving(true);
    try {
      const closingDateStr = closingMonth && closingYear ? `${closingMonth} ${closingYear}` : null;
      const updates: Record<string, unknown> = {
        amount: parsedAmount,
        instrument,
        entity_type: round,
      };
      if (closingDateStr) {
        updates.date = closingDateStr;
      }

      const { error } = await supabase
        .from("cap_table")
        .update(updates)
        .eq("id", backer.id);

      if (error) throw error;

      onSave(backer.id, {
        amount: parsedAmount,
        amountLabel: `$${parsedAmount.toLocaleString()}`,
        instrument,
        date: closingDateStr || round,
      });

      onOpenChange(false);
      toast.success("Investor updated.");
    } catch {
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }, [backer, amount, instrument, round, closingMonth, closingYear, onSave, onOpenChange]);

  const handleRemove = useCallback(async () => {
    if (!backer) return;
    try {
      const { error } = await supabase.from("cap_table").delete().eq("id", backer.id);
      if (error) throw error;
      onRemove(backer.id);
      onOpenChange(false);
      toast.success("Investor removed.");
    } catch {
      toast.error("Failed to remove investor.");
    }
  }, [backer, onRemove, onOpenChange]);

  if (!backer) return null;

  const websiteHref = backer.website
    ? backer.website.startsWith("http") ? backer.website : `https://${backer.website}`
    : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Centered Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border/50 overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0 rounded-lg border border-border shadow-sm">
                    {backer.logoUrl ? <AvatarImage src={backer.logoUrl} alt={backer.name} className="object-cover" /> : null}
                    <AvatarFallback
                      className="text-sm font-semibold rounded-lg"
                      style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
                    >
                      {backer.logoLetter}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground truncate">{backer.name}</h3>
                    {backer.slogan && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{backer.slogan}</p>
                    )}
                    {websiteHref && (
                      <a
                        href={websiteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5 w-fit"
                      >
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        {cleanDomain(backer.website!)}
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4">
                {/* Amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Investment Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                      value={amount}
                      onChange={e => {
                        setAmount(e.target.value.replace(/[^0-9.,mkMK]/g, ""));
                        if (amountError) setAmountError(null);
                      }}
                      placeholder="e.g. 1.5m or 50k"
                      className={cn(
                        "w-full rounded-xl border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all",
                        amountError
                          ? "border-destructive focus:ring-destructive/30"
                          : "border-border focus:ring-accent/30 focus:border-accent/40"
                      )}
                    />
                  </div>
                  {amountError && (
                    <p className="text-xs text-destructive mt-1">{amountError}</p>
                  )}
                </div>

                {/* Funding Round & Instrument – 2-column */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Funding Round</label>
                    <Select value={round} onValueChange={setRound}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10">
                        <SelectValue placeholder="Select round…" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999]">
                        {FUNDING_ROUNDS.map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Instrument</label>
                    <Select value={instrument} onValueChange={setInstrument}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10">
                        <SelectValue placeholder="Select type…" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999]">
                        {INVESTMENT_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Closing Date – Month & Year */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Closing Date</label>
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={closingMonth} onValueChange={setClosingMonth}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999]">
                        {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={closingYear} onValueChange={setClosingYear}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-secondary/30 h-10">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[99999]">
                        {Array.from({ length: 11 }, (_, i) => String(2020 + i)).map(y => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-secondary/20">
                <button
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-2"
                  >
                    {saving && <span className="h-3.5 w-3.5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

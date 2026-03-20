import { useState, useCallback, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trash2, DollarSign, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InlineCellCombobox } from "./InlineCellCombobox";
import { INVESTMENT_TYPES, FUNDING_ROUNDS, type CapBacker } from "./CapTableRow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvestorEditSheetProps {
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

export function InvestorEditSheet({ backer, open, onOpenChange, onSave, onRemove }: InvestorEditSheetProps) {
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState("");
  const [round, setRound] = useState("");
  const [closingDate, setClosingDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  // Sync form state when backer changes
  useEffect(() => {
    if (backer) {
      setAmount(backer.amount > 0 ? formatWithCommas(backer.amount) : "");
      setInstrument(backer.instrument);
      setRound(backer.date);
      setClosingDate(undefined);
      setAmountError(null);
    }
  }, [backer]);

  const handleSave = useCallback(async () => {
    if (!backer) return;

    // Validate amount
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
      const updates: Record<string, unknown> = {
        amount: parsedAmount,
        instrument,
        entity_type: round,
      };
      if (closingDate) {
        updates.date = format(closingDate, "MMM yyyy");
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
        date: closingDate ? format(closingDate, "MMM yyyy") : round,
      });

      onOpenChange(false);
      toast.success("Investor updated.");
    } catch {
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }, [backer, amount, instrument, round, closingDate, onSave, onOpenChange]);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              {backer.logoUrl ? <AvatarImage src={backer.logoUrl} alt={backer.name} /> : null}
              <AvatarFallback
                className="text-sm font-semibold"
                style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
              >
                {backer.logoLetter}
              </AvatarFallback>
            </Avatar>
            <SheetTitle className="text-xl font-bold text-foreground">{backer.name}</SheetTitle>
          </div>
        </SheetHeader>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-5">
            {/* Amount */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Investment Amount
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  value={amount}
                  onChange={e => {
                    setAmount(e.target.value.replace(/[^0-9.,mkMK]/g, ""));
                    if (amountError) setAmountError(null);
                  }}
                  placeholder="e.g. 1.5m or 50k"
                  className={cn(
                    "w-full rounded-md border bg-background pl-9 pr-3 py-2.5 text-sm font-mono text-foreground transition-all focus:outline-none focus:ring-2",
                    amountError
                      ? "border-destructive focus:ring-destructive"
                      : "border-input focus:ring-ring/30 focus:border-ring"
                  )}
                />
              </div>
              {amountError && (
                <p className="text-xs text-destructive">{amountError}</p>
              )}
            </div>

            {/* Instrument */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Instrument Type
              </Label>
              <InlineCellCombobox
                value={instrument}
                options={INVESTMENT_TYPES}
                onSelect={setInstrument}
              />
            </div>

            {/* Round */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Funding Round
              </Label>
              <InlineCellCombobox
                value={round}
                options={FUNDING_ROUNDS}
                onSelect={setRound}
              />
            </div>

            {/* Closing Date */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Closing Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !closingDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {closingDate ? format(closingDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                  <Calendar
                    mode="single"
                    selected={closingDate}
                    onSelect={setClosingDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-border bg-background p-4 flex items-center justify-between">
          <button
            onClick={handleRemove}
            className="inline-flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Investor
          </button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

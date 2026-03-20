import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InlineCellCombobox } from "./InlineCellCombobox";

export const INVESTMENT_TYPES = [
  "Equity (Priced Round)",
  "SAFE (Post-Money)",
  "SAFE (Pre-Money)",
  "Convertible Note",
  "Venture Debt",
  "Grant",
  "Secondary",
];

export const FUNDING_ROUNDS = [
  "Accelerator / Incubator",
  "Angel",
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C+",
  "Bridge",
];

export interface CapBacker {
  id: string;
  name: string;
  amount: number;
  amountLabel: string;
  instrument: string;
  logoLetter: string;
  date: string;
  logoUrl?: string;
  ownershipPct: number;
}

interface CapTableRowProps {
  backer: CapBacker;
  index: number;
  isHighlighted: boolean;
  formatCurrency: (n: number) => string;
  onOwnershipChange: (id: string, pct: number) => void;
  onAmountChange: (id: string, amount: number) => void;
  onInstrumentChange?: (id: string, instrument: string) => void;
  onRoundChange?: (id: string, round: string) => void;
}

export function CapTableRow({ backer, index, isHighlighted, formatCurrency, onOwnershipChange, onAmountChange, onInstrumentChange, onRoundChange }: CapTableRowProps) {
  const [editingField, setEditingField] = useState<"amount" | "ownership" | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (isHighlighted) {
      setEditingField("amount");
      setEditValue("");
    }
  }, [isHighlighted]);

  const startEditAmount = () => {
    setEditingField("amount");
    setEditValue(backer.amount > 0 ? String(backer.amount) : "");
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const confirmEdit = useCallback(async () => {
    if (!editingField) return;
    const numericValue = parseFloat(editValue) || 0;

    if (editingField === "amount") {
      onAmountChange(backer.id, numericValue);
      try {
        await supabase.from("cap_table").update({ amount: numericValue }).eq("id", backer.id);
      } catch {
        toast.error("Failed to save amount.");
      }
    } else {
      onOwnershipChange(backer.id, numericValue);
      try {
        await (supabase.from("cap_table") as any).update({ ownership_pct: numericValue }).eq("id", backer.id);
      } catch {
        toast.error("Failed to save ownership.");
      }
    }
    setEditingField(null);
    setEditValue("");
  }, [editingField, editValue, backer.id, onOwnershipChange, onAmountChange]);

  const handleInstrumentSelect = useCallback(async (val: string) => {
    onInstrumentChange?.(backer.id, val);
    try {
      await supabase.from("cap_table").update({ instrument: val }).eq("id", backer.id);
    } catch {
      toast.error("Failed to save type.");
    }
  }, [backer.id, onInstrumentChange]);

  const handleRoundSelect = useCallback(async (val: string) => {
    onRoundChange?.(backer.id, val);
    try {
      await supabase.from("cap_table").update({ entity_type: val }).eq("id", backer.id);
    } catch {
      toast.error("Failed to save round.");
    }
  }, [backer.id, onRoundChange]);

  const isEven = index % 2 === 0;

  return (
    <tr
      className={`group/row transition-all duration-300 ${
        isHighlighted ? "bg-accent/10" : ""
      }`}
      style={!isHighlighted ? { background: isEven ? "hsl(var(--background))" : "hsl(var(--secondary))" } : undefined}
    >
      {/* Logo */}
      <td className="py-3.5 px-4">
        <Avatar className="h-8 w-8 shrink-0">
          {backer.logoUrl ? <AvatarImage src={backer.logoUrl} alt={backer.name} /> : null}
          <AvatarFallback
            className="text-[11px] font-semibold"
            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
          >
            {backer.logoLetter}
          </AvatarFallback>
        </Avatar>
      </td>

      {/* Investor */}
      <td className="py-3.5 px-4">
        <span className="text-sm font-medium text-foreground truncate">{backer.name}</span>
      </td>

      {/* Type (Instrument) — Combobox */}
      <td className="py-3.5 px-4">
        <InlineCellCombobox
          value={backer.instrument}
          options={INVESTMENT_TYPES}
          onSelect={handleInstrumentSelect}
        />
      </td>

      {/* Round — Combobox */}
      <td className="py-3.5 px-4">
        <InlineCellCombobox
          value={backer.date}
          options={FUNDING_ROUNDS}
          onSelect={handleRoundSelect}
        />
      </td>

      {/* Amount */}
      <td className="py-3.5 px-4">
        {editingField === "amount" ? (
          <div className="flex items-center gap-1">
            <Input
              id={`amount-input-${backer.id}`}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              placeholder="$0"
              className="h-7 w-24 text-xs font-mono rounded-lg border-border"
              autoFocus
              onKeyDown={e => e.key === "Enter" && confirmEdit()}
              type="number"
              min="0"
            />
            <button onClick={confirmEdit} className="text-accent"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={cancelEdit} className="text-muted-foreground"><X className="h-3 w-3" /></button>
          </div>
        ) : (
          <button onClick={startEditAmount} className="group/cost flex items-center gap-1">
            <span className="text-sm font-bold text-foreground font-mono">{backer.amountLabel}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/cost:opacity-100 transition-opacity" />
          </button>
        )}
      </td>
    </tr>
  );
}

import { useCallback, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InlineCellCombobox } from "./InlineCellCombobox";
import { InlineAmountInput, formatCompactCurrency } from "./InlineAmountInput";

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

export function CapTableRow({ backer, index, isHighlighted, formatCurrency, onAmountChange, onInstrumentChange, onRoundChange }: CapTableRowProps) {
  const [editing, setEditing] = useState(false);
  const isEven = index % 2 === 0;

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

  const handleAmountConfirm = useCallback(async (amount: number) => {
    onAmountChange(backer.id, amount);
    try {
      await supabase.from("cap_table").update({ amount }).eq("id", backer.id);
    } catch {
      toast.error("Failed to save amount.");
    }
  }, [backer.id, onAmountChange]);

  return (
    <tr
      className={`group/row transition-all duration-300 ${isHighlighted ? "bg-accent/10" : ""}`}
      style={!isHighlighted ? { background: isEven ? "hsl(var(--background))" : "hsl(var(--secondary))" } : undefined}
    >
      {/* Logo */}
      <td className="py-2 px-3">
        <Avatar className="h-7 w-7 shrink-0">
          {backer.logoUrl ? <AvatarImage src={backer.logoUrl} alt={backer.name} /> : null}
          <AvatarFallback
            className="text-[10px] font-semibold"
            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
          >
            {backer.logoLetter}
          </AvatarFallback>
        </Avatar>
      </td>

      {/* Investor */}
      <td className="py-2 px-3">
        <span className="text-sm font-medium text-foreground truncate block">{backer.name}</span>
      </td>

      {/* Type */}
      <td className="py-2 px-3">
        {editing ? (
          <InlineCellCombobox value={backer.instrument} options={INVESTMENT_TYPES} onSelect={handleInstrumentSelect} />
        ) : (
          <span className="text-sm text-muted-foreground truncate block">{backer.instrument}</span>
        )}
      </td>

      {/* Round */}
      <td className="py-2 px-3">
        {editing ? (
          <InlineCellCombobox value={backer.date} options={FUNDING_ROUNDS} onSelect={handleRoundSelect} />
        ) : (
          <span className="text-sm text-muted-foreground truncate block">{backer.date}</span>
        )}
      </td>

      {/* Amount */}
      <td className="py-2 px-3">
        {editing ? (
          <InlineAmountInput value={backer.amount} displayLabel="" backerId={backer.id} onConfirm={handleAmountConfirm} />
        ) : (
          <span className="text-sm font-bold text-foreground font-mono block">
            {backer.amount > 0 ? formatCompactCurrency(backer.amount) : "$0"}
          </span>
        )}
      </td>

      {/* Edit */}
      <td className="py-2 px-3">
        <button
          onClick={() => setEditing(!editing)}
          className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
            editing
              ? "bg-primary text-primary-foreground"
              : "border border-input text-muted-foreground hover:text-foreground hover:border-ring"
          }`}
        >
          <Pencil className="h-3 w-3" />
          {editing ? "Done" : "Edit"}
        </button>
      </td>
    </tr>
  );
}

import { useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

      {/* Type — Portal Combobox */}
      <td className="py-3.5 px-4">
        <InlineCellCombobox
          value={backer.instrument}
          options={INVESTMENT_TYPES}
          onSelect={handleInstrumentSelect}
        />
      </td>

      {/* Round — Portal Combobox */}
      <td className="py-3.5 px-4">
        <InlineCellCombobox
          value={backer.date}
          options={FUNDING_ROUNDS}
          onSelect={handleRoundSelect}
        />
      </td>

      {/* Amount — Smart Currency Input */}
      <td className="py-3.5 px-4">
        <InlineAmountInput
          value={backer.amount}
          displayLabel={backer.amount > 0 ? formatCompactCurrency(backer.amount) : "$0"}
          backerId={backer.id}
          onConfirm={handleAmountConfirm}
        />
      </td>
    </tr>
  );
}

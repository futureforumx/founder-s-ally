import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

/** Generate a short ID from the backer id */
function shortId(id: string): string {
  return `#TS-${id.slice(0, 4).toUpperCase()}`;
}

/** Format a date string into the transaction table style */
function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function CapTableRow({ backer, index, isHighlighted, formatCurrency, onOwnershipChange, onAmountChange }: CapTableRowProps) {
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

  const isEven = index % 2 === 0;
  const statusLabel = backer.amount > 0 ? "Success" : "Pending";
  const isSuccess = statusLabel === "Success";

  return (
    <tr
      className={`transition-all duration-300 ${
        isHighlighted ? "bg-accent/10" : ""
      }`}
      style={!isHighlighted ? { background: isEven ? "hsl(var(--background))" : "hsl(var(--secondary))" } : undefined}
    >
      {/* ID */}
      <td className="py-3.5 px-4">
        <span className="text-xs text-muted-foreground font-mono">{shortId(backer.id)}</span>
      </td>

      {/* Transaction (Avatar + Name) */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 shrink-0">
            {backer.logoUrl ? <AvatarImage src={backer.logoUrl} alt={backer.name} /> : null}
            <AvatarFallback
              className="text-[10px] font-semibold"
              style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
            >
              {backer.logoLetter}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-foreground truncate">{backer.name}</span>
        </div>
      </td>

      {/* Activity (Instrument) */}
      <td className="py-3.5 px-4">
        <span className="text-sm text-muted-foreground">{backer.instrument}</span>
      </td>

      {/* Date Time */}
      <td className="py-3.5 px-4">
        <span className="text-sm text-muted-foreground">{formatDateTime(backer.date)}</span>
      </td>

      {/* Cost (Amount) */}
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

      {/* Status */}
      <td className="py-3.5 px-4">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={
            isSuccess
              ? { background: "hsla(var(--success), 0.15)", color: "hsl(var(--success))" }
              : { background: "hsla(var(--warning), 0.15)", color: "hsl(var(--warning))" }
          }
        >
          {statusLabel}
        </span>
      </td>
    </tr>
  );
}

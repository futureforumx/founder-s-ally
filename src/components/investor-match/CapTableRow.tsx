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
  isHighlighted: boolean;
  formatCurrency: (n: number) => string;
  onOwnershipChange: (id: string, pct: number) => void;
  onAmountChange: (id: string, amount: number) => void;
}

export function CapTableRow({ backer, isHighlighted, formatCurrency, onOwnershipChange, onAmountChange }: CapTableRowProps) {
  const [editingField, setEditingField] = useState<"amount" | "ownership" | null>(null);
  const [editValue, setEditValue] = useState("");

  // Auto-enter edit mode when this row is highlighted (newly inserted)
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

  const startEditOwnership = () => {
    setEditingField("ownership");
    setEditValue(backer.ownershipPct > 0 ? String(backer.ownershipPct) : "");
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

  const handleOwnershipKeyStroke = (val: string) => {
    setEditValue(val);
    const pct = parseFloat(val) || 0;
    onOwnershipChange(backer.id, pct);
  };

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl px-4 py-3.5 transition-all duration-500 group ${
        isHighlighted ? "bg-accent/10" : "hover:bg-secondary/40"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-10 w-10 shrink-0">
          {backer.logoUrl ? <AvatarImage src={backer.logoUrl} alt={backer.name} /> : null}
          <AvatarFallback
            className="text-sm font-semibold"
            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
          >
            {backer.logoLetter}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{backer.name}</p>
          <p className="text-[11px] text-muted-foreground">{backer.instrument} · {backer.date}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {/* Ownership % */}
        <div className="flex items-center gap-1">
          {editingField === "ownership" ? (
            <div className="flex items-center gap-1">
              <Input
                value={editValue}
                onChange={e => handleOwnershipKeyStroke(e.target.value)}
                placeholder="0"
                className="h-8 w-20 text-sm font-mono rounded-xl text-right"
                autoFocus
                onKeyDown={e => e.key === "Enter" && confirmEdit()}
                type="number"
                min="0"
                max="100"
                step="0.01"
              />
              <span className="text-xs text-muted-foreground">%</span>
              <button onClick={confirmEdit} className="h-7 w-7 flex items-center justify-center rounded-lg" style={{ color: "hsl(var(--accent))" }}>
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={cancelEdit} className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={startEditOwnership}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group/own"
            >
              <span className="font-mono font-medium" style={{ fontFamily: "'Geist Mono', monospace" }}>
                {backer.ownershipPct > 0 ? `${backer.ownershipPct}%` : "—%"}
              </span>
              <Pencil className="h-3 w-3 opacity-0 group-hover/own:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Amount */}
        <div className="flex items-center gap-1.5">
          {editingField === "amount" ? (
            <div className="flex items-center gap-1.5">
              <Input
                id={`amount-input-${backer.id}`}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                placeholder="$0"
                className="h-8 w-28 text-sm font-mono rounded-xl"
                autoFocus
                onKeyDown={e => e.key === "Enter" && confirmEdit()}
                type="number"
                min="0"
              />
              <button onClick={confirmEdit} className="h-8 w-8 flex items-center justify-center rounded-xl" style={{ color: "hsl(var(--accent))" }}>
                <Check className="h-4 w-4" />
              </button>
              <button onClick={cancelEdit} className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <span className="text-base font-bold text-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>
                {backer.amountLabel}
              </span>
              <button
                onClick={startEditAmount}
                className="h-8 w-8 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground transition-all"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

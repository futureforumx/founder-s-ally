import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil, Check, X } from "lucide-react";

interface CapBacker {
  id: string;
  name: string;
  amount: number;
  amountLabel: string;
  instrument: string;
  logoLetter: string;
  date: string;
  logoUrl?: string;
}

interface CapTableRowProps {
  backer: CapBacker;
  isHighlighted: boolean;
  formatCurrency: (n: number) => string;
}

export function CapTableRow({ backer, isHighlighted, formatCurrency }: CapTableRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const startEdit = () => {
    setEditing(true);
    setEditValue(String(backer.amount));
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

      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              id={`amount-input-${backer.id}`}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              placeholder="$0"
              className="h-8 w-28 text-sm font-mono rounded-xl"
              autoFocus
              onKeyDown={e => e.key === "Enter" && setEditing(false)}
            />
            <button
              onClick={() => setEditing(false)}
              className="h-8 w-8 flex items-center justify-center rounded-xl transition-colors"
              style={{ color: "hsl(var(--accent))" }}
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-base font-bold text-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>
              {backer.amountLabel}
            </span>
            <button
              onClick={startEdit}
              className="h-8 w-8 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground transition-all"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

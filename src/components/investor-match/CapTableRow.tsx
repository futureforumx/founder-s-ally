import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCompactCurrency } from "./InlineAmountInput";

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
  slogan?: string;
  website?: string;
}

interface CapTableRowProps {
  backer: CapBacker;
  index: number;
  isHighlighted: boolean;
  onClick: () => void;
}

export function CapTableRow({ backer, index, isHighlighted, onClick }: CapTableRowProps) {
  const isEven = index % 2 === 0;

  return (
    <tr
      onClick={onClick}
      className={`group/row cursor-pointer transition-colors hover:bg-secondary/60 ${isHighlighted ? "bg-accent/10" : ""}`}
      style={!isHighlighted ? { background: isEven ? "hsl(var(--background))" : "hsl(var(--secondary))" } : undefined}
    >
      {/* Logo */}
      <td className="py-2.5 px-3">
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
      <td className="py-2.5 px-3">
        <span className="text-sm font-medium text-foreground truncate block">{backer.name}</span>
      </td>

      {/* Round */}
      <td className="py-2.5 px-3">
        <span className="text-sm text-muted-foreground truncate block">{backer.date}</span>
      </td>

      {/* Type */}
      <td className="py-2.5 px-3">
        <span className="text-sm text-muted-foreground truncate block">{backer.instrument}</span>
      </td>

      {/* Amount */}
      <td className="py-2.5 px-3">
        <span className="text-sm font-bold text-foreground font-mono block">
          {backer.amount > 0 ? formatCompactCurrency(backer.amount) : "$0"}
        </span>
      </td>
    </tr>
  );
}

import { CheckCircle2, Building2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCapTable } from "@/hooks/useCapTable";
import { formatCompactCurrency } from "@/components/investor-match/InlineAmountInput";
import { Skeleton } from "@/components/ui/skeleton";

export function InvestorsTab() {
  const { backers, loading, totalRaised, formatCurrency } = useCapTable();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (backers.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">No investors added yet.</p>
        <p className="text-[10px] text-muted-foreground/60">
          Add investors via your Company Profile or the Investors hub.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {totalRaised > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {backers.length} investor{backers.length !== 1 ? "s" : ""}
          </span>
          <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0.5">
            {formatCurrency(totalRaised)} raised
          </Badge>
        </div>
      )}

      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Your Investors</h4>
        <div className="space-y-2">
          {backers.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:border-accent/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 rounded-lg border border-border">
                  <AvatarFallback className="text-xs font-bold rounded-lg bg-secondary text-foreground">
                    {b.logoLetter}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{b.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {b.instrument && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {b.instrument.split("(")[0].trim()}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {b.amount > 0 ? formatCompactCurrency(b.amount) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Managed from your Company Profile and Investors hub.
      </p>
    </div>
  );
}

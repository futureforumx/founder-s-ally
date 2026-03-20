import { CheckCircle2, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Investor {
  name: string;
  verified: boolean;
  type: string;
}

const MOCK_INVESTORS: Investor[] = [
  { name: "Y Combinator", verified: true, type: "Accelerator" },
  { name: "Seedcamp", verified: true, type: "Seed VC" },
  { name: "Sequoia Scout", verified: false, type: "Scout Program" },
  { name: "a16z", verified: false, type: "Growth VC" },
];

export function InvestorsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Known Investors</h4>
        <div className="space-y-2">
          {MOCK_INVESTORS.map((inv) => (
            <div
              key={inv.name}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:border-accent/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary border border-border">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{inv.name}</span>
                    {inv.verified && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent fill-accent/20" />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{inv.type}</span>
                </div>
              </div>
              {inv.verified && (
                <Badge variant="outline" className="text-[9px] px-2 py-0.5 border-accent/20 text-accent">
                  Deck verified
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Investor data sourced from pitch decks, public filings, and news mentions.
      </p>
    </div>
  );
}

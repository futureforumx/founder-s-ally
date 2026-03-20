import { DollarSign, Target, Layers, PieChart } from "lucide-react";
import { QuickFact } from "../founder-detail/QuickFact";

interface InvestorQuickFactsProps {
  checkSize: string;
  stageFocus: string;
}

export function InvestorQuickFacts({ checkSize, stageFocus }: InvestorQuickFactsProps) {
  return (
    <div>
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">Quick Facts</h4>
      <div className="grid grid-cols-2 gap-2">
        <QuickFact icon={DollarSign} label="AUM / Fund Size" value="$85B AUM" />
        <QuickFact icon={Target} label="Check Size" value={checkSize || "$1M - $5M Sweet Spot"} />
        <QuickFact icon={Layers} label="Stage Focus" value={stageFocus || "Pre-Seed to Series A"} />
        <QuickFact icon={PieChart} label="Target Ownership" value="15 - 20%" />
      </div>
    </div>
  );
}

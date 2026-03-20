import { Sparkles } from "lucide-react";

interface InvestorAIInsightProps {
  firmName: string;
}

export function InvestorAIInsight({ firmName }: InvestorAIInsightProps) {
  return (
    <div className="rounded-xl border border-emerald-500/20 p-3.5" style={{ background: "linear-gradient(135deg, hsl(45 80% 55% / 0.08), hsl(160 60% 45% / 0.06))" }}>
      <div className="flex gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "hsl(45 80% 50%)" }} />
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: "hsl(160 60% 40%)" }}>
            AI Insight
          </p>
          <p className="text-xs text-foreground leading-relaxed">
            <strong>{firmName}'s</strong> latest fund has a specific allocation for B2B SaaS in California.
            Your current traction puts you in their <strong>top 10% target strike zone</strong>.
            Mention your LTV/CAC ratio when connecting.
          </p>
        </div>
      </div>
    </div>
  );
}

import { Sparkles } from "lucide-react";

interface InvestorAIInsightProps {
  firmName: string;
  matchScore?: number;
}

export function InvestorAIInsight({ firmName, matchScore }: InvestorAIInsightProps) {
  return (
    <div className="rounded-xl border border-emerald-500/20 p-3.5" style={{ background: "linear-gradient(135deg, hsl(45 80% 55% / 0.08), hsl(160 60% 45% / 0.06))" }}>
      <div className="flex gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "hsl(45 80% 50%)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: "hsl(160 60% 40%)" }}>
            Compatibility
          </p>
          <p className="text-xs text-foreground leading-relaxed">
            <strong>{firmName}'s</strong> latest fund has a specific allocation for B2B SaaS in California.
            Your current traction puts you in their <strong>top 10% target strike zone</strong>.
            Mention your LTV/CAC ratio when connecting.
          </p>
        </div>
        {matchScore != null && (
          <div className="flex flex-col items-center justify-center shrink-0 ml-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-2"
              style={{
                borderColor: matchScore >= 80 ? "hsl(160 60% 45%)" : matchScore >= 60 ? "hsl(45 80% 50%)" : "hsl(var(--muted-foreground))",
                background: matchScore >= 80 ? "hsl(160 60% 45% / 0.1)" : matchScore >= 60 ? "hsl(45 80% 50% / 0.1)" : "hsl(var(--muted) / 0.3)",
              }}
            >
              <span
                className="text-sm font-bold"
                style={{
                  color: matchScore >= 80 ? "hsl(160 60% 40%)" : matchScore >= 60 ? "hsl(45 80% 45%)" : "hsl(var(--muted-foreground))",
                }}
              >
                {matchScore}%
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground mt-1">match</span>
          </div>
        )}
      </div>
    </div>
  );
}

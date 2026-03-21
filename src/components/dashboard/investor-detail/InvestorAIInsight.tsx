import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CompanyContext {
  name?: string;
  sector?: string;
  stage?: string;
  model?: string;
  description?: string;
}

interface InvestorContext {
  name: string;
  description?: string;
  stage?: string;
  sector?: string;
  checkSize?: string;
  recentDeals?: string;
  currentThesis?: string;
  geography?: string;
  source?: string;
}

interface InvestorAIInsightProps {
  firmName: string;
  matchScore?: number;
  companyContext?: CompanyContext | null;
  investorContext?: InvestorContext | null;
}

export function InvestorAIInsight({ firmName, matchScore, companyContext, investorContext }: InvestorAIInsightProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!companyContext?.name || !firmName) return;

    const cacheKey = `compat_${firmName.toLowerCase().trim()}_${companyContext.name.toLowerCase().trim()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setInsight(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("investor-compatibility", {
          body: {
            investorName: firmName,
            investorDescription: investorContext?.description || "",
            investorStage: investorContext?.stage || "",
            investorSector: investorContext?.sector || "",
            investorCheckSize: investorContext?.checkSize || "",
            companyName: companyContext.name,
            companySector: companyContext.sector || "",
            companyStage: companyContext.stage || "",
            companyModel: companyContext.model || "",
            companyDescription: companyContext.description || "",
            matchScore,
          },
        });

        if (cancelled) return;

        if (fnError) {
          console.error("Compatibility insight error:", fnError);
          setError(true);
        } else if (data?.insight) {
          setInsight(data.insight);
          sessionStorage.setItem(cacheKey, data.insight);
        } else {
          setError(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Compatibility fetch failed:", e);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [firmName, companyContext?.name]);

  const fallbackText = `${firmName}'s latest fund has a specific allocation for B2B SaaS in California. Your current traction puts you in their top 10% target strike zone. Mention your LTV/CAC ratio when connecting.`;

  const displayText = insight || (error ? fallbackText : null);

  return (
    <div className="rounded-xl border border-emerald-500/20 p-3.5" style={{ background: "linear-gradient(135deg, hsl(45 80% 55% / 0.08), hsl(160 60% 45% / 0.06))" }}>
      <div className="flex gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "hsl(45 80% 50%)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: "hsl(160 60% 40%)" }}>
            Compatibility
          </p>
          {loading ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Analyzing compatibility…</span>
            </div>
          ) : displayText ? (
            <p className="text-xs text-foreground leading-relaxed">{displayText}</p>
          ) : null}
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

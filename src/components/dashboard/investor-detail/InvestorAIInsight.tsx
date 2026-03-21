import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
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

interface InsightItem {
  type: "match" | "warning";
  label: string;
  detail: string;
}

function parseInsightItems(text: string): InsightItem[] {
  // Try to extract bullet-point style items from AI response
  const lines = text.split(/[.!]\s+/).filter(l => l.trim().length > 10);
  const items: InsightItem[] = [];
  
  for (const line of lines.slice(0, 3)) {
    const trimmed = line.trim();
    const isWarning = /however|but|caution|risk|nuance|concern|challenge|careful|narrow|broad/i.test(trimmed);
    items.push({
      type: isWarning ? "warning" : "match",
      label: isWarning ? "Consideration" : "Alignment",
      detail: trimmed.replace(/^[-•*]\s*/, ""),
    });
  }
  
  return items.length > 0 ? items : [];
}

const FALLBACK_ITEMS: InsightItem[] = [
  { type: "match", label: "Sweet Spot Match", detail: "Their $1M–$50M range aligns with your Seed ask." },
  { type: "match", label: "Stage Alignment", detail: "Active focus on Pre-Seed and Seed rounds." },
  { type: "warning", label: "Sector Nuance", detail: "Broad focus — emphasize your unique differentiation early." },
];

export function InvestorAIInsightBanner({ firmName, matchScore, companyContext, investorContext }: InvestorAIInsightProps) {
  const [items, setItems] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!companyContext?.name || !firmName) return;

    const cacheKey = `compat_${firmName.toLowerCase().trim()}_${companyContext.name.toLowerCase().trim()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = parseInsightItems(cached);
      setItems(parsed.length > 0 ? parsed : FALLBACK_ITEMS);
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
            investorRecentDeals: investorContext?.recentDeals || "",
            investorThesis: investorContext?.currentThesis || "",
            investorGeography: investorContext?.geography || "",
            enrichmentSource: investorContext?.source || "",
            companyName: companyContext.name,
            companySector: companyContext.sector || "",
            companyStage: companyContext.stage || "",
            companyModel: companyContext.model || "",
            companyDescription: companyContext.description || "",
            matchScore,
          },
        });

        if (cancelled) return;

        if (fnError || !data?.insight) {
          setError(true);
          setItems(FALLBACK_ITEMS);
        } else {
          sessionStorage.setItem(cacheKey, data.insight);
          const parsed = parseInsightItems(data.insight);
          setItems(parsed.length > 0 ? parsed : FALLBACK_ITEMS);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setItems(FALLBACK_ITEMS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [firmName, companyContext?.name]);

  // Show fallback if no company context
  const displayItems = items.length > 0 ? items : FALLBACK_ITEMS;

  return (
    <div className="w-full rounded-xl border border-success/20 p-4 relative overflow-hidden" style={{ background: "linear-gradient(to right, hsl(var(--success) / 0.04), hsl(var(--secondary) / 0.5))" }}>
      <div className="flex items-center gap-1.5 mb-3">
        <Sparkles className="h-3 w-3 text-success" />
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          AI Compatibility Analysis
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Analyzing compatibility…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {displayItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              {item.type === "match" ? (
                <CheckCircle className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className={`text-[10px] font-bold uppercase tracking-wide ${item.type === "match" ? "text-success" : "text-warning"}`}>
                  {item.label}
                </span>
                <p className="text-xs text-foreground leading-relaxed mt-0.5">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

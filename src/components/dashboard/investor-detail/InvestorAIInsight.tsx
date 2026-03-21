import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle, AlertTriangle, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

interface MatchScoreDropdownProps {
  matchScore: number;
  firmName: string;
  companyContext?: CompanyContext | null;
  investorContext?: InvestorContext | null;
}

interface InsightItem {
  type: "match" | "warning";
  label: string;
  detail: string;
}

const FALLBACK_ITEMS: InsightItem[] = [
  { type: "match", label: "Sweet Spot Match", detail: "Their $1M–$50M range aligns with your Seed ask." },
  { type: "match", label: "Stage Alignment", detail: "Active focus on Pre-Seed and Seed rounds." },
  { type: "warning", label: "Sector Nuance", detail: "Broad focus — emphasize your unique differentiation early." },
];

function useCompatibilityInsights(firmName: string, companyContext?: CompanyContext | null, investorContext?: InvestorContext | null, matchScore?: number) {
  const [items, setItems] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyContext?.name || !firmName) {
      setItems(FALLBACK_ITEMS);
      return;
    }

    const cacheKey = `compat_v2_${firmName.toLowerCase().trim()}_${companyContext.name.toLowerCase().trim()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) { setItems(parsed); return; }
      } catch { /* fall through */ }
    }

    let cancelled = false;
    setLoading(true);

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

        if (!fnError && data?.criteria && Array.isArray(data.criteria) && data.criteria.length > 0) {
          const validated: InsightItem[] = data.criteria
            .filter((c: any) => c.type && c.label && c.detail)
            .map((c: any) => ({
              type: c.type === "warning" ? "warning" as const : "match" as const,
              label: c.label,
              detail: c.detail,
            }));
          if (validated.length > 0) {
            setItems(validated);
            sessionStorage.setItem(cacheKey, JSON.stringify(validated));
            return;
          }
        }
        setItems(FALLBACK_ITEMS);
      } catch {
        if (!cancelled) setItems(FALLBACK_ITEMS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [firmName, companyContext?.name]);

  return { items: items.length > 0 ? items : FALLBACK_ITEMS, loading };
}

export function MatchScoreDropdown({ matchScore, firmName, companyContext, investorContext }: MatchScoreDropdownProps) {
  const { items, loading } = useCompatibilityInsights(firmName, companyContext, investorContext, matchScore);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1 bg-success/10 border border-success/20 text-success rounded-full text-sm font-bold cursor-pointer hover:bg-success/15 transition-colors shrink-0">
          <Sparkles className="w-3 h-3" />
          {matchScore}% Match
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4 rounded-xl shadow-xl border border-border">
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
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {item.type === "match" ? (
                  <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${item.type === "match" ? "text-success" : "text-warning"}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Keep legacy export for backwards compat (unused now but safe)
export function InvestorAIInsightBanner(props: { firmName: string; matchScore?: number; companyContext?: CompanyContext | null; investorContext?: InvestorContext | null }) {
  return <MatchScoreDropdown matchScore={props.matchScore || 0} firmName={props.firmName} companyContext={props.companyContext} investorContext={props.investorContext} />;
}

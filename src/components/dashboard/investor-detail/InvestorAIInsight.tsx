import { useState, useEffect, useMemo } from "react";
import { Sparkles, Loader2, ChevronDown, Globe, Layers, MapPin, User } from "lucide-react";
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

interface BreakdownItem {
  category: "sector" | "stage" | "geography" | "profile";
  score: number;
  type: "match" | "warning";
  detail: string;
}

const CATEGORY_META: Record<string, { icon: typeof Globe; label: string }> = {
  sector: { icon: Globe, label: "Sector" },
  stage: { icon: Layers, label: "Stage" },
  geography: { icon: MapPin, label: "Geography" },
  profile: { icon: User, label: "Profile" },
};

const FALLBACK_BREAKDOWN: BreakdownItem[] = [
  { category: "sector", score: 88, type: "match", detail: "Strong overlap in thesis verticals" },
  { category: "stage", score: 95, type: "match", detail: "Active in your target stage" },
  { category: "geography", score: 78, type: "match", detail: "Invests in your region" },
  { category: "profile", score: 82, type: "match", detail: "Aligned check size and model fit" },
];

function scoreColor(s: number) {
  if (s >= 85) return "text-success";
  if (s >= 65) return "text-warning";
  return "text-destructive";
}

function scoreBg(s: number) {
  if (s >= 85) return "bg-success/10";
  if (s >= 65) return "bg-warning/10";
  return "bg-destructive/10";
}

function useMatchBreakdown(firmName: string, companyContext?: CompanyContext | null, investorContext?: InvestorContext | null, matchScore?: number) {
  const [items, setItems] = useState<BreakdownItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyContext?.name || !firmName) {
      setItems(FALLBACK_BREAKDOWN);
      return;
    }

    const cacheKey = `match_bd_v3_${firmName.toLowerCase().trim()}_${companyContext.name.toLowerCase().trim()}`;
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

        // Use the new breakdown format from the edge function
        if (!fnError && data?.breakdown && Array.isArray(data.breakdown) && data.breakdown.length > 0) {
          const validated: BreakdownItem[] = data.breakdown
            .filter((c: any) => c.category && c.detail && typeof c.score === "number")
            .map((c: any) => ({
              category: (["sector", "stage", "geography", "profile"].includes(c.category) ? c.category : "profile") as BreakdownItem["category"],
              score: Math.max(0, Math.min(100, Math.round(c.score))),
              type: c.score >= 70 ? "match" as const : "warning" as const,
              detail: c.detail,
            }));

          // Ensure all 4 categories are present
          const cats: BreakdownItem["category"][] = ["sector", "stage", "geography", "profile"];
          const result = cats.map(cat => {
            const found = validated.find(v => v.category === cat);
            return found || FALLBACK_BREAKDOWN.find(f => f.category === cat)!;
          });

          setItems(result);
          sessionStorage.setItem(cacheKey, JSON.stringify(result));
          return;
        }

        // Fallback: try legacy criteria format
        if (!fnError && data?.criteria && Array.isArray(data.criteria)) {
          const categoryMap: Record<string, BreakdownItem> = {};
          for (const c of data.criteria) {
            const lbl = (c.label || "").toLowerCase();
            let cat: BreakdownItem["category"] = "profile";
            if (lbl.includes("sector") || lbl.includes("vertical") || lbl.includes("thesis")) cat = "sector";
            else if (lbl.includes("stage") || lbl.includes("round")) cat = "stage";
            else if (lbl.includes("geo") || lbl.includes("location") || lbl.includes("region")) cat = "geography";
            categoryMap[cat] = {
              category: cat,
              score: c.type === "match" ? 85 : 60,
              type: c.type === "match" ? "match" : "warning",
              detail: c.detail,
            };
          }
          const cats: BreakdownItem["category"][] = ["sector", "stage", "geography", "profile"];
          const result = cats.map(cat => categoryMap[cat] || FALLBACK_BREAKDOWN.find(f => f.category === cat)!);
          setItems(result);
          sessionStorage.setItem(cacheKey, JSON.stringify(result));
          return;
        }

        setItems(FALLBACK_BREAKDOWN);
      } catch {
        if (!cancelled) setItems(FALLBACK_BREAKDOWN);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [firmName, companyContext?.name]);

  return { items: items.length > 0 ? items : FALLBACK_BREAKDOWN, loading };
}

export function MatchScoreDropdown({ matchScore, firmName, companyContext, investorContext }: MatchScoreDropdownProps) {
  const { items, loading } = useMatchBreakdown(firmName, companyContext, investorContext, matchScore);

  const avg = useMemo(() => {
    if (!items.length) return matchScore;
    return Math.round(items.reduce((s, i) => s + i.score, 0) / items.length);
  }, [items, matchScore]);

  const displayScore = avg || matchScore;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex flex-col items-center justify-center gap-0.5 h-16 w-20 rounded-xl bg-success/10 border border-success/20 cursor-pointer hover:bg-success/15 transition-colors shrink-0">
          <span className={`text-2xl font-black leading-none ${scoreColor(displayScore)}`}>{displayScore}</span>
          <span className="text-[8px] font-semibold text-success/80 uppercase tracking-wider flex items-center gap-0.5">
            Match <ChevronDown className="w-2 h-2" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 rounded-xl shadow-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 border-b border-border bg-secondary/30">
          <Sparkles className="h-3 w-3 text-success" />
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            Match Breakdown
          </span>
          <span className={`ml-auto text-sm font-black ${scoreColor(displayScore)}`}>{displayScore}%</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Analyzing compatibility…</span>
          </div>
        ) : (
          <div className="p-3 space-y-1.5">
            {items.map((item) => {
              const meta = CATEGORY_META[item.category];
              const Icon = meta.icon;
              return (
                <div key={item.category} className={`flex items-center gap-3 p-2.5 rounded-lg ${scoreBg(item.score)} transition-colors`}>
                  <Icon className={`w-4 h-4 shrink-0 ${scoreColor(item.score)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                      <span className={`text-xs font-black ${scoreColor(item.score)}`}>{item.score}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">{item.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Legacy export
export function InvestorAIInsightBanner(props: { firmName: string; matchScore?: number; companyContext?: CompanyContext | null; investorContext?: InvestorContext | null }) {
  return <MatchScoreDropdown matchScore={props.matchScore || 0} firmName={props.firmName} companyContext={props.companyContext} investorContext={props.investorContext} />;
}

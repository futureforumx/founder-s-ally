import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { SectorClassification } from "@/components/SectorTags";
import { supabase } from "@/integrations/supabase/client";
import { CompanyData, AnalysisResult } from "@/components/CompanyProfile";
import { Lock } from "lucide-react";
import { IntelligenceCards } from "@/components/investor-match/IntelligenceCards";
import { UpdatesTab } from "@/components/investor-match/UpdatesTab";
import { MatchesTab } from "@/components/investor-match/MatchesTab";
import { ActivityTab } from "@/components/investor-match/ActivityTab";
import { ManageTab } from "@/components/investor-match/ManageTab";
import { useInvestorEnrich, EnrichResult } from "@/hooks/useInvestorEnrich";
import { TimeRangeControl, TimeRange } from "@/components/investor-match/TimeRangeControl";

// ── Types ──

interface Investor {
  id: string;
  firm_name: string;
  lead_partner: string | null;
  thesis_verticals: string[];
  preferred_stage: string | null;
  min_check_size: number;
  max_check_size: number;
  recent_deals: string[];
  location: string | null;
  lead_or_follow: string | null;
  ca_sb54_compliant: boolean;
  market_sentiment: string | null;
  sentiment_detail: string | null;
}

interface ScoredInvestor extends Investor {
  score: number;
  reasoning: string;
  coInvestLink: string | null;
}

interface CapBacker {
  id: string;
  name: string;
  amount: number;
  amountLabel: string;
  instrument: string;
  logoLetter: string;
  date: string;
  ownershipPct: number;
}

type TabKey = "updates" | "matches" | "activity" | "manage";

const TABS: { key: TabKey; label: string }[] = [
  { key: "updates", label: "Updates" },
  { key: "matches", label: "Matches" },
  { key: "activity", label: "Activity" },
  { key: "manage", label: "Manage" },
];

// ── Helpers ──

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : n > 0 ? `$${n}` : "$0";

function formatCheckSize(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function useCountUp(target: number, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (target === prevTarget.current) return;
    const start = prevTarget.current;
    prevTarget.current = target;
    const diff = target - start;
    if (diff === 0) { setDisplay(target); return; }
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return display;
}

function computeScore(
  investor: Investor,
  company: CompanyData | null,
  analysis: AnalysisResult | null,
  sectorClass: SectorClassification | null,
  confirmedBackers: CapBacker[]
): ScoredInvestor {
  let score = 0;
  const reasons: string[] = [];
  let coInvestLink: string | null = null;

  if (sectorClass?.modern_tags?.length) {
    const tagMatches = investor.thesis_verticals.filter(v =>
      sectorClass.modern_tags.some(tag => {
        const tLow = tag.toLowerCase();
        const vLow = v.toLowerCase();
        return vLow.includes(tLow) || tLow.includes(vLow) ||
          tLow.split(/[\s\-\/]/).some(w => w.length > 2 && vLow.includes(w)) ||
          vLow.split(/[\s\-\/]/).some(w => w.length > 2 && tLow.includes(w));
      })
    );
    if (tagMatches.length > 0) {
      score += Math.min(tagMatches.length * 25, 50);
      reasons.push(`niche tag match: ${tagMatches.slice(0, 2).join(", ")}`);
    }
  }

  const sectorToMatch = sectorClass?.primary_sector || company?.sector;
  if (sectorToMatch && investor.thesis_verticals.some(v => {
    const vLow = v.toLowerCase();
    const sLow = sectorToMatch.toLowerCase();
    return vLow === sLow || vLow.includes(sLow) || sLow.includes(vLow);
  })) {
    score += score > 0 ? 20 : 40;
    reasons.push(`${sectorToMatch} focus`);
  }

  if (analysis?.metrics?.mrr?.value) {
    const mrr = parseFloat(analysis.metrics.mrr.value.replace(/[^0-9.]/g, ""));
    if (!isNaN(mrr)) {
      const annualized = mrr * 12;
      if (annualized >= investor.min_check_size * 0.01 && annualized <= investor.max_check_size * 2) {
        score += 30;
        reasons.push(`MRR aligns with ${formatCheckSize(investor.min_check_size)}–${formatCheckSize(investor.max_check_size)} range`);
      }
    }
  }

  if (company?.stage && investor.preferred_stage === company.stage) {
    score += 10;
    reasons.push(`${company.stage} stage fit`);
  }

  if (confirmedBackers.length > 0) {
    const backerName = confirmedBackers[0]?.name;
    if (backerName && investor.recent_deals.some(d => d.toLowerCase().includes(backerName.toLowerCase().split(" ")[0]))) {
      score += 15;
      coInvestLink = backerName;
      reasons.push(`co-invests with ${backerName}`);
    }
  }

  const reasoning = reasons.length > 0
    ? reasons.join(" · ")
    : "Limited data overlap — update your profile for better matches";

  return { ...investor, score: Math.min(score, 100), reasoning, coInvestLink };
}

// ── Main Component ──

interface InvestorMatchProps {
  companyData: CompanyData | null;
  analysisResult: AnalysisResult | null;
  sectorClassification?: SectorClassification | null;
  isLocked?: boolean;
}

export function InvestorMatch({ companyData, analysisResult, sectorClassification, isLocked }: InvestorMatchProps) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmedBackers, setConfirmedBackers] = useState<CapBacker[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("updates");
  const { enrich, cache: enrichCache } = useInvestorEnrich();
  const [enrichedData, setEnrichedData] = useState<Record<string, EnrichResult>>({});
  const [enrichingKeys, setEnrichingKeys] = useState<Set<string>>(new Set());

  const totalRaised = useMemo(() => confirmedBackers.reduce((sum, b) => sum + b.amount, 0), [confirmedBackers]);
  const animatedTotal = useCountUp(totalRaised);

  const backerNames = confirmedBackers.map(b => b.name);
  const bannerText = backerNames.length > 0
    ? `Your matches are actively optimizing based on co-investment patterns with your current backers (${backerNames.join(" & ")}).`
    : "Complete your company profile and cap table to unlock AI-driven investor matching.";

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("investor_database").select("*");
      if (!error && data) setInvestors(data as unknown as Investor[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("cap_table").select("*").eq("user_id", user.id);
      if (data) {
        setConfirmedBackers(
          data.map(row => ({
            id: row.id,
            name: row.investor_name,
            amount: row.amount,
            amountLabel: fmt(row.amount),
            instrument: row.instrument,
            logoLetter: row.investor_name.charAt(0).toUpperCase(),
            date: row.date || row.created_at,
            ownershipPct: (row as any).ownership_pct ?? 0,
          }))
        );
      }
    })();
  }, []);

  const scoredInvestors = useMemo(() => {
    return investors
      .map(inv => computeScore(inv, companyData, analysisResult, sectorClassification || null, confirmedBackers))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [investors, companyData, analysisResult, sectorClassification, confirmedBackers]);

  // Enrich top investors via waterfall
  useEffect(() => {
    if (scoredInvestors.length === 0) return;
    const top5 = scoredInvestors.slice(0, 5);
    top5.forEach(async (inv) => {
      const key = inv.firm_name.toLowerCase().trim();
      if (enrichedData[key]) return;
      setEnrichingKeys(prev => new Set(prev).add(key));
      const result = await enrich(inv.firm_name);
      setEnrichingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (result) {
        setEnrichedData(prev => ({ ...prev, [key]: result }));
      }
    });
  }, [scoredInvestors]);

  // Enrich cap table backers for metadata in the edit sheet
  useEffect(() => {
    if (confirmedBackers.length === 0) return;
    confirmedBackers.forEach(async (b) => {
      const key = b.name.toLowerCase().trim();
      if (enrichCache[key]) return;
      await enrich(b.name);
    });
  }, [confirmedBackers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Loading investor database…
      </div>
    );
  }

  return (
    <div className="relative">
      {isLocked && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-4 shadow-sm">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Confirm your Company Profile to unlock</p>
              <p className="text-xs text-muted-foreground">Investor matching requires a verified profile</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Investor Match</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-driven investor discovery based on your profile and current cap table.
        </p>
      </div>

      {/* Intelligence Cards */}
      <IntelligenceCards
        matchCount={scoredInvestors.length}
        animatedTotal={animatedTotal}
        totalRaised={totalRaised}
        sectorClassification={sectorClassification}
        companyData={companyData}
        formatCurrency={fmt}
      />

      {/* Sticky Tab Bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm -mx-1 px-1 mb-6">
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors duration-200 ${
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "updates" && <UpdatesTab topMatches={scoredInvestors} enrichedData={enrichedData} enrichingKeys={enrichingKeys} />}
      {activeTab === "matches" && <MatchesTab scoredInvestors={scoredInvestors} bannerText={bannerText} enrichedData={enrichedData} enrichingKeys={enrichingKeys} />}
      {activeTab === "activity" && <ActivityTab />}
      {activeTab === "manage" && (
        <ManageTab
          confirmedBackers={confirmedBackers}
          totalRaised={totalRaised}
          formatCurrency={fmt}
          enrichCache={enrichCache}
        />
      )}
    </div>
  );
}

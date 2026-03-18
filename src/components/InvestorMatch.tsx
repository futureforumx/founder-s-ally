import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CompanyData, AnalysisResult } from "@/components/CompanyProfile";
import {
  Users, MapPin, DollarSign, TrendingUp, Shield, Send,
  Activity, Pause, RefreshCw, ChevronDown, ChevronUp, Filter
} from "lucide-react";

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
}

function formatCheckSize(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function computeScore(investor: Investor, company: CompanyData | null, analysis: AnalysisResult | null): ScoredInvestor {
  let score = 0;
  const reasons: string[] = [];

  // Sector match → +40
  if (company?.sector && investor.thesis_verticals.some(v => v === company.sector)) {
    score += 40;
    reasons.push(`${company.sector} focus`);
  }

  // MRR within check range → +30
  if (analysis?.metrics?.mrr?.value) {
    const mrrStr = analysis.metrics.mrr.value.replace(/[^0-9.]/g, "");
    const mrr = parseFloat(mrrStr);
    if (!isNaN(mrr)) {
      const annualized = mrr * 12;
      // Rough heuristic: if annualized revenue is within 0.5x-5x of check size range
      if (annualized >= investor.min_check_size * 0.01 && annualized <= investor.max_check_size * 2) {
        score += 30;
        reasons.push(`MRR aligns with ${formatCheckSize(investor.min_check_size)}–${formatCheckSize(investor.max_check_size)} range`);
      }
    }
  }

  // Burn multiple < 1.5x → +20
  if (analysis?.metrics?.burnRate?.value) {
    const burnStr = analysis.metrics.burnRate.value.replace(/[^0-9.]/g, "");
    const burn = parseFloat(burnStr);
    if (!isNaN(burn) && burn > 0) {
      const mrrStr = analysis?.metrics?.mrr?.value?.replace(/[^0-9.]/g, "") || "0";
      const mrr = parseFloat(mrrStr);
      if (mrr > 0) {
        const burnMultiple = burn / mrr;
        if (burnMultiple < 1.5) {
          score += 20;
          reasons.push("efficient burn multiple");
        }
      }
    }
  }

  // Stage match → +10 bonus
  if (company?.stage && investor.preferred_stage === company.stage) {
    score += 10;
    reasons.push(`${company.stage} stage fit`);
  }

  // Location bonus (simplified)
  if (company?.description?.toLowerCase().includes("san francisco") && investor.location?.includes("San Francisco")) {
    score += 10;
    reasons.push("Bay Area proximity");
  }

  const reasoning = reasons.length > 0
    ? `Matches your ${reasons.join(" and ")}`
    : "Limited data overlap — consider updating your company profile";

  return { ...investor, score: Math.min(score, 100), reasoning };
}

function CompatibilityMeter({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "hsl(var(--success))" : score >= 40 ? "hsl(var(--accent))" : "hsl(var(--destructive))";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
        <circle
          cx="36" cy="36" r={radius} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-sm font-semibold" style={{ color }}>{score}</span>
    </div>
  );
}

function SentimentBadge({ sentiment, detail }: { sentiment: string | null; detail: string | null }) {
  const config: Record<string, { icon: typeof Activity; className: string }> = {
    Active: { icon: Activity, className: "bg-success/10 text-success border-success/20" },
    Paused: { icon: Pause, className: "bg-destructive/10 text-destructive border-destructive/20" },
    "Thesis-Shifting": { icon: RefreshCw, className: "bg-accent/10 text-accent border-accent/20" },
  };
  const c = config[sentiment || "Active"] || config.Active;
  const Icon = c.icon;

  return (
    <div className="group relative">
      <Badge variant="outline" className={`gap-1 text-[10px] ${c.className}`}>
        <Icon className="h-3 w-3" />
        {sentiment}
      </Badge>
      {detail && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 hidden w-56 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg group-hover:block">
          {detail}
        </div>
      )}
    </div>
  );
}

function InvestorCard({ investor, healthScore, companyName }: { investor: ScoredInvestor; healthScore?: number; companyName?: string }) {
  const [expanded, setExpanded] = useState(false);

  const introBlurb = `Hi ${investor.lead_partner || "there"},\n\nI'm the founder of ${companyName || "our company"}${healthScore ? ` (Health Score: ${healthScore}/100)` : ""}. We're building in ${investor.thesis_verticals[0] || "your thesis area"} and believe our traction aligns well with ${investor.firm_name}'s investment thesis. Would love to connect for a brief intro call.\n\nBest regards`;

  return (
    <Card className="surface-card-hover">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <CompatibilityMeter score={investor.score} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">{investor.firm_name}</h3>
              <SentimentBadge sentiment={investor.market_sentiment} detail={investor.sentiment_detail} />
              {investor.ca_sb54_compliant && (
                <Badge variant="outline" className="gap-1 text-[10px] border-success/30 text-success bg-success/5">
                  <Shield className="h-3 w-3" /> CA SB 54
                </Badge>
              )}
            </div>
            {investor.lead_partner && (
              <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> {investor.lead_partner} · {investor.lead_or_follow}
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground italic">"{investor.reasoning}"</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {investor.thesis_verticals.map(v => (
                <Badge key={v} variant="secondary" className="text-[10px] font-normal">{v}</Badge>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {formatCheckSize(investor.min_check_size)}–{formatCheckSize(investor.max_check_size)}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {investor.preferred_stage}
              </span>
              {investor.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {investor.location}
                </span>
              )}
            </div>

            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Hide details" : "Recent deals & intro"}
            </button>

            {expanded && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Recent Deals</p>
                  <div className="flex flex-wrap gap-1">
                    {investor.recent_deals.map(d => (
                      <Badge key={d} variant="outline" className="text-[10px] font-normal">{d}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Request Intro</p>
                  <textarea
                    readOnly
                    value={introBlurb}
                    className="w-full rounded-lg border bg-muted/50 p-2.5 text-xs text-foreground resize-none"
                    rows={5}
                  />
                  <Button size="sm" className="mt-2 gap-1.5" onClick={() => navigator.clipboard.writeText(introBlurb)}>
                    <Send className="h-3 w-3" /> Copy Intro Blurb
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface InvestorMatchProps {
  companyData: CompanyData | null;
  analysisResult: AnalysisResult | null;
}

export function InvestorMatch({ companyData, analysisResult }: InvestorMatchProps) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkSizeRange, setCheckSizeRange] = useState<[number, number]>([250_000, 50_000_000]);
  const [leadFilter, setLeadFilter] = useState<string>("all");
  const [geoFilter, setGeoFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("investor_database").select("*");
      if (!error && data) setInvestors(data as unknown as Investor[]);
      setLoading(false);
    })();
  }, []);

  const scoredInvestors = useMemo(() => {
    return investors
      .map(inv => computeScore(inv, companyData, analysisResult))
      .filter(inv => {
        if (inv.max_check_size < checkSizeRange[0] || inv.min_check_size > checkSizeRange[1]) return false;
        if (leadFilter !== "all" && inv.lead_or_follow !== leadFilter) return false;
        if (geoFilter !== "all" && !inv.location?.includes(geoFilter)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [investors, companyData, analysisResult, checkSizeRange, leadFilter, geoFilter]);

  const locations = useMemo(() => {
    const set = new Set(investors.map(i => i.location).filter(Boolean) as string[]);
    return Array.from(set);
  }, [investors]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Loading investor database…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Investor Match</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {scoredInvestors.length} investors ranked by compatibility
            {companyData ? ` with ${companyData.name}` : " — add company data for personalized scores"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-3.5 w-3.5" /> Filters
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2 block">
                Check Size: {formatCheckSize(checkSizeRange[0])} – {formatCheckSize(checkSizeRange[1])}
              </label>
              <Slider
                min={100_000}
                max={50_000_000}
                step={100_000}
                value={checkSizeRange}
                onValueChange={(v) => setCheckSizeRange(v as [number, number])}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2 block">
                Lead vs Follow
              </label>
              <Select value={leadFilter} onValueChange={setLeadFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Lead">Lead</SelectItem>
                  <SelectItem value="Follow">Follow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-2 block">
                Geography
              </label>
              <Select value={geoFilter} onValueChange={setGeoFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {scoredInvestors.map(inv => (
          <InvestorCard
            key={inv.id}
            investor={inv}
            healthScore={analysisResult?.healthScore}
            companyName={companyData?.name}
          />
        ))}
        {scoredInvestors.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No investors match your current filters.
          </div>
        )}
      </div>
    </div>
  );
}

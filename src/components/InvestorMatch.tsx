import { useState, useEffect, useMemo, useCallback } from "react";
import { SectorClassification } from "@/components/SectorTags";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CompanyData, AnalysisResult } from "@/components/CompanyProfile";
import {
  Users, Sparkles, Plus, Check, X, ExternalLink,
  DollarSign, TrendingUp, Lock, Building2, ArrowRight
} from "lucide-react";

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
  amount: string;
  instrument: string;
  logoLetter: string;
}

// ── Helpers ──

function formatCheckSize(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
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

  // Modern tags match → +25 each (max 50)
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

  // Primary sector match → +20-40
  const sectorToMatch = sectorClass?.primary_sector || company?.sector;
  if (sectorToMatch && investor.thesis_verticals.some(v => {
    const vLow = v.toLowerCase();
    const sLow = sectorToMatch.toLowerCase();
    return vLow === sLow || vLow.includes(sLow) || sLow.includes(vLow);
  })) {
    const sectorPoints = score > 0 ? 20 : 40;
    score += sectorPoints;
    reasons.push(`${sectorToMatch} focus`);
  }

  // MRR alignment → +30
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

  // Stage match → +10
  if (company?.stage && investor.preferred_stage === company.stage) {
    score += 10;
    reasons.push(`${company.stage} stage fit`);
  }

  // Co-investment link with confirmed backers → +15
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

// ── Sub-components ──

function PendingSuggestion({
  name,
  amount,
  onAccept,
  onReject,
  isExiting,
}: {
  name: string;
  amount: string;
  onAccept: () => void;
  onReject: () => void;
  isExiting: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 p-3.5 transition-all duration-300 ease-out ${
        isExiting ? "opacity-0 scale-95 max-h-0 mb-0 p-0 border-0 overflow-hidden" : "opacity-100 scale-100 max-h-40 mb-4"
      }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent font-semibold text-sm">
        {name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="secondary" className="text-[10px] font-normal gap-1 bg-accent/10 text-accent border-0">
            <Sparkles className="h-2.5 w-2.5" /> AI Sourced
          </Badge>
          <span className="text-[10px] text-muted-foreground">{amount}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onAccept}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all duration-300 ease-out hover:bg-success/10 hover:text-success hover:border-success/30 hover:scale-110"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onReject}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all duration-300 ease-out hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 hover:scale-110"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function BackerRow({ backer }: { backer: CapBacker }) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-3 transition-all duration-300 ease-out hover:bg-secondary/50 hover:shadow-sm group">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground font-semibold text-sm">
        {backer.logoLetter}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{backer.name}</p>
        <p className="text-[11px] text-muted-foreground">{backer.instrument}</p>
      </div>
      <span className="text-xs font-medium text-foreground">{backer.amount}</span>
    </div>
  );
}

function MatchCard({
  investor,
  confirmedBackers,
}: {
  investor: ScoredInvestor;
  confirmedBackers: CapBacker[];
}) {
  // Build the reasoning with bolded co-invest links
  const reasoningParts = investor.reasoning.split(" · ");

  return (
    <div className="group rounded-2xl border border-border bg-card p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground font-bold text-sm">
            {investor.firm_name.charAt(0)}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{investor.firm_name}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {investor.preferred_stage} · {investor.lead_or_follow}
              {investor.lead_partner && ` · ${investor.lead_partner}`}
            </p>
          </div>
        </div>
        <Badge
          className={`text-xs font-semibold rounded-full px-3 py-1 transition-all duration-300 ease-out hover:scale-105 border-0 ${scoreColor(investor.score)}`}
        >
          {investor.score}% Match
        </Badge>
      </div>

      {/* Reasoning */}
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
        Matches your{" "}
        {reasoningParts.map((part, i) => (
          <span key={i}>
            {i > 0 && " and "}
            {investor.coInvestLink && part.includes(investor.coInvestLink) ? (
              <>
                frequently co-invests at this stage with{" "}
                <span className="font-semibold text-foreground">{investor.coInvestLink}</span>
              </>
            ) : (
              part
            )}
          </span>
        ))}
        .
      </p>

      {/* Verticals */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {investor.thesis_verticals.slice(0, 4).map(v => (
          <Badge key={v} variant="secondary" className="text-[10px] font-normal">
            {v}
          </Badge>
        ))}
      </div>

      {/* Check size + location */}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          {formatCheckSize(investor.min_check_size)}–{formatCheckSize(investor.max_check_size)}
        </span>
        {investor.location && (
          <span>{investor.location}</span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3 pt-3 border-t border-border">
        <Button size="sm" className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 transition-all duration-300 ease-out hover:translate-y-px">
          <Plus className="h-3 w-3" /> Add to CRM
        </Button>
        <button className="text-xs text-muted-foreground transition-all duration-300 ease-out hover:text-foreground hover:underline underline-offset-2">
          View Thesis <ArrowRight className="inline h-3 w-3 ml-0.5" />
        </button>
      </div>
    </div>
  );
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

  // Confirmed backers from cap_table
  const [confirmedBackers, setConfirmedBackers] = useState<CapBacker[]>([]);

  // Pending AI suggestions
  const [pendingSuggestions, setPendingSuggestions] = useState<{ id: string; name: string; amount: string }[]>([
    { id: "pending-1", name: "Trimble Ventures", amount: "$11.0M" },
  ]);
  const [exitingId, setExitingId] = useState<string | null>(null);

  // Context banner text
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

  // Load confirmed backers from cap_table
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
            amount: formatAmount(row.amount),
            instrument: row.instrument,
            logoLetter: row.investor_name.charAt(0).toUpperCase(),
          }))
        );
      }
    })();
  }, []);

  const handleAcceptSuggestion = useCallback((id: string) => {
    setExitingId(id);
    setTimeout(() => {
      const suggestion = pendingSuggestions.find(s => s.id === id);
      if (suggestion) {
        setConfirmedBackers(prev => [
          ...prev,
          { id: suggestion.id, name: suggestion.name, amount: suggestion.amount, instrument: "SAFE", logoLetter: suggestion.name.charAt(0) },
        ]);
      }
      setPendingSuggestions(prev => prev.filter(s => s.id !== id));
      setExitingId(null);
    }, 350);
  }, [pendingSuggestions]);

  const handleRejectSuggestion = useCallback((id: string) => {
    setExitingId(id);
    setTimeout(() => {
      setPendingSuggestions(prev => prev.filter(s => s.id !== id));
      setExitingId(null);
    }, 350);
  }, []);

  const scoredInvestors = useMemo(() => {
    return investors
      .map(inv => computeScore(inv, companyData, analysisResult, sectorClassification || null, confirmedBackers))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [investors, companyData, analysisResult, sectorClassification, confirmedBackers]);

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

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column: Current Backers ── */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Cap Table
              </h2>
            </div>

            {/* AI Suggestions Queue */}
            {pendingSuggestions.map(s => (
              <PendingSuggestion
                key={s.id}
                name={s.name}
                amount={s.amount}
                onAccept={() => handleAcceptSuggestion(s.id)}
                onReject={() => handleRejectSuggestion(s.id)}
                isExiting={exitingId === s.id}
              />
            ))}

            {/* Confirmed backers list */}
            <div className="space-y-0.5">
              {confirmedBackers.map(b => (
                <BackerRow key={b.id} backer={b} />
              ))}
              {confirmedBackers.length === 0 && pendingSuggestions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No backers yet. Add investors from your Company page.
                </p>
              )}
            </div>

            {/* Add manually button */}
            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-xs font-medium text-muted-foreground transition-all duration-300 ease-out hover:bg-secondary/50 hover:text-foreground"
              onClick={() => window.dispatchEvent(new CustomEvent("navigate-view", { detail: "company" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Investor manually
            </button>
          </div>
        </div>

        {/* ── Right Column: AI Matches ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Context banner */}
          <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 to-accent/10 p-4 transition-all duration-300 ease-out animate-fade-in">
            <Sparkles className="h-5 w-5 text-accent shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {bannerText}
            </p>
          </div>

          {/* Match cards grid */}
          <div className="grid gap-4 sm:grid-cols-1">
            {scoredInvestors.map(inv => (
              <MatchCard
                key={inv.id}
                investor={inv}
                confirmedBackers={confirmedBackers}
              />
            ))}
            {scoredInvestors.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground rounded-2xl border border-border bg-card">
                No investor matches found. Update your company profile for better results.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

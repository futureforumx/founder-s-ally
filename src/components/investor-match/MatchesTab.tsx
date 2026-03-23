import { forwardRef, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, DollarSign, Sparkles, Zap, ShieldCheck, Database, Clock,
  Bookmark, BookmarkCheck, X, Users, AlertTriangle, ThumbsUp,
  Heart, Gauge, TrendingUp, ArrowUpDown, ChevronDown,
} from "lucide-react";
import { CollaborativeRec } from "@/hooks/useVCInteractions";
import { motion, LayoutGroup } from "framer-motion";
import { buildDimensions } from "./InvestorIntelligenceCard";
import type { WeightConfig } from "./PersonalizeWeightsSidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Types ──

interface ScoredInvestor {
  id: string;
  firm_name: string;
  lead_partner: string | null;
  thesis_verticals: string[];
  preferred_stage: string | null;
  min_check_size: number;
  max_check_size: number;
  location: string | null;
  lead_or_follow: string | null;
  score: number;
  reasoning: string;
  coInvestLink: string | null;
  is_trending?: boolean;
  is_popular?: boolean;
  is_recent?: boolean;
}

interface EnrichedProfile {
  firmName: string;
  recentDeals: string[];
  currentThesis: string;
  stage: string;
  geography: string;
  source: "exa" | "gemini_grounded" | "local_db";
  lastVerified: string;
}

interface EnrichResult {
  profile: EnrichedProfile;
  tier: number;
}

interface MatchesTabProps {
  scoredInvestors: ScoredInvestor[];
  bannerText: string;
  enrichedData?: Record<string, EnrichResult>;
  enrichingKeys?: Set<string>;
  savedFirmIds?: Set<string>;
  collaborativeRecs?: CollaborativeRec[];
  weights?: WeightConfig;
  companySector?: string;
  companyStage?: string;
  onSave?: (firmId: string) => void;
  onUnsave?: (firmId: string) => void;
  onSkip?: (firmId: string) => void;
  onViewInvestor?: (investor: ScoredInvestor) => void;
}

type SortMetric = "match" | "sentiment" | "responsiveness" | "activity";
const SORT_OPTIONS: { key: SortMetric; label: string }[] = [
  { key: "match", label: "Structural Fit" },
  { key: "sentiment", label: "Founder Reputation" },
  { key: "responsiveness", label: "Reply Speed" },
  { key: "activity", label: "Check Velocity" },
];

// ── Helpers ──

function formatCheckSize(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function SourceBadge({ source }: { source: "exa" | "gemini_grounded" | "local_db" }) {
  if (source === "exa") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent animate-fade-in">
        <Zap className="h-2.5 w-2.5" /> Live
      </span>
    );
  }
  if (source === "gemini_grounded") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary animate-fade-in">
        <ShieldCheck className="h-2.5 w-2.5" /> Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground animate-fade-in">
      <Database className="h-2.5 w-2.5" /> Directory
    </span>
  );
}

function formatVerifiedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function getSpeedLabel(v: number): { label: string; cls: string } {
  if (v >= 85) return { label: "Lightning Fast", cls: "text-success" };
  if (v >= 70) return { label: "Quick", cls: "text-success" };
  if (v >= 50) return { label: "Moderate", cls: "text-warning" };
  return { label: "Slow", cls: "text-destructive" };
}

function getVelocityLabel(v: number): { label: string; cls: string } {
  if (v >= 80) return { label: "Active", cls: "text-success" };
  if (v >= 55) return { label: "Steady", cls: "text-warning" };
  return { label: "Paused", cls: "text-destructive" };
}

function getReputationLabel(v: number): { label: string; cls: string } {
  if (v >= 80) return { label: "Excellent", cls: "text-success" };
  if (v >= 60) return { label: "Good", cls: "text-warning" };
  return { label: "Mixed", cls: "text-destructive" };
}

// ── Contextual warning logic ──
function getContextualWarning(matchScore: number, sentiment: number, activity: number): { message: string; type: "warning" | "info" } | null {
  if (matchScore >= 75 && activity < 45) {
    return { message: "Perfect fit, but likely not writing checks right now.", type: "warning" };
  }
  if (matchScore < 60 && sentiment >= 75) {
    return { message: "Not a direct fit, but highly recommended by peers.", type: "info" };
  }
  return null;
}

// ── Structural Fit Score Box ──
function StructuralFitBox({ score, reasons }: { score: number; reasons: string[] }) {
  const color = score >= 80 ? "border-success/40 bg-success/5" : score >= 60 ? "border-warning/40 bg-warning/5" : "border-destructive/40 bg-destructive/5";
  const textColor = score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`rounded-xl border-2 ${color} p-4 flex flex-col items-center justify-center min-w-[100px] shrink-0 cursor-help`}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Structural Fit</span>
            <motion.span
              className={`text-3xl font-black leading-none ${textColor}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {score}%
            </motion.span>
            {reasons.length > 0 && (
              <p className="text-[9px] text-muted-foreground mt-2 text-center leading-relaxed max-w-[140px]">
                Matches: {reasons.slice(0, 3).join(", ")}
              </p>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="z-[9999] max-w-[260px] bg-popover/95 backdrop-blur-md p-3 space-y-1.5 shadow-lg border border-border">
          <p className="text-xs font-bold text-foreground">Structural Fit Score</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Measures alignment between your company profile and this investor&apos;s thesis across sector, stage, geography, and check size using vector similarity.
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/70 bg-secondary/50 rounded px-1.5 py-1">
            {"= cosine_sim(sector) \u00D7 stage_match \u00D7 geo_fit \u00D7 check_range"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Behavioral Sensor Cell ──
function SensorCell({ icon: Icon, label, value, sublabel, valueClass }: {
  icon: typeof Heart;
  label: string;
  value: string;
  sublabel: string;
  valueClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-secondary/40 border border-border/50 p-3 min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
      <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-xs font-bold ${valueClass}`}>{value}</span>
      <span className="text-[8px] text-muted-foreground/60">{sublabel}</span>
    </div>
  );
}

// ── Main ──

export const MatchesTab = forwardRef<HTMLDivElement, MatchesTabProps>(function MatchesTab({
  scoredInvestors, bannerText, enrichedData, enrichingKeys, savedFirmIds, collaborativeRecs,
  weights, companySector, companyStage,
  onSave, onUnsave, onSkip, onViewInvestor,
}, _ref) {

  const [sortBy, setSortBy] = useState<SortMetric>("match");

  // Build dimensions + apply sort
  const orderedInvestors = useMemo(() => {
    const withDims = scoredInvestors.map(inv => {
      const dims = buildDimensions(inv.score, companySector, companyStage, inv.firm_name);
      return {
        ...inv,
        dims: {
          fit: inv.score,
          sentiment: dims[1].value,
          responsiveness: dims[2].value,
          activity: dims[3].value,
        },
      };
    });

    // Apply weights if provided (override sort)
    if (weights) {
      const totalWeight = weights.fit + weights.sentiment + weights.responsiveness + weights.activity;
      if (totalWeight > 0) {
        return [...withDims].sort((a, b) => {
          const aW = (a.dims.fit * weights.fit + a.dims.sentiment * weights.sentiment + a.dims.responsiveness * weights.responsiveness + a.dims.activity * weights.activity) / totalWeight;
          const bW = (b.dims.fit * weights.fit + b.dims.sentiment * weights.sentiment + b.dims.responsiveness * weights.responsiveness + b.dims.activity * weights.activity) / totalWeight;
          return bW - aW;
        });
      }
    }

    // Sort by selected metric
    return [...withDims].sort((a, b) => {
      if (sortBy === "match") return b.dims.fit - a.dims.fit;
      return b.dims[sortBy] - a.dims[sortBy];
    });
  }, [scoredInvestors, weights, companySector, companyStage, sortBy]);

  const currentSortLabel = SORT_OPTIONS.find(o => o.key === sortBy)?.label || "Structural Fit";

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 to-accent/10 p-3.5 animate-fade-in">
        <Sparkles className="h-4 w-4 text-accent shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed flex-1">{bannerText}</p>

        {/* Sort Control */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowUpDown className="h-3 w-3" />
              {currentSortLabel}
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {SORT_OPTIONS.map(opt => (
              <DropdownMenuItem
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`text-xs ${sortBy === opt.key ? "font-bold text-accent" : ""}`}
              >
                {opt.label}
                {sortBy === opt.key && <span className="ml-auto text-accent">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Collaborative Recs */}
      {collaborativeRecs && collaborativeRecs.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Founders Also Saved</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {collaborativeRecs.map((rec) => (
              <button
                key={rec.firm_id}
                onClick={() => onSave?.(rec.firm_id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-background text-xs font-medium text-foreground hover:bg-primary/10 transition-colors"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                  {rec.firm_name.charAt(0)}
                </span>
                {rec.firm_name}
                <Badge variant="secondary" className="text-[9px] ml-1 px-1.5 py-0">
                  {rec.peer_save_count} peers
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Investor Cards */}
      <LayoutGroup>
        <div className="grid gap-4 sm:grid-cols-1">
          {orderedInvestors.map(investor => {
            const key = investor.firm_name.toLowerCase().trim();
            const enriched = enrichedData?.[key];
            const isEnriching = enrichingKeys?.has(key);
            const isSaved = savedFirmIds?.has(investor.id) || false;
            const { dims } = investor;

            // Build readable reasons
            const reasonParts: string[] = [];
            if (investor.preferred_stage) reasonParts.push(`${investor.preferred_stage} Stage`);
            if (investor.thesis_verticals.length > 0) reasonParts.push(investor.thesis_verticals[0]);
            reasonParts.push(`${formatCheckSize(investor.min_check_size)} Check`);

            const speed = getSpeedLabel(dims.responsiveness);
            const velocity = getVelocityLabel(dims.activity);
            const vibe = getReputationLabel(dims.sentiment);
            const reviewCount = Math.floor(dims.sentiment / 5);

            const warning = getContextualWarning(dims.fit, dims.sentiment, dims.activity);

            return (
              <motion.div
                key={investor.id}
                layout
                layoutId={investor.id}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className={`group rounded-2xl border bg-card/80 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-pointer ${
                  warning?.type === "warning" ? "border-warning/30" : warning?.type === "info" ? "border-accent/30" : "border-border hover:border-accent/30"
                }`}
                onClick={() => onViewInvestor?.(investor)}
              >
                {/* Contextual Warning Banner */}
                {warning && (
                  <div className={`flex items-center gap-2 px-5 py-2 text-[11px] font-medium ${
                    warning.type === "warning"
                      ? "bg-warning/10 text-warning border-b border-warning/20"
                      : "bg-accent/5 text-accent border-b border-accent/20"
                  }`}>
                    {warning.type === "warning" ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <ThumbsUp className="h-3 w-3 shrink-0" />}
                    {warning.message}
                  </div>
                )}

                <div className="p-5">
                  {/* ── Row 1: Header with Structural Fit ── */}
                  <div className="flex items-start gap-4">
                    {/* Left: Investor identity */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground font-bold text-sm shrink-0">
                          {investor.firm_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground truncate">{investor.firm_name}</h3>
                            {enriched && <SourceBadge source={enriched.profile.source} />}
                            {isEnriching && !enriched && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground animate-pulse">Enriching…</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {investor.preferred_stage} · {investor.lead_or_follow}
                            {investor.lead_partner && ` · ${investor.lead_partner}`}
                          </p>
                        </div>
                      </div>

                      {/* Thesis / Reasoning */}
                      {enriched?.profile.currentThesis ? (
                        <p className="text-xs text-muted-foreground leading-relaxed italic animate-fade-in line-clamp-2">
                          "{enriched.profile.currentThesis}"
                        </p>
                      ) : !isEnriching ? (
                        <div className="flex flex-wrap gap-1.5">
                          {investor.thesis_verticals.slice(0, 4).map(v => (
                            <Badge key={v} variant="secondary" className="text-[10px] font-normal">{v}</Badge>
                          ))}
                        </div>
                      ) : null}

                      {/* Meta Row */}
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {formatCheckSize(investor.min_check_size)}–{formatCheckSize(investor.max_check_size)}
                        </span>
                        {investor.location && <span>{investor.location}</span>}
                        {enriched && (
                          <span className="flex items-center gap-1 animate-fade-in">
                            <Clock className="h-3 w-3" />
                            {formatVerifiedDate(enriched.profile.lastVerified)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Structural Fit Score */}
                    <StructuralFitBox score={dims.fit} reasons={reasonParts} />
                  </div>

                  {/* ── Row 2: Behavioral Sensor Grid ── */}
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Behavioral Signals</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <SensorCell
                                icon={Heart}
                                label="Founder Reputation"
                                value={vibe.label}
                                sublabel={`${reviewCount} reviews`}
                                valueClass={vibe.cls}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="z-[9999] max-w-[260px] bg-popover/95 backdrop-blur-md p-3 space-y-1.5 shadow-lg border border-border">
                            <p className="text-xs font-bold text-foreground">Founder Reputation Score</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              Aggregated from founder reviews, NPS ratings, and response-rate data across our network. Higher scores indicate responsive, transparent, and founder-friendly investors.
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground/70 bg-secondary/50 rounded px-1.5 py-1">
                              {"= avg(NPS) \u00D7 response_rate \u00D7 recency_weight"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <SensorCell
                        icon={Gauge}
                        label="Reply Speed"
                        value={speed.label}
                        sublabel={`${dims.responsiveness}% rate`}
                        valueClass={speed.cls}
                      />
                      <SensorCell
                        icon={TrendingUp}
                        label="Check Velocity"
                        value={velocity.label}
                        sublabel={`${Math.floor(dims.activity / 10)} deals / 90d`}
                        valueClass={velocity.cls}
                      />
                    </div>
                  </div>

                  {/* ── Row 3: Actions ── */}
                  <div className="mt-4 flex items-center gap-3 pt-3 border-t border-border/50">
                    {isSaved ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-success/30 text-success hover:bg-success/5"
                        onClick={(e) => { e.stopPropagation(); onUnsave?.(investor.id); }}
                      >
                        <BookmarkCheck className="h-3 w-3" /> Saved
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={(e) => { e.stopPropagation(); onSave?.(investor.id); }}
                      >
                        <Bookmark className="h-3 w-3" /> Save
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); onSkip?.(investor.id); }}
                    >
                      <X className="h-3 w-3" /> Skip
                    </Button>
                    <button
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onViewInvestor?.(investor); }}
                    >
                      View Thesis <ArrowRight className="inline h-3 w-3 ml-0.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {orderedInvestors.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground rounded-2xl border border-border bg-card/80 backdrop-blur-sm">
              No investor matches found. Update your company profile for better results.
            </div>
          )}
        </div>
      </LayoutGroup>
    </div>
  );
});

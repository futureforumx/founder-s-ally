import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, DollarSign, Sparkles, Zap, ShieldCheck, Database, Clock, Bookmark, BookmarkCheck, X, Users } from "lucide-react";
import { CollaborativeRec } from "@/hooks/useVCInteractions";

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
  onSave?: (firmId: string) => void;
  onUnsave?: (firmId: string) => void;
  onSkip?: (firmId: string) => void;
  onViewInvestor?: (investor: ScoredInvestor) => void;
}

function formatCheckSize(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function SourceBadge({ source }: { source: "exa" | "gemini_grounded" | "local_db" }) {
  if (source === "exa") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-fade-in">
        <Zap className="h-2.5 w-2.5" /> Live Signal
      </span>
    );
  }
  if (source === "gemini_grounded") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 animate-fade-in">
        <ShieldCheck className="h-2.5 w-2.5" /> Grounding Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground animate-fade-in">
      <Database className="h-2.5 w-2.5" /> Verified Directory
    </span>
  );
}

function EnrichShimmerCard() {
  return (
    <div className="animate-pulse space-y-3 mt-3">
      <div className="flex gap-2">
        <div className="h-3.5 w-20 rounded-full bg-secondary" />
        <div className="h-3.5 w-32 rounded-full bg-secondary/70" />
      </div>
      <div className="flex gap-1.5">
        <div className="h-5 w-16 rounded-md bg-secondary/60" />
        <div className="h-5 w-20 rounded-md bg-secondary/50" />
        <div className="h-5 w-14 rounded-md bg-secondary/40" />
      </div>
      <div className="h-3 w-28 rounded-full bg-secondary/50" />
    </div>
  );
}

function formatVerifiedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Unknown";
  }
}

export const MatchesTab = forwardRef<HTMLDivElement, MatchesTabProps>(function MatchesTab({ scoredInvestors, bannerText, enrichedData, enrichingKeys, savedFirmIds, collaborativeRecs, onSave, onUnsave, onSkip, onViewInvestor }, _ref) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 to-accent/10 p-4 animate-fade-in">
        <Sparkles className="h-5 w-5 text-accent shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">{bannerText}</p>
      </div>

      {/* Collaborative Recommendations — "Founders Also Saved" */}
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

      <div className="grid gap-4 sm:grid-cols-1">
        {scoredInvestors.map(investor => {
          const key = investor.firm_name.toLowerCase().trim();
          const enriched = enrichedData?.[key];
          const isEnriching = enrichingKeys?.has(key);
          const reasoningParts = investor.reasoning.split(" · ");
          const isSaved = savedFirmIds?.has(investor.id) || false;

          return (
            <div key={investor.id} className="group rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-accent/30 cursor-pointer" onClick={() => onViewInvestor?.(investor)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground font-bold text-sm">
                    {investor.firm_name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{investor.firm_name}</h3>
                      {enriched && <SourceBadge source={enriched.profile.source} />}
                      {isEnriching && !enriched && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground animate-pulse">
                          Enriching…
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {investor.preferred_stage} · {investor.lead_or_follow}
                      {investor.lead_partner && ` · ${investor.lead_partner}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs font-semibold rounded-full px-3 py-1 border-0 ${scoreColor(investor.score)}`}>
                    {investor.score}% Match
                  </Badge>
                </div>
              </div>

              {/* Shimmer while enriching */}
              {isEnriching && !enriched && <EnrichShimmerCard />}

              {/* Enriched thesis */}
              {enriched?.profile.currentThesis ? (
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed italic animate-fade-in">
                  "{enriched.profile.currentThesis}"
                </p>
              ) : !isEnriching ? (
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                  Matches your{" "}
                  {reasoningParts.map((part, i) => (
                    <span key={i}>
                      {i > 0 && " and "}
                      {investor.coInvestLink && part.includes(investor.coInvestLink) ? (
                        <>frequently co-invests at this stage with <span className="font-semibold text-foreground">{investor.coInvestLink}</span></>
                      ) : part}
                    </span>
                  ))}.
                </p>
              ) : null}

              {/* Recent deals from enrichment */}
              {enriched && enriched.profile.recentDeals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 animate-fade-in">
                  <span className="text-[10px] text-muted-foreground mr-1">Recent:</span>
                  {enriched.profile.recentDeals.slice(0, 3).map((deal, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] font-normal">{deal}</Badge>
                  ))}
                </div>
              )}

              {!isEnriching && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {investor.thesis_verticals.slice(0, 4).map(v => (
                    <Badge key={v} variant="secondary" className="text-[10px] font-normal">{v}</Badge>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {formatCheckSize(investor.min_check_size)}–{formatCheckSize(investor.max_check_size)}
                </span>
                {investor.location && <span>{investor.location}</span>}
                {enriched && (
                  <span className="flex items-center gap-1 ml-auto animate-fade-in">
                    <Clock className="h-3 w-3" />
                    Verified: {formatVerifiedDate(enriched.profile.lastVerified)}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3 pt-3 border-t border-border">
                {isSaved ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
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
          );
        })}
        {scoredInvestors.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground rounded-2xl border border-border bg-card/80 backdrop-blur-sm">
            No investor matches found. Update your company profile for better results.
          </div>
        )}
      </div>
    </div>
  );
});

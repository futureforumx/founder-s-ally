import { forwardRef, useMemo } from "react";
import { VCBadgeContainer } from "@/components/investor-match/VCBadgeContainer";
import { FirmLogo } from "@/components/ui/firm-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bookmark, BookmarkCheck, Database, ShieldCheck, Zap } from "lucide-react";
import { CollaborativeRec } from "@/hooks/useVCInteractions";
import { motion, LayoutGroup } from "framer-motion";
import { safeLower } from "@/lib/utils";

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
  logo_url?: string | null;
  website_url?: string | null;
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

function formatVerifiedDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function SourceBadge({ source }: { source: EnrichedProfile["source"] }) {
  if (source === "exa") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-semibold text-accent"><Zap className="h-2.5 w-2.5" />Live research</span>;
  }
  if (source === "gemini_grounded") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary"><ShieldCheck className="h-2.5 w-2.5" />Grounded research</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold text-muted-foreground"><Database className="h-2.5 w-2.5" />Directory</span>;
}

function FitScore({ score, reasons }: { score: number; reasons: string[] }) {
  return (
    <div className="min-w-[96px] shrink-0 rounded-xl border border-border bg-secondary/35 px-3 py-2.5 text-center">
      <span className="block text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Company fit</span>
      <span className="mt-1 block text-3xl font-black leading-none tabular-nums text-foreground">{score}</span>
      <span className="text-[9px] text-muted-foreground">out of 100</span>
      {reasons.length > 0 && <span className="mt-1 block text-[9px] text-muted-foreground">{reasons.length} fit signals</span>}
    </div>
  );
}

export const MatchesTab = forwardRef<HTMLDivElement, MatchesTabProps>(function MatchesTab({
  scoredInvestors,
  bannerText,
  enrichedData,
  enrichingKeys,
  savedFirmIds,
  collaborativeRecs,
  onSave,
  onUnsave,
  onSkip,
  onViewInvestor,
}, _ref) {
  const orderedInvestors = useMemo(
    () => [...scoredInvestors].sort((a, b) => b.score - a.score),
    [scoredInvestors],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-3.5">
        <p className="text-xs leading-relaxed text-muted-foreground">{bannerText}</p>
        <p className="mt-1 text-[10px] text-muted-foreground/75">Scores use the company profile and investor fields shown below. Missing or stale profile data can reduce match quality.</p>
      </div>

      {collaborativeRecs && collaborativeRecs.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Founders also saved</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {collaborativeRecs.map((rec) => (
              <button
                key={rec.firm_id}
                onClick={() => onSave?.(rec.firm_id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">{rec.firm_name.trim().charAt(0) || "?"}</span>
                {rec.firm_name}
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[9px]">{rec.peer_save_count} peers</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      <LayoutGroup>
        <div className="grid gap-4 sm:grid-cols-1">
          {orderedInvestors.map((investor) => {
            const key = safeLower(investor.firm_name);
            const enriched = enrichedData?.[key];
            const isEnriching = enrichingKeys?.has(key);
            const isSaved = savedFirmIds?.has(investor.id) ?? false;
            const verifiedDate = enriched ? formatVerifiedDate(enriched.profile.lastVerified) : null;
            const reasons = investor.reasoning
              .split(" · ")
              .map((reason) => reason.trim())
              .filter((reason) => reason && !reason.startsWith("Limited data overlap"));

            return (
              <motion.article
                key={investor.id}
                layout
                layoutId={investor.id}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="cursor-pointer overflow-hidden rounded-2xl border border-border bg-card/90 transition-colors hover:border-accent/30"
                onClick={() => onViewInvestor?.(investor)}
              >
                <div className="flex items-start gap-4 p-5">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <FirmLogo
                        firmName={investor.firm_name}
                        logoUrl={investor.logo_url}
                        websiteUrl={investor.website_url}
                        size="md"
                        onClick={(event) => { event.stopPropagation(); onViewInvestor?.(investor); }}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-foreground">{investor.firm_name}</h3>
                          <SourceBadge source={enriched?.profile.source ?? "local_db"} />
                          {isEnriching && <span className="text-[9px] text-muted-foreground">Refreshing profile…</span>}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {[investor.preferred_stage, investor.lead_or_follow, investor.lead_partner].filter(Boolean).join(" · ") || "Investor profile details unavailable"}
                        </p>
                        <VCBadgeContainer vc_firm={{ is_trending: investor.is_trending, is_popular: investor.is_popular, is_recent: investor.is_recent }} />
                      </div>
                    </div>

                    {enriched?.profile.currentThesis ? (
                      <p className="line-clamp-2 text-xs italic leading-relaxed text-muted-foreground">“{enriched.profile.currentThesis}”</p>
                    ) : investor.thesis_verticals.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {investor.thesis_verticals.slice(0, 4).map((vertical) => <Badge key={vertical} variant="secondary" className="text-[10px] font-normal">{vertical}</Badge>)}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">No thesis sectors are listed in the directory.</p>}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{formatCheckSize(investor.min_check_size)}–{formatCheckSize(investor.max_check_size)} check</span>
                      {investor.location && <span>{investor.location}</span>}
                      <span>{verifiedDate ? `Verified ${verifiedDate}` : "Verification date unavailable"}</span>
                    </div>
                  </div>
                  <FitScore score={investor.score} reasons={reasons} />
                </div>

                <div className="border-t border-border/60 bg-secondary/[0.18] px-5 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Why it matched</p>
                  {reasons.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                      {reasons.map((reason, index) => <li key={`${reason}-${index}`} className="text-[11px] text-foreground/75">{reason}</li>)}
                    </ul>
                  ) : <p className="mt-1.5 text-[11px] text-muted-foreground">No specific fit signals matched the available profile fields. Add more company or investor details to improve the result.</p>}
                </div>

                <div className="flex items-center gap-3 px-5 py-3">
                  {isSaved ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 border-success/30 text-success hover:bg-success/5" onClick={(event) => { event.stopPropagation(); onUnsave?.(investor.id); }}>
                      <BookmarkCheck className="h-3 w-3" /> Saved
                    </Button>
                  ) : (
                    <Button size="sm" className="h-8 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90" onClick={(event) => { event.stopPropagation(); onSave?.(investor.id); }}>
                      <Bookmark className="h-3 w-3" /> Save
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={(event) => { event.stopPropagation(); onSkip?.(investor.id); }}>Skip</Button>
                  <button className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={(event) => { event.stopPropagation(); onViewInvestor?.(investor); }}>
                    View investor profile <ArrowRight className="ml-0.5 inline h-3 w-3" />
                  </button>
                </div>
              </motion.article>
            );
          })}
          {orderedInvestors.length === 0 && (
            <div className="rounded-2xl border border-border bg-card/80 py-12 text-center text-sm text-muted-foreground">
              No investor matches found. Update your company profile for better results.
            </div>
          )}
        </div>
      </LayoutGroup>
    </div>
  );
});

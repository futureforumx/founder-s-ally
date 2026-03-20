import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, DollarSign, Sparkles } from "lucide-react";

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

interface MatchesTabProps {
  scoredInvestors: ScoredInvestor[];
  bannerText: string;
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

export function MatchesTab({ scoredInvestors, bannerText }: MatchesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/5 to-accent/10 p-4 animate-fade-in">
        <Sparkles className="h-5 w-5 text-accent shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">{bannerText}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1">
        {scoredInvestors.map(investor => {
          const reasoningParts = investor.reasoning.split(" · ");
          return (
            <div key={investor.id} className="group rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-accent/30">
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
                <Badge className={`text-xs font-semibold rounded-full px-3 py-1 border-0 ${scoreColor(investor.score)}`}>
                  {investor.score}% Match
                </Badge>
              </div>

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

              <div className="mt-3 flex flex-wrap gap-1.5">
                {investor.thesis_verticals.slice(0, 4).map(v => (
                  <Badge key={v} variant="secondary" className="text-[10px] font-normal">{v}</Badge>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {formatCheckSize(investor.min_check_size)}–{formatCheckSize(investor.max_check_size)}
                </span>
                {investor.location && <span>{investor.location}</span>}
              </div>

              <div className="mt-4 flex items-center gap-3 pt-3 border-t border-border">
                <Button size="sm" className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">
                  <Plus className="h-3 w-3" /> Add to CRM
                </Button>
                <button className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors">
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
}

import { useMemo } from "react";
import { Swords, Globe, TrendingUp, Users, ExternalLink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompanyData } from "@/components/CompanyProfile";

interface CompetitorsViewProps {
  companyData: CompanyData | null;
  onNavigateProfile: () => void;
}

// Mock enrichment data keyed by lowercase competitor name
const COMPETITOR_INTEL: Record<string, { tagline: string; funding: string; stage: string; overlap: number; employees: string }> = {
  stripe: { tagline: "Financial infrastructure for the internet", funding: "$8.7B", stage: "Late Stage", overlap: 72, employees: "8,000+" },
  brex: { tagline: "AI-powered spend platform", funding: "$1.5B", stage: "Series D", overlap: 58, employees: "1,200+" },
  ramp: { tagline: "The corporate card that helps you spend less", funding: "$1.6B", stage: "Series D", overlap: 65, employees: "900+" },
  plaid: { tagline: "The platform for open finance", funding: "$734M", stage: "Series D", overlap: 45, employees: "1,000+" },
  mercury: { tagline: "Banking for startups", funding: "$163M", stage: "Series C", overlap: 52, employees: "600+" },
  notion: { tagline: "Connected workspace for docs, projects & knowledge", funding: "$343M", stage: "Series C", overlap: 30, employees: "500+" },
};

function getIntel(name: string) {
  const key = name.toLowerCase().trim();
  return COMPETITOR_INTEL[key] || {
    tagline: "Competitor in your market",
    funding: "Undisclosed",
    stage: "Unknown",
    overlap: Math.floor(Math.random() * 40) + 20,
    employees: "N/A",
  };
}

function overlapColor(pct: number): string {
  if (pct >= 70) return "text-destructive bg-destructive/10";
  if (pct >= 50) return "text-warning bg-warning/10";
  return "text-success bg-success/10";
}

const TLDS = [".com", ".io", ".ai", ".org", ".net", ".co", ".dev", ".app", ".xyz", ".tech"];

function domainFromName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "") + ".com";
}

function faviconSrc(domain: string): string {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
}

export function CompetitorsView({ companyData, onNavigateProfile }: CompetitorsViewProps) {
  const competitors = useMemo(() => companyData?.competitors || [], [companyData]);

  if (!companyData || competitors.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Competitors</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Competitive landscape intelligence</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mb-4">
            <Swords className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No competitors tracked yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            Add competitors in your company profile to see market intelligence here.
          </p>
          <button
            onClick={onNavigateProfile}
            className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
          >
            Go to Mission Control →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Competitors</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tracking {competitors.length} competitor{competitors.length !== 1 ? "s" : ""} from your profile
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] font-normal gap-1">
          <Sparkles className="h-2.5 w-2.5" />
          AI-Enriched
        </Badge>
      </div>

      {/* Competitor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {competitors.map((name) => {
          const intel = getIntel(name);
          const domain = domainFromName(name);

          return (
            <div
              key={name}
              className="rounded-2xl border border-border bg-card p-5 shadow-surface transition-all duration-200 hover:shadow-surface-md hover:border-accent/20 group"
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary shrink-0 overflow-hidden">
                  <img
                    src={faviconSrc(domain)}
                    alt=""
                    className="h-5 w-5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-sm font-bold text-muted-foreground">${name.charAt(0).toUpperCase()}</span>`;
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground truncate">{name}</h3>
                    <a
                      href={`https://${domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-accent" />
                    </a>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{intel.tagline}</p>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-secondary/50 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Funding</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{intel.funding}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Stage</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{intel.stage}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{intel.employees}</span>
                </div>
                <Badge className={`text-[10px] font-medium border-0 rounded-full px-2.5 py-0.5 ${overlapColor(intel.overlap)}`}>
                  {intel.overlap}% overlap
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

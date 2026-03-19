import { Users, TrendingUp, ArrowUpRight, Star, Building2, MapPin, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanyData, AnalysisResult } from "@/components/company-profile/types";

interface CommunityViewProps {
  companyData?: CompanyData | null;
  analysisResult?: AnalysisResult | null;
}

const trendingInvestors = [
  { name: "Sequoia Capital", focus: "AI, Enterprise SaaS", activity: "5 deals this month" },
  { name: "Andreessen Horowitz", focus: "AI Agents, Fintech", activity: "3 new leads" },
  { name: "Y Combinator", focus: "Broad", activity: "W26 batch open" },
  { name: "Founders Fund", focus: "Deep Tech, Defense", activity: "Raising Fund VIII" },
];

export function CommunityView({ companyData, analysisResult }: CommunityViewProps) {
  const hasProfile = !!companyData?.name;

  // Build the user's directory entry from their profile
  const userEntry = hasProfile ? {
    name: companyData.name,
    sector: companyData.sector || "Uncategorized",
    stage: companyData.stage || "—",
    description: companyData.description || companyData.uniqueValueProp || "",
    location: companyData.hqLocation || "",
    website: companyData.website || "",
    businessModel: companyData.businessModel || "",
    teamSize: companyData.totalHeadcount || companyData.teamSize || "",
    arr: companyData.currentARR || "",
    score: analysisResult?.healthScore ?? null,
    subsectors: companyData.subsectors || [],
    logoUrl: (() => {
      try { return localStorage.getItem("company-logo-url") || null; } catch { return null; }
    })(),
  } : null;

  return (
    <div className="space-y-6">
      {/* Your Company Directory Card */}
      <Card className="surface-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
              <Building2 className="h-3.5 w-3.5 text-accent" />
            </div>
            Your Directory Listing
            {hasProfile && (
              <Badge variant="secondary" className="text-[10px] font-normal ml-auto">
                Live
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userEntry ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border overflow-hidden shrink-0">
                  {userEntry.logoUrl ? (
                    <img src={userEntry.logoUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">
                      {userEntry.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground truncate">{userEntry.name}</h3>
                    {userEntry.score !== null && (
                      <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                        userEntry.score >= 80 ? "bg-success/10 text-success" : userEntry.score >= 60 ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                      }`}>
                        {userEntry.score}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge variant="outline" className="text-[9px] font-normal">{userEntry.stage}</Badge>
                    <span className="text-[10px] text-muted-foreground">{userEntry.sector}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              {userEntry.description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {userEntry.description}
                </p>
              )}

              {/* Metadata chips */}
              <div className="flex flex-wrap gap-1.5">
                {userEntry.location && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
                    <MapPin className="h-2.5 w-2.5" /> {userEntry.location}
                  </span>
                )}
                {userEntry.businessModel && (
                  <span className="text-[10px] text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
                    {userEntry.businessModel}
                  </span>
                )}
                {userEntry.teamSize && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
                    <Users className="h-2.5 w-2.5" /> {userEntry.teamSize}
                  </span>
                )}
                {userEntry.arr && (
                  <span className="text-[10px] text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
                    ARR: {userEntry.arr}
                  </span>
                )}
                {userEntry.website && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-accent bg-accent/5 rounded-md px-2 py-1">
                    <Globe className="h-2.5 w-2.5" /> Website
                  </span>
                )}
              </div>

              {/* Subsector tags */}
              {userEntry.subsectors.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {userEntry.subsectors.map((sub, i) => (
                    <Badge key={i} variant="secondary" className="text-[9px] font-normal">
                      {sub}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <Building2 className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Complete your company profile to appear in the directory.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trending Investors */}
      <Card className="surface-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10">
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            </div>
            Trending Investors
            <Star className="h-3 w-3 text-warning ml-auto" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {trendingInvestors.map((investor, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5 hover:bg-muted/60 transition-colors cursor-pointer">
                <div>
                  <p className="text-xs font-medium text-foreground">{investor.name}</p>
                  <p className="text-[10px] text-muted-foreground">{investor.focus}</p>
                </div>
                <Badge variant="secondary" className="text-[9px] font-normal">
                  {investor.activity}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

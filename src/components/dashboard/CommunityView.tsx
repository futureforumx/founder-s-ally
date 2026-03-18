import { Users, TrendingUp, ArrowUpRight, Star, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const directoryPreview = [
  { name: "BuildAI Labs", sector: "Artificial Intelligence", stage: "Seed", score: 82 },
  { name: "GreenGrid Energy", sector: "Climate & Energy", stage: "Series A", score: 75 },
  { name: "StructFlow", sector: "Construction & Real Estate", stage: "Pre-Seed", score: 68 },
  { name: "PayStack Africa", sector: "Fintech", stage: "Series B", score: 91 },
  { name: "DroneForge", sector: "Defense & GovTech", stage: "Seed", score: 77 },
];

const trendingInvestors = [
  { name: "Sequoia Capital", focus: "AI, Enterprise SaaS", activity: "5 deals this month" },
  { name: "Andreessen Horowitz", focus: "AI Agents, Fintech", activity: "3 new leads" },
  { name: "Y Combinator", focus: "Broad", activity: "W26 batch open" },
  { name: "Founders Fund", focus: "Deep Tech, Defense", activity: "Raising Fund VIII" },
];

export function CommunityView() {
  return (
    <div className="space-y-6">
      {/* Directory Preview */}
      <Card className="surface-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
              <Building2 className="h-3.5 w-3.5 text-accent" />
            </div>
            Directory Preview
            <Badge variant="secondary" className="text-[10px] font-normal ml-auto">
              {directoryPreview.length} companies
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {directoryPreview.map((company, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5 group hover:bg-muted/60 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card border border-border text-[10px] font-bold text-muted-foreground">
                    {company.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{company.name}</p>
                    <p className="text-[10px] text-muted-foreground">{company.sector}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[9px] font-normal">{company.stage}</Badge>
                  <span className={`text-[10px] font-mono font-semibold ${
                    company.score >= 80 ? "text-success" : company.score >= 60 ? "text-accent" : "text-muted-foreground"
                  }`}>
                    {company.score}
                  </span>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
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

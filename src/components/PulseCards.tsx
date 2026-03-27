import { useState, useEffect } from "react";
import { Users, TrendingUp, Newspaper, Loader2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const communityUpdates = [
  { text: "3 founders just closed Seed rounds this week", time: "2h ago", type: "milestone" as const },
  { text: "New playbook added: 'Series A Metrics That Matter'", time: "5h ago", type: "content" as const },
  { text: "12 founders updated their Health Scores", time: "1d ago", type: "activity" as const },
  { text: "Fintech cohort growing — 8 new profiles added", time: "1d ago", type: "growth" as const },
  { text: "Community AMA: 'Navigating Down Rounds' scheduled", time: "2d ago", type: "event" as const },
];

const typeStyles: Record<string, string> = {
  milestone: "bg-success/10 text-success border-success/20",
  content: "bg-accent/10 text-accent border-accent/20",
  activity: "bg-muted text-muted-foreground border-border",
  growth: "bg-success/10 text-success border-success/20",
  event: "bg-accent/10 text-accent border-accent/20",
};

interface MarketHeadline {
  title: string;
  summary: string;
  relevance: string;
}

interface PulseCardsProps {
  sector?: string;
}

export function PulseCards({ sector }: PulseCardsProps) {
  const [headlines, setHeadlines] = useState<MarketHeadline[]>([]);
  const [loadingHeadlines, setLoadingHeadlines] = useState(false);
  const [headlineError, setHeadlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!sector) return;
    let cancelled = false;

    const fetchHeadlines = async () => {
      setLoadingHeadlines(true);
      setHeadlineError(null);
      try {
        const { data, error } = await supabase.functions.invoke("market-updates", {
          body: { sector },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!cancelled && data?.headlines) {
          setHeadlines(data.headlines);
        }
      } catch (e) {
        if (!cancelled) {
          setHeadlineError(e instanceof Error ? e.message : "Failed to load market updates");
        }
      } finally {
        if (!cancelled) setLoadingHeadlines(false);
      }
    };

    fetchHeadlines();
    return () => { cancelled = true; };
  }, [sector]);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Community Updates */}
      <Card className="surface-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
              <Users className="h-3.5 w-3.5 text-accent" />
            </div>
            Network Pulse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {communityUpdates.map((update, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                update.type === "milestone" || update.type === "growth" ? "bg-success" : "bg-accent"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground leading-relaxed">{update.text}</p>
                <span className="text-[10px] text-muted-foreground font-mono">{update.time}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Market Updates */}
      <Card className="surface-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
              <Newspaper className="h-3.5 w-3.5 text-accent" />
            </div>
            Market Intelligence
            {sector && (
              <Badge variant="secondary" className="text-[10px] font-normal ml-auto">{sector}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!sector && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Add your sector to see personalized market updates
            </p>
          )}
          {loadingHeadlines && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Fetching {sector} news…</span>
            </div>
          )}
          {headlineError && (
            <p className="text-xs text-destructive py-4 text-center">{headlineError}</p>
          )}
          {!loadingHeadlines && headlines.length > 0 && (
            <div className="space-y-3">
              {headlines.map((h, i) => (
                <div key={i} className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground leading-relaxed">{h.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{h.summary}</p>
                      <Badge variant="outline" className="text-[9px] mt-1.5 font-normal">{h.relevance}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

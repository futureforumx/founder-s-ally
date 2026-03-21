import { useState, useEffect } from "react";
import {
  CircleDollarSign, FileText, UserPlus, RefreshCw, Newspaper,
  TrendingUp, Calendar, Building2, ArrowUpRight, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RecordUpdate {
  field: string;
  oldValue: string;
  newValue: string;
  time: string;
}

interface NewsItem {
  title: string;
  source: string;
  type: "press_release" | "article" | "mention";
  url: string;
  time: string;
}

interface InvestmentItem {
  company: string;
  stage: string;
  sector: string;
  checkSize: string;
  date: string;
}

// Mock data generators keyed by firm name for variety
function getRecordUpdates(firmName: string): RecordUpdate[] {
  const base: RecordUpdate[] = [
    { field: "AUM", oldValue: "$82B", newValue: "$85B", time: "4h ago" },
    { field: "Fund Status", oldValue: "Fundraising", newValue: "Actively Deploying", time: "2d ago" },
    { field: "Team Size", oldValue: "14", newValue: "15", time: "5d ago" },
    { field: "Lead Partner", oldValue: "—", newValue: "New GP added", time: "1w ago" },
  ];
  // Rotate slightly based on firm name length for variety
  const offset = firmName.length % 2;
  return offset ? base : [
    { field: "Thesis Verticals", oldValue: "SaaS, Fintech", newValue: "SaaS, Fintech, Climate", time: "1h ago" },
    { field: "Check Size Range", oldValue: "$1M–$10M", newValue: "$1M–$15M", time: "3d ago" },
    { field: "Location", oldValue: "San Francisco, CA", newValue: "Menlo Park, CA", time: "1w ago" },
    { field: "Market Sentiment", oldValue: "Selective", newValue: "Active", time: "2w ago" },
  ];
}

function getNewsItems(firmName: string): NewsItem[] {
  return [
    {
      title: `${firmName} closes $1.5B Fund III, signals aggressive 2026 deployment`,
      source: "TechCrunch",
      type: "press_release",
      url: "#",
      time: "6h ago",
    },
    {
      title: `GP at ${firmName} publishes new thesis on vertical AI infrastructure`,
      source: "Substack",
      type: "article",
      url: "#",
      time: "2d ago",
    },
    {
      title: `${firmName} mentioned in Forbes 30 Under 30 investor roundup`,
      source: "Forbes",
      type: "mention",
      url: "#",
      time: "4d ago",
    },
    {
      title: `${firmName} partner keynotes at Climate Tech Summit 2026`,
      source: "Bloomberg",
      type: "mention",
      url: "#",
      time: "1w ago",
    },
  ];
}

function getLastInvestments(firmName: string): InvestmentItem[] {
  const sets: InvestmentItem[][] = [
    [
      { company: "NovaBuild", stage: "Seed", sector: "PropTech", checkSize: "$4M", date: "Mar 2026" },
      { company: "Synthara Bio", stage: "Series A", sector: "Biotech", checkSize: "$12M", date: "Feb 2026" },
      { company: "GridShift Energy", stage: "Series A", sector: "Climate", checkSize: "$8M", date: "Jan 2026" },
    ],
    [
      { company: "CodeVault", stage: "Pre-Seed", sector: "DevTools", checkSize: "$1.5M", date: "Mar 2026" },
      { company: "AeroMind", stage: "Seed", sector: "Deep Tech", checkSize: "$3M", date: "Feb 2026" },
      { company: "Canopy Finance", stage: "Seed", sector: "Fintech", checkSize: "$5M", date: "Dec 2025" },
    ],
  ];
  return sets[firmName.length % 2];
}

const NEWS_TYPE_LABELS: Record<NewsItem["type"], { label: string; color: string }> = {
  press_release: { label: "Press Release", color: "bg-accent/10 text-accent border-accent/20" },
  article: { label: "Article", color: "bg-primary/10 text-primary border-primary/20" },
  mention: { label: "Mention", color: "bg-muted text-muted-foreground border-border" },
};

export function InvestorActivity({ firmName }: { firmName: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Simulate real-time polling
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefreshed(new Date());
    }, 60_000); // refresh timestamp every minute
    return () => clearInterval(interval);
  }, []);

  const recordUpdates = getRecordUpdates(firmName);
  const newsItems = getNewsItems(firmName);
  const investments = getLastInvestments(firmName);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefreshed(new Date());
      setIsRefreshing(false);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] text-muted-foreground font-medium">
            Live · Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isRefreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </div>

      {/* ── LATEST RECORD UPDATES ── */}
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3" /> Latest Record Updates
        </h4>
        <div className="space-y-0">
          {recordUpdates.map((update, i) => (
            <div key={i} className="flex items-start gap-3 py-2.5 relative">
              {i < recordUpdates.length - 1 && (
                <div className="absolute left-[11px] top-9 bottom-0 w-px bg-border" />
              )}
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary border border-border z-10">
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground leading-snug">
                  <span className="font-semibold">{update.field}</span> changed
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-muted-foreground line-through">{update.oldValue}</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span className="text-[10px] font-semibold text-success">{update.newValue}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{update.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── LATEST NEWS ── */}
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Newspaper className="h-3 w-3" /> Latest News
        </h4>
        <div className="space-y-2">
          {newsItems.map((item, i) => {
            const typeInfo = NEWS_TYPE_LABELS[item.type];
            return (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 hover:border-accent/20 hover:shadow-sm transition-all group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary border border-border">
                  <Newspaper className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground leading-snug group-hover:text-accent transition-colors line-clamp-2">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge className={`text-[9px] px-1.5 py-0 ${typeInfo.color}`}>
                      {typeInfo.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{item.source}</span>
                    <span className="text-border">·</span>
                    <span className="text-[10px] text-muted-foreground">{item.time}</span>
                  </div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              </a>
            );
          })}
        </div>
      </div>

      {/* ── LAST INVESTMENTS ── */}
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <CircleDollarSign className="h-3 w-3" /> Last Investments
        </h4>
        <div className="space-y-2">
          {investments.map((inv, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 hover:border-accent/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary border border-border text-sm font-bold text-muted-foreground">
                  {inv.company.charAt(0)}
                </div>
                <div>
                  <span className="text-sm font-medium text-foreground">{inv.company}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{inv.stage}</Badge>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{inv.sector}</Badge>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-semibold text-foreground">{inv.checkSize}</span>
                <div className="flex items-center gap-1 mt-0.5 justify-end">
                  <Calendar className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{inv.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Search, CheckCircle2, X, ChevronRight, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PendingInvestor {
  id: string;
  investor_name: string;
  entity_type: string;
  instrument: string;
  amount: number;
  round_name: string | null;
  source_type: string;
  source_detail: string | null;
  source_date: string | null;
  status: string;
}

interface InvestorDiscoveryProps {
  pending: PendingInvestor[];
  onConfirm: (p: PendingInvestor) => void;
  onIgnore: (id: string) => void;
}

function logoUrl(name: string) {
  if (!name.trim()) return null;
  const domain = name.trim().toLowerCase().replace(/\s+/g, "") + ".com";
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
}

function matchScore(p: PendingInvestor): number {
  // Simple heuristic match score based on available data
  let score = 50;
  if (p.amount > 0) score += 20;
  if (p.source_detail) score += 15;
  if (p.round_name) score += 10;
  if (p.source_date) score += 5;
  return Math.min(score, 99);
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return n > 0 ? `$${n}` : "";
}

export function InvestorDiscovery({ pending, onConfirm, onIgnore }: InvestorDiscoveryProps) {
  const [expanded, setExpanded] = useState(true);

  if (pending.length === 0) return null;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Search className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-accent">
          Sourced from Deep Search
        </span>
        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-accent/10 text-accent border-accent/20">
          {pending.length} found
        </Badge>
        <ChevronRight className={`h-3 w-3 text-muted-foreground ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {pending.map((p) => {
            const score = matchScore(p);
            return (
              <Card key={p.id} className="border border-border bg-card/50 hover:bg-card transition-colors">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  {/* Logo */}
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0 overflow-hidden">
                    {p.investor_name ? (
                      <img
                        src={logoUrl(p.investor_name)!}
                        alt=""
                        className="h-full w-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : null}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{p.investor_name}</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">
                        {p.entity_type}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5 shrink-0" />
                      {p.source_detail || p.source_type}
                      {p.amount > 0 && <span className="font-mono ml-1">{fmt(p.amount)}</span>}
                    </p>
                  </div>

                  {/* Match Score */}
                  <div className="flex flex-col items-center shrink-0">
                    <span className={`text-sm font-bold ${score >= 80 ? "text-success" : score >= 60 ? "text-accent" : "text-muted-foreground"}`}>
                      {score}%
                    </span>
                    <span className="text-[9px] text-muted-foreground">match</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onIgnore(p.id)}
                      title="Ignore"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1 px-2.5"
                      onClick={() => onConfirm(p)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Confirm
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

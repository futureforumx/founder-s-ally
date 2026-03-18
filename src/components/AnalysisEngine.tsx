import { useState, useEffect } from "react";
import { Building2, ChevronDown, ChevronUp, Loader2, TrendingUp, DollarSign, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AnalysisEngine() {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRunAnalysis = () => {
    setIsProcessing(true);
  };

  useEffect(() => {
    if (!isProcessing) return;
    const timer = setTimeout(() => setIsProcessing(false), 3000);
    return () => clearTimeout(timer);
  }, [isProcessing]);

  return (
    <div className="space-y-5">
      <Button
        onClick={handleRunAnalysis}
        disabled={isProcessing}
        className="gap-2"
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {isProcessing ? "Analyzing..." : "Run Analysis"}
      </Button>

      {isProcessing ? (
        /* State 1: Processing (Collapsed) */
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition-all duration-300">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Funding Hub
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Processing...</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      ) : (
        /* State 2: Results (Expanded) */
        <div className="overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <Building2 className="h-4.5 w-4.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Funding Hub</p>
                <p className="text-xs text-muted-foreground">
                  Capital raised, investor backing &amp; Exa discovery
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                $11.0M raised
              </span>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Body */}
          <div className="bg-secondary/50 p-6">
            <div className="rounded-xl border border-border bg-card p-5">
              {/* Pulse header */}
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Funding Pulse
                </span>
                <TrendingUp className="h-3.5 w-3.5 text-success" />
              </div>

              {/* Amount row */}
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
                  <DollarSign className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-4xl font-bold tracking-tight text-foreground">
                    $11.0M
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    1 verified · 0 pending
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

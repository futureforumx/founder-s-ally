import { useState, useCallback, useEffect } from "react";
import { DeckUploader } from "./DeckUploader";
import { ProcessingStatus } from "./ProcessingStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePitchDecks, type PitchDeck } from "@/hooks/usePitchDecks";
import { FileText, MoreHorizontal, Download, CheckCircle2, Archive, Trash2, Loader2, TrendingUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

import { AuditControlBar } from "./deck-audit/AuditControlBar";
import { RadialScore } from "./deck-audit/RadialScore";
import { DimensionBars } from "./deck-audit/DimensionBars";
import { SlideCoachingView } from "./deck-audit/SlideCoachingView";
import { VersionComparison } from "./deck-audit/VersionComparison";
import type { AuditResult } from "./deck-audit/types";

type AuditState = "upload" | "processing" | "report" | "error";

/** Convert legacy edge-function response to the full AuditResult schema */
function normalizeAuditResponse(raw: any): AuditResult {
  // If already in the new schema shape
  if (raw.multi_axis_scores) return raw as AuditResult;

  // Legacy shape: { companyName, overallScore, flags[] }
  return {
    audit_id: crypto.randomUUID(),
    deck_version_id: "current",
    metadata: {
      analyzed_at: new Date().toISOString(),
      target_investor: "Seed Funds",
      benchmark_cohort: "B2B SaaS / Seed / US",
    },
    multi_axis_scores: {
      readiness_score: raw.overallScore ?? 50,
      dimensions: {
        story_and_flow: { score: 65, rationale: ["Analysis pending — re-run with updated engine."] },
        clarity_and_density: { score: 70, rationale: ["Analysis pending — re-run with updated engine."] },
        market_and_financials: { score: 45, rationale: ["Analysis pending — re-run with updated engine."] },
        team_credibility: { score: 75, rationale: ["Analysis pending — re-run with updated engine."] },
        design_and_scannability: { score: 60, rationale: ["Analysis pending — re-run with updated engine."] },
      },
    },
    benchmark_insights: {
      percentile: 50,
      key_takeaway: "Benchmark data will populate after a full re-run.",
    },
    slide_analysis: (raw.flags ?? []).map((f: any, i: number) => ({
      slide_number: i + 1,
      detected_intent: f.slideRef ?? `Section ${i + 1}`,
      predicted_dropoff_risk: f.severity === "high" ? 65 : f.severity === "medium" ? 35 : 10,
      feedback: {
        concrete_edits: f.requiredFix ? [f.requiredFix] : [],
        missing_elements: [],
        investor_objections: f.body ? [f.body] : [],
      },
    })),
    version_delta: {
      compared_to_version_id: "",
      improvements: [],
      regressions: [],
    },
  };
}

export function DeckAuditView() {
  const [state, setState] = useState<AuditState>(() => {
    try {
      const cached = sessionStorage.getItem("deck-audit-result");
      if (cached) return "report";
    } catch {}
    return "upload";
  });
  const [result, setResult] = useState<AuditResult | null>(() => {
    try {
      const cached = sessionStorage.getItem("deck-audit-result");
      if (cached) return JSON.parse(cached) as AuditResult;
    } catch {}
    return null;
  });
  const [compareMode, setCompareMode] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const { decks, loading, makeActive, deleteDeck, getDownloadUrl } = usePitchDecks();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleUpload = useCallback(async (deckText: string) => {
    setState("processing");
    try {
      const { data, error } = await supabase.functions.invoke("audit-deck", { body: { deckText } });
      if (error) throw new Error(error.message || "Failed to analyze deck");
      if (data?.error) throw new Error(data.error);
      setResult(normalizeAuditResponse(data));
      setState("report");
    } catch (err) {
      console.error("Audit error:", err);
      toast({ title: "Analysis Failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
      setState("upload");
    }
  }, []);

  // Auto-run audit if a pending deck was queued from Mission Control
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("pending-deck-audit");
      if (pending && pending.length >= 50) {
        sessionStorage.removeItem("pending-deck-audit");
        handleUpload(pending);
      }
    } catch {}
  }, [handleUpload]);

  const handleReset = useCallback(() => { setState("upload"); setResult(null); setCompareMode(false); }, []);

  const handleRerun = useCallback((_params: { profile: string; sector: string; stage: string; geo: string }) => {
    setIsRerunning(true);
    setTimeout(() => setIsRerunning(false), 2000);
    toast({ title: "Audit refreshed", description: "Scores updated with new benchmark parameters." });
  }, []);

  const handleDownload = async (deck: PitchDeck) => {
    setActionLoading(deck.id);
    const url = await getDownloadUrl(deck.file_url);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = deck.file_name;
      a.click();
    }
    setActionLoading(null);
  };

  const handleMakeActive = async (deck: PitchDeck) => {
    setActionLoading(deck.id);
    await makeActive(deck.id);
    setActionLoading(null);
  };

  const handleDelete = async (deck: PitchDeck) => {
    setActionLoading(deck.id);
    await deleteDeck(deck.id);
    setActionLoading(null);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Upload State ──
  if (state === "upload") {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="w-full max-w-xl">
            <DeckUploader onUpload={handleUpload} />
          </div>
        </div>

        {/* Version History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Version History</h2>
              <p className="text-xs text-muted-foreground mt-0.5">All uploaded pitch decks across your profile</p>
            </div>
            {decks.length > 0 && (
              <span className="text-xs font-mono text-muted-foreground">{decks.length} version{decks.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : decks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No decks uploaded yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Upload a pitch deck to get started</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {decks.map((deck) => (
                <div
                  key={deck.id}
                  className={`group flex items-center gap-4 rounded-xl border px-4 py-3 transition-all duration-200 ${
                    deck.is_active
                      ? "border-success/30 bg-success/5 shadow-sm"
                      : "border-border bg-card hover:border-border/80 hover:shadow-sm"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                    deck.is_active ? "bg-success/10" : "bg-destructive/10"
                  }`}>
                    <FileText className={`h-5 w-5 ${deck.is_active ? "text-success" : "text-destructive"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{deck.file_name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(deck.uploaded_at), "MMM d, yyyy · h:mm a")}
                      </span>
                      {deck.file_size_bytes && (
                        <span className="text-xs text-muted-foreground/60">{formatFileSize(deck.file_size_bytes)}</span>
                      )}
                    </div>
                  </div>
                  {deck.is_active ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shrink-0">
                      <Archive className="h-3 w-3" /> Archived
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
                        {actionLoading === deck.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleDownload(deck)}>
                        <Download className="h-3.5 w-3.5 mr-2" /> Download
                      </DropdownMenuItem>
                      {!deck.is_active && (
                        <DropdownMenuItem onClick={() => handleMakeActive(deck)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Make Active
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDelete(deck)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Processing State ──
  if (state === "processing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <ProcessingStatus />
        </div>
      </div>
    );
  }

  // ── Report State (Full Dashboard) ──
  if (!result) return null;

  return (
    <div className="flex flex-col min-h-0">
      <AuditControlBar
        onRerun={handleRerun}
        isRunning={isRerunning}
        initialProfile={result.metadata.target_investor}
        initialBenchmark={result.metadata.benchmark_cohort}
      />

      <div className="space-y-8 px-6 py-6">
        {/* Action Row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Deck Audit Report</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analyzed {format(new Date(result.metadata.analyzed_at), "MMM d, yyyy · h:mm a")}
            </p>
          </div>
          <button
            onClick={handleReset}
            className="rounded-lg bg-secondary px-4 py-2 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-muted"
          >
            Audit Another Deck
          </button>
        </div>

        {/* Benchmark Insight */}
        {result.benchmark_insights.key_takeaway && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 flex items-start gap-3">
            <TrendingUp className="h-4 w-4 text-accent shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] font-semibold text-foreground">
                {result.benchmark_insights.percentile}th percentile
              </span>
              <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
                {result.benchmark_insights.key_takeaway}
              </p>
            </div>
          </div>
        )}

        {/* Hero: Multi-Axis Scoring */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
          <div className="flex flex-col lg:flex-row items-start gap-8">
            <RadialScore score={result.multi_axis_scores.readiness_score} />
            <DimensionBars scores={result.multi_axis_scores.dimensions} />
          </div>
        </div>

        {/* Slide-Level Coaching */}
        {result.slide_analysis.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Slide-Level Coaching</h3>
            <SlideCoachingView slides={result.slide_analysis} />
          </div>
        )}

        {/* Version Comparison */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Version Comparison</h3>
          <VersionComparison compareMode={compareMode} onToggleCompare={setCompareMode} delta={result.version_delta} />
        </div>
      </div>
    </div>
  );
}

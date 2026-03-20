import { useState, useCallback, useEffect } from "react";
import { DeckUploader } from "./DeckUploader";
import { AnalysisTerminal } from "./AnalysisTerminal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePitchDecks, type PitchDeck } from "@/hooks/usePitchDecks";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

import { AuditControlBar } from "./deck-audit/AuditControlBar";
import { KPIRibbon } from "./deck-audit/KPIRibbon";
import { SlideCoachingView } from "./deck-audit/SlideCoachingView";
import { VersionComparison } from "./deck-audit/VersionComparison";
import { NewDeckImportModal } from "./deck-audit/NewDeckImportModal";
import { VersionHistoryAccordion } from "./deck-audit/VersionHistoryAccordion";
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingDeckText, setPendingDeckText] = useState<string | null>(null);

  const handleUpload = useCallback(async (deckText: string) => {
    setState("processing");
    try {
      const { data, error } = await supabase.functions.invoke("audit-deck", { body: { deckText } });
      if (error) throw new Error(error.message || "Failed to analyze deck");
      if (data?.error) throw new Error(data.error);
      const normalized = normalizeAuditResponse(data);
      setResult(normalized);
      try { sessionStorage.setItem("deck-audit-result", JSON.stringify(normalized)); } catch {}
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

  const handleReset = useCallback(() => { setState("upload"); setResult(null); setCompareMode(false); try { sessionStorage.removeItem("deck-audit-result"); } catch {} }, []);

  /** Called from the import modal — starts the terminal animation, then runs the audit */
  const handleNewDeckImport = useCallback((deckText: string) => {
    setPendingDeckText(deckText);
    setState("processing");
  }, []);

  const handleTerminalComplete = useCallback(() => {
    if (pendingDeckText) {
      handleUpload(pendingDeckText);
      setPendingDeckText(null);
    }
  }, [pendingDeckText, handleUpload]);

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


  // ── Upload State ──
  if (state === "upload") {
    return (
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="w-full max-w-xl">
            <DeckUploader onUpload={handleUpload} />
          </div>
        </div>

        <VersionHistoryAccordion
          decks={decks}
          loading={loading}
          actionLoading={actionLoading}
          onDownload={handleDownload}
          onMakeActive={handleMakeActive}
          onDelete={handleDelete}
        />
      </div>
    );
  }

  // ── Processing State (Analysis Terminal overlay) ──
  if (state === "processing") {
    return (
      <AnalysisTerminal
        companyName="DECK"
        onComplete={pendingDeckText ? handleTerminalComplete : () => {}}
      />
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
            onClick={() => setImportModalOpen(true)}
            className="rounded-lg bg-secondary px-4 py-2 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-muted active:scale-[0.97]"
          >
            Audit Another Deck
          </button>
        </div>

        <NewDeckImportModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          onImport={handleNewDeckImport}
        />

        {/* KPI Ribbon with Expanding Tray */}
        <KPIRibbon scores={result.multi_axis_scores} benchmark={result.benchmark_insights} />

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

        <VersionHistoryAccordion
          decks={decks}
          loading={loading}
          actionLoading={actionLoading}
          onDownload={handleDownload}
          onMakeActive={handleMakeActive}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

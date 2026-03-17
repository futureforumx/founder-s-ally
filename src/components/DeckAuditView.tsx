import { useState, useCallback } from "react";
import { DeckUploader } from "./DeckUploader";
import { ProcessingStatus } from "./ProcessingStatus";
import { DiligenceScore } from "./DiligenceScore";
import { RedFlagCard } from "./RedFlagCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type AuditState = "upload" | "processing" | "report" | "error";

interface AuditFlag {
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
  requiredFix: string;
  slideRef: string;
}

interface AuditResult {
  companyName: string;
  overallScore: number;
  flags: AuditFlag[];
}

export function DeckAuditView() {
  const [state, setState] = useState<AuditState>("upload");
  const [result, setResult] = useState<AuditResult | null>(null);

  const handleUpload = useCallback(async (deckText: string) => {
    setState("processing");

    try {
      const { data, error } = await supabase.functions.invoke("audit-deck", {
        body: { deckText },
      });

      if (error) {
        throw new Error(error.message || "Failed to analyze deck");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setResult(data as AuditResult);
      setState("report");
    } catch (err) {
      console.error("Audit error:", err);
      toast({
        title: "Analysis Failed",
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setState("upload");
    }
  }, []);

  const handleReset = useCallback(() => {
    setState("upload");
    setResult(null);
  }, []);

  if (state === "upload") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-xl">
          <DeckUploader onUpload={handleUpload} />
        </div>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <ProcessingStatus />
        </div>
      </div>
    );
  }

  if (!result) return null;

  const highCount = result.flags.filter((f) => f.severity === "high").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={handleReset}
          className="rounded-lg bg-secondary px-4 py-2 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-muted"
        >
          Audit Another Deck
        </button>
      </div>

      <DiligenceScore
        score={result.overallScore}
        redFlagCount={result.flags.length}
        companyName={result.companyName}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Associate Notes</h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {result.flags.length} findings · {highCount} critical
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {result.flags.map((flag, i) => (
            <RedFlagCard key={i} {...flag} />
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from "react";
import { DeckUploader } from "./DeckUploader";
import { ProcessingStatus } from "./ProcessingStatus";
import { DiligenceScore } from "./DiligenceScore";
import { RedFlagCard } from "./RedFlagCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePitchDecks, type PitchDeck } from "@/hooks/usePitchDecks";
import { FileText, MoreHorizontal, Download, Eye, CheckCircle2, Archive, Trash2, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

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
  const { decks, activeDeck, loading, makeActive, deleteDeck, getDownloadUrl } = usePitchDecks();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleUpload = useCallback(async (deckText: string) => {
    setState("processing");
    try {
      const { data, error } = await supabase.functions.invoke("audit-deck", { body: { deckText } });
      if (error) throw new Error(error.message || "Failed to analyze deck");
      if (data?.error) throw new Error(data.error);
      setResult(data as AuditResult);
      setState("report");
    } catch (err) {
      console.error("Audit error:", err);
      toast({ title: "Analysis Failed", description: err instanceof Error ? err.message : "Something went wrong.", variant: "destructive" });
      setState("upload");
    }
  }, []);

  const handleReset = useCallback(() => { setState("upload"); setResult(null); }, []);

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

  if (state === "upload") {
    return (
      <div className="space-y-8">
        {/* Upload Section */}
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
              <p className="text-xs text-muted-foreground/60 mt-1">Upload a pitch deck from the Company Profile to get started</p>
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
                  {/* PDF Icon */}
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                    deck.is_active ? "bg-success/10" : "bg-destructive/10"
                  }`}>
                    <FileText className={`h-5 w-5 ${deck.is_active ? "text-success" : "text-destructive"}`} />
                  </div>

                  {/* Info */}
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

                  {/* Status Badge */}
                  {deck.is_active ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shrink-0">
                      <Archive className="h-3 w-3" /> Archived
                    </span>
                  )}

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
                        {actionLoading === deck.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
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

      <DiligenceScore score={result.overallScore} redFlagCount={result.flags.length} companyName={result.companyName} />

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

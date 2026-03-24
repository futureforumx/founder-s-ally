import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Globe, Upload, FileText, X, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "./types";

interface StepCompanyDNAProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

const TLDS = [".com", ".io", ".ai", ".org", ".net", ".co", ".dev", ".app", ".xyz", ".tech"];

function extractDomain(url: string): string | null {
  try {
    let u = url.trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const hostname = new URL(u).hostname.replace(/^www\./, "");
    return hostname || null;
  } catch { return null; }
}

function faviconSrc(domain: string): string {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepCompanyDNA({ state, update, onNext, onBack }: StepCompanyDNAProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const websiteDomain = extractDomain(state.websiteUrl);

  const extractTextFromFile = useCallback(async (file: File): Promise<string> => {
    const name = file.name.toLowerCase();

    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return await file.text();
    }

    if (name.endsWith(".pdf")) {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ");
        pages.push(`[Slide ${String(i).padStart(2, "0")}]\n${text}`);
      }

      return pages.join("\n\n");
    }

    throw new Error("Unsupported file type.");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 50 * 1024 * 1024) return;

    setDeckFile(file);
    setIsExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      update({ deckText: text, deckFileName: file.name });
    } catch {
      update({ deckText: "", deckFileName: file.name });
    } finally {
      setIsExtracting(false);
    }
  }, [extractTextFromFile, update]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const removeDeck = () => {
    setDeckFile(null);
    update({ deckText: "", deckFileName: "" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-lg mx-auto space-y-5"
    >
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your Company</h1>
        <p className="text-sm text-muted-foreground">We'll use these to build your company profile.</p>
      </div>

      <div className="space-y-4">
        {/* Company Name */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Company Name
          </label>
          <Input
            value={state.companyName}
            onChange={(e) => update({ companyName: e.target.value })}
            placeholder="Acme Corp"
          />
        </div>

        {/* Website URL */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Website URL
          </label>
          <div className="relative">
            {websiteDomain ? (
              <img
                src={faviconSrc(websiteDomain)}
                alt=""
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            )}
            <Input
              value={state.websiteUrl}
              onChange={(e) => update({ websiteUrl: e.target.value })}
              placeholder="https://acme.com"
              className="pl-10"
            />
          </div>
        </div>

        {/* Pitch Deck */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Pitch Deck (PDF)
          </label>

          {deckFile || state.deckFileName ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {deckFile?.name || state.deckFileName}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {deckFile ? formatFileSize(deckFile.size) : ""}
                  {isExtracting && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Extracting...
                    </span>
                  )}
                  {state.deckText && !isExtracting && (
                    <span className="text-green-500 font-mono ml-2">✓ Text extracted</span>
                  )}
                </p>
              </div>
              <button
                onClick={removeDeck}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 transition-all cursor-pointer",
                  isDragOver
                    ? "border-accent/60 bg-accent/5"
                    : "border-border bg-muted/30 hover:border-accent/40"
                )}
              >
                <Upload className={cn("h-8 w-8 transition-colors", isDragOver ? "text-accent" : "text-muted-foreground/50")} />
                <span className="text-sm text-muted-foreground text-center px-4">
                  Drop PDF here or click to browse
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Upload your latest pitch deck. The AI will extract metrics, competitive landscape, and cap table to build your profile.
              </p>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={onNext}>Continue</Button>
      </div>
    </motion.div>
  );
}

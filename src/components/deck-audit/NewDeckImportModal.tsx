import { useState, useCallback, useRef } from "react";
import { Upload, Link2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface NewDeckImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (text: string) => void;
}

export function NewDeckImportModal({ open, onOpenChange, onImport }: NewDeckImportModalProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const text = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
        pages.push(`[Slide ${String(i).padStart(2, "0")}]\n${text}`);
      }
      return pages.join("\n\n");
    }

    throw new Error("Unsupported file type. Please upload a PDF or TXT file.");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > 50 * 1024 * 1024) {
      setError("File too large. Maximum size is 50 MB.");
      return;
    }
    setIsExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      if (text.trim().length < 50) {
        setError("Could not extract enough text from this file.");
        return;
      }
      onOpenChange(false);
      onImport(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setIsExtracting(false);
    }
  }, [extractTextFromFile, onImport, onOpenChange]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleLinkImport = useCallback(() => {
    if (!linkUrl.trim()) return;
    setError(null);
    setIsExtracting(true);
    // Simulate link fetch — in production this would call an edge function
    setTimeout(() => {
      setIsExtracting(false);
      onOpenChange(false);
      onImport(`[Link Import]\nImported deck from: ${linkUrl}\n\n[Slide 01]\nTitle slide content extracted from link.\n\n[Slide 02]\nProblem statement and market analysis.\n\n[Slide 03]\nSolution overview and product demo.\n\n[Slide 04]\nTraction metrics and growth chart.\n\n[Slide 05]\nTeam and advisors.`);
    }, 1500);
  }, [linkUrl, onImport, onOpenChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <DialogPrimitive.Title className="text-lg font-bold text-foreground tracking-tight">
                Analyze a New Deck
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Upload a new version or import from a link. This will become your active deck.
              </DialogPrimitive.Description>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {/* Link Import Zone */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Import from link</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="Paste link from Google Slides, Pitch, or DocSend..."
                      className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
                      disabled={isExtracting}
                    />
                  </div>
                  <button
                    onClick={handleLinkImport}
                    disabled={!linkUrl.trim() || isExtracting}
                    className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
                  >
                    {isExtracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    Import
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* File Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => !isExtracting && fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center gap-3 transition-all duration-200 ${
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${
                  isDragging ? "bg-primary/10" : "bg-muted"
                }`}>
                  {isExtracting ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Upload className={`h-5 w-5 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {isExtracting ? "Reading your deck..." : "Drag and drop PDF or PPTX, or click to browse"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">PDF or TXT · Max 50 MB</p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.pptx"
                className="hidden"
                onChange={handleInputChange}
              />

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-end">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted active:scale-[0.97]"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

import { useState, useCallback, useRef } from "react";
import { Upload, Link2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { supabase } from "@/integrations/supabase/client";
import { BobbingDots } from "@/components/loading-ui/bobbing-dots";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { inspectPdf } from "@/lib/pdfInspector";
import { withTimeout } from "@/lib/withTimeout";

// pdf.js's worker handshake can hang forever with no error in some environments; never wait past these.
const PDF_PREVIEW_TIMEOUT_MS = 6000;
const PDF_TEXT_FALLBACK_TIMEOUT_MS = 12000;

interface NewDeckImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (text: string, file?: File, pageCount?: number) => void;
}

interface ParsedDeck {
  text: string;
  pageImages: string[];
  pageCount?: number;
}

/** Best-effort page-image thumbnails via pdf.js; hard-timeboxed and never throws. */
async function renderPagePreviews(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await withTimeout(
    pdfjsLib.getDocument({ data: arrayBuffer }).promise,
    PDF_PREVIEW_TIMEOUT_MS,
    "Timed out rendering previews."
  );

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const previews: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.75 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    previews.push(canvas.toDataURL("image/jpeg", 0.82));
  }
  return previews;
}

export function NewDeckImportModal({ open, onOpenChange, onImport }: NewDeckImportModalProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [pendingImportText, setPendingImportText] = useState<string | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [pendingPageCount, setPendingPageCount] = useState<number | undefined>(undefined);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [activePreviewPage, setActivePreviewPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetModalState = useCallback(() => {
    setLinkUrl("");
    setIsDragging(false);
    setError(null);
    setIsExtracting(false);
    setPendingImportText(null);
    setPendingImportFile(null);
    setPendingPageCount(undefined);
    setPagePreviews([]);
    setActivePreviewPage(0);
  }, []);

  const handleModalOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetModalState();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetModalState]);

  const parseDeckFromFile = useCallback(async (file: File): Promise<ParsedDeck> => {
    const name = file.name.toLowerCase();

    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return {
        text: await file.text(),
        pageImages: [],
      };
    }

    if (name.endsWith(".pdf")) {
      // Assess + parse with Firecrawl's pdf-inspector (runs locally in-browser, no worker
      // needed — reliable where raw pdf.js's worker handshake can silently hang forever).
      // Page image previews are best-effort only via pdf.js and run in parallel, hard-timeboxed
      // so a stuck renderer can never block the import.
      const [textResult, previews] = await Promise.all([
        inspectPdf(file)
          .then((inspected) => ({ text: inspected.markdown, pageCount: inspected.pageCount }))
          .catch((err) => {
            console.warn("pdf-inspector failed, falling back to pdf.js text extraction:", err);
            return { text: "", pageCount: undefined as number | undefined };
          }),
        renderPagePreviews(file).catch(() => [] as string[]),
      ]);

      let { text, pageCount } = textResult;

      if (!text) {
        // Fallback: pdf.js text extraction, hard-timeboxed so it can never hang the modal
        // if the worker never responds.
        const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await withTimeout(
          pdfjsLib.getDocument({ data: arrayBuffer }).promise,
          PDF_TEXT_FALLBACK_TIMEOUT_MS,
          "Timed out reading this PDF."
        );

        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
          pages.push(`[Slide ${String(i).padStart(2, "0")}]\n${pageText}`);
        }
        text = pages.join("\n\n");
        pageCount = pdf.numPages;
      }

      return { text, pageImages: previews, pageCount };
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
      const parsed = await parseDeckFromFile(file);

      if (parsed.text.trim().length < 50) {
        setError("Could not extract enough text from this file.");
        return;
      }

      setPendingImportText(parsed.text);
      setPendingImportFile(file);
      setPendingPageCount(parsed.pageCount);
      setPagePreviews(parsed.pageImages);
      setActivePreviewPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setIsExtracting(false);
    }
  }, [parseDeckFromFile]);

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

  const handleLinkImport = useCallback(async () => {
    if (!linkUrl.trim()) return;
    setError(null);
    setIsExtracting(true);

    try {
      const { data, error: scrapeError } = await supabase.functions.invoke("scrape-website", {
        body: { url: linkUrl.trim() },
      });

      if (scrapeError) {
        setError("Failed to fetch content from this link. Please try uploading the file instead.");
        return;
      }

      const markdown = data?.markdown;
      if (!markdown || markdown.trim().length < 50) {
        setError("Could not extract enough content from this link. Try uploading the deck as a PDF instead.");
        return;
      }

      setPendingImportText(`[Link Import]\nImported deck from: ${linkUrl}\n\n${markdown}`);
      setPendingImportFile(null);
      setPendingPageCount(undefined);
      setPagePreviews([]);
      setActivePreviewPage(0);
    } catch {
      setError("Failed to fetch content from this link. Please try uploading the file instead.");
    } finally {
      setIsExtracting(false);
    }
  }, [linkUrl]);

  const handleConfirmImport = useCallback(() => {
    if (!pendingImportText) return;
    onImport(pendingImportText, pendingImportFile ?? undefined, pendingPageCount);
    handleModalOpenChange(false);
  }, [handleModalOpenChange, onImport, pendingImportText, pendingImportFile, pendingPageCount]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleModalOpenChange}>
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
                {isExtracting ? (
                  <BobbingDots className="w-16 text-primary" />
                ) : (
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${
                    isDragging ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <Upload className={`h-5 w-5 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                )}
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

              {/* Slide preview with page buttons */}
              {pagePreviews.length > 0 && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Slide preview
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      Page {activePreviewPage + 1} of {pagePreviews.length}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <img
                      src={pagePreviews[activePreviewPage]}
                      alt={`Slide ${activePreviewPage + 1}`}
                      className="h-48 w-full object-contain"
                    />
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {pagePreviews.map((src, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePreviewPage(idx)}
                        className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md border transition-all ${
                          idx === activePreviewPage
                            ? "border-primary ring-1 ring-primary/40"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <img src={src} alt={`Slide ${idx + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 left-0 right-0 bg-foreground/70 px-1 py-0.5 text-[10px] font-medium text-background">
                          {idx + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pendingImportText && pagePreviews.length === 0 && (
                <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2.5 text-xs text-success">
                  Deck content is ready to import.
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-end gap-2">
              <button
                onClick={handleConfirmImport}
                disabled={!pendingImportText || isExtracting}
                className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none"
              >
                Import deck
              </button>
              <button
                onClick={() => handleModalOpenChange(false)}
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

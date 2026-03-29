import { Upload, FileText, AlertCircle } from "lucide-react";
import { useState, useCallback, useRef } from "react";

interface DeckUploaderProps {
  onUpload: (text: string, file?: File) => void;
}

interface ParsedDeck {
  text: string;
  pageImages: string[];
}

export function DeckUploader({ onUpload }: DeckUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [pendingDeckText, setPendingDeckText] = useState<string | null>(null);
  const [pendingDeckFile, setPendingDeckFile] = useState<File | null>(null);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [activePreviewPage, setActivePreviewPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseDeckFromFile = useCallback(async (file: File): Promise<ParsedDeck> => {
    const name = file.name.toLowerCase();

    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return {
        text: await file.text(),
        pageImages: [],
      };
    }

    if (name.endsWith(".pdf")) {
      // Use pdf.js to extract text from PDF
      const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      const previews: string[] = [];
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ");
        pages.push(`[Slide ${String(i).padStart(2, "0")}]\n${text}`);

        if (ctx) {
          const viewport = page.getViewport({ scale: 0.75 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          previews.push(canvas.toDataURL("image/jpeg", 0.82));
        }
      }

      return {
        text: pages.join("\n\n"),
        pageImages: previews,
      };
    }

    throw new Error("Unsupported file type. Please upload a PDF or TXT file.");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setPendingDeckText(null);
    setPendingDeckFile(null);
    setPagePreviews([]);
    setActivePreviewPage(0);

    if (file.size > 50 * 1024 * 1024) {
      setError("File too large. Maximum size is 50 MB.");
      return;
    }

    setIsExtracting(true);
    try {
      const parsed = await parseDeckFromFile(file);
      if (parsed.text.trim().length < 50) {
        setError("Could not extract enough text from this file. Try a different format.");
        return;
      }

      setPendingDeckText(parsed.text);
      setPendingDeckFile(file);
      setPagePreviews(parsed.pageImages);
      setActivePreviewPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setIsExtracting(false);
    }
  }, [parseDeckFromFile]);

  const handleConfirmUpload = useCallback(() => {
    if (!pendingDeckText) return;
    onUpload(pendingDeckText, pendingDeckFile ?? undefined);
  }, [onUpload, pendingDeckFile, pendingDeckText]);

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

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={`surface-card flex flex-col items-center justify-center gap-4 border-2 border-dashed p-16 transition-colors ${
        isDragging ? "border-accent bg-accent/5" : "border-border"
      }`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
        <Upload className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h3 className="text-sm font-semibold text-foreground">
          {isExtracting ? "Reading your deck..." : "Drop your pitch deck here"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">PDF or TXT · Max 50 MB</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {pagePreviews.length > 0 && (
        <div className="w-full max-w-2xl space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Slide preview</p>
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
                    ? "border-accent ring-1 ring-accent/40"
                    : "border-border hover:border-accent/40"
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

      {pendingDeckText && pagePreviews.length === 0 && !isExtracting && (
        <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
          Deck content extracted and ready.
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        className="hidden"
        onChange={handleInputChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isExtracting}
        className="rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isExtracting ? "Extracting..." : "Browse Files"}
      </button>

      <button
        onClick={handleConfirmUpload}
        disabled={!pendingDeckText || isExtracting}
        className="rounded-lg bg-accent px-5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Analyze Deck
      </button>
      <div className="mt-2 flex items-center gap-4">
        {["Financials", "TAM Logic", "Team Moat", "GTM Strategy"].map((item) => (
          <div key={item} className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-[10px] font-mono text-muted-foreground/60">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

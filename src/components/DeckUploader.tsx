import { AlertCircle } from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { inspectPdf } from "@/lib/pdfInspector";
import { Ripple } from "@/components/loading-ui/ripple";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { withTimeout } from "@/lib/withTimeout";

// pdf.js's worker handshake can hang forever with no error in some environments; never wait past this.
const PDF_TEXT_FALLBACK_TIMEOUT_MS = 12000;

interface DeckUploaderProps {
  onUpload: (text: string, file?: File, pageCount?: number) => void;
}

interface ParsedDeck {
  text: string;
  pageCount?: number;
}

export function DeckUploader({ onUpload }: DeckUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseDeckFromFile = useCallback(async (file: File): Promise<ParsedDeck> => {
    const name = file.name.toLowerCase();

    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return { text: await file.text() };
    }

    if (name.endsWith(".pdf")) {
      // Assess + parse with Firecrawl's pdf-inspector (runs locally in-browser, no upload).
      let text = "";
      let pageCount: number | undefined;
      try {
        const inspected = await inspectPdf(file);
        text = inspected.markdown;
        pageCount = inspected.pageCount;
      } catch (err) {
        console.warn("pdf-inspector failed, falling back to pdf.js text extraction:", err);
      }
      if (text) return { text, pageCount };

      // Fallback: pdf.js text extraction if the WASM parser can't load, errors, or comes back empty.
      const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await withTimeout(
        pdfjsLib.getDocument({ data: arrayBuffer }).promise,
        PDF_TEXT_FALLBACK_TIMEOUT_MS,
        "Timed out reading this PDF."
      );
      const fallbackPages: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: unknown) => (item && typeof item === "object" && "str" in item ? String((item as { str: unknown }).str) : ""))
          .join(" ");
        fallbackPages.push(`[Slide ${String(i).padStart(2, "0")}]\n${pageText}`);
      }

      return { text: fallbackPages.join("\n\n"), pageCount: pdf.numPages };
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
      const { text, pageCount } = await parseDeckFromFile(file);
      if (text.trim().length < 50) {
        setError("Could not extract enough text from this file. Try a different format.");
        return;
      }
      onUpload(text, file, pageCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setIsExtracting(false);
    }
  }, [parseDeckFromFile, onUpload]);

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
      <Ripple className="size-14 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">
        {isExtracting ? "Reading your deck..." : "Drop a PDF or TXT file here."}
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
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
        className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.06] px-5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-white/[0.1] disabled:opacity-50"
      >
        {isExtracting ? "Extracting..." : "Browse Files"}
      </button>
    </div>
  );
}

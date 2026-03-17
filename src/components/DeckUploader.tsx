import { Upload, FileText, AlertCircle } from "lucide-react";
import { useState, useCallback, useRef } from "react";

interface DeckUploaderProps {
  onUpload: (text: string) => void;
}

export function DeckUploader({ onUpload }: DeckUploaderProps) {
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
      // Use pdf.js to extract text from PDF
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
        setError("Could not extract enough text from this file. Try a different format.");
        return;
      }
      onUpload(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setIsExtracting(false);
    }
  }, [extractTextFromFile, onUpload]);

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

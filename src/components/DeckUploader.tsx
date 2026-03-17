import { Upload, FileText } from "lucide-react";
import { useState, useCallback } from "react";

interface DeckUploaderProps {
  onUpload: () => void;
}

export function DeckUploader({ onUpload }: DeckUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onUpload();
  }, [onUpload]);

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
        <h3 className="text-sm font-semibold text-foreground">Drop your pitch deck here</h3>
        <p className="mt-1 text-xs text-muted-foreground">PDF or PPTX · Max 50 MB</p>
      </div>
      <button
        onClick={onUpload}
        className="rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Browse Files
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

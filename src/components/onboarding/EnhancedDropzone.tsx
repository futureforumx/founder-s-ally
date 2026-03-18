import { useRef, useState, useCallback } from "react";
import { Upload, FileText, X } from "lucide-react";

interface EnhancedDropzoneProps {
  file: File | null;
  hasExtractedText: boolean;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EnhancedDropzone({ file, hasExtractedText, onFileSelect, onRemove }: EnhancedDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
          <FileText className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {formatFileSize(file.size)}
            {hasExtractedText && <span className="text-success font-mono ml-2">✓ Text extracted</span>}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed 
          py-8 transition-all cursor-pointer overflow-hidden
          ${isDragOver
            ? "border-accent/60 bg-accent/5"
            : "border-border bg-muted/30 hover:border-accent/40"
          }
        `}
      >
        {/* Animated gradient border overlay on hover/drag */}
        {isDragOver && (
          <div className="absolute inset-0 rounded-lg pointer-events-none animate-pulse"
            style={{
              background: "linear-gradient(135deg, hsl(var(--accent) / 0.08), transparent, hsl(var(--accent) / 0.08))",
            }}
          />
        )}
        <Upload className={`h-8 w-8 transition-colors ${isDragOver ? "text-accent" : "text-muted-foreground/50"}`} />
        <span className="text-sm text-muted-foreground text-center px-4">
          Drop PDF here or click to browse
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Upload your latest PDF. The AI will securely extract your metrics, competitive landscape, and cap table to build your profile.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }}
      />
    </>
  );
}

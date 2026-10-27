import { useRef, useState, type DragEvent } from "react";
import { FileText, Film, Presentation, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileUploadProps = {
  accept: string;
  value: File | null;
  onChange: (file: File | null) => void;
  description: string;
  maxFileSizeBytes: number;
  disabled?: boolean;
  onInvalidFile?: () => void;
  onFileTooLarge?: () => void;
};

function formatFileSize(size: number) {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isAccepted(file: File, accept: string) {
  const rules = accept.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return rules.some((rule) => rule.startsWith(".") ? file.name.toLowerCase().endsWith(rule) : file.type.toLowerCase() === rule);
}

export function FileUpload({ accept, value, onChange, description, maxFileSizeBytes, disabled = false, onInvalidFile, onFileTooLarge }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!isAccepted(file, accept)) {
      onInvalidFile?.();
      return;
    }
    if (file.size > maxFileSizeBytes) {
      onFileTooLarge?.();
      return;
    }
    onChange(file);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };
  return (
    <div
      role="region"
      aria-label="File upload"
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex min-h-64 flex-col items-center justify-center gap-5 overflow-hidden rounded-[1.125rem] border border-dashed px-6 py-8 text-center shadow-[0_0_18px_rgba(164,135,245,0.08)] transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging ? "border-primary/70 bg-primary/5 shadow-[0_0_24px_rgba(164,135,245,0.18)]" : "border-border bg-neutral-900/20 hover:border-primary/45 hover:bg-neutral-900/35 hover:shadow-[0_0_22px_rgba(164,135,245,0.14)]",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input ref={inputRef} type="file" accept={accept} disabled={disabled} className="hidden" onChange={(event) => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      {value ? (
        <>
          <Upload className="size-7 text-neutral-400" aria-hidden="true" />
          <div className="max-w-full space-y-1">
            <p className="max-w-full truncate text-sm font-medium text-neutral-100">{value.name}</p>
            <p className="text-xs text-neutral-400">{formatFileSize(value.size)}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" disabled={disabled} onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} className="h-8 px-3 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white">Replace file</Button>
            <Button type="button" variant="ghost" disabled={disabled} onClick={(event) => { event.stopPropagation(); onChange(null); }} className="h-8 px-3 text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white">Remove file<X className="ml-2 size-3.5" /></Button>
          </div>
        </>
      ) : (
        <>
          <div className="relative flex h-14 w-36 items-center justify-center" aria-hidden="true">
            {[FileText, Presentation, Film].map((Icon, index) => (
              <span key={index} className={cn("absolute grid size-12 place-items-center rounded-xl border border-border bg-background text-muted-foreground transition-transform", index === 1 && "z-10", dragging ? "scale-110" : index === 0 ? "-translate-x-7 -rotate-6" : index === 2 ? "translate-x-7 rotate-6" : "")}><Icon className="size-5" /></span>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{dragging ? "Drop to add" : "Click to upload or drop files"}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Button type="button" variant="outline" disabled={disabled} onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} className="h-8 rounded-full border-border bg-background px-3 text-xs text-muted-foreground"><Upload className="mr-2 size-3.5" />Browse files</Button>
        </>
      )}
    </div>
  );
}

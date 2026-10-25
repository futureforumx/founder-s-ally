import { useEffect, useRef, useState } from "react";
import { FileText, MoreHorizontal, Download, CheckCircle2, Trash2, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import type { PitchDeck } from "@/hooks/usePitchDecks";

const labelClass = "text-[11px] font-medium uppercase leading-4 tracking-[0.12em] text-muted-foreground";
const metaClass = "text-[13px] leading-[18px] text-muted-foreground";
const ROW = "grid w-full grid-cols-[32px_minmax(0,1fr)_56px_72px_140px_72px_32px] items-center gap-4";

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EditableDeckName({
  fileName,
  onRename,
  disabled,
}: {
  fileName: string;
  onRename: (newFileName: string) => void;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(fileName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) setValue(fileName);
  }, [fileName, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commit = () => {
    setIsEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== fileName) onRename(trimmed);
    else setValue(fileName);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); setValue(fileName); setIsEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full min-w-0 rounded-md border border-primary/40 bg-background px-1.5 py-0.5 text-sm font-medium leading-5 text-foreground outline-none ring-2 ring-primary/20"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setIsEditing(true)}
      className="w-full min-w-0 truncate text-left text-sm font-medium leading-5 text-foreground disabled:cursor-not-allowed"
    >
      {fileName}
    </button>
  );
}

function DeckRow({
  deck,
  actionLoading,
  onDownload,
  onRename,
  onMakeActive,
  onDelete,
}: {
  deck: PitchDeck;
  actionLoading: string | null;
  onDownload: (d: PitchDeck) => void;
  onRename: (d: PitchDeck, newFileName: string) => void;
  onMakeActive: (d: PitchDeck) => void;
  onDelete: (d: PitchDeck) => void;
}) {
  return (
    <div className={`${ROW} border-b border-border py-4`}>
      <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-card">
        <FileText className="size-3.5 text-foreground" strokeWidth={1.6} />
      </div>

      <EditableDeckName
        fileName={deck.file_name}
        onRename={(newFileName) => onRename(deck, newFileName)}
        disabled={actionLoading === deck.id}
      />

      <span className={metaClass}>
        {deck.slide_count ?? "—"}
      </span>

      <span className={metaClass}>
        {formatFileSize(deck.file_size_bytes)}
      </span>

      <span className={metaClass}>
        {format(new Date(deck.uploaded_at), "MMM d, yyyy")}
      </span>

      <span className={`text-[13px] leading-[18px] ${
        deck.is_active ? "font-medium text-success" : "text-muted-foreground"
      }`}>
        {deck.is_active ? "Active" : "Archived"}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 items-center justify-center justify-self-end text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Actions for ${deck.file_name}`}
          >
            {actionLoading === deck.id
              ? <Loader2 className="size-3.5 animate-spin" />
              : <MoreHorizontal className="size-3.5" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {!deck.is_active && (
            <DropdownMenuItem onClick={() => onMakeActive(deck)}>
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Make active
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onDownload(deck)}>
            <Download className="mr-2 h-3.5 w-3.5" /> Download
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(deck)} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function VersionHistoryAccordion({
  decks,
  loading,
  actionLoading,
  onDownload,
  onRename,
  onMakeActive,
  onDelete,
}: {
  decks: PitchDeck[];
  loading: boolean;
  actionLoading: string | null;
  onDownload: (deck: PitchDeck) => void;
  onRename: (deck: PitchDeck, newFileName: string) => void;
  onMakeActive: (deck: PitchDeck) => void;
  onDelete: (deck: PitchDeck) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h3 className={labelClass}>Version History</h3>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {decks.length} {decks.length === 1 ? "version" : "versions"}
        </p>
      </div>

      {loading ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">Loading…</p>
      ) : decks.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          No decks uploaded yet.
        </p>
      ) : (
        <div>
          <div className={`${ROW} pb-2`}>
            <span />
            <span className={labelClass}>Name</span>
            <span className={labelClass}>Slides</span>
            <span className={labelClass}>Size</span>
            <span className={labelClass}>Uploaded</span>
            <span />
            <span />
          </div>

          {decks.map((deck) => (
            <DeckRow
              key={deck.id}
              deck={deck}
              actionLoading={actionLoading}
              onDownload={onDownload}
              onRename={onRename}
              onMakeActive={onMakeActive}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

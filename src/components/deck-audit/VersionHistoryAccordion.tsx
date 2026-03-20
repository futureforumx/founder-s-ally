import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, MoreHorizontal, Download, CheckCircle2, Archive, Trash2, Loader2, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import type { PitchDeck } from "@/hooks/usePitchDecks";

interface VersionHistoryAccordionProps {
  decks: PitchDeck[];
  loading: boolean;
  actionLoading: string | null;
  onDownload: (deck: PitchDeck) => void;
  onMakeActive: (deck: PitchDeck) => void;
  onDelete: (deck: PitchDeck) => void;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DeckRow({
  deck,
  actionLoading,
  onDownload,
  onMakeActive,
  onDelete,
  muted = false,
}: {
  deck: PitchDeck;
  actionLoading: string | null;
  onDownload: (d: PitchDeck) => void;
  onMakeActive: (d: PitchDeck) => void;
  onDelete: (d: PitchDeck) => void;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-xl border px-4 py-3 transition-all duration-200",
        deck.is_active
          ? "border-success/30 bg-success/5 shadow-sm"
          : "border-border bg-card hover:border-border/80 hover:shadow-sm",
        muted && "opacity-70 hover:opacity-100"
      )}
    >
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", deck.is_active ? "bg-success/10" : "bg-muted")}>
        <FileText className={cn("h-5 w-5", deck.is_active ? "text-success" : "text-muted-foreground")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{deck.file_name}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground">{format(new Date(deck.uploaded_at), "MMM d, yyyy · h:mm a")}</span>
          {deck.file_size_bytes && <span className="text-xs text-muted-foreground/60">{formatFileSize(deck.file_size_bytes)}</span>}
        </div>
      </div>
      {deck.is_active ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success shrink-0">
          <CheckCircle2 className="h-3 w-3" /> Active
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shrink-0">
          <Archive className="h-3 w-3" /> Archived
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
            {actionLoading === deck.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onDownload(deck)}>
            <Download className="h-3.5 w-3.5 mr-2" /> Download
          </DropdownMenuItem>
          {!deck.is_active && (
            <DropdownMenuItem onClick={() => onMakeActive(deck)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Make Active
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onDelete(deck)} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function VersionHistoryAccordion({ decks, loading, actionLoading, onDownload, onMakeActive, onDelete }: VersionHistoryAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeDeck = decks.find((d) => d.is_active);
  const archivedDecks = decks.filter((d) => !d.is_active);
  const archivedCount = archivedDecks.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Version History</h3>
          <p className="text-xs text-muted-foreground mt-0.5">All uploaded pitch decks across your profile</p>
        </div>
        {decks.length > 0 && (
          <span className="text-xs font-mono text-muted-foreground">{decks.length} version{decks.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : decks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No decks uploaded yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Upload a pitch deck to get started</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Active deck row */}
          {activeDeck && (
            <DeckRow deck={activeDeck} actionLoading={actionLoading} onDownload={onDownload} onMakeActive={onMakeActive} onDelete={onDelete} />
          )}

          {/* Toggle button */}
          {archivedCount > 0 && (
            <>
              <button
                onClick={() => setIsOpen((v) => !v)}
                className="flex items-center justify-center w-full py-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer rounded-b-xl mt-1"
              >
                {isOpen ? "Hide past versions" : `View past versions (${archivedCount})`}
                <ChevronDown className={cn("w-4 h-4 ml-1 transition-transform duration-200", isOpen && "rotate-180")} />
              </button>

              {/* Collapsible archived rows */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300 ease-in-out",
                  isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="flex flex-col gap-2 pt-1">
                  {archivedDecks.map((deck) => (
                    <DeckRow key={deck.id} deck={deck} actionLoading={actionLoading} onDownload={onDownload} onMakeActive={onMakeActive} onDelete={onDelete} muted />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

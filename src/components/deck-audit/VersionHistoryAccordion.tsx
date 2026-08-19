import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, MoreHorizontal, Download, CheckCircle2, Archive, Trash2, Loader2, ChevronDown, Pencil, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import type { PitchDeck } from "@/hooks/usePitchDecks";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { CompanySettingsLogo } from "@/components/ui/company-settings-logo";

const ROW_GRID_COLS = "grid-cols-[40px_minmax(0,1fr)_64px_88px_168px_92px_32px]";

interface VersionHistoryAccordionProps {
  decks: PitchDeck[];
  loading: boolean;
  actionLoading: string | null;
  onDownload: (deck: PitchDeck) => void;
  onRename: (deck: PitchDeck, newFileName: string) => void;
  onMakeActive: (deck: PitchDeck) => void;
  onDelete: (deck: PitchDeck) => void;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
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
        className="min-w-0 rounded-md border border-primary/40 bg-background px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none ring-2 ring-primary/20"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setIsEditing(true)}
      className="group/name flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed"
    >
      <span className="text-sm font-semibold text-foreground truncate min-w-0">{fileName}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/0 group-hover/name:text-muted-foreground/70 transition-colors" />
    </button>
  );
}

function StatusBadge({
  deck,
  disabled,
  onMakeActive,
}: {
  deck: PitchDeck;
  disabled?: boolean;
  onMakeActive: (deck: PitchDeck) => void;
}) {
  if (deck.is_active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success shrink-0 justify-self-start">
        <CheckCircle2 className="h-3 w-3" /> Active
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shrink-0 justify-self-start transition-colors hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Archive className="h-3 w-3" /> Archived
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        <DropdownMenuItem onClick={() => onMakeActive(deck)}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Active
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="text-muted-foreground/70">
          <Archive className="h-3.5 w-3.5 mr-2" /> Archived
          <Check className="h-3.5 w-3.5 ml-auto" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeckRow({
  deck,
  actionLoading,
  onDownload,
  onRename,
  onMakeActive,
  onDelete,
  muted = false,
  companyName,
  logoUrl,
  websiteUrl,
  hasProfile,
}: {
  deck: PitchDeck;
  actionLoading: string | null;
  onDownload: (d: PitchDeck) => void;
  onRename: (d: PitchDeck, newFileName: string) => void;
  onMakeActive: (d: PitchDeck) => void;
  onDelete: (d: PitchDeck) => void;
  muted?: boolean;
  companyName: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  hasProfile: boolean;
}) {
  return (
    <div
      className={cn(
        "group grid items-center gap-4 rounded-xl border px-4 py-3 transition-all duration-200",
        ROW_GRID_COLS,
        deck.is_active
          ? "border-success/30 bg-success/5 shadow-sm"
          : "border-border bg-card hover:border-border/80 hover:shadow-sm",
        muted && "opacity-70 hover:opacity-100"
      )}
    >
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border",
          deck.is_active ? "bg-success/10 border-success/20" : "bg-muted border-border/60"
        )}
      >
        <CompanySettingsLogo
          companyName={companyName}
          logoUrl={logoUrl}
          websiteUrl={websiteUrl}
          hasProfile={hasProfile}
          size={40}
          alt={companyName ? `${companyName} logo` : "Company logo"}
          imgClassName="h-full w-full object-contain p-1.5"
          initialClassName={cn("text-sm font-semibold", deck.is_active ? "text-success" : "text-muted-foreground")}
          iconClassName={cn("h-5 w-5", deck.is_active ? "text-success" : "text-muted-foreground")}
        />
      </div>

      <EditableDeckName
        fileName={deck.file_name}
        onRename={(newFileName) => onRename(deck, newFileName)}
        disabled={actionLoading === deck.id}
      />

      <span className="text-xs text-muted-foreground/80 font-mono tabular-nums whitespace-nowrap">
        {deck.slide_count ? `${deck.slide_count}` : "—"}
      </span>

      <span className="text-xs text-muted-foreground/80 font-mono tabular-nums whitespace-nowrap">
        {deck.file_size_bytes ? formatFileSize(deck.file_size_bytes) : "—"}
      </span>

      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {format(new Date(deck.uploaded_at), "MMM d, yyyy · h:mm a")}
      </span>

      <StatusBadge deck={deck} disabled={actionLoading === deck.id} onMakeActive={onMakeActive} />

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
          <DropdownMenuItem onClick={() => onDelete(deck)} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function VersionHistoryAccordion({ decks, loading, actionLoading, onDownload, onRename, onMakeActive, onDelete }: VersionHistoryAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { companyName, logoUrl, websiteUrl, hasProfile } = useCompanyBranding();

  const activeDeck = decks.find((d) => d.is_active);
  const archivedDecks = decks.filter((d) => !d.is_active);
  const archivedCount = archivedDecks.length;

  const brandingProps = { companyName, logoUrl, websiteUrl, hasProfile };

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
          {/* Column headers */}
          <div className={cn("grid items-center gap-4 px-4 pb-2", ROW_GRID_COLS)}>
            <span />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Name</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Slides</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Size</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Uploaded</span>
            <span />
            <span />
          </div>

          {/* Active deck row */}
          {activeDeck && (
            <DeckRow deck={activeDeck} actionLoading={actionLoading} onDownload={onDownload} onRename={onRename} onMakeActive={onMakeActive} onDelete={onDelete} {...brandingProps} />
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
                    <DeckRow key={deck.id} deck={deck} actionLoading={actionLoading} onDownload={onDownload} onRename={onRename} onMakeActive={onMakeActive} onDelete={onDelete} muted {...brandingProps} />
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

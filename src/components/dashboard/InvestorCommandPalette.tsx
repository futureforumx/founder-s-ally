import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search, Building2, User, Flame, Users, Clock, Sparkles, ArrowRight,
  Zap, TrendingUp, Star, Download, Plus, ListFilter, X, CornerDownLeft,
} from "lucide-react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FirmLogo } from "@/components/ui/firm-logo";
import Fuse from "fuse.js";
import type { VCFirm, VCPerson } from "@/hooks/useVCDirectory";
import type { LiveInvestorEntry } from "@/hooks/useInvestorDirectory";

// ── Types ──
type FilterChip = "all" | "matches" | "sector" | "stage" | "trending" | "popular" | "recent";

interface InvestorCommandPaletteProps {
  firms: VCFirm[];
  people: VCPerson[];
  firmMap: Map<string, VCFirm>;
  dbInvestors?: LiveInvestorEntry[];
  userSector?: string | null;
  userStage?: string | null;
  onSelectFirm?: (firmId: string) => void;
  onSelectPerson?: (personId: string) => void;
  onNavigateMatches?: () => void;
  onExportShortlist?: () => void;
  /** External open state — parent can control */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// ── Filter chip config ──
const FILTER_CHIPS: { id: FilterChip; label: string; icon: typeof Search }[] = [
  { id: "all", label: "All", icon: ListFilter },
  { id: "matches", label: "Matches", icon: Zap },
  { id: "sector", label: "Sector", icon: Building2 },
  { id: "stage", label: "Stage", icon: TrendingUp },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "popular", label: "Popular", icon: Star },
  { id: "recent", label: "Recent", icon: Clock },
];

// ── Badge icons for result rows ──
function ResultBadges({ entry }: { entry: LiveInvestorEntry }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {entry.is_trending && <Flame className="h-3 w-3 text-orange-400" />}
      {entry.is_popular && <Users className="h-3 w-3 text-violet-400" />}
      {entry.is_recent && <Clock className="h-3 w-3 text-sky-400" />}
    </span>
  );
}

// ── AI suggestion generator ──
function getAISuggestions(sector?: string | null, stage?: string | null): string[] {
  const base: string[] = [];
  if (sector) {
    base.push(
      `Lead ${sector} investors`,
      `Top ${sector} funds actively deploying`,
    );
  }
  if (stage) {
    base.push(`Investors writing ${stage} checks`);
  }
  if (base.length === 0) {
    base.push(
      "Top AI Seed funds in NY",
      "Climate investors deploying now",
      "VCs who like agentic AI",
    );
  }
  return base.slice(0, 3);
}

export function InvestorCommandPalette({
  firms, people, firmMap, dbInvestors,
  userSector, userStage,
  onSelectFirm, onSelectPerson,
  onNavigateMatches, onExportShortlist,
  open: externalOpen, onOpenChange: externalOnOpenChange,
}: InvestorCommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = externalOnOpenChange ?? setInternalOpen;

  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<FilterChip>("all");

  // ── Cmd+K shortcut ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  // Reset on open
  useEffect(() => {
    if (open) { setQuery(""); setActiveChip("all"); }
  }, [open]);

  // ── Build DB lookup ──
  const dbMap = useMemo(() => {
    const m = new Map<string, LiveInvestorEntry>();
    if (dbInvestors) {
      for (const inv of dbInvestors) {
        m.set(inv.name.toLowerCase().trim(), inv);
      }
    }
    return m;
  }, [dbInvestors]);

  // ── Fuse.js indexes ──
  const firmFuse = useMemo(
    () => new Fuse(firms, { keys: ["name", "sectors"], threshold: 0.35, includeScore: true }),
    [firms]
  );
  const personFuse = useMemo(
    () => new Fuse(people, { keys: ["full_name", "title"], threshold: 0.35, includeScore: true }),
    [people]
  );

  // ── Chip-filtered DB investors ──
  const chipFiltered = useMemo(() => {
    if (!dbInvestors) return [];
    switch (activeChip) {
      case "trending":
        return dbInvestors.filter(i => i.is_trending);
      case "popular":
        return dbInvestors.filter(i => i.is_popular);
      case "recent":
        return dbInvestors.filter(i => i.is_recent);
      case "matches":
        // Placeholder: show actively deploying as proxy until real match_score
        return dbInvestors.filter(i => i.is_actively_deploying);
      case "sector":
        return userSector
          ? dbInvestors.filter(i => i.sector.toLowerCase().includes(userSector.toLowerCase()))
          : dbInvestors;
      case "stage":
        return userStage
          ? dbInvestors.filter(i => i.stage.toLowerCase().includes(userStage.toLowerCase()))
          : dbInvestors;
      default:
        return dbInvestors;
    }
  }, [dbInvestors, activeChip, userSector, userStage]);

  // ── Search results ──
  const { firmResults, personResults, dbResults } = useMemo(() => {
    const q = query.trim();

    if (!q) {
      // No query — show chip-filtered DB investors
      return {
        firmResults: [] as VCFirm[],
        personResults: [] as VCPerson[],
        dbResults: chipFiltered.slice(0, 8),
      };
    }

    // Fuzzy search
    const fr = firmFuse.search(q).slice(0, 6).map(r => r.item);
    const pr = personFuse.search(q).slice(0, 4).map(r => r.item);

    // Also filter chip-filtered DB by query
    const dbr = chipFiltered
      .filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || i.sector.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 6);

    return { firmResults: fr, personResults: pr, dbResults: dbr };
  }, [query, firmFuse, personFuse, chipFiltered]);

  const aiSuggestions = useMemo(
    () => getAISuggestions(userSector, userStage),
    [userSector, userStage]
  );

  const handleSelectFirm = useCallback((firm: VCFirm) => {
    setOpen(false);
    onSelectFirm?.(firm.id);
  }, [setOpen, onSelectFirm]);

  const handleSelectPerson = useCallback((person: VCPerson) => {
    setOpen(false);
    onSelectPerson?.(person.id);
  }, [setOpen, onSelectPerson]);

  const handleSelectDbInvestor = useCallback((entry: LiveInvestorEntry) => {
    setOpen(false);
    // Try to find matching VC firm first
    const vcFirm = firms.find(f => f.name.toLowerCase() === entry.name.toLowerCase());
    if (vcFirm) {
      onSelectFirm?.(vcFirm.id);
    } else {
      onSelectFirm?.(entry.id);
    }
  }, [setOpen, firms, onSelectFirm]);

  const hasResults = firmResults.length > 0 || personResults.length > 0 || dbResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="!p-0 !gap-0 max-w-2xl overflow-hidden border-zinc-700/60 bg-zinc-900/[0.97] backdrop-blur-2xl shadow-2xl shadow-black/40 rounded-xl [&>button]:hidden"
      >
        <Command
          className="bg-transparent"
          shouldFilter={false}
          loop
        >
          {/* ── Search input ── */}
          <div className="flex items-center border-b border-zinc-800 px-4">
            <Search className="h-4 w-4 text-zinc-500 shrink-0 mr-2" />
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search or type a command…"
              className="h-12 border-0 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
              ⌘K
            </kbd>
          </div>

          {/* ── Filter chips ── */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-zinc-800/60 overflow-x-auto scrollbar-none">
            <span className="text-[10px] text-zinc-500 font-medium shrink-0 mr-1">I'm looking for</span>
            {FILTER_CHIPS.map(chip => {
              const Icon = chip.icon;
              const isActive = activeChip === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setActiveChip(chip.id)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? "bg-zinc-700 text-zinc-100 shadow-sm"
                      : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* ── Results list ── */}
          <CommandList className="max-h-[420px] overflow-y-auto">
            {/* AI Suggestions (only when no query) */}
            {!query.trim() && (
              <CommandGroup heading={
                <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-emerald-400/80">
                  <Sparkles className="h-3 w-3" /> AI Suggestions
                </span>
              }>
                {aiSuggestions.map((suggestion, i) => (
                  <CommandItem
                    key={`ai-${i}`}
                    onSelect={() => setQuery(suggestion)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-zinc-300 hover:bg-zinc-800 aria-selected:bg-zinc-800 aria-selected:text-zinc-100"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <span className="text-sm">{suggestion}</span>
                    <span className="ml-auto text-[10px] text-zinc-600 italic">try this</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* DB Investors (chip-filtered or searched) */}
            {dbResults.length > 0 && (
              <>
                <CommandSeparator className="bg-zinc-800/60" />
                <CommandGroup heading={
                  <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-500">
                    <Building2 className="h-3 w-3" />
                    {activeChip !== "all" && activeChip !== "matches"
                      ? `${activeChip.charAt(0).toUpperCase() + activeChip.slice(1)} Firms`
                      : "Firms"
                    }
                    <span className="text-zinc-600 ml-0.5">{dbResults.length}</span>
                  </span>
                }>
                  {dbResults.map(entry => {
                    const vcFirm = firms.find(f => f.name.toLowerCase() === entry.name.toLowerCase());
                    return (
                      <CommandItem
                        key={entry.id}
                        value={entry.name}
                        onSelect={() => handleSelectDbInvestor(entry)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-zinc-300 hover:bg-zinc-800 aria-selected:bg-zinc-800 aria-selected:text-zinc-100 group"
                      >
                        <FirmLogo
                          firmName={entry.name}
                          logoUrl={entry.logo_url}
                          websiteUrl={entry.website_url}
                          size="sm"
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100 truncate">{entry.name}</span>
                            <ResultBadges entry={entry} />
                          </div>
                          <span className="text-[11px] text-zinc-500 truncate block">
                            {[entry.stage, entry.aum, entry.location].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                        <span className="opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 transition-opacity text-[10px] text-zinc-600 flex items-center gap-0.5 shrink-0">
                          <CornerDownLeft className="h-3 w-3" /> Open
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {/* Fuzzy-matched VC firms (only when typing) */}
            {query.trim() && firmResults.length > 0 && (
              <>
                <CommandSeparator className="bg-zinc-800/60" />
                <CommandGroup heading={
                  <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-500">
                    <Building2 className="h-3 w-3" /> Directory Firms
                    <span className="text-zinc-600 ml-0.5">{firmResults.length}</span>
                  </span>
                }>
                  {firmResults.map(firm => {
                    const dbEntry = dbMap.get(firm.name.toLowerCase().trim());
                    return (
                      <CommandItem
                        key={firm.id}
                        value={firm.name}
                        onSelect={() => handleSelectFirm(firm)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-zinc-300 hover:bg-zinc-800 aria-selected:bg-zinc-800 aria-selected:text-zinc-100 group"
                      >
                        <FirmLogo
                          firmName={firm.name}
                          logoUrl={firm.logo_url || dbEntry?.logo_url}
                          websiteUrl={firm.website_url || dbEntry?.website_url}
                          size="sm"
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100 truncate">{firm.name}</span>
                            {dbEntry && <ResultBadges entry={dbEntry} />}
                          </div>
                          <span className="text-[11px] text-zinc-500 truncate block">
                            {[firm.stages?.slice(0, 2).join(", "), firm.aum].filter(Boolean).join(" · ") || "Investor"}
                          </span>
                        </div>
                        <span className="opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 transition-opacity text-[10px] text-zinc-600 flex items-center gap-0.5 shrink-0">
                          <CornerDownLeft className="h-3 w-3" /> Open
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {/* People results */}
            {query.trim() && personResults.length > 0 && (
              <>
                <CommandSeparator className="bg-zinc-800/60" />
                <CommandGroup heading={
                  <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-500">
                    <User className="h-3 w-3" /> Partners & Angels
                    <span className="text-zinc-600 ml-0.5">{personResults.length}</span>
                  </span>
                }>
                  {personResults.map(person => {
                    const firm = firmMap.get(person.firm_id);
                    return (
                      <CommandItem
                        key={person.id}
                        value={person.full_name}
                        onSelect={() => handleSelectPerson(person)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-zinc-300 hover:bg-zinc-800 aria-selected:bg-zinc-800 aria-selected:text-zinc-100 group"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 shrink-0">
                          <User className="h-3.5 w-3.5 text-zinc-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-zinc-100 truncate block">{person.full_name}</span>
                          <span className="text-[11px] text-zinc-500 truncate block">
                            {[person.title, firm?.name].filter(Boolean).join(" at ")}
                          </span>
                        </div>
                        <span className="opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 transition-opacity text-[10px] text-zinc-600 flex items-center gap-0.5 shrink-0">
                          <CornerDownLeft className="h-3 w-3" /> Open
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {/* Actions */}
            <CommandSeparator className="bg-zinc-800/60" />
            <CommandGroup heading={
              <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-500">Quick Actions</span>
            }>
              {onNavigateMatches && (
                <CommandItem
                  onSelect={() => { setOpen(false); onNavigateMatches(); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 aria-selected:bg-zinc-800 aria-selected:text-zinc-200"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10 shrink-0">
                    <Zap className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                  <span className="text-sm">View My Matches</span>
                  <kbd className="ml-auto hidden sm:inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-mono text-zinc-500">M</kbd>
                </CommandItem>
              )}
              {onExportShortlist && (
                <CommandItem
                  onSelect={() => { setOpen(false); onExportShortlist(); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 aria-selected:bg-zinc-800 aria-selected:text-zinc-200"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/10 shrink-0">
                    <Download className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <span className="text-sm">Export Shortlist</span>
                  <kbd className="ml-auto hidden sm:inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-mono text-zinc-500">E</kbd>
                </CommandItem>
              )}
            </CommandGroup>

            {/* Empty state */}
            {query.trim() && !hasResults && (
              <CommandEmpty className="py-8 text-center">
                <p className="text-sm text-zinc-500">No results for "<span className="text-zinc-300 font-medium">{query}</span>"</p>
                <p className="text-xs text-zinc-600 mt-1">Try a natural language query like "AI Seed funds in NY"</p>
              </CommandEmpty>
            )}
          </CommandList>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2">
            <div className="flex items-center gap-3 text-[10px] text-zinc-600">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono">↑↓</kbd> Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono">↵</kbd> Open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono">esc</kbd> Close
              </span>
            </div>
            <span className="text-[9px] text-zinc-700 font-mono">Hybrid Search · Fuzzy + AI</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Dark inline search bar + filter chips matching Raycast aesthetic */
export function InvestorSearchTrigger({
  placeholder,
  onClick,
  activeChip,
  onChipChange,
}: {
  placeholder?: string;
  onClick: () => void;
  activeChip?: string;
  onChipChange?: (chip: string) => void;
}) {
  return (
    <div className="w-full space-y-0">
      {/* ── Search bar ── */}
      <button
        onClick={onClick}
        className="flex h-14 w-full items-center gap-3 rounded-t-2xl border border-zinc-700/60 bg-zinc-900/95 backdrop-blur-xl pl-5 pr-5 shadow-lg hover:border-zinc-600/80 transition-all cursor-text group"
      >
        <Search className="h-5 w-5 text-zinc-500 shrink-0 group-hover:text-zinc-400 transition-colors" />
        <span className="flex-1 text-left text-[15px] text-zinc-500 truncate font-normal">
          {placeholder || "Search or type a command…"}
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-mono text-zinc-500">
          ⌘K
        </kbd>
      </button>

      {/* ── Filter chips row ── */}
      <div className="flex items-center gap-2 px-5 py-2.5 rounded-b-2xl border border-t-0 border-zinc-700/60 bg-zinc-900/90 backdrop-blur-xl overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        <span className="text-[11px] text-zinc-500 font-medium shrink-0 mr-0.5">I'm looking for</span>
        {FILTER_CHIPS.map(chip => {
          const Icon = chip.icon;
          const isActive = activeChip === chip.id;
          return (
            <button
              key={chip.id}
              onClick={(e) => {
                e.stopPropagation();
                onChipChange?.(chip.id);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 border border-zinc-700/40"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

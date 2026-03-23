import { useState, useEffect, useRef, useMemo } from "react";
import { Building2, Search, ChevronDown, ChevronRight, Zap, TrendingUp, Activity, Radio, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ViewType = "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "settings";

interface GlobalTopNavProps {
  companyName?: string | null;
  logoUrl?: string | null;
  hasProfile: boolean;
  lastSyncedAt: Date | null;
  syncFlash: boolean;
  relativeTime: string;
  onNavigateProfile: () => void;
  activeView?: ViewType;
  onViewChange?: (view: ViewType) => void;
  onOpenCommandPalette?: () => void;
}

// ── View metadata for breadcrumbs ──
const VIEW_META: Record<ViewType, { section: string; label: string; parent?: ViewType; siblings?: { id: ViewType; label: string }[] }> = {
  dashboard: { section: "Mission Control", label: "Overview" },
  company: { section: "My Company", label: "Company Settings", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  competitors: { section: "My Company", label: "Competitors", parent: "company", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  sector: { section: "My Company", label: "Sector", parent: "company", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  benchmarks: { section: "My Company", label: "Benchmarks", parent: "company", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  audit: { section: "My Company", label: "Deck Audit", parent: "company", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  investors: { section: "Investors", label: "Matches", siblings: [
    { id: "investors", label: "Matches" },
    { id: "investor-search", label: "Search" },
    { id: "connections", label: "Connections" },
  ]},
  "investor-search": { section: "Investors", label: "Search", parent: "investors", siblings: [
    { id: "investors", label: "Matches" },
    { id: "investor-search", label: "Search" },
    { id: "connections", label: "Connections" },
  ]},
  connections: { section: "Investors", label: "Connections", parent: "investors", siblings: [
    { id: "investors", label: "Matches" },
    { id: "investor-search", label: "Search" },
    { id: "connections", label: "Connections" },
  ]},
  directory: { section: "Community", label: "Directory", siblings: [
    { id: "directory", label: "Directory" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Events" },
  ]},
  groups: { section: "Community", label: "Groups", parent: "directory", siblings: [
    { id: "directory", label: "Directory" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Events" },
  ]},
  events: { section: "Community", label: "Events", parent: "directory", siblings: [
    { id: "directory", label: "Directory" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Events" },
  ]},
  messages: { section: "Community", label: "Messages" },
  settings: { section: "Settings", label: "Settings" },
};

// ── Live Market Pulse messages ──
const PULSE_MESSAGES = [
  { text: "12 New Seed Rounds Today", icon: Zap, color: "text-emerald-400" },
  { text: "3 Funds Actively Deploying", icon: Activity, color: "text-sky-400" },
  { text: "AI Sector +18% This Week", icon: TrendingUp, color: "text-amber-400" },
  { text: "8 New Investors Added", icon: Radio, color: "text-violet-400" },
];

function useRotatingPulse(interval = 4000) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % PULSE_MESSAGES.length), interval);
    return () => clearInterval(t);
  }, [interval]);
  return PULSE_MESSAGES[idx];
}

export function GlobalTopNav({
  companyName,
  logoUrl,
  hasProfile,
  lastSyncedAt,
  syncFlash,
  relativeTime,
  onNavigateProfile,
  activeView = "dashboard",
  onViewChange,
  onOpenCommandPalette,
}: GlobalTopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const pulse = useRotatingPulse();

  // Detect scroll for glassmorphism effect
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const handler = () => {
      setScrolled(main.scrollTop > 12);
      setSearchCollapsed(main.scrollTop > 80);
    };
    main.addEventListener("scroll", handler, { passive: true });
    return () => main.removeEventListener("scroll", handler);
  }, []);

  const viewMeta = VIEW_META[activeView] || VIEW_META.dashboard;
  const isInvestorArea = ["investors", "investor-search", "connections"].includes(activeView);
  const PulseIcon = pulse.icon;

  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-50 px-6 py-2.5 flex items-center gap-4 transition-all duration-300",
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent border-b border-transparent"
      )}
      style={{ left: "11rem" }}
    >
      {/* ── Left: Contextual Intelligence ── */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Dropdown Breadcrumbs */}
        <nav className="flex items-center gap-1 text-[12px] shrink-0">
          <span className="text-muted-foreground/60 font-medium">{viewMeta.section}</span>

          {viewMeta.siblings && viewMeta.siblings.length > 1 ? (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                  {viewMeta.label}
                  <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                  {viewMeta.siblings.map(s => (
                    <DropdownMenuItem
                      key={s.id}
                      onClick={() => onViewChange?.(s.id)}
                      className={cn(
                        "text-xs cursor-pointer",
                        activeView === s.id && "bg-accent/10 text-accent font-semibold"
                      )}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
              <span className="font-semibold text-foreground">{viewMeta.label}</span>
            </>
          )}
        </nav>

        {/* Separator */}
        <div className="h-4 w-px bg-border/50 shrink-0" />

        {/* Live Market Pulse (investor views) or sync status */}
        {isInvestorArea ? (
          <div
            key={pulse.text}
            className="flex items-center gap-1.5 text-[11px] font-medium animate-fade-in"
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <PulseIcon className={cn("h-3 w-3 shrink-0", pulse.color)} />
            <span className="text-muted-foreground truncate">{pulse.text}</span>
          </div>
        ) : lastSyncedAt ? (
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <Clock className="h-3 w-3 text-muted-foreground/50" />
            <span className={cn(
              "transition-colors duration-500 truncate",
              syncFlash ? "text-success" : "text-muted-foreground/70"
            )}>
              {syncFlash ? "Analyzed just now" : `Last analyzed ${relativeTime || ""}`}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Center: Omni-Search (shrinks on scroll) ── */}
      <button
        onClick={onOpenCommandPalette}
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-border transition-all cursor-text group",
          searchCollapsed
            ? "w-9 h-9 justify-center px-0"
            : "h-9 px-3 min-w-[220px] max-w-[280px]"
        )}
      >
        <Search className={cn(
          "shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors",
          searchCollapsed ? "h-4 w-4" : "h-3.5 w-3.5"
        )} />
        {!searchCollapsed && (
          <>
            <span className="text-[12px] text-muted-foreground/40 truncate flex-1 text-left">
              Search…
            </span>
            <kbd className="hidden sm:inline-flex items-center rounded border border-border/60 bg-background/50 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/40">
              ⌘K
            </kbd>
          </>
        )}
      </button>

      {/* ── Right: Persona Switcher ── */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer shrink-0">
          <div className="relative w-7 h-7 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-full h-full object-contain rounded-lg" />
            ) : hasProfile ? (
              <span className="text-[10px] font-bold text-muted-foreground">
                {companyName?.charAt(0).toUpperCase() || "?"}
              </span>
            ) : (
              <Building2 className="h-3 w-3 text-muted-foreground/40" />
            )}
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <div className="px-3 py-2 border-b border-border/50">
            <p className="text-xs font-semibold text-foreground truncate">
              {hasProfile ? companyName : "My Company"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {hasProfile ? "Active workspace" : "Set up your profile"}
            </p>
          </div>
          <DropdownMenuItem
            onClick={onNavigateProfile}
            className="text-xs cursor-pointer"
          >
            Company Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onViewChange?.("settings")}
            className="text-xs cursor-pointer"
          >
            Account Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Live indicator dot ── */}
      {hasProfile && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="text-[10px] font-medium text-success hidden lg:inline">Live</span>
        </div>
      )}
    </div>
  );
}

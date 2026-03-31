import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Building2, Search, ChevronDown, ChevronRight, Zap, TrendingUp,
  Activity, Radio, Clock, Sparkles, ListFilter, Star, Flame, Users,
  X, Eye, Radar, Lock, CircleHelp, Cloud, CheckCircle2, WifiOff, CreditCard,
  User, Settings2, SlidersHorizontal, LogOut
} from "lucide-react";
import { useAutosaveStatus, type AutosaveStatus } from "@/hooks/useAutosave";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dispatchInvestorsAllFocus } from "@/lib/investorMatchNavigation";
import { TopNavCompanyHealth } from "@/components/health/TopNavCompanyHealth";
import type { AnalysisResult } from "@/components/company-profile/types";
import {
  COMPANY_HEALTH_SIGNAL_EVENT,
  getCachedCompanyHealthSignals,
  type CompanyHealthSnapshot,
} from "@/lib/companyHealthSignals";
import { trackMixpanelEvent } from "@/lib/mixpanel";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { FirmLogo } from "@/components/ui/firm-logo";

type ViewType = "company" | "dashboard" | "industry" | "competitive" | "audit" | "benchmarks" | "market-intelligence" | "market-investors" | "market-market" | "market-tech" | "market-network" | "investors" | "investor-search" | "network" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "data-room" | "resources" | "settings";

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
  userSector?: string | null;
  userStage?: string | null;
  profileCompletion?: number;
  personalCompletion?: number;
  investorSearchChip?: string;
  onInvestorSearchChipChange?: (chip: string) => void;
  investorSearchQuery?: string;
  onInvestorSearchQueryChange?: (query: string) => void;
  /** Fires with VC firm id + filter text when a directory row is chosen (firm or partner). */
  onInvestorDirectoryPick?: (pick: InvestorDirectoryPick) => void;
  onInvestorSuggestionSelect?: (suggestion: string) => void;
  analysisResult?: AnalysisResult | null;
}

// ── View metadata for breadcrumbs ──
const VIEW_META: Record<ViewType, { section: string; label: string; siblings?: { id: ViewType; label: string }[] }> = {
  dashboard: { section: "Mission Control", label: "Company" },
  industry: { section: "Mission Control", label: "Industry" },
  competitive: { section: "Mission Control", label: "Competitive" },
  "data-room": { section: "Mission Control", label: "Data Room" },
  company: { section: "My Company", label: "Company Settings", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  competitors: { section: "My Company", label: "Competitors", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  sector: { section: "My Company", label: "Sector", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  benchmarks: { section: "My Company", label: "Benchmarks", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  audit: { section: "My Company", label: "Deck Audit", siblings: [
    { id: "company", label: "Company Settings" },
    { id: "competitors", label: "Competitors" },
    { id: "sector", label: "Sector" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "audit", label: "Deck Audit" },
  ]},
  investors: { section: "Investors", label: "ALL", siblings: [
    { id: "investors", label: "ALL" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "directory", label: "OPERATORS" },
  ]},
  "investor-search": { section: "Investors", label: "INVESTORS", siblings: [
    { id: "investors", label: "ALL" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "directory", label: "OPERATORS" },
  ]},
  directory: { section: "Investors", label: "OPERATORS", siblings: [
    { id: "investors", label: "ALL" },
    { id: "investor-search", label: "INVESTORS" },
    { id: "directory", label: "OPERATORS" },
  ]},
  connections: { section: "Nodes", label: "Connections" },
  network: { section: "Network", label: "Overview" },
  groups: { section: "Community", label: "Groups", siblings: [
    { id: "directory", label: "OPERATORS" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Events" },
  ]},
  events: { section: "Community", label: "Events", siblings: [
    { id: "directory", label: "OPERATORS" },
    { id: "groups", label: "Groups" },
    { id: "events", label: "Events" },
  ]},
  messages: { section: "Community", label: "Messages" },
  "market-intelligence": { section: "Market Intelligence", label: "Live" },
  "market-investors": { section: "Market Intelligence", label: "Investors" },
  "market-market": { section: "Market Intelligence", label: "Market" },
  "market-tech": { section: "Market Intelligence", label: "Tech" },
  "market-network": { section: "Market Intelligence", label: "Network" },

  resources: { section: "Resources", label: "Help Center" },
  settings: { section: "Settings", label: "Settings" },
};

// ── Contextual AI suggestions per view ──
function getContextSuggestions(view: ViewType, sector?: string | null, stage?: string | null): string[] {
  const s = sector || "Technology";
  const st = stage || "Seed";
  switch (view) {
    case "investor-search":
    case "investors":
    case "directory":
      return [
        `Lead ${s} investors`,
        `Top ${s} funds actively deploying`,
        `Investors writing ${st} checks`,
      ];
    case "connections":
      return [
        "Warm intros through shared investors",
        `${s} investors in my network`,
        "Recently connected funds",
      ];
    case "network":
      return [
        `${s} founders near me`,
        "Second-time founders raising now",
        `Operators with ${s} experience`,
      ];
    case "market-intelligence":
    case "market-investors":
    case "market-market":
    case "market-tech":
    case "market-network":
      return [
        "Funds that led rounds in my space this week",
        "Competitor pricing and packaging changes",
        "Regulatory updates affecting GTM",
      ];
    case "competitors":
    case "benchmarks":
    case "industry":
    case "competitive":
      return [
        `Top ${s} competitors`,
        "Companies at similar stage",
        `${s} market leaders`,
      ];
    case "company":
    case "sector":
      return [
        `${s} market trends`,
        "Similar companies in my sector",
        `${st} stage benchmarks`,
      ];
    default:
      return [
        `Lead ${s} investors`,
        `${s} founders near me`,
        "Trending startups this week",
      ];
  }
}

// ── Filter chips config ──
const FILTER_CHIPS = [
  { id: "all", label: "INVESTORS", icon: ListFilter },
  { id: "matches", label: "Matches", icon: Zap },
  { id: "sector", label: "Sector", icon: Building2 },
  { id: "stage", label: "Stage", icon: TrendingUp },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "popular", label: "Popular", icon: Star },
  { id: "recent", label: "Recent", icon: Clock },
];

type SearchDropdownRow =
  | { kind: "ai"; suggestion: string }
  | {
      kind: "firm";
      id: string;
      name: string;
      subtitle: string;
      logoUrl?: string | null;
      websiteUrl?: string | null;
    }
  | { kind: "person"; id: string; name: string; subtitle: string; firmId: string };

type InvestorTypeaheadRow = Extract<SearchDropdownRow, { kind: "firm" } | { kind: "person" }>;

/** Passed when user picks a firm or person in investor typeahead so the directory can scroll to the firm card. */
export type InvestorDirectoryPick = {
  vcFirmId: string;
  /** Applied to the investor grid text filter (firm name; for people, their fund name). */
  filterQuery: string;
};

function buildInvestorDirectoryPick(
  row: InvestorTypeaheadRow,
  firmMap: Map<string, { name: string }>,
): InvestorDirectoryPick {
  if (row.kind === "firm") {
    return { vcFirmId: row.id, filterQuery: row.name };
  }
  const firmName = firmMap.get(row.firmId)?.name || row.subtitle || row.name;
  return { vcFirmId: row.firmId, filterQuery: firmName };
}

const MOST_RELATED_CAP = 5;
const MAX_PER_SECTION = 25;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Higher = better match for ranking “most related”. */
function nameMatchScore(name: string, qLower: string): number {
  const n = name.toLowerCase().trim();
  if (!qLower || !n.includes(qLower)) return -1;
  if (n === qLower) return 1000;
  if (n.startsWith(qLower)) return 800;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.some((w) => w.startsWith(qLower))) return 650;
  const idx = n.indexOf(qLower);
  if (idx === 0) return 800;
  if (idx > 0 && (n[idx - 1] === " " || n[idx - 1] === "-" || n[idx - 1] === "/")) return 550;
  return 400;
}

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function HighlightedName({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <span className="font-medium text-foreground">{text}</span>;
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  const parts = text.split(re);
  const qLower = q.toLowerCase();
  return (
    <span className="font-medium text-foreground">
      {parts.map((part, i) =>
        part.toLowerCase() === qLower ? (
          <mark
            key={i}
            className="rounded px-0.5 font-semibold bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-200"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

// ── Live Market Pulse ──
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
  userSector,
  userStage,
  profileCompletion = 0,
  personalCompletion = 0,
  investorSearchChip,
  onInvestorSearchChipChange,
  investorSearchQuery,
  onInvestorSearchQueryChange,
  onInvestorDirectoryPick,
  onInvestorSuggestionSelect,
  analysisResult,
}: GlobalTopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeChip, setActiveChip] = useState("all");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [logoImgError, setLogoImgError] = useState(false);
  const [healthSnapshot, setHealthSnapshot] = useState<CompanyHealthSnapshot | null>(null);
  const pulseHealthTrackTsRef = useRef(0);

  // Reset error state whenever the URL changes so a new URL gets a fresh attempt
  useEffect(() => { setLogoImgError(false); }, [logoUrl]);
  const searchRef = useRef<HTMLDivElement>(null);
  const pulse = useRotatingPulse();

  const autosaveStatus = useAutosaveStatus();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const routeView = useCallback(
    (v: ViewType) => {
      const intel =
        v === "market-intelligence" ||
        v === "market-investors" ||
        v === "market-market" ||
        v === "market-tech" ||
        v === "market-network";
      if (intel) {
        if (location.pathname !== "/intelligence") navigate("/intelligence");
      } else if (location.pathname === "/intelligence") {
        navigate("/");
      }
      onViewChange?.(v);
      if (v === "investors") dispatchInvestorsAllFocus();
    },
    [location.pathname, navigate, onViewChange]
  );

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const handler = () => setScrolled(main.scrollTop > 12);
    main.addEventListener("scroll", handler, { passive: true });
    return () => main.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    const syncFromCache = () => {
      const cached = getCachedCompanyHealthSignals();
      if (cached) setHealthSnapshot(cached);
    };

    const onSignalUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CompanyHealthSnapshot>).detail;
      if (detail?.score != null) setHealthSnapshot(detail);
    };

    syncFromCache();
    window.addEventListener(COMPANY_HEALTH_SIGNAL_EVENT, onSignalUpdate as EventListener);
    window.addEventListener("storage", syncFromCache);
    return () => {
      window.removeEventListener(COMPANY_HEALTH_SIGNAL_EVENT, onSignalUpdate as EventListener);
      window.removeEventListener("storage", syncFromCache);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  // Keep filter chips aligned with investor directory tab when opening search
  useEffect(() => {
    if (!searchOpen) return;
    if (investorSearchChip) setActiveChip(investorSearchChip);
  }, [searchOpen, investorSearchChip]);

  const isInvestorArea = ["investors", "investor-search", "directory"].includes(activeView);
  const { firms: vcFirms, people: vcPeople, firmMap } = useVCDirectory();

  const suggestions = useMemo(
    () => getContextSuggestions(activeView, userSector, userStage),
    [activeView, userSector, userStage],
  );
  const investorSearchTrim = (investorSearchQuery ?? "").trim();

  const investorTypeahead = useMemo(() => {
    if (!isInvestorArea || !investorSearchTrim) {
      return {
        flatRows: suggestions.map((s) => ({ kind: "ai" as const, suggestion: s })) as SearchDropdownRow[],
        sections: null as { title: string; rows: InvestorTypeaheadRow[] }[] | null,
      };
    }
    const q = investorSearchTrim.toLowerCase();

    type ScoredFirm = {
      kind: "firm";
      id: string;
      name: string;
      subtitle: string;
      logoUrl: string | null;
      websiteUrl: string | null;
      score: number;
    };
    type ScoredPerson = {
      kind: "person";
      id: string;
      name: string;
      subtitle: string;
      firmId: string;
      score: number;
    };

    const firmsScored: ScoredFirm[] = [];
    for (const f of vcFirms) {
      const score = nameMatchScore(f.name, q);
      if (score < 0) continue;
      firmsScored.push({
        kind: "firm",
        id: f.id,
        name: f.name,
        subtitle: [f.stages?.slice(0, 2).join(", "), f.aum].filter(Boolean).join(" · ") || "Investor",
        logoUrl: f.logo_url ?? null,
        websiteUrl: f.website_url ?? null,
        score,
      });
    }
    firmsScored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const peopleScored: ScoredPerson[] = [];
    for (const p of vcPeople) {
      const score = nameMatchScore(p.full_name, q);
      if (score < 0) continue;
      const firm = firmMap.get(p.firm_id);
      peopleScored.push({
        kind: "person",
        id: p.id,
        name: p.full_name,
        subtitle: firm?.name ?? "Partner",
        firmId: p.firm_id,
        score,
      });
    }
    peopleScored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const toRow = (r: ScoredFirm | ScoredPerson): InvestorTypeaheadRow =>
      r.kind === "firm"
        ? {
            kind: "firm",
            id: r.id,
            name: r.name,
            subtitle: r.subtitle,
            logoUrl: r.logoUrl,
            websiteUrl: r.websiteUrl,
          }
        : { kind: "person", id: r.id, name: r.name, subtitle: r.subtitle, firmId: r.firmId };

    const combined: (ScoredFirm | ScoredPerson)[] = [...firmsScored, ...peopleScored];
    combined.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const picked = new Set<string>();
    const mostRelated: InvestorTypeaheadRow[] = [];
    for (const r of combined) {
      if (mostRelated.length >= MOST_RELATED_CAP) break;
      const key = `${r.kind}:${r.id}`;
      if (picked.has(key)) continue;
      picked.add(key);
      mostRelated.push(toRow(r));
    }

    const firmsRest = firmsScored
      .filter((f) => !picked.has(`firm:${f.id}`))
      .slice(0, MAX_PER_SECTION)
      .map(toRow);
    const peopleRest = peopleScored
      .filter((p) => !picked.has(`person:${p.id}`))
      .slice(0, MAX_PER_SECTION)
      .map(toRow);

    const sections: { title: string; rows: InvestorTypeaheadRow[] }[] = [
      { title: "Most related", rows: mostRelated },
      { title: "Firms", rows: firmsRest },
      { title: "People", rows: peopleRest },
    ].filter((s) => s.rows.length > 0);

    const flatRows: SearchDropdownRow[] = sections.flatMap((s) => s.rows);
    return { flatRows, sections };
  }, [isInvestorArea, investorSearchTrim, suggestions, vcFirms, vcPeople, firmMap]);

  const searchDropdownRows = investorTypeahead.flatRows;

  useEffect(() => {
    setHighlightIdx(0);
  }, [investorSearchTrim, searchOpen]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (onOpenCommandPalette) {
          onOpenCommandPalette();
        } else {
          setSearchOpen(o => !o);
          setHighlightIdx(0);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpenCommandPalette]);

  // Keyboard navigation for search dropdown (Esc, Enter, Arrow keys)
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      const len = searchDropdownRows.length;
      if (e.key === "Escape") {
        e.preventDefault();
        setSearchOpen(false);
        setHighlightIdx(0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (len === 0) return;
        setHighlightIdx((i) => (i < len - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (len === 0) return;
        setHighlightIdx((i) => (i > 0 ? i - 1 : len - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const q = (investorSearchQuery || "").trim();
        const row = searchDropdownRows[highlightIdx];
        if (row?.kind === "ai") {
          onInvestorSuggestionSelect?.(row.suggestion);
        } else if (row && (row.kind === "firm" || row.kind === "person")) {
          const pick = buildInvestorDirectoryPick(row, firmMap);
          onInvestorSearchQueryChange?.(pick.filterQuery);
          onInvestorDirectoryPick?.(pick);
        } else if (q) {
          onInvestorSearchQueryChange?.(investorSearchQuery || "");
        }
        setSearchOpen(false);
        setHighlightIdx(0);
        onOpenCommandPalette?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    searchOpen,
    searchDropdownRows,
    highlightIdx,
    investorSearchQuery,
    onOpenCommandPalette,
    onInvestorSearchQueryChange,
    onInvestorDirectoryPick,
    firmMap,
    onInvestorSuggestionSelect,
  ]);

  const viewMeta = VIEW_META[activeView] || VIEW_META.dashboard;
  const isCommunityArea = ["network", "groups", "events"].includes(activeView);
  const PulseIcon = pulse.icon;
  const topHealthDriver = healthSnapshot?.drivers?.[0]?.label;

  const handlePulseHealthChipClick = useCallback(() => {
    if (!healthSnapshot) return;
    const now = Date.now();
    if (now - pulseHealthTrackTsRef.current < 1200) return;
    pulseHealthTrackTsRef.current = now;
    trackMixpanelEvent("Company Health Interaction", {
      action: "pulse_health_chip_clicked",
      activeView,
      score: healthSnapshot.score,
      trendPct: healthSnapshot.trendPct,
      topDriver: topHealthDriver,
    });
  }, [activeView, healthSnapshot, topHealthDriver]);

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setSearchOpen(false);
      setHighlightIdx(0);
      onInvestorSuggestionSelect?.(suggestion);
      onOpenCommandPalette?.();
    },
    [onInvestorSuggestionSelect, onOpenCommandPalette]
  );

  const handleTypeaheadPick = useCallback(
    (row: InvestorTypeaheadRow) => {
      setSearchOpen(false);
      setHighlightIdx(0);
      const pick = buildInvestorDirectoryPick(row, firmMap);
      onInvestorSearchQueryChange?.(pick.filterQuery);
      onInvestorDirectoryPick?.(pick);
    },
    [onInvestorSearchQueryChange, onInvestorDirectoryPick, firmMap],
  );

  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-50 flex items-center justify-between gap-4 px-5 py-2 transition-all duration-300",
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent border-b border-transparent"
      )}
      style={{ left: "11rem" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* ── Left: Pulse ── */}
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          {(isInvestorArea || isCommunityArea) ? (
            <div key={pulse.text} className="flex items-center gap-2 text-[11px] font-medium animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <PulseIcon className={cn("h-3 w-3 shrink-0", pulse.color)} />
                <span className="hidden truncate text-muted-foreground xl:inline">{pulse.text}</span>
              </div>

              {healthSnapshot && (
                <button
                  type="button"
                  onClick={handlePulseHealthChipClick}
                  className={cn(
                    "hidden rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors xl:inline-flex",
                    healthSnapshot.trendPct >= 0
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-600",
                  )}
                  title={topHealthDriver || "Health delta"}
                >
                  Health {healthSnapshot.trendPct >= 0 ? "+" : ""}
                  {healthSnapshot.trendPct}%
                </button>
              )}
            </div>
          ) : lastSyncedAt ? (
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <Clock className="h-3 w-3 text-muted-foreground/50" />
              <span className={cn("hidden truncate transition-colors duration-500 xl:inline", syncFlash ? "text-success" : "text-muted-foreground/70")}>
                {syncFlash ? "Analyzed just now" : `Last analyzed ${relativeTime || ""}`}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Search ── */}
        <div ref={searchRef} className={cn("relative transition-all duration-300", searchOpen ? "min-w-[220px] flex-1 max-w-4xl" : "")}>
          <button
            onClick={handleSearchClick}
            className={cn(
              "group flex h-9 cursor-text items-center gap-2.5 rounded-xl border bg-muted/30 pl-3.5 pr-3 transition-all hover:bg-muted/50",
              searchOpen
                ? "w-full border-accent/40 bg-muted/50 shadow-sm"
                : "w-9 border-border/50 hover:border-border justify-center"
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground/70" />
            {searchOpen && (
              <>
                <span className="flex-1 truncate text-left text-[13px] text-muted-foreground/40">
                  Search...
                </span>
                <kbd className="hidden items-center rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/40 sm:inline-flex">
                  ⌘K
                </kbd>
              </>
            )}
          </button>

          {searchOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 animate-scale-in overflow-hidden rounded-2xl border border-border/50 bg-popover shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/40 px-4 py-2.5 scrollbar-none [&::-webkit-scrollbar]:hidden">
                <span className="mr-0.5 shrink-0 text-[10px] font-medium text-muted-foreground/60">I'm looking for</span>
                {FILTER_CHIPS.map(chip => {
                  const Icon = chip.icon;
                  const isActive = activeChip === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => {
                        setActiveChip(chip.id);
                        onInvestorSearchChipChange?.(chip.id);
                      }}
                      className={cn(
                        "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all",
                        isActive
                          ? "border-accent/20 bg-accent/15 text-accent shadow-sm"
                          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              <div className="border-b border-border/40 px-4 py-2.5">
                <input
                  type="text"
                  placeholder="Search investors, firms…"
                  value={investorSearchQuery || ""}
                  onChange={(e) => onInvestorSearchQueryChange?.(e.target.value)}
                  className="w-full rounded-xl border border-border/50 bg-muted/20 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/45 focus:border-accent/35 focus:bg-background focus:ring-2 focus:ring-accent/10"
                  autoFocus
                />
              </div>

              <div className="max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain px-2 py-1">
                {isInvestorArea && investorSearchTrim ? (
                  <>
                    {searchDropdownRows.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No investors match &ldquo;{investorSearchTrim}&rdquo;.
                      </p>
                    ) : (
                      (() => {
                        let rowIndex = 0;
                        return investorTypeahead.sections?.map((section) => (
                          <div
                            key={section.title}
                            className="border-t border-border/35 pt-3 pb-1 first:border-t-0 first:pt-2"
                          >
                            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                              {section.title}
                            </p>
                            <div className="flex flex-col gap-0.5">
                              {section.rows.map((row) => {
                                const i = rowIndex++;
                                return (
                                  <button
                                    key={`${section.title}-${row.kind}-${row.id}`}
                                    type="button"
                                    onClick={() => handleTypeaheadPick(row)}
                                    onMouseEnter={() => setHighlightIdx(i)}
                                    className={cn(
                                      "group/item flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                                      i === highlightIdx
                                        ? "bg-accent/12 text-foreground"
                                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                    )}
                                  >
                                    {row.kind === "firm" ? (
                                      <FirmLogo
                                        firmName={row.name}
                                        logoUrl={row.logoUrl}
                                        websiteUrl={row.websiteUrl}
                                        size="sm"
                                        className="h-9 w-9 shrink-0 rounded-full border border-border/50 bg-background"
                                      />
                                    ) : (
                                      <div
                                        className={cn(
                                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/50 text-[10px] font-bold",
                                          i === highlightIdx
                                            ? "bg-accent/15 text-accent"
                                            : "bg-muted/80 text-muted-foreground",
                                        )}
                                      >
                                        {personInitials(row.name)}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <span className="block line-clamp-1 text-[13px] leading-snug">
                                        <HighlightedName text={row.name} query={investorSearchTrim} />
                                      </span>
                                      <span className="mt-0.5 block line-clamp-1 text-[11px] leading-snug text-muted-foreground">
                                        {row.subtitle}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ));
                      })()
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 px-1 pb-2">
                      <Sparkles className="h-3 w-3 text-emerald-400" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                        AI Suggestions
                      </span>
                    </div>
                    {suggestions.map((suggestion, i) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        onMouseEnter={() => setHighlightIdx(i)}
                        className={cn(
                          "group/item flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                          i === highlightIdx
                            ? "bg-accent/10 text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            i === highlightIdx ? "bg-accent/20" : "bg-muted/60",
                          )}
                        >
                          <Sparkles
                            className={cn(
                              "h-4 w-4",
                              i === highlightIdx ? "text-accent" : "text-muted-foreground/60",
                            )}
                          />
                        </div>
                        <span className="flex-1 text-sm">{suggestion}</span>
                        <span className="text-[10px] italic opacity-0 transition-opacity text-muted-foreground/40 group-hover/item:opacity-100">
                          try this
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono">↵</kbd> Open
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono">esc</kbd> Close
                  </span>
                </div>
                <span className="text-[9px] font-mono text-muted-foreground/30">
                  {isInvestorArea && investorSearchTrim ? "Directory" : "Contextual · AI"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Investor Section Tabs (visible when search collapsed) ── */}
        {!searchOpen && ["investors", "investor-search", "directory"].includes(activeView) && (
          <>
            {/* Tabs for larger screens */}
            <div className="hidden md:flex items-center gap-1 ml-3 mr-3 shrink min-w-0">
              {[
                { id: "matches", label: "ALL" },
                { id: "search", label: "INVESTORS" },
                { id: "operators", label: "OPERATORS" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === "matches") routeView("investors");
                    else if (tab.id === "search") routeView("investor-search");
                    else if (tab.id === "operators") routeView("directory");
                  }}
                  className={cn(
                    "text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 whitespace-nowrap",
                    activeView === "investors" && tab.id === "matches" ||
                    activeView === "investor-search" && tab.id === "search" ||
                    activeView === "directory" && tab.id === "operators"
                      ? "text-accent bg-accent/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Dropdown for smaller screens */}
            <div className="md:hidden ml-2 mr-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap",
                    "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}>
                    <span className="truncate max-w-[100px]">
                      {activeView === "investors" ? "ALL" : activeView === "investor-search" ? "INVESTORS" : "OPERATORS"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuItem
                    onClick={() => routeView("investors")}
                    className={cn(activeView === "investors" && "bg-accent/10 text-accent")}
                  >
                    ALL
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("investor-search")}
                    className={cn(activeView === "investor-search" && "bg-accent/10 text-accent")}
                  >
                    INVESTORS
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("directory")}
                    className={cn(activeView === "directory" && "bg-accent/10 text-accent")}
                  >
                    OPERATORS
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}



        {/* ── Market Intelligence Section Tabs (visible when search collapsed) ── */}
        {!searchOpen && ["market-intelligence", "market-investors", "market-market", "market-tech", "market-network"].includes(activeView) && (
          <>
            {/* Tabs for larger screens */}
            <div className="hidden md:flex items-center gap-1 ml-3 mr-3 shrink min-w-0">
              {[
                { id: "market-intelligence", label: "Live" },
                { id: "market-investors", label: "Investors" },
                { id: "market-market", label: "Market" },
                { id: "market-tech", label: "Tech" },
                { id: "market-network", label: "Network" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => routeView(tab.id as ViewType)}
                  className={cn(
                    "text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 whitespace-nowrap",
                    activeView === tab.id
                      ? "text-accent bg-accent/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Dropdown for smaller screens */}
            <div className="md:hidden ml-2 mr-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap",
                    "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}>
                    <span className="truncate max-w-[100px]">
                      {activeView === "market-intelligence"
                        ? "Live"
                        : activeView === "market-investors"
                          ? "Investors"
                          : activeView === "market-market"
                            ? "Market"
                            : activeView === "market-tech"
                              ? "Tech"
                              : activeView === "market-network"
                                ? "Network"
                                : "Intelligence"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem
                    onClick={() => routeView("market-intelligence")}
                    className={cn(activeView === "market-intelligence" && "bg-accent/10 text-accent")}
                  >
                    Live
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("market-investors")}
                    className={cn(activeView === "market-investors" && "bg-accent/10 text-accent")}
                  >
                    Investors
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("market-market")}
                    className={cn(activeView === "market-market" && "bg-accent/10 text-accent")}
                  >
                    Market
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("market-tech")}
                    className={cn(activeView === "market-tech" && "bg-accent/10 text-accent")}
                  >
                    Tech
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("market-network")}
                    className={cn(activeView === "market-network" && "bg-accent/10 text-accent")}
                  >
                    Network
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        {/* ── Mission Control section tabs (visible when search collapsed) — not Intelligence */}
        {!searchOpen &&
          ["dashboard", "industry", "competitive", "competitors", "sector", "data-room"].includes(activeView) && (
          <>
            <div className="hidden md:flex items-center gap-1 ml-3 mr-3 shrink min-w-0">
              {(
                [
                  { nav: "dashboard" as const, label: "Company" },
                  { nav: "industry" as const, label: "Industry" },
                  { nav: "competitive" as const, label: "Competitive" },
                  { nav: "competitors" as const, label: "Competitors" },
                  { nav: "sector" as const, label: "Sector" },
                  { nav: "data-room" as const, label: "Data Room" },
                ] as const
              ).map((tab) => {
                const tabActive = activeView === tab.nav;
                return (
                  <button
                    key={tab.nav}
                    onClick={() => routeView(tab.nav)}
                    className={cn(
                      "text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 whitespace-nowrap",
                      tabActive
                        ? "text-accent bg-accent/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="md:hidden ml-2 mr-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap",
                    "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}>
                    <span className="truncate max-w-[80px]">
                      {activeView === "dashboard"
                        ? "Company"
                        : activeView === "industry"
                          ? "Industry"
                          : activeView === "competitive"
                            ? "Competitive"
                            : activeView === "competitors"
                              ? "Competitors"
                              : activeView === "sector"
                                ? "Sector"
                                : "Data Room"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem
                    onClick={() => routeView("dashboard")}
                    className={cn(activeView === "dashboard" && "bg-accent/10 text-accent")}
                  >
                    Company
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("industry")}
                    className={cn(activeView === "industry" && "bg-accent/10 text-accent")}
                  >
                    Industry
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("competitive")}
                    className={cn(activeView === "competitive" && "bg-accent/10 text-accent")}
                  >
                    Competitive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("competitors")}
                    className={cn(activeView === "competitors" && "bg-accent/10 text-accent")}
                  >
                    Competitors
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("sector")}
                    className={cn(activeView === "sector" && "bg-accent/10 text-accent")}
                  >
                    Sector
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => routeView("data-room")}
                    className={cn(activeView === "data-room" && "bg-accent/10 text-accent")}
                  >
                    Data Room
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
        <div className="h-4 w-px shrink-0 bg-border/40" />

        <TooltipProvider delayDuration={200}>
          <div className="hidden md:flex shrink-0 items-center gap-4">
            {(() => {
              const locked = profileCompletion < 100 || personalCompletion < 100;
              const views = 12;
              const searches = 85;
              return (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center gap-1.5">
                        <Eye className="h-4 w-4 text-muted-foreground/60" />
                        {locked ? (
                          <Lock className="h-3 w-3 text-muted-foreground/40" />
                        ) : (
                          <span className="text-xs font-medium text-foreground">{views}</span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {locked ? "Complete your personal and company profiles to unlock Investor Views" : `${views} Total Investor Views this week`}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center gap-1.5">
                        <Radar className="h-4 w-4 text-muted-foreground/60" />
                        {locked ? (
                          <Lock className="h-3 w-3 text-muted-foreground/40" />
                        ) : (
                          <span className="text-xs font-medium text-foreground">{searches}</span>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {locked ? "Complete your personal and company profiles to unlock Search Appearances" : `${searches} Search Appearances this week`}
                    </TooltipContent>
                  </Tooltip>
                </>
              );
            })()}
          </div>
        </TooltipProvider>

        <div className="hidden md:block h-4 w-px shrink-0 bg-border/40" />

        {autosaveStatus !== "idle" && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex shrink-0 items-center gap-1">
                  {autosaveStatus === "saving" && (
                    <Cloud className="h-3.5 w-3.5 animate-pulse text-muted-foreground/60" />
                  )}
                  {autosaveStatus === "saved" && (
                    <CheckCircle2 className="h-3.5 w-3.5 animate-fade-in text-success" />
                  )}
                  {autosaveStatus === "error" && (
                    <WifiOff className="h-3.5 w-3.5 animate-pulse text-destructive" />
                  )}
                  <span
                    className={cn(
                      "hidden text-[9px] font-mono uppercase tracking-wider sm:inline",
                      autosaveStatus === "saving" && "text-muted-foreground/60",
                      autosaveStatus === "saved" && "text-success",
                      autosaveStatus === "error" && "text-destructive",
                    )}
                  >
                    {autosaveStatus === "saving" ? "Saving" : autosaveStatus === "saved" ? "Saved" : "Offline"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {autosaveStatus === "saving" ? "Saving changes..." : autosaveStatus === "saved" ? "All changes saved" : "Changes not saved — will retry"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="h-4 w-px shrink-0 bg-border/40" />

        <TopNavCompanyHealth
          score={analysisResult?.healthScore}
          stage={userStage}
          sector={userSector}
          activeView={activeView}
          analysisResult={analysisResult}
          companyName={companyName}
          logoUrl={logoUrl}
          hasProfile={hasProfile}
        />

        {/* ── Right: Help + Persona Switcher ── */}
        <div className="flex shrink-0 items-center gap-4">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onViewChange?.("help")}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Help Center</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer shrink-0">
            <div className="relative w-7 h-7 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl && !logoImgError ? (
                <img key={logoUrl} src={logoUrl} alt="" className="w-full h-full object-contain rounded-lg" onError={() => setLogoImgError(true)} />
              ) : hasProfile ? (
                <span className="text-[10px] font-bold text-muted-foreground">
                  {companyName?.charAt(0).toUpperCase() || "?"}
                </span>
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-0">
            {/* Active Workspace Header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="relative w-9 h-9 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl && !logoImgError ? (
                  <img key={logoUrl} src={logoUrl} alt="" className="w-full h-full object-contain rounded-lg" onError={() => setLogoImgError(true)} />
                ) : hasProfile ? (
                  <span className="text-xs font-bold text-muted-foreground">
                    {companyName?.charAt(0).toUpperCase() || "?"}
                  </span>
                ) : (
                  <Building2 className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {hasProfile ? companyName : "My Company"}
                </p>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground mt-0.5">
                  {userStage || "Seed"}
                </span>
              </div>
            </div>

            {/* Combined Profile Strength */}
            <button
              onClick={() => {
                const fromIntel = location.pathname === "/intelligence";
                if (fromIntel) navigate("/");
                const url = new URL(fromIntel ? `${window.location.origin}/` : window.location.href);
                url.searchParams.set("view", "settings");
                url.searchParams.set("tab", "account");
                window.history.replaceState({}, "", url.toString());
                onViewChange?.("settings" as ViewType);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">
                  Profile {Math.round((profileCompletion + personalCompletion) / 2)}% Complete
                </p>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full rounded-l-full bg-accent/60 transition-all"
                    style={{ width: `${personalCompletion / 2}%` }}
                  />
                  <div
                    className="h-full rounded-r-full bg-accent transition-all"
                    style={{ width: `${profileCompletion / 2}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-muted-foreground/50">Personal</span>
                  <span className="text-[9px] text-muted-foreground/50">Company</span>
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>

            {/* Divider */}
            <div className="border-b border-border/50" />

            {/* Navigation Menu Items */}
            <div className="p-1">
              {([
                { key: "personal", label: "Personal", icon: User, tab: "account" },
                { key: "company", label: "Company", icon: Building2, tab: "company" },
                { key: "network", label: "Network", icon: Radio, tab: "network" },
                { key: "preferences", label: "Preferences", icon: SlidersHorizontal, tab: "notifications" },
                { key: "subscription", label: "Subscription", icon: CreditCard, tab: "subscription" },
                { key: "acct", label: "Account", icon: Settings2, tab: "security" },
              ] as const).map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  onClick={() => {
                    const fromIntel = location.pathname === "/intelligence";
                    if (fromIntel) navigate("/");
                    const url = new URL(fromIntel ? `${window.location.origin}/` : window.location.href);
                    url.searchParams.set("view", "settings");
                    url.searchParams.set("tab", item.tab);
                    window.history.replaceState({}, "", url.toString());
                    onViewChange?.("settings" as ViewType);
                  }}
                  className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide cursor-pointer"
                >
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                  {item.label}
                </DropdownMenuItem>
              ))}
              <div className="border-t border-border/50 my-1" />
              <DropdownMenuItem
                onClick={() => signOut()}
                className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] font-medium tracking-wide cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/5 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </div>
  );
}
